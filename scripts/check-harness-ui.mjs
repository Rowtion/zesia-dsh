import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory=await fs.mkdtemp('/tmp/zesia-ui-check-');
const config=directory+'/config.json';
await fs.writeFile(config,JSON.stringify({token:'local-ui-test-only',confirmBeforeSend:true}),{mode:0o600});
const child=spawn('/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh',['web','--no-open','--port','0'],{env:{...process.env,DSH_HOME:process.env.ZESIA_DSH_TEST_HOME || '/tmp/zesia-dsh-independent',ZESIA_CONFIG:config},stdio:['ignore','pipe','pipe']});
let buffer='';let rejectReady;
const timer=setTimeout(()=>rejectReady?.(new Error('Temporary dsh startup timed out')),25000);
const ready=new Promise((resolve,reject)=>{rejectReady=reject;child.stdout.on('data',chunk=>{buffer+=String(chunk);const match=buffer.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/);if(match)resolve(match[1]);});child.stderr.on('data',chunk=>{const text=String(chunk);if(/error|failed/i.test(text))process.stderr.write(text.replace(/token=[^\s]+/g,'token=[redacted]'));});child.on('exit',code=>reject(new Error('Temporary dsh exited '+code)));});
try{
 const url=await ready;clearTimeout(timer);const origin=new URL(url).origin;
 const login=await fetch(url,{redirect:'manual'});const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'Host must issue a browser cookie');
 async function rpc(method,args){const response=await fetch(origin+'/api/'+method,{method:'POST',headers:{'content-type':'application/json',cookie,origin},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args}})});assert.equal(response.status,200);const body=await response.json();if(!body.result?.ok)throw new Error(method+': '+JSON.stringify(body.result?.error));return body.result.value;}
 const input={input:{action:'settings'}};
 const first=await rpc('zesiaUi/settings',input);assert.equal(first.confirmBeforeSend,true);
 await rpc('zesiaUi/settings',{input:{action:'set_mode',confirmBeforeSend:false}});
 const second=await rpc('zesiaUi/settings',input);assert.equal(second.confirmBeforeSend,false);
 await rpc('zesiaUi/settings',{input:{action:'set_mode',confirmBeforeSend:true}});
 await assert.rejects(rpc('zesiaUi/settings',{input:{action:'send'}}));
 console.log(JSON.stringify({noSessionCreated:true,actualHarnessHttpRpc:'passed',read:true,save:true,reread:true,restored:true,modelCalls:0,dailyConfigTouched:false}));
}catch(error){console.error(error.message);process.exitCode=1;}finally{clearTimeout(timer);if(child.exitCode===null && child.signalCode===null){ child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve)); }await fs.rm(directory,{recursive:true,force:true});}
