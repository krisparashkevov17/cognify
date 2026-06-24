import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { appendSession, loadProfile, validateSession } from './cognify-store.mjs';

const STORE = join(dirname(fileURLToPath(import.meta.url)), 'cognify-store.mjs');

function tmpDir() { return mkdtempSync(join(tmpdir(), 'cognify-')); }

function sampleSession(id = 's1') {
  return {
    id,
    timestamp: '2026-06-24T00:00:00.000Z',
    source: 'claude-code',
    conversation: 'label',
    scores: { criticalThinking: 60, depth: 55, engagement: 70 },
    offloadingRatio: 40,
    claims: [],
    topics: ['ai'],
    engagementSignals: [],
    summary: 'ok',
    rubricVersion: '1.0',
  };
}

test('append creates profile when missing', () => {
  const dir = tmpDir();
  const profile = appendSession(sampleSession(), dir);
  assert.equal(profile.sessions.length, 1);
  assert.ok(existsSync(join(dir, 'profile.json')));
});

test('append adds to existing profile in order', () => {
  const dir = tmpDir();
  appendSession(sampleSession('a'), dir);
  const profile = appendSession(sampleSession('b'), dir);
  assert.deepEqual(profile.sessions.map(s => s.id), ['a', 'b']);
});

test('corrupt profile is backed up and reset', () => {
  const dir = tmpDir();
  writeFileSync(join(dir, 'profile.json'), '{ not json');
  const profile = loadProfile(dir);
  assert.equal(profile.sessions.length, 0);
  assert.ok(existsSync(join(dir, 'profile.corrupt-1.json')));
});

test('malformed session is rejected', () => {
  assert.throws(() => validateSession({ id: 'x' }), /scores/);
  assert.throws(
    () => validateSession({ ...sampleSession(), scores: { criticalThinking: 200, depth: 1, engagement: 1 } }),
    /0-100/
  );
});

test('malformed claim is rejected', () => {
  assert.throws(
    () => validateSession({ ...sampleSession(), claims: [{ text: 'x', risk: 'severe', tag: 't' }] }),
    /claim.risk/
  );
  assert.throws(
    () => validateSession({ ...sampleSession(), claims: [{ risk: 'high', tag: 't' }] }),
    /claim.text/
  );
});

// Regression: invoking the CLI through a symlink (how the skill is installed,
// e.g. ~/.claude/skills/cognify -> repo) must still run main() and persist.
// Node resolves import.meta.url to the real path while argv[1] keeps the symlink
// path, so a naive `import.meta.url === file://${argv[1]}` guard silently no-ops.
test('CLI persists when invoked through a symlink', () => {
  const dir = tmpDir();
  const link = join(dir, 'store-link.mjs');
  symlinkSync(STORE, link);
  const sessionFile = join(dir, 'session.json');
  writeFileSync(sessionFile, JSON.stringify(sampleSession('via-link')));

  execFileSync(process.execPath, [link, 'append', sessionFile], {
    env: { ...process.env, COGNIFY_DIR: dir },
  });

  assert.ok(existsSync(join(dir, 'profile.json')), 'profile.json written via symlinked CLI');
  assert.deepEqual(loadProfile(dir).sessions.map(s => s.id), ['via-link']);
});
