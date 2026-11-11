import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import vm from 'node:vm';
import { UI_REMOTE } from '../src/ui-rpc.mjs';
const electron='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness';
const harnessPath='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-api-gateway/lib/client.browser.js';
export function installedClient() {
  let text=execFileSync(electron,['-e',`process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(harnessPath)},'utf8'))`],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',maxBuffer:2e6,stdio:['ignore','pipe','pipe']});
  text=text.replace('exports.apply = apply;', 'exports.__ClientRemoteService = ClientRemoteService; exports.apply = apply;');
  let api;
  vm.runInNewContext(text,{AbortController,AbortSignal,window:{__ModuleLoader__:{load(row){api=row.factory(()=>({Service:class{}}));}}}});
  return api.__ClientRemoteService;
}
test('installed dsh client accepts the real UI RPC contribution before any settings request', {skip:!existsSync(electron)}, () => {
  const Service=installedClient();
  const client=Object.create(Service.prototype);
  client.namespaces=new Map();client.ownerCtx={reflect:{props:{}},get(){return undefined;}};
  client.validateContribution(UI_REMOTE);
  assert.equal(UI_REMOTE.descriptors[0].parameters[0].wire, 'agentId');
  assert.equal(UI_REMOTE.descriptors[0].parameters[0].codec.typeSymbol, '@deepseek-ai/dsh-session/types#SessionId');
  assert.ok(UI_REMOTE.descriptors.every(d=>d.parameters.every(p=>p.codec.mode==='strict')));
});

test('installed Cordis enforces injection while both UI entry points use the injected child', {skip:!existsSync(electron)}, () => {
  const result=execFileSync(electron,[new URL('../scripts/check-harness-client.cjs',import.meta.url).pathname],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',maxBuffer:2e6,stdio:['ignore','pipe','pipe']});
  assert.match(result,/"parentGuardReproduced":true/);
  assert.match(result,/"footerComponentAndConfirm":true/);
  assert.match(result,/"realModelCalls":0/);
});
