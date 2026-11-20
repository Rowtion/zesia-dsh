import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createConsultWorkflow } from '../src/workflow.mjs';
import { createApprovedRequestStore } from '../src/approved-requests.mjs';

async function fixture(run, { preflightRequest } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'zesia-dsh-discussion-'));
  const now = Date.now;
  const events = [{ type: 'user/message' }, { type: 'turn/start', data: { turn: 'turn-1' } }];
  const session = { id: 'discussion-session', header: { cwd: root }, snapshotEvents: () => events };
  const exec = { agent: { session }, signal: AbortSignal.timeout(15_000) };
  const calls = [];
  const workflow = createConsultWorkflow({
    now, openBrowser: false,
    approvedRequests: createApprovedRequestStore({ directory: join(root, 'state'), now }),
    readConfiguration: async () => ({ url: 'https://api.zesia.dev', token: 'synthetic-discussion-token' }),
    preflightRequest: preflightRequest || (async () => ({ ok: true, modelCalls: 0 })),
    requestConsult: async ({ input, contextId, requestId }) => {
      calls.push({ input, contextId, requestId });
      const round = input.context.reviewDiscussion?.challenge?.round ?? 1;
      return {
        format: 'zesia.consult.v0', requestId, consultId: 'synthetic-' + calls.length,
        advice: round === 1 ? 'Revise the reported figure.' : 'Keep the verified terminal figure.',
        resultSchemaVersion: 'zesia.consult.result.v2',
        decision: { status: 'advice', recommendation: round === 1 ? 'Revise the reported figure.' : 'Keep the verified terminal figure.',
          nextSteps: [{ action: 'Use the verification trace.', successCriteria: 'The terminal value is reported.' }] },
        nextAction: { kind: 'apply_advice', blocking: false, requests: [] },
        ...(input.context.reviewDiscussion ? { reviewDiscussion: { version: 1, round, rootRequestId: calls[0].requestId } } : {}),
        a2a: { contextId: contextId ?? 'same-context', messageId: 'reply-' + calls.length },
      };
    },
  });
  try { await run({ root, exec, workflow, calls, events }); }
  finally { workflow.close(); await rm(root, { recursive: true, force: true }); }
}

async function bridge(prepared) {
  const url = new URL(prepared.url);
  const params = new URLSearchParams(url.hash.slice(1));
  const path = 'http://127.0.0.1:' + params.get('port') + '/bridge/v1/';
  const headers = { Origin: url.origin, Authorization: 'Bearer ' + params.get('key'), 'Content-Type': 'application/json' };
  const read = async () => (await fetch(path + 'view', { headers })).json();
  const initial = await read();
  const { draftId, requestId, approvedHash, destination, protocolVersion } = initial;
  const post = (method, extra) => fetch(path + method, {
    method: 'POST', headers, body: JSON.stringify({ draftId, requestId, approvedHash, destination, protocolVersion, ...extra }),
  });
  return { initial, read, approve: extra => post('approve', extra), stop: () => post('stop-discussion') };
}

async function firstRound(s, approval) {
  const draft = await s.workflow.tool.execute({
    project: 'Synthetic animated report', brief: 'Review the final reply. Return an assessment without changing files.',
    context: { materials: [{ id: 'animation', content: 'First paint: 96.7%. Stable output: 99.2%. Source target: 99.2%.' }] },
  }, s.exec);
  assert.equal(draft.status, 'awaiting_online_review');
  assert.deepEqual(draft.draft, { id: draft.draftId });
  assert.equal(s.calls.length, 0);
  const online = await bridge(draft);
  assert.equal(online.initial.discussionMaxRounds, 3);
  assert.equal((await online.approve(approval)).status, 202);
  const result = await s.workflow.waitTool.execute({ draftId: draft.draftId, seconds: 4 }, s.exec);
  return { draft, online, result };
}

