import { createHash } from 'node:crypto';
import { isServiceGuidance } from './adoption.mjs';

export const DISCUSSION_ROUNDS = 3;
export const nextQuestions = result => result?.resultSchemaVersion === 'zesia.consult.result.v2'
  ? result.nextAction?.requests || [] : result?.followUp?.requests || [];

export function findingsFor(result) {
  if (isServiceGuidance(result) || !result?.consultId || !result.decision?.recommendation) return [];
  const findings = [
    { target: 'recommendation', text: result.decision.recommendation },
    ...(result.decision.nextSteps || []).map((step, index) => ({
      target: 'step:' + index, text: step.action, successCriteria: step.successCriteria,
    })),
  ];
  return findings.map(finding => ({
    ...finding,
    id: createHash('sha256').update(JSON.stringify([result.consultId, finding.target, finding.text])).digest('hex').slice(0, 20),
  }));
}

export function prepareObjections(packet, findings, objections = []) {
  if (!Array.isArray(objections) || objections.length > 3) throw new Error('Use up to three specific findings per round.');
  return objections.map(({ findingId, materialId, quote }) => {
    const finding = findings.find(item => item.id === findingId);
    if (!finding) throw new Error('Use a finding ID from the latest opinion.');
    if (typeof quote === 'string' && quote.trim() && quote.trim().length <= 1200) {
      const excerpt = quote.trim();
      const sources = (packet.context.materials || []).filter(item =>
        (!materialId || item.id === materialId) && item.content.includes(excerpt));
      if (sources.length !== 1) throw new Error('Use an exact excerpt and identify its source when there is more than one match.');
      return { target: finding.target, materialId: sources[0].id, quote: excerpt };
    }
    if (quote === undefined && packet.context.attachments?.some(item => item.id === materialId)) {
      return { target: finding.target, materialId };
    }
    throw new Error('Cite an exact excerpt or an approved attachment. A personal view alone does not start another round.');
  });
}

export function closingDecision(result, args) {
  const findings = findingsFor(result);
  const decisions = args?.decisions;
  if (!Array.isArray(decisions) || decisions.length !== findings.length ||
      new Set(decisions.map(item => item?.findingId)).size !== findings.length ||
      typeof args.summary !== 'string' || !args.summary.trim() || args.summary.length > 2000 ||
      decisions.some(item => !findings.some(finding => finding.id === item?.findingId)
        || !['verified', 'unresolved'].includes(item?.status)
        || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 1000)) {
    throw new Error('Use each finding ID from the latest opinion once, with the reason and a handback summary.');
  }
  const blocking = result.nextAction?.blocking === true || nextQuestions(result).some(item => item.blocking);
  const state = blocking || decisions.some(item => item.status === 'unresolved') ? 'unresolved' : 'completed';
  return { state, summary: args.summary.trim(), decisions: structuredClone(decisions), consultId: result.consultId };
}
