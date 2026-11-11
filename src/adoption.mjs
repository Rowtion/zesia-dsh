export const ADOPTION_INSTRUCTIONS = 'After receiving successful advice, assess every recommendation and next step against the actual user constraints. Call zesia_consult_feedback with consultId copied exactly from consultation.consultId in this result and your accepted, declined and deferred decisions, the reason for each, the concrete plan change, and the next step. Targets are recommendation and step:0, step:1, etc. Explain these decisions to the user in their language; do not merely repeat the consultant. This local record is a decision, not evidence of executed work. Failed consultation: report the failed stage and outcome without calling feedback or automatically consulting again.';
export function createAdoptionTracker() {
  const sessions = new WeakMap();
  function remember(session, result) {
    if (!session || !result.ok || !result.consultation?.consultId) return;
    let items = sessions.get(session); if (!items) { items = new Map(); sessions.set(session, items); }
    if (items.size >= 20) items.delete(items.keys().next().value);
    items.set(result.consultation.consultId, { result, feedback: null });
  }
  const item = { type: 'object', additionalProperties: false, required: ['target','reason','change'], properties: { target: { type: 'string' }, reason: { type: 'string', minLength: 1, maxLength: 2000 }, change: { type: 'string', minLength: 1, maxLength: 2000 } } };
  const tool = {
    name: 'zesia_consult_feedback', description: 'Record locally how this conversation will use a completed 则灵 consultation. No network or execution. Cover recommendation and every step exactly once across accepted, declined and deferred. Explain reasons and concrete plan changes; recording a plan is not completing it.',
    parameters: { type: 'object', additionalProperties: false, required: ['consultId','accepted','declined','deferred','nextStep'], properties: { consultId: { type: 'string', minLength: 1, description: 'Copy consultation.consultId from the consultation result. Do not use the A2A context ID.' }, ...Object.fromEntries(['accepted','declined','deferred'].map(key => [key, { type: 'array', maxItems: 6, items: item }])), nextStep: { type: 'string', minLength: 1, maxLength: 2000 } } },
    output: { schema: { type: 'object', additionalProperties: true, required: ['ok'], properties: { ok: { type: 'boolean' } } }, render: (_args,value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const consultId = args?.consultId;
      if (typeof consultId !== 'string' || !consultId.trim()) {
        return { ok: false, code: 'consultation_id_required', message: 'Pass consultation.consultId from the result being reviewed. Feedback is local; do not start another consultation.' };
      }
      const entry = sessions.get(exec.agent?.session)?.get(consultId);
      if (!entry) return { ok: false, code: 'consultation_not_in_this_session', message: 'Use the consultation result from this conversation. An A2A context ID is not a consultation ID.' };
      if (entry.feedback) return { ok: true, cached: true, feedback: entry.feedback };
      const expected = ['recommendation', ...(entry.result.consultation.decision?.nextSteps || []).map((_,i) => 'step:' + i)];
      const rows = ['accepted','declined','deferred'].flatMap(key => Array.isArray(args[key]) ? args[key] : [null]);
      if (rows.some(row => !row || !expected.includes(row.target) || typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 2000 || typeof row.change !== 'string' || !row.change.trim() || row.change.length > 2000) || rows.length !== expected.length || new Set(rows.map(row => row.target)).size !== expected.length || typeof args.nextStep !== 'string' || !args.nextStep.trim() || args.nextStep.length > 2000) return { ok: false, code: 'adoption_incomplete', expectedTargets: expected };
      entry.feedback = { ...structuredClone(args), recordedAt: new Date().toISOString(), workExecuted: false };
      return { ok: true, feedback: entry.feedback };
    },
  };
  return { tool, remember, get: (session,id) => sessions.get(session)?.get(id)?.feedback || null };
}
