import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureEvidence, captureAttachments } from '../src/evidence.mjs';

test('dsh auto-chunks large evidenceFiles along line boundaries up to 16 materials of 12,000 chars', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zesia-dsh-ev-'));
  try {
    const line = '.card-item { display: flex; gap: 12px; padding: 16px; color: #111827; }\n';
    const lines = Array.from({ length: 300 }, (_, i) => `/* ${String(i + 1).padStart(3, '0')} */ ${line}`);
    fs.writeFileSync(path.join(dir, 'large.css'), lines.join(''));
    const mats = await captureEvidence([{ path: 'large.css', startLine: 1, endLine: 300 }], { header: { cwd: dir } });
    assert.ok(mats.length >= 2 && mats.length <= 16);
    for (const m of mats) assert.ok(m.content.length <= 12000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dsh captures image attachmentFiles and rejects unsupported formats', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zesia-dsh-att-'));
  try {
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63606060000000040001f61738550000000049454e44ae426082',
      'hex',
    );
    fs.writeFileSync(path.join(dir, 'ui.png'), pngBytes);
    fs.writeFileSync(path.join(dir, 'bad.zip'), Buffer.from([1, 2, 3]));
    const atts = await captureAttachments([{ id: 'shot', path: 'ui.png', description: 'UI' }], { header: { cwd: dir } });
    assert.equal(atts.length, 1);
    assert.equal(atts[0].mediaType, 'image/png');
    assert.ok(atts[0].data.startsWith('data:image/png;base64,'));
    await assert.rejects(() => captureAttachments([{ path: 'bad.zip' }], { header: { cwd: dir } }), /Unsupported attachment format/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('oversized source lines retain every character in bounded, distinct chunks', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zesia-dsh-long-line-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = '/* intro */\n' + '🧪'.repeat(13500) + '\n/* tail */';
  fs.writeFileSync(path.join(dir, 'long.css'), source);
  const chunks = await captureEvidence([{ path: 'long.css' }], { header: { cwd: dir } });
  assert.ok(chunks.length > 2);
  assert.equal(new Set(chunks.map(chunk => chunk.id)).size, chunks.length);
  const excerpts = chunks.map(({ content }) => {
    const match = /^Source: [^\n]+\nExcerpt SHA-256: ([a-f0-9]{64})\n/u.exec(content);
    assert.ok(match);
    assert.ok(content.length <= 12000);
    const original = content.slice(match[0].length);
    assert.equal(original.isWellFormed(), true);
    assert.equal(match[1], createHash('sha256').update(original).digest('hex'));
    return original;
  });
  assert.equal(excerpts.join(''), source);
});
