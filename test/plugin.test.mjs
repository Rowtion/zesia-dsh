import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { apply, createConsultTool, createConsultWorkflow } from '../src/index.mjs';
import { consultationPrompt, PREPARATION_INSTRUCTIONS } from '../src/prompt.mjs';

test('host registers a model-visible consult tool with bounded execution and advisory output', () => {
  let tool;
  apply({ skills:{register(){}}, provide() {}, typert: { register() {} }, commands: { register() {} }, tools: { register(value) { if (value.name === 'zesia_consult') tool = value; } } });
  assert.equal(tool.name, 'zesia_consult');
  assert.equal(tool.timeoutMs, 65000);
  assert.ok(tool.parameters.required.includes('context'));
  assert.match(tool.output.render({}, { ok: true, advice: 'Verify before retry.', primaryExpert: 'general', routeStatus: 'uncertain', consultation: { advice: 'Verify before retry.' } })[0].text, /grants no additional authority/);
});
test('tool rejects an empty question before reading credentials or using the network', async () => {
  let tool; apply({ skills:{register(){}}, provide() {}, typert: { register() {} }, commands: { register() {} }, tools: { register(value) { if (value.name === 'zesia_consult') tool = value; } } });
  const result = await tool.execute({ brief: '', project: 'test', context: {} }, {});
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'consult_invalid_input');
});
test('browser bundle mounts a reply button and sends the fixed prompt into that same session', async () => {
  let plugin;
  const React = { useRef:()=>({current:null}),useId:()=> 'card-menu-test', createElement: (type, props, ...children) => ({ type, props, children }), useState: initial => [initial, () => {}], useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useEffect() {} };
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(row) { plugin = row.factory(name => { assert.equal(name, 'react'); return React; }); } } },
  });
  let registration, Component, sent;
  await plugin.apply({ inject(_deps,fn) { fn(this); return {dispose(){}}; }, remote: { zesiaUi: { async consult(sessionId,messageId){sent={sessionId,messageId};return {ok:true,value:{accepted:true}};} }, $mount() { return Promise.resolve(() => {}); } },
    slots: { inject(_name, fn) { fn(); }, register(row, view) { if (row.name === 'conversation.chat.assistant-actions') { registration = row; Component = view; } } },
    sessions: { binding(id) { assert.equal(id, 'session-a'); return { session: { async prompt(parts, mode) { sent = { parts, mode }; return { ok: true }; } } }; } },
  });
  assert.equal(registration.name, 'conversation.chat.assistant-actions');
  const props = registration.inject('session-a');
  const view = Component({ ...props, messageId: 'reply-123' });
  const button = view.children.find(child => child?.type === 'button');
  assert.equal(button.children[0].type, 'svg');
  assert.equal(button.children[0].props['aria-hidden'], true);
  assert.equal(button.children.length, 1, 'brand action is icon only');
  assert.equal(button.children[0].props.viewBox, '0 0 24 24');
  assert.equal(button.children[0].props.width, 24);
  assert.equal(button.children[0].props.height, 24);
  assert.equal(view.children.filter(child => child?.props?.className === 'zesia-toolbar-separator').length, 2);
  assert.equal(button.props.title, 'zesia');
  assert.equal(button.props['aria-label'], 'zesia: prepare consultation materials');
  assert.equal(view.children.some(child=>typeof child?.type==='function'),false,'reply actions must not contain settings');
  await button.props.onClick();
  assert.deepEqual(sent, {sessionId:'session-a',messageId:'reply-123'});
});
test('reply identity is a quoted reference; missing reply is rejected', () => {
  assert.throws(() => consultationPrompt(''));
  assert.match(consultationPrompt('a"b'), /a\\"b/);
});


test('one user message cannot trigger repeated paid consultations after a service failure', async () => {
  let calls = 0;
  let events = [{ type: 'user/message' }];
  const session = { snapshotEvents: () => events };
  const tool = createConsultWorkflow({ preflightRequest: async () => ({ ok: true, modelCalls: 0 }), readConfiguration: async () => ({ token: 'test', url: 'https://example.com', confirmBeforeSend: false }), requestConsult: async () => { calls++; throw Object.assign(new Error('consult_input_budget_exceeded'), { metadata: { inputBytes: '50000', maxInputBytes: '48000' } }); } }).tool;
  const args = { brief: 'question', project: 'project', context: {} };
  const exec = { signal: new AbortController().signal, agent: { session } };
  const first = await tool.execute(args, exec);
  assert.equal(first.ok, false);
  assert.equal(first.retryAllowed, false);
  assert.match(first.errorMessage, /50000 \/ 48000/);
  for (let i = 0; i < 5; i++) assert.equal((await tool.execute(args, exec)).errorCode, 'consult_already_attempted');
  assert.equal(calls, 1);
  events = [...events, { type: 'user/message' }];
  await tool.execute(args, exec);
  assert.equal(calls, 2);
});


test('failed free preflight exposes actionable fields and spends no model calls', async () => {
  let paid = 0;
  const report = { ok: false, issues: [{ code: 'input_budget_exceeded', field: '$', used: 51000, limit: 48000, unit: 'utf8_bytes', message: 'Too large', hint: 'Remove duplicate narrative.' }], modelCalls: 0, contentModified: false };
  const tool = createConsultTool({ readConfiguration: async () => ({ url: 'https://example.com', token: 'test' }), preflightRequest: async () => report, requestConsult: async () => { paid++; } });
  const result = await tool.execute({ brief: 'Review', project: 'test', context: {} }, { signal: new AbortController().signal });
  assert.equal(result.ok, false);
  assert.equal(result.error.limit, 48000);
  assert.equal(result.error.modelCalls, 0);
  assert.equal(result.preflight.contentModified, false);
  assert.equal(paid, 0);
});
test('full structured consultation including usage and review survives the plugin and model-facing renderer', async () => {
  const original = { format: 'zesia.consult.v0', consultId: 'consult-test', advice: 'Conditional recommendation.', decision: { nextSteps: [{ action: 'Check feasibility', successCriteria: 'Materials sufficient' }] }, review: { abandonIf: ['Material is insufficient'], constraintChecks: [{ fit: 'unknown' }] }, usage: { inputTokens: 123 }, pipeline: { calls: 2 }, expertProfiles: [{ id: 'general' }], budget: { inputBytes: 19000 } };
  const tool = createConsultTool({ readConfiguration: async () => ({ url: 'https://example.com', token: 'test' }), preflightRequest: async () => ({ ok: true, modelCalls: 0 }), requestConsult: async () => original });
  const result = await tool.execute({ brief: 'Review', project: 'test', context: {} }, { signal: new AbortController().signal });
  assert.deepEqual(result.consultation, original);
  const content = tool.output.render({}, result)[0].text;
  assert.match(content, /inputTokens/);
  assert.match(content, /abandonIf/);
  assert.match(content, /consult-test/);
  assert.match(content, /successCriteria/);
});


test('a partial server result is explicitly disclosed to the original agent', () => {
  const tool = createConsultTool();
  const text = tool.output.render({}, { ok: true, advice: 'Bounded advice.', consultation: { advice: 'Bounded advice.', qualityStatus: 'partial', review: null } })[0].text;
  assert.match(text, /Partial consultation/);
  assert.match(text, /Do not claim a complete expert review/);
});

test('consultation dialog approves the exact read-only packet and returns a short reference', async () => {
  const { webcrypto, createHash } = await import('node:crypto');
  let plugin, registration, View, sent, returned;
  let states = [], index = 0, effects = [], captureEffects = true;
  const React = { useRef:()=>({current:{open:false,showModal(){this.open=true;},close(){this.open=false;}}}),useId:()=> 'card-menu-test', createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) { const at = index++; if (!(at in states)) states[at] = initial; return [states[at], value => { states[at] = typeof value === 'function' ? value(states[at]) : value; }]; },
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useEffect(fn) { if (captureEffects) effects.push(fn); } };
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { crypto: webcrypto, TextEncoder,
    window: { __ModuleLoader__: { load(row) { plugin = row.factory(() => React); } } } });
  const packet = { requester: 'DeepSeek Harness', project: 'Synthetic', brief: 'Review tradeoffs', context: { facts: ['Synthetic context'] } };
  const draft = { id: 'draft-test', hash: 'original-hash', destination: 'https://consult.example', packet };
  await plugin.apply({ inject(_deps,fn) { fn(this); return {dispose(){}}; },locale:{getSnapshot:()=>({active:'zh'}),subscribe:()=>()=>{}},remote: { $mount() { return Promise.resolve(() => {}); } }, slots: { inject(_name,fn) { fn(); }, register(row,view) { if (row.name === 'conversation.chat.turnTail') { registration=row; View=view; } } },
    remote: { $mount() { return Promise.resolve(() => {}); }, zesiaUi: { async control(id,input) { assert.equal(id,'review-session');
      if (input.action === 'draft_for_turn') { assert.equal(input.turn,17); return { ok:true,value:{draft,status:'prepared'} }; }
      if (input.action === 'status') return {ok:true,value:{status:'prepared'}};
      sent=input; return {ok:true,value:{ok:true,status:'completed',advice:'Actual advice',delivery:{packet}}}; } } },
    sessions: { binding(id) { assert.equal(id,'review-session'); return {session:{async prompt(parts) {returned=parts[0].text;return {ok:true};}}}; } },
  });
  assert.equal(registration.name,'conversation.chat.turnTail');
  const props={...registration.inject('review-session'),turn:{ turn:17 }};
  assert.equal(View(props),null);
  await Promise.all(effects.map(fn=>fn())); await new Promise(resolve=>setImmediate(resolve));
  index=0;captureEffects=false;
  const element=View(props);
  states=[];
  const flatten=node=>node&&typeof node==='object'?(typeof node.type==='function'?flatten(node.type({...node.props,children:(node.children||[]).flat(Infinity)})):[node,...(node.children||[]).flat(Infinity).flatMap(flatten)]):[];
  const render = () => { index = 0; return flatten(element.type(element.props)); };
  const button = (nodes, label) => nodes.find(node => node.type === 'button' && node.children.flat(Infinity).includes(label));
  const initial = render();
  assert.ok(initial.some(node => node.type === 'dialog'));
  assert.ok(!initial.some(node => node.type === 'textarea'));
  assert.ok(initial.some(node => node.type === 'pre' && JSON.parse(node.children[0]).brief === packet.brief));
  assert.equal(sent, undefined);
  await button(initial, '打开咨询').props.onClick();
  assert.equal(sent, undefined);
  await button(render(), '×').props.onClick();
  const closedAgain = render();
  assert.ok(closedAgain.some(node => node.type === 'button' && node.children.flat(Infinity).includes('继续咨询')));
  assert.ok(closedAgain.some(node => node.type === 'p' && String(node.children[0]).includes('草稿已保留')));
  await button(closedAgain, '继续咨询').props.onClick();
  await button(render(), '确认发送').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(sent.packet)), packet);
  assert.equal(sent.approvedHash, createHash('sha256').update(JSON.stringify(packet)).digest('hex'));
  assert.equal(sent.action, 'send');
  assert.equal(returned, undefined);
  await button(render(), '交回我的 Agent').props.onClick();
  assert.match(returned, /zesia_consult_result.*draft-test/);
  assert.doesNotMatch(returned, /Actual advice|Synthetic context/);
});

