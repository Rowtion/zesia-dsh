const V2 = 'zesia.consult.result.v2';

export function consultFollowUpRequests(result) {
  if (result?.resultSchemaVersion === V2) {
    const action = result.nextAction;
    if (!['apply_advice', 'supply_evidence', 'ask_user_decision', 'escalate'].includes(action?.kind)) return [];
    return Array.isArray(action.requests) ? action.requests : [];
  }
  return Array.isArray(result?.followUp?.requests) ? result.followUp.requests : [];
}

export function awaitingConsultInput(result) {
  if (result?.resultSchemaVersion !== V2) return result?.decision?.status === 'needs_clarification';
  return ['supply_evidence', 'ask_user_decision'].includes(result.nextAction?.kind) && consultFollowUpRequests(result).length > 0;
}
