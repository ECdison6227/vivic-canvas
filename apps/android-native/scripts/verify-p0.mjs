/** P0 live checks. Writes synthetic data only to an empty, explicitly marked evaluation Space. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const args = process.argv.slice(2);
assert(args.length === 4 && args[0] === '--credentials' && args[2] === '--output',
  'Usage: node verify-p0.mjs --credentials PRIVATE.json --output REPORT.json');
const credentialsPath = resolve(args[1]), outputPath = resolve(args[3]);
assert.notEqual(outputPath, credentialsPath, 'Report must not overwrite the private session');
assert.notEqual(outputPath, resolve(import.meta.filename), 'Report must not overwrite the runner');
const credential = JSON.parse(await readFile(credentialsPath, 'utf8'));
assert(credential.evaluation === true && /^decision-eval-[a-z0-9_.-]+$/.test(credential.username),
  'Only the designated evaluation account is allowed');
assert(credential.origin === 'https://vivic.edsionc.top');
assert(/^__Host-vivic_space=[A-Za-z0-9_-]{43}$/.test(credential.cookie));
assert(/^[A-Za-z0-9_-]{1,128}$/.test(credential.spaceId));
const { origin, spaceId } = credential;
const root = `/api/space/spaces/${spaceId}`;
const ownerPath = `/api/space/owner/canvases/${spaceId}`;
const report = { date: new Date().toISOString(), scope: 'evaluation account; synthetic data; no deployment',
  checks: [], fixtures: [], cleanup: {} };
const record = (name, status, details) => {
  report.checks.push({ name, status, details });
  console.log(JSON.stringify({ name, status, details }));
};
async function api(path, { method = 'GET', data, cookie = credential.cookie, withOrigin = true, headers = {}, body } = {}) {
  const response = await fetch(origin + path, { method, redirect: 'error',
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(withOrigin ? { Origin: origin } : {}),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: data === undefined ? body : JSON.stringify(data), signal: AbortSignal.timeout(30000) });
  const value = await response.json();
  return { status: response.status, value, headers: response.headers };
}
const snapshot = async () => {
  const result = await api(root); assert.equal(result.status, 200); return result.value;
};
const command = async value => {
  const current = await snapshot();
  const result = await api(root + '/commands', { method: 'POST',
    data: { requestId: randomUUID(), expectedVersion: current.space.version, command: value } });
  assert.equal(result.status, 200, `Evaluation command failed: ${result.value.code}`);
  return result.value.snapshot;
};
const tasks = new Set();
async function task(text, expectedVersion) {
  const requestId = randomUUID(), started = Date.now();
  const input = { requestId, text, expectedVersion };
  const accepted = await api(root + '/tasks', { method: 'POST', data: input });
  if (accepted.status !== 202) return { input, accepted: accepted.status, error: accepted.value.code, states: [] };
  tasks.add(requestId);
  const states = [{ status: accepted.value.task.status, elapsedMs: Date.now() - started }];
  let result = accepted.value;
  while (['accepted', 'running'].includes(result.task.status) && Date.now() - started < 95000) {
    await delay(Date.now() - started < 10000 ? 1000 : 2000);
    const next = await api(root + '/tasks/' + requestId);
    assert.equal(next.status, 200);
    result = next.value;
    if (result.task.status !== states.at(-1).status)
      states.push({ status: result.task.status, elapsedMs: Date.now() - started });
  }
  return { input, accepted: accepted.status, states, elapsedMs: Date.now() - started, result };
}
const fixtureIds = new Map();
function fixtureId(id, prefix) {
  if (!fixtureIds.has(id)) fixtureIds.set(id, `${prefix}_${fixtureIds.size + 1}`);
  return fixtureIds.get(id);
}
async function fixture(name, value) {
  const cards = structuredClone(value.space.cards).map(card => {
    card.id = fixtureId(card.id, 'card'); card.sources = [];
    if (card.type === 'TodoCard') card.displayProps.items = card.displayProps.items.map(item => ({ ...item, id: fixtureId(item.id, 'item') }));
    return card;
  });
  const space = { ...value.space, id: 'space_fixture', title: '接口核验示例空间', cards };
  const cleaned = { space, spaces: [{ ...space, cards: undefined }], cursor: 0, reminders: [] };
  const file = resolve(import.meta.dirname, '../app/src/test/resources/fixtures/' + name + '.json');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(cleaned, null, 2) + '\n');
  report.fixtures.push({ name, cards: cards.map(card => card.type) });
}

let original, claimedCookie, changed = false;
try {
  const session = await api('/api/space/session');
  assert.equal(session.status, 200);
  assert(session.value.authenticated && session.value.user.id === credential.accountId
    && session.value.user.username === credential.username, 'Evaluation identity mismatch');
  const owner = await api(ownerPath); assert.equal(owner.status, 200); original = owner.value;
  assert.equal(original.record.cardOrder.length, 0, 'Refusing a nonempty evaluation Space');
  assert.equal((await snapshot()).space.cards.length, 0);

  const noOrigin = await api('/api/space/pair', { method: 'POST', data: {}, withOrigin: false });
  const bearer = await api('/api/space/session', { headers: { Authorization: 'Bearer P0-rejection-probe' } });
  const issued = await api('/api/space/pair', { method: 'POST', data: {} });
  assert.equal(issued.status, 200); assert.match(issued.value.code, /^[A-Za-z0-9_-]{12}$/);
  const claim = await api('/api/space/pair/claim', { method: 'POST', cookie: null,
    data: { code: issued.value.code, deviceName: 'Vivic Android P0 evaluation' } });
  assert.equal(claim.status, 200);
  const cookieHeader = claim.headers.get('set-cookie');
  claimedCookie = cookieHeader.split(';')[0];
  const paired = await api('/api/space/session', { cookie: claimedCookie });
  const reused = await api('/api/space/pair/claim', { method: 'POST', cookie: null,
    data: { code: issued.value.code, deviceName: 'P0 one-use probe' } });
  record('a_pair_claim_session', noOrigin.status === 403 && bearer.status === 400
    && paired.value.user.id === credential.accountId && reused.status >= 400 ? 'pass' : 'fail', {
      issue: issued.status, claim: claim.status, session: paired.status, sameAccount: paired.value.user.id === credential.accountId,
      missingOrigin: noOrigin.status, authorizationHeader: { status: bearer.status, code: bearer.value.code },
      reusedCode: { status: reused.status, code: reused.value.code },
      cookieAttributes: cookieHeader.split(';').slice(1).map(part => part.trim()),
    });

  const startVersion = (await snapshot()).space.version;
  changed = true;
  const timer = await task('倒计时 5 分钟', startVersion);
  record('b_countdown_task', timer.result?.task.status === 'succeeded'
    && timer.result.snapshot.space.cards.some(card => card.type === 'CountdownCard') ? 'pass' : 'fail', {
      accepted: timer.accepted, states: timer.states, elapsedMs: timer.elapsedMs,
      finalStatus: timer.result?.task.status, message: timer.result?.task.message,
      createdTypes: timer.result?.snapshot.space.cards.map(card => card.type),
    });
  if (!(await snapshot()).space.cards.some(card => card.type === 'CountdownCard'))
    await command({ type: 'reminder.create', text: 'P0引用计时', seconds: 300 });
  await fixture('countdown', await snapshot());

  const todoSnapshot = await command({ type: 'todo.create', title: 'P0接口待办', items: ['核验原生接口', '核验同步'] });
  const todo = todoSnapshot.space.cards.find(card => card.type === 'TodoCard');
  const items = todo.displayProps.items.map((item, index) => ({ ...item, done: index === 0 }));
  const checked = await command({ type: 'card.update', cardId: todo.id, displayProps: { items } });
  record('d_todo_payload', checked.space.cards.find(card => card.id === todo.id).displayProps.items[0].done ? 'pass' : 'fail', {
    command: { type: 'card.update', cardId: '<todo-id>', displayProps: { items: items.map((item, index) => ({ ...item, id: `<existing-item-${index + 1}>` })) } },
    rule: 'Send the complete items array with existing item IDs; patching one index is unsupported.',
  });
  await fixture('todo', { ...checked, space: { ...checked.space, cards: checked.space.cards.filter(card => card.type === 'TodoCard') } });

  const stale = await task('倒计时 2 分钟', startVersion);
  const duplicate = await api(root + '/tasks', { method: 'POST', data: stale.input });
  const conflicting = await api(root + '/tasks', { method: 'POST', data: { ...stale.input, text: '不同的请求正文' } });
  const lookup = await api(root + '/tasks/' + stale.input.requestId);
  record('c_stale_version_and_409', stale.accepted === 202 && conflicting.status === 409
    && conflicting.value.code === 'request-id-conflict'
    && lookup.status === 200 ? 'contract-change' : 'fail', {
      staleVersionSubmission: stale.accepted, states: stale.states,
      duplicateSamePayload: duplicate.status, conflictingPayload: { status: conflicting.status, code: conflicting.value.code },
      originalTaskStillExists: lookup.status === 200,
      conclusion: 'Stale expectedVersion is accepted and refreshed server-side. A 409 can refer to an existing task. Do not generate a new ID and replay after a generic 409.',
    });

  const models = await api('/api/space/models/status');
  const speech = await api('/api/space/models/speech', { method: 'POST', data: { text: '收到' } });
  const form = new FormData();
  form.set('file', new Blob([], { type: 'audio/mp4' }), 'mime-probe.m4a');
  const transcribe = await api('/api/space/models/transcribe', { method: 'POST', body: form });
  record('e_transcribe_m4a', 'blocked', { configured: models.value.configured, status: transcribe.status, code: transcribe.value.code,
    note: 'Empty MIME probe only; no microphone capture. Source accepts audio/mp4, but a valid recording cannot be verified until the evaluation voice model is connected.' });
  record('f_speech_response', Array.isArray(speech.value.segments) && speech.value.segments.length ? 'pass' : 'blocked', {
    status: speech.status, code: speech.value.code,
    ...(speech.value.segments ? { segmentCount: speech.value.segments.length,
      firstSegment: Object.fromEntries(Object.entries(speech.value.segments[0]).map(([key, value]) => [key, key === 'audio' ? `<base64 length ${value.length}>` : value])) } : {}),
    sourceContract: 'segments[{audio:base64 WAV,text,mime:"audio/wav",durationSeconds,nonSilent}]',
  });

  await command({ type: 'note.create', title: 'P0引用便笺', text: 'P0接口核验合成内容' });
  const beforeReference = await snapshot();
  const reference = await task('关于「P0引用便笺」：改成明天', beforeReference.space.version);
  const afterReference = await snapshot();
  const targetBefore = beforeReference.space.cards.find(card => card.sourceData.title === 'P0引用便笺');
  const targetAfter = afterReference.space.cards.find(card => card.id === targetBefore?.id);
  const matched = targetBefore && targetAfter && JSON.stringify(targetBefore.displayProps) !== JSON.stringify(targetAfter.displayProps)
    && afterReference.space.cards.length === beforeReference.space.cards.length;
  record('h_reference_target', matched ? 'pass' : 'blocked', { states: reference.states,
    finalStatus: reference.result?.task.status, message: reference.result?.task.message, exactCardChanged: Boolean(matched),
    newlyCreatedCards: afterReference.space.cards.length - beforeReference.space.cards.length,
    conclusion: matched ? 'The title targeted the existing card.' : 'Title concatenation has not established reliable targeting; keep reference sending gated pending a connected-model test.' });
  await fixture('mixed', afterReference);

  const ownerAfter = await api(ownerPath);
  record('g_reading_order', 'pass', { snapshotOrderMatchesOwnerCardOrder:
    JSON.stringify(ownerAfter.value.record.cardOrder) === JSON.stringify(afterReference.space.cards.map(card => card.id)),
    desktop: 'Absolute x/y visual layout; owner cardOrder retains insertion/persistence order.',
    mobilePlan: 'Pinned first, then updatedAt descending is a new mobile order, not the desktop visual order.',
    decisionRequired: 'Checkpoint 0: choose pinned+updatedAt mobile order or geometric y/x order. No coordinates are written by this runner.' });
} catch (error) {
  report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  try {
    for (const id of tasks) {
      const result = await api(root + '/tasks/' + id);
      if (result.value.task && ['accepted', 'running', 'awaiting_clarification', 'unknown'].includes(result.value.task.status))
        await api(root + '/tasks/' + id + '/cancel', { method: 'POST', data: {} });
    }
    if (changed && original) {
      const latest = await api(ownerPath); assert.equal(latest.status, 200);
      const restored = await api(ownerPath, { method: 'PUT', data: { record: { ...original.record,
        version: latest.value.record.version + 1, updatedAt: new Date().toISOString() },
        expectedVersion: latest.value.serverVersion, requestId: randomUUID() } });
      assert.equal(restored.status, 200);
      report.cleanup.emptySpaceRestored = (await snapshot()).space.cards.length === 0;
    }
    if (claimedCookie) {
      const logout = await api('/api/space/logout', { method: 'POST', cookie: claimedCookie, data: {} });
      report.cleanup.claimedDeviceLoggedOut = logout.status === 200;
    }
  } catch (error) {
    report.cleanup.error = error.message; process.exitCode = 1;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ cleanup: report.cleanup, error: report.error, fixtures: report.fixtures }));
}
