import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentCard, Message } from '@a2a-js/sdk';
import { consultOverA2A, CONSULT_MEDIA_TYPE } from '../src/a2a-client.mjs';

const input = { requester: 'DeepSeek Harness', project: 'demo', brief: 'Review this reply', context: { goal: 'Check the A2A contract' } };
const card = AgentCard.fromJSON({
  name: 'Zesia Consultant', version: '0.2.0', description: 'contract test',
  supportedInterfaces: [{ url: 'https://consult.example/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ['text/plain', CONSULT_MEDIA_TYPE],
  defaultOutputModes: ['text/plain', CONSULT_MEDIA_TYPE],
  skills: [{ id: 'consult', name: 'Consult', description: 'contract test', tags: ['consult'] }],
});
const reply = { format: 'zesia.consult.v0', consultId: 'consult-1', advice: 'Bounded advice.' };

function fakeServer({ contextId = 'ctx-1' } = {}) {
  let body;
  const message = Message.fromJSON({ messageId: 'server-message-1', contextId, role: 'ROLE_AGENT', parts: [{ data: reply, mediaType: CONSULT_MEDIA_TYPE }] });
  const fetch = async (url, init = {}) => {
    const target = new URL(url instanceof Request ? url.url : url);
    if (target.pathname.endsWith('/.well-known/agent-card.json')) return Response.json(AgentCard.toJSON(card));
    if (target.pathname === '/a2a') {
      body = JSON.parse(init.body);
      return Response.json({ jsonrpc: '2.0', id: body.id, result: { message: Message.toJSON(message) } });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetch, body: () => body };
}

test('DSH A2A request carries only the core packet and an optional caller request ID', async () => {
  const server = fakeServer();
  const result = await consultOverA2A({ url: 'https://consult.example', token: 'token', input, clientRequestId: 'client-request-1', fetch: server.fetch });
  assert.equal(result.advice, 'Bounded advice.');
  assert.equal(result.a2a.contextId, 'ctx-1');
  const body = server.body();
  assert.equal(body.method, 'SendMessage');
  assert.equal(body.params.message.role, 'ROLE_USER');
  assert.equal(body.params.message.messageId, 'client-request-1');
  assert.equal(body.params.message.parts.length, 1);
  assert.equal(body.params.message.parts[0].mediaType, CONSULT_MEDIA_TYPE);
  assert.deepEqual(Object.keys(body.params.message.parts[0].data).sort(), ['brief', 'context', 'project', 'requester']);
  for (const field of ['sessionId', 'turn', 'replyId', 'message_id']) assert.ok(!(field in body.params.message));
});

test('DSH A2A generates a message ID and preserves context continuity', async () => {
  const server = fakeServer();
  await consultOverA2A({ url: 'https://consult.example', token: 'token', input, fetch: server.fetch });
  assert.match(server.body().params.message.messageId, /^[0-9a-f-]{36}$/u);
  await assert.rejects(
    consultOverA2A({ url: 'https://consult.example', token: 'token', input, contextId: 'ctx-2', fetch: fakeServer({ contextId: 'ctx-1' }).fetch }),
    /continuity/u,
  );
  await assert.rejects(
    consultOverA2A({ url: 'https://consult.example', token: 'token', input, clientRequestId: '', fetch: server.fetch }),
    /client request ID/u,
  );
});