test('result card discloses specialist fallback, quality limits and the actual failed stage', async () => {
  let plugin, View;
  const React = { useRef:()=>({current:null}),useId:()=> 'card-menu-test', createElement: (type, props, ...children) => ({ type, props, children }), useState: initial => [initial, () => {}], useSyncExternalStore: (_s,snapshot) => snapshot(), useEffect() {} };
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(row) { plugin = row.factory(() => React); } } } });
  await plugin.apply({ inject(_deps,fn) { fn(this); return {dispose(){}}; }, remote: { $mount() { return Promise.resolve(() => {}); } }, slots: { inject(_n,fn) { fn(); }, register(row,view) { if (row.key === 'zesia_consult') { View=view; } } } });
  const value = { ok: true, status: 'completed', advice: 'Bounded advice', consultation: { qualityStatus: 'partial', expertMatch: { primary: { id: 'general', domain: 'general' }, supporting: [], reason: 'Routing timed out', warning: 'Do not claim specialist review', candidates: [], thresholds: {} }, qualityChecks: { warnings: [{ code: 'action_check_missing_or_duplicate' }], semanticVerification: 'not_performed' }, trace: { stages: [{ stage: 'routing', status: 'failed' }] } } };
  const expand = node => {
    if (typeof node === 'string') return node;
    if (!node || typeof node !== 'object') return '';
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return (node.children || []).flat(Infinity).map(expand).join(' ');
  };
  const render = row => expand(View({ phase: 'result', block: { content: [{ type: 'text', text: JSON.stringify(row) }] } }));
  const text = render(value);
  assert.match(text, /Do not claim specialist review/);
  assert.match(text, /action_check_missing_or_duplicate/);
  assert.match(text, /not_performed/);
  const failed = render({ ok: false, status: 'failed', consultation: {}, error: { stage: 'discovery', outcome: 'not_started', hint: 'Report error', errorId: 'test-error' } });
  assert.match(failed, /test-error/);
  assert.match(failed, /not_started/);
  assert.match(failed, /discovery/);
});

