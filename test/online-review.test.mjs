import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConsultWorkflow } from '../src/workflow.mjs';

for (const classification of [
  { deliveryKind: 'opinion', qualityStatus: 'complete_structure' },
  { deliveryKind: 'partial', qualityStatus: 'partial' },
  { deliveryKind: 'guidance', qualityStatus: 'not_reviewed' },
]) {
  test(`DSH workflow opens the shared review and returns the settled ${classification.deliveryKind} result`, async () => {
    let calls = 0;
    const session = { id: 'online-s1', snapshotEvents: () => [{ type: 'user/message' }] };
    const exec = { agent: { session }, signal: new AbortController().signal };
    const workflow = createConsultWorkflow({
      openBrowser: false,
      readConfiguration: () => ({ url: 'https://api.zesia.dev', token: 'synthetic-dsh-online-token' }),
      preflightRequest: async () => ({ ok: true, modelCalls: 0 }),
      requestConsult: async () => {
        calls += 1;
        return {
          ...classification,
          format: 'zesia.consult.v0',
          consultId: 'dsh-online-1',
          advice: 'Use the shared online window.',
          decision: { status: 'advice', recommendation: 'Verify boundary', nextSteps: [] },
          followUp: { requests: [] },
          a2a: { contextId: 'ctx-dsh-1', messageId: 'msg-dsh-1' },
        };
      },
    });
    try {
      const prepared = await workflow.tool.execute({ project: 'demo', brief: 'Review plan', context: { goal: 'Verify bridge' } }, exec);
      assert.equal(prepared.ok, true);
      assert.equal(prepared.status, 'awaiting_online_review');
      for (const key of Object.keys(prepared)) {
        assert.ok(Object.hasOwn(workflow.tool.output.schema.properties, key), `undeclared output field: ${key}`);
      }
      assert.equal(calls, 0);

      const parsed = new URL(prepared.url);
      assert.equal(parsed.origin, 'https://zesia.dev');
      const params = new URLSearchParams(parsed.hash.slice(1));
      const origin = 'http://127.0.0.1:' + params.get('port');
      const headers = { Origin: 'https://zesia.dev', Authorization: 'Bearer ' + params.get('key'), 'Content-Type': 'application/json' };
      const view = await (await fetch(origin + '/bridge/v1/view', { headers })).json();
      assert.equal(view.packet.requester, 'DeepSeek Harness');
      assert.equal(JSON.stringify(view).includes('synthetic-dsh-online-token'), false);

      const sent = await fetch(origin + '/bridge/v1/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ protocolVersion: 1, draftId: view.draftId, requestId: view.requestId, approvedHash: view.approvedHash, destination: view.destination }),
      });
      assert.equal(sent.status, 202);

      const result = await workflow.waitTool.execute({ draftId: prepared.draftId, seconds: 5 }, exec);
      assert.equal(result.ok, true);
      assert.equal(result.advice, 'Use the shared online window.');
      assert.equal(calls, 1);

      const again = await workflow.resultTool.execute({ draftId: prepared.draftId }, exec);
      assert.equal(again.advice, 'Use the shared online window.');
      assert.equal(again.consultation.deliveryKind, classification.deliveryKind);
      for (const [tool, value] of [[workflow.waitTool, result], [workflow.resultTool, again], [workflow.tool, result]]) {
        const parts = tool.output.render({}, value);
        if (classification.deliveryKind === 'guidance') {
          assert.match(parts[0].text, /No expert review was completed/);
          assert.doesNotMatch(parts[0].text, /zesia_consult_feedback|zesia_consult_followup/);
        }
        assert.equal(JSON.parse(parts.at(-1).text).consultation.consultId, 'dsh-online-1');
      }
      assert.equal(calls, 1);
    } finally {
      workflow.close();
    }
  });
}

test('an unconfigured review saves the first credential and still requires approval of the same draft', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'zesia-dsh-review-activation-'));
  const path = join(directory, 'dsh.json');
  const keys = ['ZESIA_CONFIG', 'ZESIA_URL', 'ZESIA_TOKEN', 'ZESIA_PROJECT'];
  const previous = keys.map(key => [key, process.env[key]]);
  for (const key of keys) delete process.env[key];
  process.env.ZESIA_CONFIG = path;
  t.after(async () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  await writeFile(path, '{"project":"keep the prior project","confirmBeforeSend":true}\n', { mode: 0o600 });

  const token = 'fixture-dsh-activation-credential';
  let preflights = 0, sends = 0;
  const workflow = createConsultWorkflow({
    openBrowser: false, onlineOrigin: 'https://zesia.dev',
    preflightRequest: async options => {
      assert.equal(options.token, token);
      preflights++;
      return { ok: true };
    },
    requestConsult: async options => {
      assert.equal(options.token, token);
      assert.equal(options.input.project, 'keep the prior project');
      sends++;
      return { advice: 'Synthetic saved response.', a2a: { contextId: 'test-context', messageId: 'test-reply' } };
    },
  });
  const session = { id: 'dsh-test-session', snapshotEvents: () => [{ type: 'user/message' }] };
  const exec = { agent: { session } };
  try {
    const prepared = await workflow.tool.execute({ project: 'fixture', brief: 'Review the draft.', context: {} }, exec);
    const url = new URL(prepared.url);
    const key = new URLSearchParams(url.hash.slice(1));
    const base = 'http://127.0.0.1:' + key.get('port') + '/bridge/v1/';
    const headers = { Origin: url.origin, Authorization: 'Bearer ' + key.get('key'), 'Content-Type': 'application/json' };
    const get = async path => (await fetch(base + path, { headers })).json();
    const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const before = await get('view');
    assert.equal(before.configured, false);
    const activation = { protocolVersion: 1, destination: before.destination, token };
    assert.equal((await post('configure', { ...activation, destination: 'https://elsewhere.example' })).status, 409);
    assert.equal((await post('configure', { ...activation, token: 'invalid space' })).status, 400);
    const [attempts, setting] = await Promise.all([
      Promise.all([post('configure', activation), post('configure', activation)]),
      workflow.control({ action: 'set_mode', confirmBeforeSend: false }, exec),
    ]);
    assert.equal(setting.confirmBeforeSend, false);
    assert.deepEqual(attempts.map(response => response.status).sort(), [200, 400]);
    const after = await attempts.find(response => response.ok).json();
    assert.equal(after.configured, true);
    assert.equal(after.status, 'prepared');
    assert.equal((await get('status?compact=1')).configured, true);
    for (const field of ['draftId', 'requestId', 'approvedHash', 'destination']) assert.equal(after[field], before[field]);
    assert.deepEqual(after.packet, before.packet);
    assert.equal(JSON.stringify(after).includes(token), false);
    assert.equal((await post('configure', { ...activation, token: 'fixture-replacement' })).status, 400);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      project: 'keep the prior project', confirmBeforeSend: false, url: before.destination, token,
    });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual([preflights, sends], [0, 0]);

    const { draftId, requestId, destination, approvedHash } = before;
    assert.equal((await post('approve', { protocolVersion: 1, draftId, requestId, destination, approvedHash })).status, 202);
    const result = await workflow.waitTool.execute({ draftId, seconds: 5 }, exec);
    assert.equal(result.consultation.a2a.messageId, 'test-reply');
    assert.deepEqual([preflights, sends], [1, 1]);
  } finally {
    workflow.close();
  }
});
