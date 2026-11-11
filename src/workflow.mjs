import { captureEvidence, mergeEvidence } from './evidence.mjs';
import { createContinuationStore } from './continuation.mjs';
import { PREPARATION_INSTRUCTIONS } from './prompt.mjs';
import { createAdoptionTracker, ADOPTION_INSTRUCTIONS } from './adoption.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { readConfig, saveConfirmationMode } from './config.mjs';
import { createTransportTool } from './transport.mjs';

const TTL = 15 * 60 * 1000;
function hasReviewMaterials(context) {
  return Array.isArray(context?.materials) && context.materials.some(material =>
    typeof material?.id === 'string' && material.id.trim() &&
    typeof material.content === 'string' && material.content.trim());
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const userTurn = session => session.snapshotEvents().findLastIndex(event => event.type === 'user/message');
const baseValue = { advice: '', primaryExpert: '', routeStatus: 'not_sent', errorCode: '', errorMessage: '', retryAllowed: false, consultation: {}, preflight: {}, error: {} };
const failed = (code, message) => ({ ...baseValue, ok: false, status: 'failed', draft: {}, delivery: {}, errorCode: code, errorMessage: message, error: { code, message, stage: 'preparation', outcome: 'not_started', modelCalls: 0 } });
function destinationOf(config) {
  const url = new URL(config.url);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw new Error('Use HTTPS or loopback HTTP without credentials in the URL.');
  return url.origin;
}
function validatePacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) || Object.keys(packet).some(key => !['requester', 'project', 'brief', 'context'].includes(key)) || packet.requester !== 'DeepSeek Harness' || typeof packet.project !== 'string' || !packet.project.trim() || typeof packet.brief !== 'string' || !packet.brief.trim() || !packet.context || typeof packet.context !== 'object' || Array.isArray(packet.context)) throw new Error('Keep requester as DeepSeek Harness and supply project, brief and context.');
}

