import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const CONSULT_SKILLS = [
  {name:'zesia-consult-prepare',description:'Prepare a scoped, source-linked 则灵 consultation packet for the current task and response.',content:readFileSync(new URL('../skills/zesia-consult-prepare/SKILL.md',import.meta.url),'utf8')},
  {name:'zesia-consult-evidence',description:'Answer a specific 则灵 follow-up requesting observable local evidence, within existing permissions.',content:readFileSync(new URL('../skills/zesia-consult-evidence/SKILL.md',import.meta.url),'utf8')},
  {name:'zesia-consult-decision',description:'Clarify user-owned choices raised by 则灵 without deciding or authorizing actions on the user behalf.',content:readFileSync(new URL('../skills/zesia-consult-decision/SKILL.md',import.meta.url),'utf8')},
  {name:'zesia-consult-adopt',description:'Check 则灵 advice against local evidence and record acceptance, rejection or deferral without claiming execution.',content:readFileSync(new URL('../skills/zesia-consult-adopt/SKILL.md',import.meta.url),'utf8')}
];
export function registerConsultSkills(ctx) {
  for (const skill of CONSULT_SKILLS) {
    const directory=fileURLToPath(new URL('../skills/'+skill.name+'/',import.meta.url));
    ctx.skills.register({...skill,source:'zesia-plugin',path:directory+'SKILL.md',resourceBase:{kind:'directory',path:directory},invocation:{modelInvocable:true,userInvocable:true}});
  }
}