async function firstApprovedRound(s) {
  const { draft, online, result } = await firstRound(s, { maxRounds: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.verification.round, 1);
  assert.equal(result.verification.rootRequestId, draft.requestId);
  return { online, result };
}

function objection(result, quote) {
  return { consultId: result.consultation.consultId, objections: [{ findingId: result.verification.findings[0].id, quote }] };
}

test('the same reviewed materials support agent-initiated reconsideration and checked handback', () => fixture(async s => {
  const { online, result } = await firstApprovedRound(s);
  assert.equal((await s.workflow.followupTool.execute(objection(result, 'I disagree'), s.exec)).ok, false);
  assert.equal(s.calls.length, 1);
  const second = await s.workflow.followupTool.execute(objection(result, 'Stable output: 99.2%.'), s.exec);
  assert.equal(second.ok, true);
  assert.equal(second.verification.round, 2);
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].contextId, 'same-context');
  assert.equal(s.calls[1].input.brief, s.calls[0].input.brief);
  assert.deepEqual(s.calls[1].input.context.materials, s.calls[0].input.context.materials);
  assert.notEqual(s.calls[1].requestId, s.calls[0].requestId);
  assert.equal((await online.read()).opinionId, second.consultation.consultId);
  assert.equal((await online.read()).discussion.state, 'verifying');
  const finish = await s.workflow.finishTool.execute({
    consultId: second.consultation.consultId,
    summary: 'The observed terminal value matches the source target.',
    decisions: second.verification.findings.map(finding => ({ findingId: finding.id, status: 'verified', reason: 'Stable capture and source target coincide.' })),
  }, s.exec);
  assert.equal(finish.state, 'completed');
  assert.ok((await online.read()).discussion.state === 'completed');
  assert.equal((await s.workflow.followupTool.execute(objection(second, 'Source target: 99.2%.'), s.exec)).ok, false);
  assert.equal(s.calls.length, 2);
}));

test('adding evidence prepares an exact browser review before any new data is sent', () => fixture(async s => {
  const { online, result } = await firstApprovedRound(s);
  await writeFile(join(s.root, 'capture.txt'), 'Rendered after animation at 1500 ms: 99.2%.\n');
  const followup = await s.workflow.followupTool.execute({
    ...objection(result, 'Rendered after animation at 1500 ms: 99.2%.'),
    evidenceFiles: [{ path: 'capture.txt' }],
  }, s.exec);
  assert.equal(followup.status, 'awaiting_online_review');
  assert.equal(s.calls.length, 1);
  const review = await bridge(followup);
  assert.equal(review.initial.status, 'prepared');
  assert.equal(review.initial.discussionMaxRounds, undefined);
  assert.match(review.initial.packet.context.materials[1].content, /capture\.txt/);
  assert.match(review.initial.packet.context.materials[1].content, /Rendered after animation/);
  assert.equal((await review.approve({ maxRounds: 3 })).status, 400);
  assert.equal((await review.approve()).status, 202);
  const child = await s.workflow.waitTool.execute({ draftId: followup.draftId, seconds: 4 }, s.exec);
  assert.equal(child.ok, true);
  assert.equal(s.calls.length, 2);
  assert.deepEqual(s.calls[1].input.context.reviewDiscussion.challenge.additions, { materials: 1, attachments: 0 });
  assert.equal((await online.stop()).status, 200);
  assert.equal((await online.read()).discussion.state, 'stopped');
  assert.equal((await s.workflow.followupTool.execute(objection(child, 'Source target: 99.2%.'), s.exec)).ok, false);
  assert.equal(s.calls.length, 2);
}));

test('old or unchecked approve remains a single round', () => fixture(async s => {
  const { result } = await firstRound(s, null);
  assert.equal(result.verification, undefined);
  assert.equal(s.calls[0].input.context.reviewDiscussion, undefined);
  assert.equal(s.calls.length, 1);
}));

test('stopping during preflight preserves the last opinion and prevents another model request', () => {
  const blocked = Promise.withResolvers();
  const ready = Promise.withResolvers();
  return fixture(async s => {
    const { online, result } = await firstApprovedRound(s);
    const child = s.workflow.followupTool.execute(objection(result, 'Stable output: 99.2%.'), s.exec);
    await ready.promise;
    try {
      assert.equal((await online.stop()).status, 200);
    } finally { blocked.resolve(); }
    assert.equal((await child).errorCode, 'consult_discussion_stopped');
    assert.equal(s.calls.length, 1);
    assert.equal((await online.read()).opinionId, result.consultation.consultId);
  }, {
    preflightRequest: async ({ input }) => {
      if (input.context.reviewDiscussion?.challenge) { ready.resolve(); await blocked.promise; }
      return { ok: true, modelCalls: 0 };
    },
  });
});
