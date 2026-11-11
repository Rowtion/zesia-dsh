import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { readSecret } from '@zesia/client/read-secret';

const defaultUrl = 'https://api.zesia.dev';
const path = process.env.ZESIA_CONFIG || join(homedir(), '.config', 'zesia', 'dsh.json');
const args = process.argv.slice(2);
let config = {};
try {
  config = JSON.parse(await readFile(path, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Could not read the existing DSH configuration.');
}

const storedUrl = config.url?.replace(/\/$/u, '');
const url = process.env.ZESIA_URL || (storedUrl && storedUrl !== 'https://zesia-consult.cprindex.workers.dev' ? storedUrl : defaultUrl);
const tokenConfigured = Boolean(process.env.ZESIA_TOKEN || config.token);
if (args.length === 1 && args[0] === '--show') {
  const destination = new URL(url);
  if (destination.username || destination.password) throw new Error('Remove credentials from the service URL.');
  console.log(JSON.stringify({ url: destination.origin, confirmBeforeSend: config.confirmBeforeSend !== false, tokenConfigured }));
} else {
  if (args.length) throw new Error('Run without arguments to activate, or pass --show to check configuration.');
  if (tokenConfigured || url !== defaultUrl) throw new Error('An activation code or custom service is already configured. Existing settings were preserved.');
  const token = await readSecret(stdin, stdout);
  if (!token || /[\s\x00-\x1f\x7f]/u.test(token)) throw new Error('A valid trial token is required.');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ ...config, url, token, confirmBeforeSend: config.confirmBeforeSend !== false }, null, 2), { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
  await chmod(path, 0o600);
  console.log('Saved private DSH configuration.');
}