test('button prompt stays short while detailed preparation rules remain in the tool description', () => {
  const prompt=consultationPrompt('reply-123');assert.equal(prompt, '/zesia "reply-123"');assert.match(PREPARATION_INSTRUCTIONS,/conversation language/);
  let tool;apply({skills:{register(){}},provide(){},typert:{register(){}},commands:{register(){}},tools:{register(value){if(value.name==='zesia_consult')tool=value;}}});
  assert.ok(tool.description.includes(PREPARATION_INSTRUCTIONS));assert.match(tool.description,/sourceQuote/);
});


test('preparation failures appear in a dismissible English popup, never as toolbar text', async () => {
  let plugin, Component, index=0;const states=[], effects=[], handlers=new Map();let copied='';
  const React={useId:()=> 'failure-ui',useRef:()=>({current:null}),useEffect(fn){effects.push(fn);},useSyncExternalStore:(_s,get)=>get(),useState(initial){const i=index++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v];},createElement:(type,props,...children)=>({type,props,children})};
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{navigator:{clipboard:{async writeText(text){copied=text;}}},window:{addEventListener(name,fn){handlers.set(name,fn);},removeEventListener(name){handlers.delete(name);},__ModuleLoader__:{load(row){plugin=row.factory(()=>React);}}}});
  await plugin.apply({inject(_deps,fn){fn(this);return {dispose(){}};},remote:{$mount:async()=>()=>{}},slots:{inject(_n,fn){fn();},register(row,view){if(row.name==='conversation.chat.assistant-actions')Component=view;}},sessions:{}});
  const props={messageId:'reply-test',submit:async()=>{throw new Error('The UI and host plugin versions do not match. Fully quit and restart DSH.');}};
  let view=Component(props);await view.children.find(c=>c?.type==='button').props.onClick();index=0;view=Component(props);
  const popup=view.children.find(c=>c?.props?.role==='alert');assert.equal(popup.type,'div');assert.equal(popup.props.className,'zesia-request-error');assert.match(popup.children[1].children[0],/restart DSH/);
  assert.doesNotMatch(JSON.stringify(popup),/[\u4e00-\u9fff]/);
  assert.equal(view.children.some(c=>typeof c==='string'),false);
  for(const effect of effects.splice(0)) effect();
  assert.equal(popup.children[2].children[0].props['aria-label'], 'Copy error');
  assert.equal(popup.children[2].children[0].children[0].type, 'svg');
  assert.equal(popup.children[2].children[1].children[0].type, 'svg');
  await popup.children[2].children[0].props.onClick();assert.equal(copied,popup.children[1].children[0]);
  assert.equal(typeof handlers.get('keydown'),'function');
  handlers.get('keydown')({key:'Escape',preventDefault(){}});index=0;assert.equal(Component(props).children.some(c=>c?.props?.role==='alert'),false);

  popup.children[2].children.find(child=>child?.props?.['aria-label']==='Dismiss error').props.onClick();index=0;view=Component(props);assert.equal(view.children.some(c=>c?.props?.role==='alert'),false);
});
