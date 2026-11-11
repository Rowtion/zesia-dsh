const explicitUserMessage = e => e.type === 'user/message' && e.data?.source?.kind === 'user' && !(e.data.content || []).some(p => p.type === 'text' && /^(The user confirmed this consultation packet through the (?:则灵|zesia) UI\.|The user chose to return the ZESIA consultation to this chat\.|请继续(?:则灵|zesia)咨询 |请先加载 zesia-consult-prepare|Load zesia-consult-prepare|\/zesia(?:\s|$))/.test(p.text));
const MAX_ROUNDS = 3, TTL = 60 * 60 * 1000;
export function createContinuationStore(now = Date.now) {
  const sessions = new WeakMap();
  const entries = session => { let map=sessions.get(session); if (!map) {map=new Map();sessions.set(session,map);} for(const [id,r] of map)if(now()-r.createdAt>TTL)map.delete(id);return map; };
  function validateAnswers(session,parent,answersInput) {
      const requests=parent.result.followUp?.requests || [];
      if(!Array.isArray(answersInput)||!answersInput.length||answersInput.length>3)throw new Error('Answer one to three actual consultant requests.');
      const seen=new Set();
      const answers=answersInput.map(answer=>{
        const request=requests.find(r=>r.id===answer.requestId);
        if(!request||seen.has(answer.requestId))throw new Error('Unknown or duplicate follow-up request.');seen.add(answer.requestId);
        if(typeof answer.text!=='string'||!answer.text.trim()||answer.text.length>2000||typeof answer.sourceRef!=='string'||!answer.sourceRef.trim()||answer.sourceRef.length>200)throw new Error('Provide a bounded answer and a source reference.');
        const quote=answer.sourceQuote || '';
        if(quote.length>2000)throw new Error('User quote exceeds 2000 characters.');
        if(request.kind!=='evidence') {
          const match=session.snapshotEvents().find(e=>explicitUserMessage(e) && quote.trim() && (e.data?.content||[]).some(p=>p.type==='text'&&p.text.includes(quote)) && [e.data?.id,e.data?.messageId,`seq:${e.seq}`].includes(answer.sourceRef));
          if(!match)throw new Error('This decision requires an exact quote and message ID (or seq:N) from this conversation user. Agent text or send confirmation is not a user decision.');
        }
        return {requestId:answer.requestId,question:request.question,text:answer.text,sourceRef:answer.sourceRef,sourceQuote:quote};
      });
      return answers;
  }
  return {
    inspect(session,id) {
      const parent=entries(session).get(id);
      if(!parent)return {ok:false,code:'consultation_unavailable'};
      const userStatements=session.snapshotEvents().filter(e=>explicitUserMessage(e)).slice(-3).map(e=>{
        const text=(e.data.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
        return {sourceRef:e.data.id||e.data.messageId||`seq:${e.seq}`,text:text.slice(0,2000),truncated:text.length>2000};
      });
      return {ok:true,contextId:parent.result.a2a?.contextId,round:parent.round,maxRounds:MAX_ROUNDS,consumed:parent.consumed,followUp:parent.result.followUp?.requests||[],userStatements};
    },
    verify(session,id,answers) { const parent=entries(session).get(id);if(!parent)throw new Error('Consultation expired.');return validateAnswers(session,parent,answers); },
    remember(session, result, packet, round=1) {
      const c=result.consultation;
      if (!session || !result.ok || !c?.consultId) return;
      const map=entries(session);if(map.size>=20)map.delete(map.keys().next().value);
      map.set(c.consultId,{result:structuredClone(c),packet:structuredClone(packet),round,createdAt:now(),consumed:false});
    },
    prepare(session, args) {
      const parent=entries(session).get(args.consultId);
      if(!parent)throw new Error('Consultation is unavailable, expired, or belongs to another conversation.');
      if(parent.consumed)throw new Error('This response already has a follow-up draft or attempt; do not retry.');
      if(parent.round>=MAX_ROUNDS)throw new Error('The three-round consultation limit was reached. Report remaining limits.');
      const contextId=parent.result.a2a?.contextId;
      if(!contextId)throw new Error('The previous response has no A2A contextId; do not invent one.');
      const answers=validateAnswers(session,parent,args.answers);
      const packet=structuredClone(parent.packet);
      packet.brief=`继续同一次咨询。结合本轮补充的证据与用户回答更新判断；能给出有条件建议时直接给出，不要重复已回答的问题。原始问题：\n${parent.packet.brief}`;
      if(packet.brief.length>8000)throw new Error('The continued brief exceeds the input contract; narrow the scope explicitly.');
      packet.context.previousAdvice=[...(packet.context.previousAdvice||[]),parent.result.decision?.assessment,parent.result.decision?.recommendation].filter(Boolean);
      packet.context.continuation={previousConsultId:args.consultId,round:parent.round+1,answers};
      packet.context.materials=[...(packet.context.materials||[]),...answers.map(a=>({id:`answer-${parent.round+1}-${a.requestId}`,content:`Question: ${a.question}\nSource: ${a.sourceRef}\n${a.text}${a.sourceQuote?'\nUser quote: '+a.sourceQuote:''}`}))];
      if(packet.context.materials.length>8||packet.context.previousAdvice.length>12)throw new Error('The accumulated evidence exceeds the current contract. Narrow the scope explicitly; nothing was sent.');
      return {packet,contextId,round:parent.round+1,parent,previousConsultId:args.consultId};
    },
  };
}
