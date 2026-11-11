import { realpath, readFile, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
export async function captureEvidence(files = [], session) {
  if (!Array.isArray(files) || files.length > 3) throw new Error('Supply at most three bounded file excerpts.');
  if (!files.length) return [];
  const cwd = session?.header?.cwd;
  if (!cwd) throw new Error('The active project directory is unavailable.');
  const root = await realpath(cwd);
  const materials = [];
  for (const file of files) {
    if (!file || typeof file.path !== 'string') throw new Error('Evidence needs a project-relative path.');
    const target = await realpath(resolve(root, file.path));
    const name = relative(root, target);
    if (!name || name.startsWith('..') || isAbsolute(name) || name.split(/[\\/]/).some(part => /^(\.env(?:\..*)?|\.git|\.aws|\.ssh|credentials(?:\..*)?|secrets?(?:\..*)?)$/i.test(part))) throw new Error('Evidence path is outside the project or contains credential/configuration data.');
    const info = await stat(target);
    if (!info.isFile() || info.size > 2_000_000) throw new Error('Select a small text evidence file.');
    const bytes = await readFile(target);
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (source.includes('\0')) throw new Error('Binary evidence is not supported.');
    const lines = source.match(/[^\n]*\n|[^\n]+$/g) || [];
    const start = file.startLine ?? 1, end = file.endLine ?? Math.min(lines.length, start + 119);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length || end - start > 199) throw new Error('Choose an existing range of at most 200 lines.');
    const excerpt = lines.slice(start - 1, end).join('');
    const hash = createHash('sha256').update(excerpt).digest('hex');
    const content = `Source: ${name}:${start}-${end}\nExcerpt SHA-256: ${hash}\n${excerpt}`;
    if (content.length > 6000) throw new Error('Evidence excerpt exceeds 6000 characters; select a narrower range.');
    const identity=createHash('sha256').update(`${name}:${start}-${end}\n${excerpt}`).digest('hex');
    materials.push({ id: `file-${identity.slice(0,20)}`, content });
  }
  return materials;
}

export function mergeEvidence(existing = [], additions = []) {
  const map = new Map();
  for (const item of [...existing, ...additions]) {
    if (map.has(item.id) && map.get(item.id).content !== item.content) throw new Error('Conflicting evidence IDs. Nothing sent.');
    map.set(item.id,item);
  }
  return [...map.values()];
}
