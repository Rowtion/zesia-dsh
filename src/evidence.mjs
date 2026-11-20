import { realpath, readFile, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

export const MAX_MATERIALS = 16;
export const MAX_MATERIAL_CHARS = 12000;
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

const MEDIA_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.pdf', 'application/pdf'],
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.json', 'application/json'],
]);

function isSensitivePath(name) {
  return !name || name.startsWith('..') || isAbsolute(name) ||
    name.split(/[\\/]/).some(part => /^(\.env(?:\..*)?|\.git|\.aws|\.ssh|credentials(?:\..*)?|secrets?(?:\..*)?)$/i.test(part));
}

async function resolveProjectFile(filePath, session) {
  const cwd = session?.header?.cwd;
  if (!cwd) throw new Error('The active project directory is unavailable.');
  const root = await realpath(cwd);
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('Evidence needs a project-relative path.');
  const target = await realpath(resolve(root, filePath));
  const name = relative(root, target);
  if (isSensitivePath(name)) throw new Error('Evidence or attachment path is outside the project (save temporary screenshots inside the project directory such as .zesia/review/, never /tmp) or contains credential/configuration data.');
  return { target, name };
}

function excerptBudget(source) {
  const headerLength = `Source: ${source}\nExcerpt SHA-256: `.length + 65; // Digest and newline.
  const budget = MAX_MATERIAL_CHARS - headerLength;
  if (budget < 2) throw new Error('The source label is too long. Choose a shorter project path.');
  return budget;
}

function evidenceChunk(source, excerpt) {
  const hash = createHash('sha256').update(excerpt).digest('hex');
  const identity = createHash('sha256').update(`${source}\n${excerpt}`).digest('hex');
  const content = `Source: ${source}\nExcerpt SHA-256: ${hash}\n${excerpt}`;
  return { id: `file-${identity.slice(0, 20)}`, content };
}

function* splitLinesIntoChunks(lines, startLine, name) {
  let first = startLine;
  let excerpt = '';
  for (const [index, line] of lines.entries()) {
    const last = startLine + index;
    if (excerpt.length + line.length <= excerptBudget(`${name}:${first}-${last}`)) {
      excerpt += line;
      continue;
    }
    if (excerpt) yield evidenceChunk(`${name}:${first}-${last - 1}`, excerpt);
    first = last;
    const label = `${name}:${last}-${last}`;
    if (line.length <= excerptBudget(label)) {
      excerpt = line;
      continue;
    }

    let offset = 0;
    for (let part = 1; offset < line.length; part++) {
      const source = `${label} (part ${part})`;
      let end = Math.min(offset + excerptBudget(source), line.length);
      const lastCodeUnit = line.charCodeAt(end - 1);
      if (end < line.length && lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end--;
      yield evidenceChunk(source, line.slice(offset, end));
      offset = end;
    }
    first = last + 1;
    excerpt = '';
  }
  if (excerpt) yield evidenceChunk(`${name}:${first}-${startLine + lines.length - 1}`, excerpt);
}

export async function captureEvidence(files = [], session) {
  if (!Array.isArray(files) || files.length > MAX_MATERIALS) throw new Error(`Supply at most ${MAX_MATERIALS} file excerpts.`);
  if (!files.length) return [];
  const materials = [];
  for (const file of files) {
    const { target, name } = await resolveProjectFile(file?.path, session);
    const info = await stat(target);
    if (!info.isFile() || info.size > 4_000_000) throw new Error('Select a text evidence file under 4 MB.');
    const bytes = await readFile(target);
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (source.includes('\0')) throw new Error('Binary evidence is not supported in evidenceFiles; use attachmentFiles.');
    const lines = source.match(/[^\n]*\n|[^\n]+$/g) || [];
    const start = file.startLine ?? 1;
    const end = file.endLine ?? lines.length;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) {
      throw new Error('Choose an existing line range.');
    }
    const selected = lines.slice(start - 1, end);
    const chunks = splitLinesIntoChunks(selected, start, name);
    for (const chunk of chunks) {
      materials.push(chunk);
      if (materials.length > MAX_MATERIALS) {
        throw new Error(`Evidence exceeds ${MAX_MATERIALS} material chunks (${MAX_MATERIAL_CHARS} characters each). Select fewer files or ranges.`);
      }
    }
  }
  return materials;
}

export async function captureAttachments(files = [], session) {
  if (!Array.isArray(files) || files.length > MAX_ATTACHMENTS) throw new Error(`Supply at most ${MAX_ATTACHMENTS} attachments.`);
  if (!files.length) return [];
  const attachments = [];
  let totalBytes = 0;
  for (const file of files) {
    const { target, name } = await resolveProjectFile(file?.path, session);
    const ext = extname(target).toLowerCase();
    const mediaType = MEDIA_TYPES.get(ext);
    if (!mediaType) throw new Error(`Unsupported attachment format (${ext || 'unknown'}). Supported: png, jpg, webp, gif, pdf, txt, md, json.`);
    const info = await stat(target);
    if (!info.isFile() || info.size <= 0) throw new Error('Select a non-empty attachment file.');
    totalBytes += info.size;
    if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error('Total attachment size exceeds 6 MiB.');
    const bytes = await readFile(target);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const id = typeof file.id === 'string' && file.id.trim() ? file.id.trim().slice(0, 80) : `att-${hash.slice(0, 16)}`;
    attachments.push({
      id,
      filename: basename(name),
      mediaType,
      data: `data:${mediaType};base64,${bytes.toString('base64')}`,
      ...(typeof file.description === 'string' && file.description.trim() ? { description: file.description.trim().slice(0, 200) } : {}),
    });
  }
  return attachments;
}

export function mergeEvidence(existing = [], additions = []) {
  const map = new Map();
  for (const item of [...existing, ...additions]) {
    if (map.has(item.id) && map.get(item.id).content !== item.content) throw new Error('Conflicting evidence IDs. Nothing sent.');
    map.set(item.id, item);
  }
  return [...map.values()];
}

export function mergeAttachments(existing = [], additions = []) {
  const map = new Map();
  for (const item of [...existing, ...additions]) {
    if (map.has(item.id) && map.get(item.id).data !== item.data) throw new Error('Conflicting attachment IDs. Nothing sent.');
    map.set(item.id, item);
  }
  return [...map.values()];
}
