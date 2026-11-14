import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConsultWorkflow } from '../src/workflow.mjs';
import { readConfig, saveConfirmationMode } from '../src/config.mjs';
const args = { brief: 'Review the plan.', project: 'user-project', context: { goal: 'Choose a safe next step.', facts: ['User supplied fact.'], assumptions: ['Agent inference.'], constraints: ['No extra spending.'], originalReply: 'Previous answer.', attempts: [], userFeedback: [] } };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture() {
  let config = { url: 'https://consult.example', token: 'test-secret' };
  let clock = 10000;
  let preflight = 0, paid = 0;
  const sent = [];
  const events = [{ type: 'user/message' }];
  const session = { id: 'session-1', snapshotEvents: () => events };
  const exec = { agent: { session }, signal: new AbortController().signal };
  const workflow = createConsultWorkflow({
    enableOnlineBridge: false,
    readConfiguration: async () => config, saveMode: async flag => { config = { ...config, confirmBeforeSend: flag }; return { confirmBeforeSend: flag }; }, now: () => clock,
    preflightRequest: async value => { preflight++; sent.push(structuredClone(value.input)); return { ok: true, modelCalls: 0 }; },
    requestConsult: async value => { paid++; assert.deepEqual(value.input, sent.at(-1)); return { format: 'zesia.consult.v0', advice: 'Bounded advice.', usage: { totalTokens: 20 } }; },
  });
  const send = (draft, packet = draft.packet, extra = {}) => workflow.control({ action: 'send', draftId: draft.id, draftHash: draft.hash, approvedHash: hash(packet), packet, ...extra }, exec);
  return { ...workflow, exec, events, send, counts: () => ({ preflight, paid }), sent, setConfig: value => { config = value; }, advance: () => { clock += 16 * 60 * 1000; } };
}
test('default model call prepares exact local draft; no preflight or external call before confirmation', async () => {
  const f = fixture();
  const result = await f.tool.execute(args, f.exec);
  assert.equal(result.status, 'awaiting_confirmation');
  assert.equal(result.draft.destination, 'https://consult.example');
  assert.deepEqual(result.draft.packet, { requester: 'DeepSeek Harness', ...args });
  assert.deepEqual(f.counts(), { preflight: 0, paid: 0 });
  assert.doesNotMatch(JSON.stringify(result), /test-secret/);
});
test('document evidence cannot silently disappear before confirmation or at send time', async () => {
  const f = fixture();
  const materials = [{ id: 'slides-01-10', content: 'Review this supplied deck text.' }];
  const misplaced = await f.tool.execute({ ...args, materials }, f.exec);
  assert.equal(misplaced.errorCode, 'consult_materials_wrong_field');
  const unknown = await f.tool.execute({ ...args, confirmed: true, confirmBeforeSend: false }, f.exec);
  assert.equal(unknown.errorCode, 'consult_invalid_input');
  const empty = await f.tool.execute({ ...args, requireMaterials: true }, f.exec);
  assert.equal(empty.errorCode, 'consult_materials_required');
  const { draft } = await f.tool.execute({ ...args, requireMaterials: true, context: { ...args.context, materials } }, f.exec);
  assert.deepEqual(draft.packet.context.materials, materials);
  assert.equal(Object.hasOwn(draft.packet, 'requireMaterials'), false);
  const edited = { ...draft.packet, context: { ...draft.packet.context, materials: [] } };
  assert.equal((await f.send(draft, edited)).errorCode, 'consult_materials_required');
  assert.deepEqual(f.counts(), { preflight: 0, paid: 0 });
  const result = await f.send(draft);
  assert.deepEqual(result.delivery.packet.context.materials, materials);
  assert.deepEqual(f.sent[0], draft.packet);
  assert.deepEqual(f.counts(), { preflight: 1, paid: 1 });
});
test('confirmation submits the edited packet exactly, and cached replay never sends again', async () => {
  const f = fixture(); const { draft } = await f.tool.execute(args, f.exec);
  const edited = { ...draft.packet, brief: 'Edited question.', context: { ...draft.packet.context, facts: ['Only this fact may leave.'] } };
  const result = await f.send(draft, edited);
  assert.equal(result.ok, true);
  assert.equal(result.delivery.mode, 'confirmed');
  assert.deepEqual(result.delivery.packet, edited);
  assert.equal(result.delivery.payloadSha256, hash(edited));
  assert.deepEqual(f.sent[0], edited);
  assert.deepEqual(f.counts(), { preflight: 1, paid: 1 });
  const cached = await f.send(draft, edited); assert.equal(cached.cached, true);
  assert.deepEqual(f.counts(), { preflight: 1, paid: 1 });
});
test('cancel, missing or stale approval and wrong session fail closed with zero external calls', async () => {
  for (const scenario of ['cancel','wrong-hash','wrong-session','changed-packet','expired','new-turn','destination']) {
    const f = fixture(); const { draft } = await f.tool.execute(args, f.exec);
    let result;
    if (scenario === 'cancel') { result = await f.control({ action: 'cancel', draftId: draft.id, draftHash: draft.hash }, f.exec); await f.send(draft); }
    if (scenario === 'wrong-hash') result = await f.send(draft, draft.packet, { draftHash: 'wrong' });
    if (scenario === 'wrong-session') result = await f.control({ action: 'send', draftId: draft.id, draftHash: draft.hash, approvedHash: hash(draft.packet), packet: draft.packet }, { ...f.exec, agent: { session: { id: 'other', snapshotEvents: () => [] } } });
    if (scenario === 'changed-packet') result = await f.send(draft, draft.packet, { approvedHash: 'wrong' });
    if (scenario === 'expired') { f.advance(); result = await f.send(draft); }
    if (scenario === 'new-turn') { f.events.push({ type: 'user/message' }); result = await f.send(draft); }
    if (scenario === 'destination') { f.setConfig({ url: 'https://other.example', token: 'test' }); result = await f.send(draft); }
    assert.equal(result.ok, false, scenario);
    assert.deepEqual(f.counts(), { preflight: 0, paid: 0 }, scenario);
  }
});
test('explicit automatic preference affects future requests, never sends existing drafts by itself', async () => {
  const f = fixture(); const first = await f.tool.execute(args, f.exec);
  assert.equal((await f.control({ action: 'settings' }, f.exec)).confirmBeforeSend, true);
  await f.control({ action: 'set_mode', confirmBeforeSend: false }, f.exec);
  assert.deepEqual(f.counts(), { preflight: 0, paid: 0 });
  assert.equal(first.status, 'awaiting_confirmation');
  f.events.push({ type: 'user/message' });
  const result = await f.tool.execute(args, f.exec);
  assert.equal(result.delivery.mode, 'automatic');
  assert.deepEqual(f.counts(), { preflight: 1, paid: 1 });
  await f.control({ action: 'set_mode', confirmBeforeSend: true }, f.exec);
  f.events.push({ type: 'user/message' });
  assert.equal((await f.tool.execute(args, f.exec)).status, 'awaiting_confirmation');
});
test('missing token and missing confirmation UI never leak a prepared packet', async () => {
  const f = fixture();
  assert.equal((await f.tool.execute(args, { signal: f.exec.signal })).errorCode, 'confirmation_unavailable');
  f.setConfig({ url: 'https://consult.example' });
  const { draft } = await f.tool.execute(args, f.exec);
  assert.equal((await f.send(draft)).errorCode, 'configuration_missing');
  assert.deepEqual(f.counts(), { preflight: 0, paid: 0 });
});
test('confirmation preferences default on and save atomically without losing credentials', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'zesia-consent-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json'); const env = { ZESIA_CONFIG: path };
  assert.equal((await readConfig(env, { requireToken: false })).confirmBeforeSend, true);
  await writeFile(path, JSON.stringify({ token: 'private-test', project: 'kept' }), { mode: 0o600 });
  await saveConfirmationMode(false, env);
  const config = await readConfig(env);
  assert.equal(config.confirmBeforeSend, false); assert.equal(config.token, 'private-test'); assert.equal(config.project, 'kept');
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await saveConfirmationMode(true, env); assert.equal((await readConfig(env)).confirmBeforeSend, true);
});

test('inline draft discovery is bound to the exact session and conversation turn with no external calls', async () => {
  const f=fixture();f.events.push({type:'turn/start',data:{turn:17}});
  const prepared=await f.tool.execute(args,f.exec);
  const found=await f.control({action:'draft_for_turn',turn:17},f.exec);
  assert.deepEqual(found.draft.packet,prepared.draft.packet);
  assert.equal(found.draft.id,prepared.draft.id);
  assert.equal((await f.control({action:'draft_for_turn',turn:16},f.exec)).draft,null);
  assert.equal((await f.control({action:'draft_for_turn',turn:17},{agent:{session:{}}})).draft,null);
  assert.equal((await f.control({action:'draft_for_turn'},f.exec)).draft,null);
  assert.deepEqual(f.counts(),{preflight:0,paid:0});
  assert.doesNotMatch(JSON.stringify(found),/test-secret/);
  f.advance();assert.equal((await f.control({action:'draft_for_turn',turn:17},f.exec)).draft,null);
});
