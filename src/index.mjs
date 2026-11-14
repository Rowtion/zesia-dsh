import { randomUUID } from 'node:crypto';
import { consultationPrompt } from './prompt.mjs';
import { registerConsultSkills } from './skills.mjs';
import { registerUiRpc } from './ui-rpc.mjs';
import { createConsultWorkflow } from './workflow.mjs';
export { createConsultWorkflow } from './workflow.mjs';
export { createTransportTool as createConsultTool } from './transport.mjs';
export const name = 'zesia-consult';
export const inject = ['tools', 'commands', 'typert', 'skills'];
export function apply(ctx) {
  registerConsultSkills(ctx);
  const workflow = createConsultWorkflow();
  registerUiRpc(ctx, workflow);
  ctx.tools.register(workflow.tool);
  ctx.tools.register(workflow.feedbackTool);
  ctx.tools.register(workflow.followupTool);
  ctx.tools.register(workflow.contextTool);
  ctx.tools.register(workflow.resultTool);
  ctx.tools.register(workflow.waitTool);
  ctx.commands.register({
    definitionId: 'zesia-consult-command', name: 'zesia',
    description: 'Ask zesia for an independent review of the current reply.',
    input: { hint: 'Optional reply ID' },
    handler({ rawInput, agent, signal }) {
      if (signal?.aborted) return { kind: 'error', text: 'zesia request cancelled.' };
      const raw = rawInput.trim();
      let messageId;
      if (raw) {
        try { messageId = raw.startsWith('"') ? JSON.parse(raw) : raw; }
        catch { return { kind: 'error', text: 'Invalid reply ID.' }; }
        if (typeof messageId !== 'string' || !messageId || messageId.length > 200) return { kind: 'error', text: 'Invalid reply ID.' };
      }
      if (typeof agent?.followup !== 'function') return { kind: 'error', text: 'This conversation cannot accept a zesia request.' };
      // Same immutable user-message shape used by the installed DSH LLM helper.
      // followup queues work; it does not wait for an inference or send a consult.
      agent.followup(Object.freeze({ id: randomUUID(), role: 'user', source: Object.freeze({kind:'user'}), content: Object.freeze([Object.freeze({type:'text',text: messageId ? consultationPrompt(messageId) : '/zesia'})]) }));
      return { kind: 'success' };
    },
  });
  // This is a native UI command, not a model-facing send/approval tool.
  ctx.commands.register({
    definitionId: 'zesia-control', name: 'zesia-control', recordInput: false,
    description: 'Local zesia confirmation and privacy preferences',
    async handler({ rawInput, agent, signal }) {
      try {
        const input = JSON.parse(rawInput);
        const result = await workflow.control(input, { agent, signal });
        return { kind: 'success', text: JSON.stringify(result) };
      } catch { return { kind: 'error', text: 'Could not apply the consultation action. No automatic retry was performed.' }; }
    },
  });
}
