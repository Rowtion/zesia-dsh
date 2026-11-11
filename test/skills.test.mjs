import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {CONSULT_SKILLS} from '../src/skills.mjs';
test('four scoped skills ship with valid names and only the prepare skill owns initial submission',()=>{
 assert.equal(CONSULT_SKILLS.length,4);assert.equal(new Set(CONSULT_SKILLS.map(s=>s.name)).size,4);
 for(const s of CONSULT_SKILLS){assert.match(s.content,/^---\nname: zesia-consult-/);assert.ok(s.content.length<6000);assert.ok(s.description.length>20);}
 assert.match(CONSULT_SKILLS[0].content,/evidenceFiles/);assert.match(CONSULT_SKILLS[2].content,/exact quote/);
});
const electron='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness';
test('installed dsh discovers, loads and removes plugin-owned runtime skills',{skip:!existsSync(electron)},()=>{
 const result=execFileSync(electron,[new URL('../scripts/check-harness-skills.cjs',import.meta.url).pathname],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe']});assert.match(result,/four model-loadable skills/);
});
