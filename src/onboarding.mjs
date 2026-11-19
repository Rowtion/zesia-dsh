import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { saveConfig } from '@zesia/runtime/config';
import { openOnlineBrowser, startOnlineReview } from '../node_modules/@zesia/runtime/review/online.mjs';
import { defaultConfigPath, DEFAULT_SERVICE_URL, readConfig } from './config.mjs';

// This bridge has no consultation, project, materials, send or cancel implementation.
export function createOnboarding({ env = process.env, openBrowser = openOnlineBrowser } = {}) {
  const configPath = env.ZESIA_CONFIG || defaultConfigPath();
  const marker = configPath + '.onboarding-complete';
  const settings = () => readConfig(env, { requireToken: false });
  let session, opening, connected = false, disposed = false, activating = false;

  async function seen() {
    try { await access(marker); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }

  async function markSeen() {
    await mkdir(dirname(marker), { recursive: true, mode: 0o700 });
    try { await writeFile(marker, '', { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }

  async function open(locale) {
    if (await seen() || disposed) return { state: 'seen' };
    if (session) return { state: 'link', url: session.url };
    const id = randomUUID();
    const runtime = {
      async inspect() {
        const config = await settings();
        if (session && !connected) { await markSeen(); connected = true; }
        return { ok: true, draftId: id, requestId: id, status: 'onboarding', guideLocale: locale === 'zh' ? 'zh' : 'en',
          configured: Boolean(config.token), destination: new URL(config.url).origin,
          packet: { requester: 'DeepSeek Harness' } };
      },
      async configure({ destination, token }) {
        if (activating) throw new Error('Sign-in is already being saved.');
        activating = true;
        try {
          const config = await settings();
          if (config.token || config.url.replace(/\/$/u, '') !== DEFAULT_SERVICE_URL || destination !== DEFAULT_SERVICE_URL)
            throw new Error('Existing credentials or service configuration were preserved.');
          if (typeof token !== 'string' || !token || /[\s\x00-\x1f\x7f]/u.test(token))
            throw new Error('A valid activation token is required.');
          await saveConfig({ token, url: destination }, { ...env, ZESIA_CONFIG: configPath });
        } finally { activating = false; }
      },
    };
    session = await startOnlineReview({ draftId: id, runtime, onClose() { session = undefined; connected = false; } });
    if (disposed) { session.close(); return { state: 'seen' }; }
    const url = session.url;
    return await openBrowser(url) ? { state: 'opened' } : { state: 'link', url };
  }

  return {
    async handle(action, locale) {
      if (action === 'dismiss') { await markSeen(); return { state: 'seen' }; }
      if (action !== 'open') throw new Error('Unknown onboarding action.');
      if (!opening) opening = open(locale).finally(() => { opening = undefined; });
      return opening;
    },
    close() { disposed = true; session?.close(); },
  };
}
