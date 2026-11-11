import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { registerUiRpc, UI_RPC_DESCRIPTOR } from '../src/ui-rpc.mjs';

test('UI RPC uses the receiving-agent lookup, cancellation and a separate registry without command lifecycle writes', async () => {
  let service, contribution;
  const seen=[];
  registerUiRpc({ provide(name,value){assert.equal(name,'zesiaUi');service=value;},typert:{register(value){contribution=value;}} },{control:async(input,exec)=>{seen.push({input,exec});return {confirmBeforeSend:true};}});
  assert.equal(service.typertRemote.service,service);
  assert.equal(contribution.invocations[0].parameters[0].lookup,'agent');
  assert.equal(UI_RPC_DESCRIPTOR.parameters[0].wire,'agentId');
  const agent={session:{id:'test'}};const signal=new AbortController().signal;
  assert.equal((await service.control(agent,{action:'settings'},signal)).confirmBeforeSend,true);
  assert.equal(seen[0].exec.agent,agent);assert.equal(seen[0].exec.signal,signal);
  await assert.rejects(service.control(agent,null,signal));
  await service.settings({action:'settings'},signal);assert.equal(seen.at(-1).exec.agent,undefined);
  assert.equal(contribution.invocations[1].parameters.length,1);assert.equal(contribution.invocations[1].parameters[0].source,'json');
  await assert.rejects(service.settings({action:'send'},signal));
  await assert.rejects(service.settings({action:'settings',agentId:'fake'},signal));
});

test('settings open a top-layer native dialog and save through UI RPC without submitting chat commands', async () => {
  let plugin, registration, Global;
  let states=[],index=0,effects=[];
  const element={open:false,shown:0,showModal(){this.open=true;this.shown++;},close(){this.open=false;}};
  const React={createElement:(type,props,...children)=>({type,props,children}),useState(initial){const at=index++;if(!(at in states))states[at]=initial;return [states[at],value=>{states[at]=typeof value==='function'?value(states[at]):value;}];},useEffect(fn){effects.push(fn);},useRef:()=>({current:element}),useId:()=> 'settings-test',useSyncExternalStore:(_s,snapshot)=>snapshot()};
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load(row){plugin=row.factory(()=>React);}}}});
  const calls=[];let mode=true;
  await plugin.apply({ inject(_deps,fn) { fn(this); return {dispose(){}}; },locale:{getSnapshot:()=>({active:'zh'}),subscribe:()=>()=>{}},remote:{$mount:async()=>()=>{},zesiaUi:{async settings(input){calls.push(input);if(input.action==='settings')return {ok:true,value:{confirmBeforeSend:mode,destination:'https://consult.example'}};mode=input.confirmBeforeSend;return {ok:true,value:{confirmBeforeSend:mode}};}}},slots:{inject(_n,fn){fn();},register(row,component){if(row.name==='settings.section'){registration=row;Global=component;}}}});
  const settings=Global(registration.inject());
  settings.props.embedded=false;
  states=[];index=0;effects=[];
  const render=()=>{index=0;effects=[];return settings.type(settings.props);};
  const flatten=node=>node&&typeof node==='object'?(typeof node.type==='function'?flatten(node.type({...node.props,children:node.children.flat(Infinity)})):[node,...(node.children||[]).flat(Infinity).flatMap(flatten)]):[];
  let view=render();
  assert.equal(flatten(view).some(n=>n.type==='dialog'),false);
  flatten(view).find(n=>n.type==='button').props.onClick({currentTarget:{closest:()=>({open:true})}});
  view=render();effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));
  view=render();let nodes=flatten(view);
  assert.equal(element.shown,1);
  const dialog=nodes.find(n=>n.type==='dialog');assert.equal(dialog.props.className,'zesia-settings');
  const source=await readFile(new URL('../lib/client.js',import.meta.url),'utf8');
  assert.match(source,/::backdrop/);assert.match(source,/--dsw-alias-bg-base/);
  assert.doesNotMatch(nodes.flatMap(n=>n.children).join(' '),/选择咨询资料的发送方式|设置保存在本机|默认方式/);
  nodes.find(n=>n.type==='input'&&!n.props.checked).props.onChange();
  view=render();nodes=flatten(view);
  await nodes.find(n=>n.type==='button'&&n.children.flat(Infinity).includes('保存')).props.onClick();
  assert.equal(mode,false);assert.equal(calls.length,2);assert.equal(calls[1].action,'set_mode');
  assert.equal(flatten(render()).some(n=>n.type==='dialog'),false);
  view=render();flatten(view).find(n=>n.type==='button').props.onClick({currentTarget:{closest:()=>({open:true})}});
  view=render();effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));
  view=render();nodes=flatten(view);
  nodes.find(n=>n.type==='input'&&!n.props.checked).props.onChange();
  view=render();nodes=flatten(view);
  nodes.find(n=>n.type==='button'&&n.children.flat(Infinity).includes('取消')).props.onClick();
  assert.equal(mode,false);assert.equal(calls.filter(row=>row.action==='set_mode').length,1);
  assert.equal(flatten(render()).some(n=>n.type==='dialog'),false);
  settings.props.embedded=true;states=[];index=0;effects=[];
  view=render();effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));
  nodes=flatten(render());assert.equal(nodes.some(n=>n.type==='dialog'),false);assert.ok(nodes.some(n=>n.type==='section'&&n.props.className.includes('zesia-settings-embedded')));
  nodes.find(n=>n.type==='input'&&!n.props.checked).props.onChange();nodes=flatten(render());
  await nodes.find(n=>n.type==='button'&&n.children.flat(Infinity).includes('保存')).props.onClick();
  assert.equal(mode,true);assert.ok(flatten(render()).some(n=>n.props?.role==='status'&&n.children.includes('已保存')));
});


test('consult UI dispatches the native command once and surfaces admission failures', async () => {
  let service;const calls=[];const agent={session:{id:'synthetic'}};const signal=new AbortController().signal;
  const ctx={provide(_n,value){service=value;},typert:{register(){}},commands:{async execute(...args){calls.push(args);return {result:{kind:'success'}};}}};
  registerUiRpc(ctx,{});
  assert.deepEqual(await service.consult(agent,'reply-a',signal),{accepted:true});assert.equal(calls.length,1);assert.equal(calls[0][0],agent);assert.equal(calls[0][1],'/zesia "reply-a"');assert.equal(calls[0][3],signal);
  ctx.commands.execute=async()=>({result:{kind:'error',text:'This conversation cannot accept a zesia request.'}});
  await assert.rejects(service.consult(agent,'reply-a',signal),/cannot accept/);
});
