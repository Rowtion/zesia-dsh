import { Message } from '@a2a-js/sdk';
import { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { CONSULT_MEDIA_TYPE } from '@zesia/client/contract';
export { CONSULT_MEDIA_TYPE };

export async function consultOverA2A({ url, token, input, contextId, clientRequestId, signal, fetch: transport = fetch, onStage = () => {} }) {
  const base = new URL(url);
  if (clientRequestId !== undefined && (typeof clientRequestId !== 'string' || !clientRequestId || clientRequestId.length > 200)) {
    throw new Error('Invalid client request ID.');
  }
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === '127.0.0.1')) throw new Error('ZESIA_URL must use HTTPS or loopback HTTP.');
  // Both discovery and RPC are pinned to the configured origin. Never forward
  // credentials to another URL named by a card or follow an HTTP redirect.
  const scopedFetch = (target, init = {}) => {
    if (new URL(target instanceof Request ? target.url : target).origin !== base.origin) throw new Error('Cross-origin A2A endpoint rejected.');
    return transport(target, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${token}` }, redirect: 'error', signal });
  };
  const factory = new ClientFactory({
    transports: [new JsonRpcTransportFactory({ fetchImpl: scopedFetch })],
    cardResolver: new DefaultAgentCardResolver({ fetchImpl: scopedFetch }),
  });
  onStage('discovery');
  const client = await factory.createFromUrl(base.origin);
  let result;
  try {
    onStage('cloud_consultation');
    result = await client.sendMessage({ message: Message.fromJSON({ messageId: clientRequestId || crypto.randomUUID(), role: 'ROLE_USER', ...(contextId ? {contextId} : {}),
    parts: [{ data: input, mediaType: CONSULT_MEDIA_TYPE }] }) }, { signal });
  } catch (error) {
    const info = Array.isArray(error.data) ? error.data.find(item => item['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' && item.domain === 'a2a-protocol.org') : undefined;
    if (info?.metadata) error.metadata = info.metadata;
    throw error;
  }
  const message = 'messageId' in result ? result : undefined;
  if (!message) throw new Error('Expected a stateless consultation message.');
  const data = message.parts.find(part => part.content?.$case === 'data')?.content.value;
  if (!data || data.format !== 'zesia.consult.v0' || typeof data.advice !== 'string') throw new Error('Invalid consultation result.');
  if (!message.contextId || (contextId && message.contextId !== contextId)) throw new Error('A2A context continuity was not preserved; do not retry automatically.');
  return { ...data, a2a: { contextId: message.contextId, messageId: message.messageId, historyRetained: false } };
}


export async function preflightConsult({ url, token, input, signal, fetch: transport = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === '127.0.0.1')) throw new Error('ZESIA_URL must use HTTPS or loopback HTTP.');
  const response = await transport(new URL('/v1/consult/preflight', base), { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(input), redirect: 'error', signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error('Preflight could not be completed.'), { code: response.status === 401 ? 'authentication_failed' : 'preflight_unavailable', ...(result.ok === false && result.code ? { failure: result } : {}) });
  if (result.format !== 'zesia.consult.preflight.v1' || typeof result.ok !== 'boolean' || result.modelCalls !== 0) throw Object.assign(new Error('Invalid preflight response.'), { code: 'preflight_unavailable' });
  return result;
}
