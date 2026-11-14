import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsultWorkflow } from '../src/workflow.mjs';

test('DSH workflow opens shared zesia.dev/consult online bridge and zesia_consult_wait returns the settled advice', async () => {
  let calls = 0;
  const session = { id: 'online-s1', snapshotEvents: () => [{ type: 'user/message' }] };
  const exec = { agent: { session }, signal: new AbortController().signal };
  const workflow = createConsultWorkflow({
    openBrowser: false,
    readConfiguration: async () => ({ url: 'https://api.zesia.dev', token: 'synthetic-dsh-online-token' }),
    preflightRequest: async () => ({ ok: true, modelCalls: 0 }),
    requestConsult: async () => {
      calls += 1;
      return {
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
    assert.equal(calls, 1);
  } finally {
    workflow.close();
  }
});
