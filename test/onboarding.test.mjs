import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOnboarding } from '../src/onboarding.mjs';

async function fixture(t, values) {
  const directory = await mkdtemp(join(tmpdir(), 'zesia-onboarding-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'dsh.json');
  if (values) await writeFile(path, JSON.stringify(values));
  const env = { ZESIA_CONFIG: path };
  const urls = [];
  function mount() {
    const guide = createOnboarding({ env, openBrowser: async url => { urls.push(url); return false; } });
    t.after(() => guide.close());
    return guide;
  }
  return { mount, urls, path, directory };
}

function bridge(url) {
  const link = new URL(url);
  assert.equal(link.origin + link.pathname, 'https://zesia.dev/consult');
  const params = new URLSearchParams(link.hash.slice(1));
  return async (name, body) => {
    const response = await fetch('http://127.0.0.1:' + params.get('port') + '/bridge/v1/' + name, {
      method: body ? 'POST' : 'GET',
      headers: { Origin: link.origin, Authorization: 'Bearer ' + params.get('key'), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
}

test('first load opens the shared guide once, independently of an existing credential', async t => {
  const previous = { token: 'existing-fixture', confirmBeforeSend: true };
  const f = await fixture(t, previous);
  const first = f.mount();
  const [a, b] = await Promise.all([first.handle('open', 'zh'), first.handle('open', 'zh')]);
  assert.deepEqual(a, b);
  assert.equal(f.urls.length, 1);
  const call = bridge(a.url);
  assert.equal((await first.handle('open')).url, a.url);
  assert.deepEqual(await readdir(f.directory), ['dsh.json']);
  const { data } = await call('view');
  assert.equal(data.status, 'onboarding');
  assert.equal(data.configured, true);
  assert.equal(data.guideLocale, 'zh');
  assert.deepEqual(data.packet, { requester: 'DeepSeek Harness' });
  assert.ok(!JSON.stringify(data).includes(previous.token));
  assert.notEqual((await call('approve', {})).status, 200);
  assert.notEqual((await call('configure', { protocolVersion: 1, destination: data.destination, token: 'replacement' })).status, 200);
  assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')), previous);
  assert.deepEqual(await f.mount().handle('open'), { state: 'seen' });
  assert.equal(f.urls.length, 1);
});

test('unconfigured guide can activate through the original page, and dismissal persists', async t => {
  const f = await fixture(t);
  const guide = f.mount();
  const { url } = await guide.handle('open');
  const call = bridge(url);
  assert.equal((await call('view')).data.configured, false);
  const input = { protocolVersion: 1, destination: 'https://api.zesia.dev', token: 'fixture' };
  assert.equal((await call('configure', input)).data.configured, true);
  assert.equal(JSON.parse(await readFile(f.path, 'utf8')).token, input.token);
  assert.deepEqual(await guide.handle('dismiss'), { state: 'seen' });
  await assert.rejects(guide.handle('send'), /Unknown onboarding action/);
});
