import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { UI_REMOTE } from '../src/ui-rpc.mjs';
const electron='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness';
test('UI RPC contributions declare strict wire parameters', () => {
  assert.equal(UI_REMOTE.descriptors[0].parameters[0].wire, 'agentId');
  assert.equal(UI_REMOTE.descriptors[0].parameters[0].codec.typeSymbol, '@deepseek-ai/dsh-session/types#SessionId');
  assert.ok(UI_REMOTE.descriptors.every(d=>d.parameters.every(p=>p.codec.mode==='strict')));
});

for (const kind of ['opinion', 'partial', 'guidance']) {
test(`installed Cordis enforces injection and hands back a settled ${kind}`, {skip:!existsSync(electron)}, () => {
  const result=execFileSync(electron,[new URL('../scripts/check-harness-client.cjs',import.meta.url).pathname,kind],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',maxBuffer:2e6,timeout:15000,stdio:['ignore','pipe','pipe']});
  assert.match(result,/"parentGuardReproduced":true/);
  assert.match(result,/"footerComponentAndConfirm":true/);
  assert.match(result,/"realModelCalls":0/);
});
}
