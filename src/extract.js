import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { extractionSchema, systemPrompt, PROMPT_VERSION } from './schema.js';

const MEDIA = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export const SUPPORTED = Object.keys(MEDIA);

// USD per million tokens. Check https://platform.claude.com/docs/en/about-claude/pricing before quoting clients.
const PRICES = { 'claude-sonnet-5-5': { in: 2, out: 10 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5 } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const hashFile = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

function contentBlock(file, buf) {
  const media = MEDIA[path.extname(file).toLowerCase()];
  const source = { type: 'base64', media_type: media, data: buf.toString('base64') };
  return media === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
}

export function makeExtractor({ model, cacheDir, mockDir, dateFormat = 'DMY' }) {
  const client = mockDir ? null : new Anthropic({ maxRetries: 4, timeout: 180000 }); // reads ANTHROPIC_API_KEY; SDK retries network drops itself
  fs.mkdirSync(cacheDir, { recursive: true });

  return async function extract(file) {
    const buf = fs.readFileSync(file);
    const key = `${hashFile(buf)}-${PROMPT_VERSION}-${model}-${dateFormat}${mockDir ? '-mock' : ''}`;
    const cached = path.join(cacheDir, `${key}.json`);
    if (fs.existsSync(cached)) return { ...JSON.parse(fs.readFileSync(cached, 'utf8')), fromCache: true };

    let result;
    if (mockDir) {
      // Offline demo: use the hand-written expected output next to the sample file.
      const mock = path.join(mockDir, path.basename(file).replace(/\.[^.]+$/, '.expected.json'));
      if (!fs.existsSync(mock)) throw new Error(`no mock output for ${path.basename(file)}`);
      result = { data: JSON.parse(fs.readFileSync(mock, 'utf8')), usage: { input_tokens: 0, output_tokens: 0 }, costUsd: 0 };
    } else {
      result = await callClaude(client, model, file, buf, dateFormat);
    }
    fs.writeFileSync(cached, JSON.stringify(result, null, 2));
    return result;
  };
}

async function callClaude(client, model, file, buf, dateFormat, attempt = 1) {
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 8000,
      system: systemPrompt({ dateFormat }),
      messages: [{
        role: 'user',
        content: [contentBlock(file, buf), { type: 'text', text: 'Extract this document into the required JSON.' }],
      }],
      output_config: { format: { type: 'json_schema', schema: extractionSchema } },
    });
    if (res.stop_reason === 'max_tokens') throw new Error('response cut off (max_tokens); document may be too long, split it');
    if (res.stop_reason === 'refusal') throw new Error('model refused this document');
    const text = res.content.find((b) => b.type === 'text')?.text;
    const data = JSON.parse(text);
    const p = PRICES[model] || PRICES['claude-sonnet-5-5'];
    const costUsd = (res.usage.input_tokens * p.in + res.usage.output_tokens * p.out) / 1e6;
    return { data, usage: res.usage, costUsd };
  } catch (err) {
    const status = err?.status;
    const network = err instanceof Anthropic.APIConnectionError || /connection|ECONNRESET|ETIMEDOUT|socket/i.test(err?.message || '');
    const retryable = status === 429 || status === 529 || (status >= 500 && status < 600) || network;
    if (retryable && attempt < 4) {
      const wait = (network ? 5000 : 2000) * 2 ** (attempt - 1);
      console.log(`  retry ${attempt}/3 in ${wait / 1000}s (${status || (network ? 'network' : err.name)}) - ${path.basename(file)}`);
      await sleep(wait);
      return callClaude(client, model, file, buf, dateFormat, attempt + 1);
    }
    throw err;
  }
}
