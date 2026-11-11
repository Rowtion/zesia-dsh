import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, writeFile, readFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defaultConfigPath, serviceUrl } from '../src/config.mjs';
const args = process.argv.slice(2);
const at = args.indexOf('--token-file');
let token;
if (at >= 0) { const source = JSON.parse(await readFile(args[at + 1], 'utf8')); token = source.token; }
else { const prompt = createInterface({ input: stdin, output: stdout }); token = (await prompt.question('Zesia trial token (stored only on this computer): ')).trim(); prompt.close(); }
if (typeof token !== 'string' || !token.trim() || /\s/.test(token)) throw new Error('A valid trial token is required.');
const path = process.env.ZESIA_CONFIG || defaultConfigPath();
await mkdir(dirname(path), { recursive: true, mode: 0o700 });
let previous = {};
try { previous = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(path, JSON.stringify({ ...previous, confirmBeforeSend: previous.confirmBeforeSend !== false, url: serviceUrl(previous.url), token }, null, 2), { mode: 0o600 });
await chmod(path, 0o600);
console.log(`Saved private configuration: ${path}`);
