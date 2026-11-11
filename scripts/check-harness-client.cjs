// Run under the installed Harness Electron to exercise its actual Cordis guards
// and Client Gateway, rather than replacing Context with a permissive mock.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const root = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/';
(async () => {
  const { createConsultWorkflow } = await import('../lib/index.mjs');
  const { Context } = require(root + 'cordis/lib/index.js');
  const ctx = new Context();
  let mode = true, paid = 0, returned;
  const session = { id: 'ui-regression', snapshotEvents: () => [{ type: 'user/message' }, { type: 'turn/start', data: { turn: 17 } }] };
  const workflow = createConsultWorkflow({
    readConfiguration: async () => ({ token: 'synthetic-only', url: 'https://consult.example', confirmBeforeSend: mode }),
    saveMode: async value => ({ confirmBeforeSend: mode = value }),
    preflightRequest: async () => ({ ok: true }),
    requestConsult: async () => { paid++; return { advice: 'Synthetic expert response', consultId: 'synthetic-consult' }; },
  });
  const exec = { agent: { session }, signal: new AbortController().signal };
  const prepared = await workflow.tool.execute({ project: 'Synthetic', brief: 'Review a synthetic design', context: { goal: 'Synthetic regression' } }, exec);
  assert.equal(prepared.status, 'awaiting_confirmation');
  assert.equal(paid, 0);
  require(root + 'dsh-client-connection/lib/client.node.js').installConnection(ctx, {
    interactions: 'none', transport: { rpc: { open() {}, async call(_base, endpoint, payload) {
      assert.ok(['zesiaUi/control','zesiaUi/settings'].includes(endpoint));
      if(endpoint==='zesiaUi/control')assert.equal(payload.args.agentId,session.id);else assert.equal(payload.args.agentId,undefined);
      return { ok: true, value: await workflow.control(payload.args.input, exec) };
    } } },
  });
  new (require(root + 'dsh-typert-registry/lib/index.js').TypertRegistry)(ctx);
  require(root + 'dsh-api-gateway/lib/client.node.js').apply(ctx);
  const slots = [];
  ctx.provide('slots', { inject(_name, fn) { fn(); }, register(row, view) { slots.push({ row, view }); } });
  ctx.provide('sessions', { binding() { return { session: { getSnapshot: () => ({ running: false }), async prompt(parts) { returned = parts[0].text; return { ok: true }; } } }; } });
  let states = [], index = 0, effects = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) { const at = index++; if (!(at in states)) states[at] = initial; return [states[at], value => { states[at] = typeof value === 'function' ? value(states[at]) : value; }]; },
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useEffect(fn) { effects.push(fn); }, useRef: () => ({ current: { open: false, showModal() { this.open = true; }, close() { this.open = false; } } }), useId: () => 'regression',
  };
  let client;
  vm.runInNewContext(fs.readFileSync(new URL('../lib/client.js', 'file://' + __filename), 'utf8'), { crypto: webcrypto, TextEncoder, window: { __ModuleLoader__: { load(row) { client = row.factory(() => React); } } } });
  const fork = ctx.plugin({ ...client, async apply(inner) {
    const dispose = await client.apply(inner);
    // The old implementation captured exactly this un-injected parent.
    assert.throws(() => inner.remote.zesiaUi, /without inject/);
    const actions = slots.find(s => s.row.name === 'conversation.chat.assistant-actions');
    const global=slots.find(s=>s.row.name==='settings.section'&&s.row.id==='zesia');
    assert.ok(global);assert.equal(global.row.label(),'zesia');
    const props = global.row.inject();
    assert.equal((await props.control({ action: 'settings' })).confirmBeforeSend, true);
    await props.control({ action: 'set_mode', confirmBeforeSend: false });
    assert.equal((await props.control({ action: 'settings' })).confirmBeforeSend, false);
    await props.control({ action: 'set_mode', confirmBeforeSend: true });
    const footer = slots.find(s => s.row.name === 'conversation.chat.turnTail');
    const tailProps = { ...footer.row.inject(session.id), turn: { turn: 17, data: new Map(), end: {} } };
    assert.equal(footer.view(tailProps), null);
    for (const effect of effects.splice(0)) effect();
    await new Promise(resolve => setImmediate(resolve));
    index = 0;
    const cardElement = footer.view(tailProps);
    states = []; index = 0; effects = [];
    const flatten = node => node && typeof node === 'object' ? (typeof node.type === 'function' ? flatten(node.type({ ...node.props, children: (node.children || []).flat(Infinity) })) : [node, ...(node.children || []).flat(Infinity).flatMap(flatten)]) : [];
    const render = () => { index = 0; return flatten(cardElement.type(cardElement.props)); };
    const button = (nodes, label) => nodes.find(node => node.type === 'button' && node.children.flat(Infinity).includes(label));
    const draftId = prepared.draft.id;
    const localResult = () => workflow.resultTool.execute({ draftId }, exec);
    let nodes = render();
    assert.ok(nodes.some(node => node.type === 'dialog'));
    assert.ok(!nodes.some(node => node.type === 'textarea'));
    assert.equal((await localResult()).ok, false);
    await button(nodes, 'Open consultation').props.onClick();
    assert.equal(paid, 0);
    nodes = render();
    await button(nodes, 'Confirm and send').props.onClick();
    assert.equal(paid, 1);
    assert.equal(returned, undefined);
    nodes = render();
    await button(nodes, 'Return to my Agent').props.onClick();
    assert.ok(returned.includes(draftId));
    assert.ok(!returned.includes('Synthetic expert response'));
    assert.equal((await localResult()).advice, 'Synthetic expert response');
    assert.equal((await workflow.resultTool.execute({ draftId }, { agent: { session: { id: 'other' } } })).ok, false);
    assert.equal(paid, 1);
    await dispose();
  } });
  await fork;
  await fork.dispose();
  console.log(JSON.stringify({ installedCordisAndGateway: 'passed', parentGuardReproduced: true, settingsReadSaveReread: true, footerComponentAndConfirm: true, syntheticRequestCount: paid, realModelCalls: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