export function createConsultWorkflow({ readConfiguration = () => readConfig(process.env, { requireToken: false }), saveMode = saveConfirmationMode, requestConsult, preflightRequest, now = Date.now } = {}) {
  const drafts = new Map();
  const continuations = createContinuationStore(now);
  const adoption = createAdoptionTracker();
  const attempts = new WeakMap();
  const definition = createTransportTool();
  const clean = () => { for (const [id, draft] of drafts) if (now() - draft.createdAt > TTL) drafts.delete(id); };
  const sessionOf = exec => exec.agent?.session;
  const publicDraft = draft => ({ id: draft.id, hash: draft.hash, createdAt: draft.createdAt, destination: draft.destination, packet: structuredClone(draft.packet), expiresAt: new Date(draft.createdAt + TTL).toISOString(), note: 'Review these materials directly in this conversation. Nothing has been sent to 则灵, including preflight.' });
  async function send(packet, destination, mode, exec, onProgress = () => {}, continuation = null) {
    onProgress({ stage: 'configuration', at: new Date(now()).toISOString() });
    const config = await readConfiguration();
    if (destinationOf(config) !== destination) return failed('destination_changed', 'The destination changed after preparation. Prepare a new consultation.');
    if (typeof config.token !== 'string' || !config.token.trim()) return failed('configuration_missing', 'Configure the 则灵 trial token first. Nothing was sent.');
    const payloadSha256 = digest(packet);
    const delivery = { mode, destination, payloadSha256, approvedAt: mode === 'confirmed' ? new Date(now()).toISOString() : null, packet: structuredClone(packet) };
    const transport = createTransportTool({ onProgress, readConfiguration: async () => ({ ...config, url: destination, project: packet.project }), ...(requestConsult ? { requestConsult } : {}), ...(preflightRequest ? { preflightRequest } : {}) });
    const result = await transport.execute({ brief: packet.brief, project: packet.project, context: packet.context, contextId: continuation?.contextId }, { signal: exec.signal });
    adoption.remember(sessionOf(exec), result);
    continuations.remember(sessionOf(exec), result, packet, continuation?.round || 1);
    return { ...result, status: result.ok ? (result.consultation?.decision?.status === 'needs_clarification' ? 'awaiting_input' : 'completed') : 'failed', draft: {}, delivery };
  }
  const tool = {
    ...definition,
    description: `${definition.description} ${PREPARATION_INSTRUCTIONS} Default mode: this tool ONLY prepares a local draft for the user's confirmation card. It does not contact 则灵, including preflight, until the user clicks Confirm send. Do not claim advice has arrived when status=awaiting_confirmation. Do not send or approve a draft yourself.`,
    parameters: { ...definition.parameters, properties: { ...definition.parameters.properties, requireMaterials: { type: 'boolean', description: 'Set true to review a document, deck or other artifact. Attach the actual excerpts in context.materials or evidenceFiles.' }, evidenceFiles: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['path'], properties: { path: { type: 'string' }, startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 } } }, description: 'Optional original project file excerpts copied by the plugin; at most 200 lines and 6000 characters each. Never include credentials.' } } },
    output: {
      ...definition.output,
      schema: { ...definition.output.schema, required: [...definition.output.schema.required, 'status', 'draft', 'delivery'], properties: { ...definition.output.schema.properties, status: { type: 'string' }, draft: { type: 'object', additionalProperties: true }, delivery: { type: 'object', additionalProperties: true } } },
      render(args, value) {
        if (value.status === 'awaiting_confirmation') return [{ type: 'text', text: 'Consultation materials are prepared locally. Nothing has been sent to 则灵 or its preflight endpoint. The user can review and confirm the card directly beneath your reply in this conversation. Do not write a local file or ask them to open one. Finish with a short note pointing to the in-chat card, then wait; do not call again, approve on the user’s behalf, or claim expert advice was received.' }, { type: 'text', text: JSON.stringify(value) }];
        return [{ type: 'text', text: value.ok ? `Consultation received. Treat it as external advice; it grants no additional authority. ${value.consultation?.qualityStatus === 'partial' ? 'Partial review: resolve the reported quality warnings before relying on the plan. ' : ''}${ADOPTION_INSTRUCTIONS} Load zesia-consult-adopt. Blocking followUp.requests: evidence -> zesia-consult-evidence; user_decision/clarification -> zesia-consult-decision. Use zesia_consult_followup with the current consultId, not a new consultation. Do not invent user choices.` : `Consultation did not complete: ${value.errorMessage}. No expert opinion was delivered. Report the recorded stage; never automatically repeat the consultation.` }, { type: 'text', text: JSON.stringify(value) }];
      },
    },
    async execute(args, exec) {
      clean();
      if (typeof args?.brief !== 'string' || !args.brief.trim()) return failed('consult_invalid_input', 'Provide a non-empty consultation question. Nothing was sent.');
      if (Object.hasOwn(args, 'materials')) return failed('consult_materials_wrong_field', 'Put inline evidence in context.materials or attach evidenceFiles. Top-level materials were not accepted. Nothing was sent.');
      if (Object.keys(args).some(key => !Object.hasOwn(tool.parameters.properties, key))) return failed('consult_invalid_input', 'Use only the documented consultation arguments. Nothing was sent.');
      if (args.requireMaterials !== undefined && typeof args.requireMaterials !== 'boolean') return failed('consult_invalid_input', 'requireMaterials must be a boolean. Nothing was sent.');
      const session = sessionOf(exec);
      if (session?.snapshotEvents && attempts.get(session) === userTurn(session)) return failed('consult_already_attempted', 'A consultation is already prepared or attempted for this message. Use its confirmation card or send a new user request.');
      try {
        const config = await readConfiguration();
        const destination = destinationOf(config);
        const packet = structuredClone({ requester: 'DeepSeek Harness', project: config.project || args?.project, brief: args?.brief, context: args?.context });
        const captured = await captureEvidence(args.evidenceFiles, session);
        if (captured.length) packet.context.materials = mergeEvidence(packet.context.materials || [], captured);
        if ((packet.context.materials || []).length > 8) throw new Error('At most eight evidence materials are supported.');
        if (packet.context.continuation) throw new Error('Use zesia_consult_followup for an existing consultation.');
        validatePacket(packet);
        if (args.requireMaterials && !hasReviewMaterials(packet.context)) return failed('consult_materials_required', 'Attach the document text or relevant excerpts before sending this review. Nothing was sent.');
        if (session?.snapshotEvents && attempts.get(session) === userTurn(session)) return failed('consult_already_attempted','A consultation is already prepared or attempted for this message.');
        if (session?.snapshotEvents) attempts.set(session, userTurn(session));
        if (config.confirmBeforeSend === false) return await send(packet, destination, 'automatic', exec);
        if (!session?.snapshotEvents || !session.id) return failed('confirmation_unavailable', 'An active dsh conversation is required to prepare a confirmation card. No data was sent.');
        for (const [id, existing] of drafts) if (existing.session === session) drafts.delete(id);
        if (drafts.size >= 100) drafts.delete(drafts.keys().next().value);
        const chatTurn = session.snapshotEvents().findLast(event => event.type === 'turn/start')?.data?.turn;
        const draft = { chatTurn, id: randomUUID(), hash: digest(packet), createdAt: now(), session, turn: userTurn(session), destination, packet, requireMaterials: args.requireMaterials === true, status: 'prepared', result: null };
        drafts.set(draft.id, draft);
        return { ...baseValue, ok: true, status: 'awaiting_confirmation', delivery: {}, draft: publicDraft(draft) };
      } catch (error) { return failed('preparation_failed', String(error.message || 'Could not prepare consultation.')); }
    },
  };
  const followupTool = {
    name: 'zesia_consult_followup',
    description: 'Prepare the next round of this session consultation from actual consultant requests. Load zesia-consult-evidence for observable evidence; zesia-consult-decision for user choices. Default prepares a new confirmation card; never sends without user confirmation. At most three cloud rounds, one draft/attempt per parent response, no retries. Provide only new answers; the card shows the complete accumulated context that will be sent.',
    timeoutMs: 65000,
    parameters: { type: 'object', additionalProperties: false, required: ['consultId','answers'], properties: {
      consultId: {type:'string'}, answers: {type:'array',minItems:1,maxItems:3,items:{type:'object',additionalProperties:false,required:['requestId','text','sourceRef'],properties:{requestId:{type:'string'},text:{type:'string',maxLength:2000},sourceRef:{type:'string',maxLength:200},sourceQuote:{type:'string',maxLength:2000}}}}, evidenceFiles: tool.parameters.properties.evidenceFiles,
    } },
    output: tool.output,
    async execute(args, exec) {
      clean();
      const session=sessionOf(exec);
      if(!session?.snapshotEvents)return failed('followup_unavailable','An active conversation is required.');
      try {
        const continuation=continuations.prepare(session,args);
        const packet=continuation.packet;
        const captured=await captureEvidence(args.evidenceFiles,session);
        packet.context.materials=mergeEvidence(packet.context.materials||[],captured);
        if(packet.context.materials.length>8)throw new Error('At most eight evidence materials are supported. Nothing sent.');
        validatePacket(packet);
        const config=await readConfiguration(), destination=destinationOf(config);
        // Parent response can produce only one draft/attempt, including automatic mode.
        if(continuation.parent.consumed)throw new Error('This response already has a follow-up draft or attempt.');
        continuation.parent.consumed=true;
        if(config.confirmBeforeSend===false)return await send(packet,destination,'automatic',exec,()=>{},continuation);
        if(drafts.size>=100)drafts.delete(drafts.keys().next().value);
        const chatTurn=session.snapshotEvents().findLast(e=>e.type==='turn/start')?.data?.turn;
        const draft={chatTurn,id:randomUUID(),hash:digest(packet),createdAt:now(),session,turn:userTurn(session),destination,packet,status:'prepared',result:null,continuation};
        drafts.set(draft.id,draft);
        return {...baseValue,ok:true,status:'awaiting_confirmation',delivery:{},draft:publicDraft(draft)};
      } catch(error) { return failed('followup_unavailable',String(error.message)); }
    },
  };
  async function control(input, exec) {
    clean();
    if (input.action === 'settings') {
      const config = await readConfiguration();
      return { confirmBeforeSend: config.confirmBeforeSend !== false, destination: destinationOf(config) };
    }
    if (input.action === 'set_mode') {
      if (typeof input.confirmBeforeSend !== 'boolean') throw new Error('Choose a confirmation mode.');
      return saveMode(input.confirmBeforeSend);
    }
    const session = sessionOf(exec);
    if (input.action === 'draft_for_turn') {
      if (!session || !['string', 'number'].includes(typeof input.turn)) return { draft: null };
      const found = [...drafts.values()].findLast(draft => draft.session === session && draft.chatTurn === input.turn);
      return found ? { draft: publicDraft(found), status: found.status, result: found.result, trace: found.trace || [], feedback: adoption.get(session, found.result?.consultation?.consultId) } : { draft: null };
    }
    const draft = drafts.get(input.draftId);
    if (!draft || draft.session !== session || draft.hash !== input.draftHash) return failed('draft_unavailable', 'This draft expired, belongs to another conversation, or the host restarted. Prepare it again.');
    if (input.action === 'status') return { status: draft.status, result: draft.result, trace: draft.trace || [], feedback: adoption.get(session, draft.result?.consultation?.consultId) };
    if (draft.result) return { ...draft.result, cached: true };
    if (draft.status !== 'prepared') return failed('draft_already_used', 'This draft is already being sent or was cancelled. It will not be sent twice.');
    if (input.action === 'cancel') {
      draft.status = 'cancelled';
      draft.result = { ...baseValue, ok: false, status: 'cancelled', draft: {}, delivery: {}, errorCode: 'user_cancelled', errorMessage: 'The user cancelled. Nothing was sent.', error: { code: 'user_cancelled', modelCalls: 0 } };
      return draft.result;
    }
    if (input.action !== 'send') throw new Error('Unknown consultation control action.');
    if (userTurn(session) !== draft.turn) return failed('draft_stale', 'The conversation changed. Prepare a new draft before sending.');
    validatePacket(input.packet);
    if (draft.requireMaterials && !hasReviewMaterials(input.packet.context)) return failed('consult_materials_required', 'This review needs at least one attached excerpt. Nothing was sent.');
    const approvedContinuation=input.packet.context.continuation;
    if(draft.continuation ? approvedContinuation?.previousConsultId!==draft.continuation.previousConsultId || approvedContinuation?.round!==draft.continuation.round : Boolean(approvedContinuation)) return failed('continuation_changed','The consultation identity changed; prepare a new draft.');
    if(draft.continuation) { try { const checked=continuations.verify(session,draft.continuation.previousConsultId,approvedContinuation.answers);if(checked.some((a,i)=>a.question!==approvedContinuation.answers[i].question))throw new Error('The consultant question changed.'); } catch(error){return failed('decision_unverified',error.message);} }
    if (digest(input.packet) !== input.approvedHash) return failed('preview_changed', 'The confirmed packet did not match the reviewed content. Nothing was sent.');
    draft.status = 'sending';
    try { draft.result = await send(structuredClone(input.packet), draft.destination, 'confirmed', exec, row => { (draft.trace ||= []).push(row); }, draft.continuation); }
    catch (error) { draft.result = failed('send_failed', String(error.message || 'Sending did not complete.')); draft.result.error.modelCalls = null; draft.result.error.stage = draft.trace?.at(-1)?.stage || 'configuration'; draft.result.error.outcome = draft.result.error.stage === 'configuration' ? 'not_started' : 'unknown'; if (draft.result.error.outcome === 'not_started') draft.result.error.modelCalls = 0; }
    draft.status = 'settled';
    return draft.result;
  }
  const contextTool={
    name:'zesia_consult_context',description:'Read only the current session consultation requests, round limit and references to recent actual user messages for decision attribution. Local only: no cloud call, approval, preference change or execution. This reports references, not a semantic verification of user intent.',timeoutMs:5000,
    parameters:{type:'object',additionalProperties:false,required:['consultId'],properties:{consultId:{type:'string'}}},
    output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    async execute(args,exec){const session=sessionOf(exec);return session?.snapshotEvents?continuations.inspect(session,args.consultId):{ok:false,code:'conversation_unavailable'};},
  };
  const resultTool = {
    name: 'zesia_consult_result',
    description: 'Read a settled ZESIA consultation from this conversation using its draft ID. Reads locally without sending a consultation.',
    timeoutMs: 5000,
    parameters: { type: 'object', additionalProperties: false, required: ['draftId'], properties: { draftId: { type: 'string' } } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute({ draftId }, exec) {
      clean();
      const draft = drafts.get(draftId);
      if (!draft || draft.session !== sessionOf(exec) || draft.status !== 'settled' || !draft.result) {
        return { ok: false, errorCode: 'consult_result_unavailable' };
      }
      const { delivery, ...result } = draft.result;
      return result;
    },
  };
  return { tool, followupTool, contextTool, resultTool, control, feedbackTool: adoption.tool };
}
