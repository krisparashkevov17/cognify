import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function profileDir() {
  return process.env.COGNIFY_DIR || join(homedir(), '.cognify');
}

export function profilePath(dir = profileDir()) {
  return join(dir, 'profile.json');
}

const REQUIRED_SCORES = ['criticalThinking', 'depth', 'engagement'];

export function validateSession(s) {
  if (!s || typeof s !== 'object') throw new Error('session must be an object');
  if (typeof s.id !== 'string' || !s.id) throw new Error('session.id required');
  if (!s.scores || typeof s.scores !== 'object') throw new Error('session.scores required');
  for (const k of REQUIRED_SCORES) {
    const v = s.scores[k];
    if (typeof v !== 'number' || v < 0 || v > 100) throw new Error(`scores.${k} must be 0-100`);
  }
  if (typeof s.timestamp !== 'string' || !s.timestamp) throw new Error('session.timestamp required');
  if (s.offloadingRatio !== undefined &&
      (typeof s.offloadingRatio !== 'number' || s.offloadingRatio < 0 || s.offloadingRatio > 100)) {
    throw new Error('offloadingRatio must be 0-100');
  }
  for (const k of ['claims', 'topics', 'engagementSignals']) {
    if (!Array.isArray(s[k])) throw new Error(`session.${k} must be an array`);
  }
  if (typeof s.summary !== 'string') throw new Error('session.summary must be a string');
  return true;
}

export function loadProfile(dir = profileDir()) {
  const path = profilePath(dir);
  if (!existsSync(path)) return { version: 1, sessions: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || !Array.isArray(parsed.sessions)) throw new Error('bad shape');
    return parsed;
  } catch {
    let n = 1;
    while (existsSync(join(dir, `profile.corrupt-${n}.json`))) n++;
    renameSync(path, join(dir, `profile.corrupt-${n}.json`));
    return { version: 1, sessions: [] };
  }
}

export function appendSession(session, dir = profileDir()) {
  validateSession(session);
  mkdirSync(dir, { recursive: true });
  const profile = loadProfile(dir);
  profile.sessions.push(session);
  const path = profilePath(dir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(profile, null, 2));
  renameSync(tmp, path);
  return profile;
}

function main(argv) {
  const [cmd, arg] = argv;
  if (cmd === 'append') {
    if (!arg) { console.error('usage: cognify-store.mjs append <session.json>'); process.exit(2); }
    let session;
    try { session = JSON.parse(readFileSync(arg, 'utf8')); }
    catch (e) { console.error(`cannot read session file: ${e.message}`); process.exit(2); }
    try {
      const profile = appendSession(session);
      console.error(`Saved session ${session.id}. Total sessions: ${profile.sessions.length}.`);
    } catch (e) { console.error(`invalid session: ${e.message}`); process.exit(1); }
  } else if (cmd === 'export') {
    console.log(profilePath());
  } else {
    console.error('usage: cognify-store.mjs <append|export> [args]');
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
