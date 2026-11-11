import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
export const DEFAULT_SERVICE_URL = 'https://api.zesia.dev';
export const serviceUrl = stored => !stored || stored.replace(/\/$/, '') === 'https://zesia-consult.cprindex.workers.dev' ? DEFAULT_SERVICE_URL : stored;
export const defaultConfigPath = () => join(homedir(), '.config', 'zesia', 'dsh.json');
export async function readConfig(env = process.env, { requireToken = true } = {}) {
  let stored = {};
  try { stored = JSON.parse(await readFile(env.ZESIA_CONFIG || defaultConfigPath(), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read zesia configuration.'); }
  const config = { url: env.ZESIA_URL || serviceUrl(stored.url), token: env.ZESIA_TOKEN || stored.token, project: env.ZESIA_PROJECT || stored.project, confirmBeforeSend: stored.confirmBeforeSend !== false };
  if (requireToken && (!config.token || typeof config.token !== 'string')) throw new Error('Configure the zesia trial token first: npm run configure');
  return config;
}

export async function saveConfirmationMode(confirmBeforeSend, env = process.env) {
  if (typeof confirmBeforeSend !== 'boolean') throw new Error('Confirmation setting must be boolean.');
  const path = env.ZESIA_CONFIG || defaultConfigPath();
  let stored = {};
  try { stored = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not update zesia configuration.'); }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ ...stored, confirmBeforeSend }, null, 2), { mode: 0o600 });
  await rename(temporary, path); await chmod(path, 0o600);
  return { confirmBeforeSend };
}
