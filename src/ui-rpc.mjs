import { z } from 'zod';
const strict = (name, create) => ({ mode: 'strict', typeSymbol: '@zesia/dsh-plugin-ui#' + name, create });
// Uses the installed dsh Typert registry contract. UI calls are not commands
// and therefore append no command/run or command/done transcript events.
export const UI_RPC_DESCRIPTOR = {
  id: '@zesia/dsh-plugin-ui#zesiaUi/control', service: 'zesiaUi', namespace: 'zesiaUi', method: 'control',
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent', codec: { ...strict('sessionId', () => z.string().min(1).max(256)), typeSymbol: '@deepseek-ai/dsh-session/types#SessionId' } },
    { name: 'input', wire: 'input', source: 'json', codec: strict('input', () => z.object({ action: z.enum(['settings','set_mode','draft_for_turn','status','cancel','send']) }).passthrough()) },
  ], cancellation: { parameter: 'signal' }, result: strict('result', () => z.unknown()),
};
export const SETTINGS_RPC_DESCRIPTOR = {
  id: '@zesia/dsh-plugin-ui#zesiaUi/settings', service: 'zesiaUi', namespace: 'zesiaUi', method: 'settings',
  invocation: { kind: 'direct' },
  parameters: [{name:'input',wire:'input',source:'json',codec:strict('settingsInput',()=>z.object({action:z.enum(['settings','set_mode']),confirmBeforeSend:z.boolean().optional()}).strict())}],
  cancellation:{parameter:'signal'},result:strict('settingsResult',()=>z.unknown()),
};
export const CONSULT_COMMAND_RPC_DESCRIPTOR = {
  id: '@zesia/dsh-plugin-ui#zesiaUi/consult', service:'zesiaUi', namespace:'zesiaUi', method:'consult', invocation:{kind:'direct'},
  parameters:[UI_RPC_DESCRIPTOR.parameters[0], {name:'messageId',wire:'messageId',source:'json',codec:strict('replyId',()=>z.string().min(1).max(200))}],
  cancellation:{parameter:'signal'},result:strict('commandResult',()=>z.unknown()),
};
export const UI_REMOTE = { package: '@zesia/dsh-plugin-ui', descriptors: [UI_RPC_DESCRIPTOR, SETTINGS_RPC_DESCRIPTOR, CONSULT_COMMAND_RPC_DESCRIPTOR] };
export function registerUiRpc(ctx, workflow) {
  const service = {
    async consult(agent, messageId, signal) {
      if (typeof messageId !== 'string' || !messageId || messageId.length > 200) throw new Error('Invalid reply ID.');
      const executed = await ctx.commands.execute(agent, '/zesia ' + JSON.stringify(messageId), [], signal);
      if (!executed || executed.result.kind !== 'success') throw new Error(executed?.result.text || 'zesia command unavailable.');
      return { accepted:true };
    },
    async settings(input, signal) {
      if(!input||typeof input!=='object'||Array.isArray(input)||!['settings','set_mode'].includes(input.action)||Object.keys(input).some(key=>!['action','confirmBeforeSend'].includes(key)))throw new Error('Only global consultation preferences are available here.');
      return workflow.control(input,{signal});
    },
    async control(agent, input, signal) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.action !== 'string') throw new Error('Invalid zesia UI action.');
      return workflow.control(input, { agent, signal });
    },
  };
  service.typertRemote = { service, serviceKey: 'zesiaUi', namespace: 'zesiaUi' };
  ctx.provide('zesiaUi', service);
  ctx.typert.register({ package: '@zesia/dsh-plugin-ui', face: 'host', model: {}, schemas: [], invocations: [UI_RPC_DESCRIPTOR, SETTINGS_RPC_DESCRIPTOR, CONSULT_COMMAND_RPC_DESCRIPTOR] });
}
