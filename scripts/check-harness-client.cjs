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
  const deliveryKind = process.argv[2] || 'opinion';
  const online = deliveryKind !== 'opinion';
  const qualityStatus = { opinion: 'complete_structure', partial: 'partial', guidance: 'not_reviewed' }[deliveryKind];
  const session = { id: 'ui-regression', snapshotEvents: () => [{ type: 'user/message' }, { type: 'turn/start', data: { turn: 17 } }] };
  const workflow = createConsultWorkflow({
    enableOnlineBridge: online,
    openBrowser: false,
    readConfiguration: async () => ({ token: 'synthetic-only', url: 'https://consult.example', confirmBeforeSend: mode }),
    saveMode: async value => ({ confirmBeforeSend: mode = value }),
    preflightRequest: async () => ({ ok: true }),
    requestConsult: async () => {
      paid++;
      return {
        format: 'zesia.consult.v0', advice: 'Synthetic response', consultId: 'synthetic-consult', deliveryKind, qualityStatus,
        expertMatch: { primary: { title: 'Fixture expert', domain: 'Fixtures' }, supporting: [] },
      };
    },
  });
  const exec = { agent: { session }, signal: new AbortController().signal };
  const prepared = await workflow.tool.execute({ project: 'Synthetic', brief: 'Review a synthetic design', context: { goal: 'Synthetic regression' } }, exec);
  assert.equal(prepared.status, online ? 'awaiting_online_review' : 'awaiting_confirmation');
  assert.equal(paid, 0);
  require(root + 'dsh-client-connection/lib/client.node.js').installConnection(ctx, {
    interactions: 'none', transport: { rpc: { open() {}, async call(_base, endpoint, payload) {
      if (endpoint === 'zesiaUi/onboarding') {
        assert.equal(payload.args.action, 'open');
        assert.equal(payload.args.agentId, undefined);
        return { ok: true, value: { state: 'opened' } };
      }
      assert.ok(['zesiaUi/control','zesiaUi/settings'].includes(endpoint));
      if(endpoint==='zesiaUi/control')assert.equal(payload.args.agentId,session.id);else assert.equal(payload.args.agentId,undefined);
      return { ok: true, value: await workflow.control(payload.args.input, exec) };
    } } },
  });
  require(root + 'dsh-typert-registry/lib/client.node.js').apply(ctx);
  require(root + 'dsh-api-gateway/lib/client.node.js').apply(ctx);
  const locale = { active: 'en' };
  ctx.provide('locale', { getSnapshot: () => locale, subscribe: () => () => {} });
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
  const opened = [];
  vm.runInNewContext(fs.readFileSync(new URL('../lib/client.js', 'file://' + __filename), 'utf8'), { crypto: webcrypto, TextEncoder, window: { open: url => opened.push(url), __ModuleLoader__: { load(row) { client = row.factory(() => React); } } } });
  const fork = ctx.plugin({ ...client, async apply(inner) {
    const dispose = await client.apply(inner);
    // The old implementation captured exactly this un-injected parent.
    assert.throws(() => inner.remote.zesiaUi, /without inject/);
    const welcome = slots.find(s => s.row.name === 'shell.overlay' && s.row.id === 'zesia-first-use');
    assert.ok(welcome);
    assert.equal((await welcome.row.inject().onboarding('open')).state, 'opened');
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
    if (online) {
      await button(nodes, 'Review on zesia.dev').props.onClick();
      assert.deepEqual(opened, [prepared.url]);
      assert.equal(paid, 0);
      const params = new URLSearchParams(new URL(prepared.url).hash.slice(1));
      const bridge = 'http://127.0.0.1:' + params.get('port') + '/bridge/v1/';
      const headers = { Origin: 'https://zesia.dev', Authorization: 'Bearer ' + params.get('key'), 'Content-Type': 'application/json' };
      const view = await (await fetch(bridge + 'view', { headers })).json();
      const { draftId, requestId, approvedHash, destination } = view;
      const approved = await fetch(bridge + 'approve', {
        method: 'POST', headers, body: JSON.stringify({ protocolVersion: 1, draftId, requestId, approvedHash, destination }),
      });
      assert.equal(approved.status, 202);
      assert.equal((await workflow.waitTool.execute({ draftId, seconds: 5 }, exec)).ok, true);
      await button(render(), 'Review on zesia.dev').props.onClick();
    } else {
      await button(nodes, 'Open consultation').props.onClick();
      assert.equal(paid, 0);
      await button(render(), 'Confirm and send').props.onClick();
    }
    assert.equal(paid, 1);
    assert.equal(returned, undefined);
    nodes = render();
    assert.equal(nodes.some(node => node.props?.className === 'zesia-consult-expert'), deliveryKind !== 'guidance');
    await button(nodes, 'Return to my Agent').props.onClick();
    assert.ok(returned.includes(draftId));
    assert.ok(!returned.includes('Synthetic response'));
    assert.equal(returned.includes('No expert review was completed'), deliveryKind === 'guidance');
    assert.equal(returned.includes('zesia_consult_feedback'), deliveryKind !== 'guidance');
    assert.equal(returned.includes('zesia_consult_followup'), deliveryKind !== 'guidance');
    assert.equal(returned.includes('Partial review:'), deliveryKind === 'partial');
    assert.equal((await localResult()).advice, 'Synthetic response');
    assert.equal((await workflow.resultTool.execute({ draftId }, { agent: { session: { id: 'other' } } })).ok, false);
    assert.equal(paid, 1);
    await dispose();
  } });
  await fork;
  await fork.dispose();
  workflow.close();
  console.log(JSON.stringify({ installedCordisAndGateway: 'passed', parentGuardReproduced: true, settingsReadSaveReread: true, footerComponentAndConfirm: true, syntheticRequestCount: paid, realModelCalls: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
