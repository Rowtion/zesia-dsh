import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdoptionTracker, ADOPTION_INSTRUCTIONS } from '../src/adoption.mjs';
import { createTransportTool } from '../src/transport.mjs';
import { createConsultWorkflow } from '../src/workflow.mjs';

test('adoption records cover every recommendation locally and never claim executed work', async () => {
  const tracker = createAdoptionTracker(); const session = {};
  const exec = { agent: { session } };
  tracker.remember(session, { ok: true, consultation: { consultId: 'c1', decision: { nextSteps: [{ action: 'Verify resources' }] } } });
  const args = { consultId: 'c1', accepted: [{ target: 'recommendation', reason: 'Evidence only supports exploration', change: 'Downgrade the strong conclusion' }], declined: [], deferred: [], nextStep: 'Check prerequisites before spending' };
  assert.equal((await tracker.tool.execute(args, exec)).code, 'adoption_incomplete');
  args.deferred = [{ target: 'step:0', reason: 'Available material not established', change: 'Block the assay until sufficiency is checked' }];
  for (const consultId of [undefined, '', ' ', 7]) {
    const failure = await tracker.tool.execute({ ...args, consultId }, exec);
    assert.equal(failure.code, 'consultation_id_required');
    assert.match(failure.message, /consultation\.consultId/);
  }
  assert.equal((await tracker.tool.execute({ ...args, consultId: 'c2' }, exec)).code, 'consultation_not_in_this_session');
  assert.equal((await tracker.tool.execute(args, { agent: { session: {} } })).code, 'consultation_not_in_this_session');
  assert.equal(tracker.get(session, 'c1'), null);
  const result = await tracker.tool.execute(args, exec);
  assert.equal(result.ok, true); assert.equal(result.feedback.workExecuted, false);
  assert.equal((await tracker.tool.execute(args, exec)).cached, true);
  assert.equal(tracker.get(session, 'c1').accepted[0].change, args.accepted[0].change);
  assert.match(ADOPTION_INSTRUCTIONS, /do not merely repeat/);
});

test('transport preserves observed failure stages and does not retry unknown outcomes', async () => {
  for (const failStage of ['preflight','discovery','cloud_consultation']) {
    let calls = 0;
    const rows = [];
    const tool = createTransportTool({ readConfiguration: async () => ({ url: 'https://consult.example', token: 'synthetic-only' }), onProgress: row => rows.push(row),
      preflightRequest: async () => { if (failStage === 'preflight') throw new Error('synthetic failure'); return { ok: true, modelCalls: 0 }; },
      requestConsult: async ({ onStage }) => { calls++; onStage(failStage); throw new Error('synthetic failure'); } });
    const result = await tool.execute({ brief: 'Review', project: 'synthetic', context: {} }, { signal: new AbortController().signal });
    assert.equal(result.ok, false); assert.equal(result.error.stage, failStage);
    assert.equal(result.error.outcome, failStage === 'cloud_consultation' ? 'unknown' : 'not_started');
    assert.equal(result.retryAllowed, false); assert.ok(rows.length);
    assert.equal(calls, failStage === 'preflight' ? 0 : 1);
    assert.equal(result.trace.at(-1).stage, failStage);
  }
});

test('native progress and adoption retrieval stay in the original session and make no remote request', async () => {
  let calls = 0; const session = { id: 's1', snapshotEvents: () => [{ type: 'user/message' }] };
  const exec = { agent: { session }, signal: new AbortController().signal };
  const workflow = createConsultWorkflow({ enableOnlineBridge: false, readConfiguration: async () => ({ url: 'https://consult.example', token: 'synthetic' }), preflightRequest: async () => ({ ok: true, modelCalls: 0 }), requestConsult: async ({ onStage }) => { calls++; onStage('discovery'); onStage('cloud_consultation'); return { advice: 'Bounded advice', consultId: 'c2', decision: { nextSteps: [] } }; } });
  const { draft } = await workflow.tool.execute({ brief: 'Review', project: 'test', context: {} }, exec);
  const control = { draftId: draft.id, draftHash: draft.hash };
  assert.equal((await workflow.control({ ...control, action: 'status' }, exec)).status, 'prepared');
  assert.equal(calls, 0);
  await workflow.control({ ...control, action: 'send', approvedHash: draft.hash, packet: draft.packet }, exec);
  const result = await workflow.feedbackTool.execute({ consultId: 'c2', accepted: [], declined: [{ target: 'recommendation', reason: 'Missing support', change: 'Keep existing plan and investigate' }], deferred: [], nextStep: 'Inspect evidence' }, exec);
  assert.equal(result.ok, true);
  const status = await workflow.control({ ...control, action: 'status' }, exec);
  assert.equal(status.trace.at(-1).stage, 'result_received');
  assert.equal(status.feedback.workExecuted, false);
  assert.equal(calls, 1);
  assert.equal((await workflow.control({ ...control, action: 'status' }, { agent: { session: {} } })).ok, false);
});
