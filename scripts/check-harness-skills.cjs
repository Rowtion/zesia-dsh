const assert=require('node:assert/strict');
const root='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/';
(async()=>{
 const {Context}=require(root+'cordis/lib/index.js');const {SkillRegistry}=require(root+'dsh-skill/lib/index.js');const ctx=new Context();new SkillRegistry(ctx);
 ctx.provide('tools',{register(){}});ctx.provide('commands',{register(){}});ctx.provide('typert',{register(){}});
 const plugin=await import('../lib/index.mjs');const mounted=ctx.plugin(plugin);await mounted;
 const names=['zesia-consult-prepare','zesia-consult-evidence','zesia-consult-decision','zesia-consult-adopt'];
 const available=await ctx.skills.list();
 for(const name of names){assert.ok(available.some(s=>s.name===name));const skill=await ctx.skills.get(name);assert.equal(skill.invocation.modelInvocable,true);assert.equal(skill.resourceBase.kind,'directory');assert.match(skill.content,new RegExp(name));assert.ok(require('node:fs').existsSync(skill.path));}
 await mounted.dispose();const removed=await ctx.skills.list();assert.ok(!removed.some(s=>names.includes(s.name)));
 console.log('Actual dsh SkillRegistry: four model-loadable skills, local resources and uninstall cleanup passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
