/** Generate the approved local acknowledgements through the authorized evaluation voice connection. No playback. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
assert(args.length === 4 && args[0] === '--credentials' && args[2] === '--models');
const auth = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
const models = JSON.parse(await readFile(resolve(args[3]), 'utf8'));
assert(auth.evaluation && auth.username.startsWith('decision-eval-') && auth.origin === 'https://vivic.edsionc.top');
const request = async (path, body) => {
  const response = await fetch(auth.origin + path, { method: body ? 'POST' : 'GET', redirect: 'error',
    headers: { Cookie: auth.cookie, Origin: auth.origin, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(185000) });
  assert(response.ok, `Voice API status ${response.status}`); return response.json();
};
const session = await request('/api/space/session'); assert(session.user.id === auth.accountId);
await request('/api/space/models/connect', { apiKey: models.voice.apiKey });
const output = resolve(import.meta.dirname, '../app/src/main/res/raw'); await mkdir(output, { recursive: true });
const report = [];
for (const [name, text] of [['wait_one', '好的，稍等。'], ['wait_two', '马上帮你看看。'], ['wait_three', '收到。']]) {
  const data = await request('/api/space/models/speech', { text }); assert(data.segments?.length === 1 && data.segments[0].nonSilent);
  const bytes = Buffer.from(data.segments[0].audio, 'base64'); assert(bytes.subarray(0, 4).toString() === 'RIFF');
  await writeFile(resolve(output, name + '.wav'), bytes);
  report.push({ name, text, model: 'qwen3-tts-1.7b', durationSeconds: data.segments[0].durationSeconds,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
}
await writeFile(resolve(output, 'voice_provenance.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ generated: report.map(({ name, durationSeconds }) => ({ name, durationSeconds })), playback: false }));
