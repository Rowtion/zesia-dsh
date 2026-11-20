import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApprovedRequestStore, REVIEW_TTL_MS } from '../src/approved-requests.mjs';
import { createConsultWorkflow } from '../lib/index.mjs';

const token = 'local-recovery-fixture-token';
const contextId = 'recovery-context';
const mediaType = 'application/vnd.zesia.consult+json';

async function review(draft) {
  const link = new URL(draft.url);
  const capability = new URLSearchParams(link.hash.slice(1));
  const base = 'http://127.0.0.1:' + capability.get('port') + '/bridge/v1/';
  const headers = { Origin: link.origin, Authorization: 'Bearer ' + capability.get('key'), 'Content-Type': 'application/json' };
  const status = async (path = 'status') => (await fetch(base + path, { headers })).json();
  const view = await status('view');
  const binding = { protocolVersion: 1, draftId: view.draftId, approvedHash: view.approvedHash, destination: view.destination, requestId: view.requestId };
  return {
    status,
    approve: () => fetch(base + 'approve', { method: 'POST', headers, body: JSON.stringify(binding) }),
    cancel: () => fetch(base + 'cancel', { method: 'POST', headers, body: JSON.stringify(binding) }),
  };
}

test('the bundled CLI sends the approved ID once and a saved reply survives restarting the DSH host', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'zesia-dsh-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sends = [], reads = [];
  const runs = new Map();
  let preflights = 0;
  let recoverCompleted = false;
  let now = Date.now();
  let fixtureError;
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.headers.authorization, 'Bearer ' + token);
      if (req.method === 'GET') {
        const requestId = req.url.slice('/v1/consult/requests/'.length);
        assert.equal(req.url, '/v1/consult/requests/' + requestId);
        reads.push(requestId);
        const result = runs.get(requestId);
        const state = result && recoverCompleted ? 'completed' : 'running';
        res.end(JSON.stringify({ requestId, contextId, state, ...(state === 'completed' ? { result } : {}) }));
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (req.url === '/v1/consult/preflight') {
        preflights++;
        res.end(JSON.stringify({ format: 'zesia.consult.preflight.v1', ok: true, modelCalls: 0 }));
        return;
      }
      assert.equal(req.url, '/a2a');
      assert.equal(body.method, 'SendMessage');
      assert.equal(body.params.message.parts[0].mediaType, mediaType);
      const requestId = req.headers['x-zesia-request-id'];
      assert.match(requestId, /^zrq-\d{13}-[a-f0-9-]{36}$/);
      assert.equal(body.params.message.messageId, requestId);
      assert.equal(runs.has(requestId), false);
      sends.push({ requestId, message: body.params.message });
      const followUp = { requests: sends.length === 1 ? [{ id: 'collect', kind: 'evidence', question: 'What did the fixture observe?' }] : [], round: sends.length, maxRounds: 3 };
      runs.set(requestId, {
        requestId, format: 'zesia.consult.v0', consultId: 'recovery-' + sends.length, advice: 'Saved synthetic opinion',
        followUp, a2a: { messageId: 'original-reply-' + sends.length, contextId },
      });
      // The service retained the accepted result, but the native CLI receives no reply.
      res.destroy();
    } catch (error) {
      fixtureError = error;
      res.writeHead(500).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = 'http://127.0.0.1:' + server.address().port;
  let configuration = { url, token };
  const runWorkflow = () => {
    const workflow = createConsultWorkflow({
      openBrowser: false, readConfiguration: async () => configuration, now: () => now,
      approvedRequests: createApprovedRequestStore({ directory, now: () => now }),
    });
    t.after(() => workflow.close());
    return workflow;
  };
  const conversation = id => ({ agent: { session: { id, snapshotEvents: () => [
    { type: 'user/message' }, { type: 'turn/start', data: { turn: 2 } },
  ] } } });
  const args = { project: 'recovery-fixture', brief: 'Review this synthetic plan.', context: { goal: 'Verify recovery' } };
  let exec = conversation('recovery-session');
  const unrelated = conversation('other-session');
  const original = runWorkflow();
  const prepared = await original.tool.execute(args, exec);
  const approved = await review(prepared);
  const cancelled = await review(await original.tool.execute(args, unrelated));
  await cancelled.cancel();
  assert.equal((await cancelled.status()).status, 'cancelled');
  assert.equal(reads.length, 0);
  assert.equal(sends.length, 0);
  assert.equal(preflights, 0);
  assert.equal((await approved.approve()).status, 202);
  const unknown = await original.waitTool.execute({ draftId: prepared.draftId, seconds: 4 }, exec);
  assert.equal(unknown.status, 'unknown');
  assert.deepEqual(reads, [prepared.requestId]);
  assert.equal((await approved.status('status?compact=1')).status, 'running');
  assert.equal((await approved.approve()).status, 200);
  assert.equal(sends[0].requestId, prepared.requestId);
  assert.equal(preflights, 1);
  const localFile = join(directory, prepared.draftId + '.json');
  assert.equal((await stat(localFile)).mode & 0o777, 0o600);
  assert.equal((await readFile(localFile, 'utf8')).includes(token), false);
  original.close();

  exec = conversation('recovery-session');
  const restarted = runWorkflow();
  const card = await restarted.control({ action: 'draft_for_turn', turn: 2 }, exec);
  assert.equal(card.draft.id, prepared.draftId);
  assert.equal(card.status, 'unknown');
  assert.equal((await restarted.resultTool.execute({ draftId: prepared.draftId }, unrelated)).errorCode, 'consult_result_unavailable');

  configuration = { url, token: 'changed-recovery-token' };
  assert.equal((await restarted.resultTool.execute({ draftId: prepared.draftId }, exec)).status, 'unknown');
  assert.equal(reads.length, 1);
  now += 2001;
  configuration = { url, token };
  recoverCompleted = true;
  const results = await Promise.all(Array.from({ length: 5 }, () => restarted.resultTool.execute({ draftId: prepared.draftId }, exec)));
  assert.ok(results.every(result => result.ok && result.requestId === prepared.requestId &&
    result.consultation.a2a.messageId === 'original-reply-1'));
  assert.equal(reads.length, 2);
  assert.equal(sends.length, 1);
  assert.equal(preflights, 1);

  const draft = await restarted.followupTool.execute({ consultId: results[0].consultation.consultId,
    answers: [{ requestId: 'collect', text: 'Fixture read one saved reply.', sourceRef: 'fixture-output' }] }, exec);
  assert.notEqual(draft.requestId, prepared.requestId);
  assert.equal(preflights, 1);
  const followup = await review(draft);
  assert.equal((await followup.approve()).status, 202);
  const returned = await restarted.waitTool.execute({ draftId: draft.draftId, seconds: 4 }, exec);
  assert.equal(returned.consultation.a2a.messageId, 'original-reply-2');
  assert.equal(sends[1].message.contextId, contextId);
  assert.equal(sends[1].requestId, draft.requestId);
  const view = await followup.status('view');
  assert.equal(view.status, 'completed');
  assert.equal(view.rawResult.a2a.messageId, 'original-reply-2');
  assert.equal(sends.length, 2);
  assert.equal(preflights, 2);
  assert.equal(reads.length, 3);
  assert.ifError(fixtureError);

  restarted.close();
  exec = conversation('recovery-session');
  const reopened = runWorkflow();
  assert.equal((await reopened.resultTool.execute({ draftId: prepared.draftId }, exec)).ok, true);
  const duplicate = await reopened.followupTool.execute({ consultId: results[0].consultation.consultId,
    answers: [{ requestId: 'collect', text: 'Do not repeat an approved round.', sourceRef: 'fixture-output' }] }, exec);
  assert.equal(duplicate.errorCode, 'followup_unavailable');
  assert.equal(sends.length, 2);
  assert.equal(preflights, 2);

  now += REVIEW_TTL_MS;
  assert.equal((await reopened.resultTool.execute({ draftId: draft.draftId }, exec)).errorCode, 'consult_result_unavailable');
  assert.equal((await reopened.resultTool.execute({ draftId: prepared.draftId }, exec)).errorCode, 'consult_result_unavailable');
  await assert.rejects(stat(localFile), { code: 'ENOENT' });
});
