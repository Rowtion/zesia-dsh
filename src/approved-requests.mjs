import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DRAFT_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export const REVIEW_TTL_MS = 24 * 60 * 60 * 1000;

export function createApprovedRequestStore({
  directory = process.env.ZESIA_DSH_STATE_DIR || join(homedir(), '.local', 'state', 'zesia', 'dsh', 'approved-consults'),
  now = Date.now,
} = {}) {
  const path = id => join(directory, id + '.json');

  async function read(id) {
    if (typeof id !== 'string' || !DRAFT_ID.test(id)) return null;
    let record;
    try { record = JSON.parse(await readFile(path(id), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (record.id !== id || !Number.isSafeInteger(record.approvedAt)) throw new Error('Invalid local approval record.');
    if (record.approvedAt + REVIEW_TTL_MS <= now()) {
      await unlink(path(id)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      return null;
    }
    return record;
  }

  async function* scan() {
    let names;
    try { names = await readdir(directory); }
    catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const record = await read(name.slice(0, -5)).catch(() => null);
      if (record) yield record;
    }
  }

  async function store(record, claim) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path(record.id);
    const temp = file + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
      if (claim) await link(temp, file);
      else await rename(temp, file);
    } finally {
      await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  return {
    async claim(record) {
      await store(record, true);
    },
    save(record) { return store(record, false); },
    async get(id, sessionId) {
      const record = await read(id);
      return record?.sessionId === sessionId ? record : null;
    },
    async forTurn(sessionId, turn) {
      let latest = null;
      for await (const record of scan()) {
        if (record.sessionId === sessionId && record.chatTurn === turn && (!latest || record.approvedAt > latest.approvedAt)) latest = record;
      }
      return latest;
    },
    async hasFollowup(sessionId, consultId) {
      for await (const record of scan()) {
        if (record.sessionId === sessionId && record.previousConsultId === consultId) return true;
      }
      return false;
    },
    async clean() {
      const records = scan();
      while (!(await records.next()).done) {
        // Reading drops expired records.
      }
    },
  };
}
