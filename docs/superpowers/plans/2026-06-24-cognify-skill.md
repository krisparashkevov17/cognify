# Cognify Skill + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Cognify into an open-source Claude skill that scores the current conversation (no copy/paste), persists a local profile, and feeds the existing React dashboard — all sharing one `schema.json` contract.

**Architecture:** One repo, three parts. `skill/` holds `SKILL.md` (the science-grounded rubric Claude follows), `cognify-store.mjs` (dependency-free Node persistence to `~/.cognify/profile.json`), and `reference/` (`schema.json` + `scientific-basis.md`). `app/` is the existing React dashboard, moved from the repo root, reading the profile via import. The skill never imports React; the dashboard never knows about Claude; `schema.json` is the only shared surface.

**Tech Stack:** Node ≥18 (ESM, built-in `node:test` runner — no npm deps for the store), React 18 + Vite + Tailwind (existing dashboard), Markdown (skill + docs).

**Spec:** `docs/superpowers/specs/2026-06-24-cognify-skill-design.md`

---

## File Structure

| Path | Responsibility | Status |
|------|----------------|--------|
| `app/` | Existing React dashboard (was repo root: `src/`, `index.html`, `vite.config.js`, `package.json`, `tailwind.config.js`, `postcss.config.js`) | Move |
| `skill/SKILL.md` | Rubric + procedure Claude follows | Create |
| `skill/reference/schema.json` | Shared session/profile contract | Create |
| `skill/reference/scientific-basis.md` | Cited constructs behind every rubric band | Create |
| `skill/scripts/cognify-store.mjs` | Append/export sessions to `~/.cognify/profile.json` | Create |
| `skill/scripts/cognify-store.test.mjs` | Unit tests for the store (node:test) | Create |
| `hooks/cognify-stop-hook.md` | Phase-2 auto-trigger (documented only) | Create |
| `app/src/App.jsx` | Add import affordance + Offloading Ratio card | Modify |
| `README.md` | Install, usage, science story, roadmap | Create |

**Repo-name reconciliation:** package name `cognition-os` → `cognify` (Task 2). The physical folder rename (`dignify` → `cognify`) and git remote are a final manual step (Task 12) because renaming the working directory mid-session breaks paths.

---

## Task 1: Move the dashboard into `app/`

**Files:**
- Move: `src/`, `index.html`, `vite.config.js`, `package.json`, `tailwind.config.js`, `postcss.config.js` → `app/`
- Keep at root: `demo.html`, `explainer.html`, `pitch.html`, `slides.html`, `speaker_notes.html`, `.gitignore`, `docs/`

- [ ] **Step 1: Create `app/` and move the dashboard files with git**

```bash
cd /Users/inteligentekris/skill/dignify
mkdir -p app
git mv src index.html vite.config.js package.json tailwind.config.js postcss.config.js app/
```

- [ ] **Step 2: Verify the dashboard still builds from its new home**

```bash
cd app && npm install && npm run build
```
Expected: Vite build completes, `app/dist/` produced, no path errors. (`vite.config.js` uses relative paths, so no edits needed.)

- [ ] **Step 3: Commit**

```bash
cd /Users/inteligentekris/skill/dignify
git add -A
git commit -m "refactor: move dashboard into app/ to make room for skill"
```

---

## Task 2: Rename the package to cognify

**Files:**
- Modify: `app/package.json:2`

- [ ] **Step 1: Change the package name**

In `app/package.json`, change:
```json
  "name": "cognition-os",
```
to:
```json
  "name": "cognify",
```

- [ ] **Step 2: Commit**

```bash
git add app/package.json
git commit -m "chore: rename package to cognify"
```

---

## Task 3: Define the shared schema contract

**Files:**
- Create: `skill/reference/schema.json`

- [ ] **Step 1: Write the schema**

Create `skill/reference/schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Cognify session",
  "type": "object",
  "required": ["id", "timestamp", "scores", "claims", "topics", "engagementSignals", "summary"],
  "properties": {
    "id": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "source": { "type": "string", "enum": ["claude-code", "claude-ai", "manual"] },
    "conversation": { "type": "string", "description": "Short label, NOT the full transcript (privacy)" },
    "scores": {
      "type": "object",
      "required": ["criticalThinking", "depth", "engagement"],
      "properties": {
        "criticalThinking": { "type": "number", "minimum": 0, "maximum": 100 },
        "depth": { "type": "number", "minimum": 0, "maximum": 100 },
        "engagement": { "type": "number", "minimum": 0, "maximum": 100 }
      }
    },
    "offloadingRatio": { "type": "number", "minimum": 0, "maximum": 100, "description": "Signature metric; optional for back-compat" },
    "claims": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["text", "risk", "tag"],
        "properties": {
          "text": { "type": "string" },
          "risk": { "type": "string", "enum": ["high", "medium", "low"] },
          "tag": { "type": "string" }
        }
      }
    },
    "topics": { "type": "array", "items": { "type": "string" } },
    "engagementSignals": { "type": "array", "items": { "type": "string" } },
    "summary": { "type": "string" },
    "rubricVersion": { "type": "string" }
  }
}
```

- [ ] **Step 2: Verify it is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('skill/reference/schema.json','utf8')); console.log('valid')"
```
Expected: prints `valid`.

- [ ] **Step 3: Commit**

```bash
git add skill/reference/schema.json
git commit -m "feat: add shared cognify session schema"
```

---

## Task 4: Store — append a session (TDD)

**Files:**
- Create: `skill/scripts/cognify-store.test.mjs`
- Create: `skill/scripts/cognify-store.mjs`

- [ ] **Step 1: Write the failing tests**

Create `skill/scripts/cognify-store.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendSession, loadProfile, validateSession } from './cognify-store.mjs';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test skill/scripts/
```
Expected: FAIL — `Cannot find module './cognify-store.mjs'`.

- [ ] **Step 3: Implement the store**

Create `skill/scripts/cognify-store.mjs`:
```js
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
  if (typeof s.timestamp !== 'string' || !s.timestamp) throw new Error('session.timestamp required');
  if (!s.scores || typeof s.scores !== 'object') throw new Error('session.scores required');
  for (const k of REQUIRED_SCORES) {
    const v = s.scores[k];
    if (typeof v !== 'number' || v < 0 || v > 100) throw new Error(`scores.${k} must be 0-100`);
  }
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test skill/scripts/
```
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add skill/scripts/cognify-store.mjs skill/scripts/cognify-store.test.mjs
git commit -m "feat: add dependency-free cognify profile store with tests"
```

---

## Task 5: Store CLI smoke test

**Files:**
- (No new files — verifies the `main()` CLI path of `cognify-store.mjs`.)

- [ ] **Step 1: Append a real session via the CLI into a temp dir**

```bash
cat > /tmp/cognify-sample.json <<'JSON'
{ "id":"cli-1","timestamp":"2026-06-24T00:00:00.000Z","source":"manual",
  "conversation":"smoke","scores":{"criticalThinking":50,"depth":50,"engagement":50},
  "offloadingRatio":50,"claims":[],"topics":[],"engagementSignals":[],"summary":"s","rubricVersion":"1.0" }
JSON
COGNIFY_DIR=/tmp/cognify-smoke node skill/scripts/cognify-store.mjs append /tmp/cognify-sample.json
```
Expected: stderr prints `Saved session cli-1. Total sessions: 1.`

- [ ] **Step 2: Verify rejection of a malformed session returns non-zero**

```bash
echo '{"id":"bad"}' > /tmp/cognify-bad.json
COGNIFY_DIR=/tmp/cognify-smoke node skill/scripts/cognify-store.mjs append /tmp/cognify-bad.json; echo "exit=$?"
```
Expected: prints `invalid session: ...` and `exit=1`.

- [ ] **Step 3: Clean up (no commit — verification only)**

```bash
rm -rf /tmp/cognify-smoke /tmp/cognify-sample.json /tmp/cognify-bad.json
```

---

## Task 6: Scientific basis reference

**Files:**
- Create: `skill/reference/scientific-basis.md`

- [ ] **Step 1: Write the reference doc**

Create `skill/reference/scientific-basis.md`:
```markdown
# Scientific basis for the Cognify rubric

Every score and output bucket is anchored to text-observable behavior drawn from established
cognitive-science frameworks. This file is the citation backbone for `SKILL.md` and for future research.

## Score dimensions

### Critical thinking
- Paul–Elder intellectual standards: clarity, accuracy, precision, relevance, depth, breadth, logic,
  significance, fairness (Paul & Elder, 2006/2014).
- Epistemic vigilance toward source and content (Sperber et al., 2010).
- Argument hygiene (Watson–Glaser; Ennis & Weir, 1985; Halpern, 2010).
- *Observable:* makes assumptions explicit, requests evidence, weighs counterarguments, calibrates confidence.

### Depth
- SOLO taxonomy: prestructural → unistructural → multistructural → relational → extended abstract
  (Biggs & Collis, 1982).
- Bloom's revised taxonomy: remember → understand → apply → analyze → evaluate → create
  (Anderson & Krathwohl, 2001).
- Levels of processing (Craik & Lockhart, 1972).
- *Observable:* isolated facts (low) → integrated, generalized reasoning (high).

### Engagement
- ICAP framework: Passive → Active → Constructive → Interactive (Chi & Wylie, 2014).
- Need for Cognition (Cacioppo & Petty, 1982).
- *Observable:* restating (low) → building on / extending the other party's ideas (high).

## Five-band 0–100 ladder (applied per score)
- **0–20 Passive / Surface / Remember:** restating, agreeing without content; no reasoning visible.
- **21–40 Active / Unistructural:** manipulates given content but adds nothing new.
- **41–60 Constructive / Multistructural / Understand–Apply:** generates explanations/examples/inferences;
  several relevant but loosely connected points.
- **61–80 Interactive-emerging / Relational / Analyze–Evaluate:** integrates into a coherent argument,
  weighs evidence and counterarguments, makes assumptions explicit.
- **81–100 Interactive / Extended Abstract / Create:** co-constructs and extends others' reasoning,
  synthesizes novel connections, considers multiple viewpoints fairly, calibrates confidence, self-corrects.

## Output buckets
- **Flagged claims** — low epistemic vigilance (Sperber et al., 2010); miscalibration (Fleming & Lau, 2014);
  single-source reliance (Barzilai & Zohar, 2012); no lateral reading (Wineburg & McGrew, 2019).
- **Engagement signals** — metacognition (Flavell, 1979); System-2 effort (Kahneman, 2011);
  cognitive-miser override (Stanovich, 2009).
- **Blind spots** — confirmation bias (Nickerson, 1998); motivated reasoning (Kunda, 1990);
  anchoring (Tversky & Kahneman, 1974).
- **Strengths** — good calibration; disconfirmation-seeking; source corroboration (lateral reading).

## Signature metric — Cognitive Offloading Ratio
A 0–100 behavioral measure of effortful engagement vs. wholesale offloading to the AI. Grounded in
cognitive-offloading theory (Sparrow, Liu & Wegner, 2011; Risko & Gilbert, 2016). Current 2025 studies
(Lee et al., CHI 2025, Microsoft Research/CMU; Gerlich, 2025, *Societies*) rely on self-report; scoring
real conversations is the unique behavioral contribution.

## Honesty / calibration rule
Score observable behavior confidently; surface trait-level inferences (Need for Cognition, System 1/2)
as soft signals with explicit uncertainty. Over-claiming a disposition from a short transcript is itself
a calibration error.

## Caveats for the research arm
Sparrow et al. (2011) has faced replication scrutiny; Gerlich (2025) is cross-sectional/correlational with
a published table correction; Kosmyna et al. (2025, "Your Brain on ChatGPT") is a small-N preprint with a
formal critique. Cite accordingly.
```

- [ ] **Step 2: Commit**

```bash
git add skill/reference/scientific-basis.md
git commit -m "docs: add cited scientific basis for the rubric"
```

---

## Task 7: Write SKILL.md

**Files:**
- Create: `skill/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skill/SKILL.md`:
```markdown
---
name: cognify
description: >-
  Score the cognitive quality of the current conversation — critical thinking, depth, engagement,
  and a Cognitive Offloading Ratio — grounded in cognitive science. Use when the user says "score
  my thinking", "analyze my conversation", "cognitive score", "how critical was I", "rate my
  reasoning", or "cognify". Reads the conversation already in context (no copy/paste); can also
  score a pasted transcript or a transcript file.
---

# Cognify

Turn this conversation into a cognitive-fitness reading. You are a cognitive analysis engine applying
a rubric grounded in cognitive science (see `reference/scientific-basis.md`).

## Procedure

1. **Scope the source.** Default to the **current conversation in context**. If the user points at a
   transcript file or pastes one, score that instead. Score **only the user's** contributions.

2. **Apply the rubric** (full anchors in `reference/scientific-basis.md`). Produce three 0–100 scores
   using the five-band ladder:
   - **criticalThinking** — assumptions made explicit, evidence requested, counterarguments weighed,
     confidence calibrated (Paul–Elder; Sperber et al. 2010).
   - **depth** — isolated facts (low) vs. integrated, generalized reasoning (high) (SOLO; Bloom).
   - **engagement** — restating (low) vs. building on / extending ideas (high) (ICAP; Need for Cognition).
   - **offloadingRatio** (0–100) — share of cognitive work delegated wholesale to the AI vs. retained
     and verified by the user. Higher = more offloading. This is the signature metric.

3. **Extract:**
   - **claims** — significant claims the user made or accepted, each `{ text, risk: high|medium|low, tag }`.
     High risk = accepted uncritically / no source / miscalibrated confidence.
   - **topics** — main subjects.
   - **engagementSignals** — observable behaviors (clarifying questions, self-correction, source requests…).
   - **summary** — 2–3 sentence narrative of the cognitive patterns.

4. **Honesty guardrail (mandatory).** Be accurate, not flattering — never inflate scores to please the
   user. Score observable behavior confidently; hedge trait-level inferences with explicit uncertainty.

5. **Build the session object** matching `reference/schema.json`:
   - `id`: `session-<timestamp-ms>`
   - `timestamp`: current ISO-8601
   - `source`: `claude-code` (or `claude-ai` / `manual`)
   - `conversation`: a **short label only** (e.g. "Discussion of AI productivity and health claims") —
     never the full transcript (privacy).
   - `scores`, `offloadingRatio`, `claims`, `topics`, `engagementSignals`, `summary`
   - `rubricVersion`: `"1.0"`

6. **Present in-chat** a compact markdown summary: the four numbers, the top 2–3 flagged claims, and a
   one-line takeaway.

7. **Persist.** Write the session JSON to a temp file and run the store:
   ```bash
   node <skill-dir>/scripts/cognify-store.mjs append <session.json>
   ```
   If Node is unavailable, still show the in-chat summary and tell the user how to enable persistence
   (install Node ≥18). Scoring must never be blocked by the store failing.

8. **Point to the dashboard.** Tell the user they can view trends, fingerprint, blind spots, and the
   Offloading Ratio by importing `~/.cognify/profile.json` into the Cognify dashboard (`app/`).

## Notes
- One rubric, any source. The only difference between Claude Code and claude.ai is step 7's persistence.
- Keep scores comparable: always stamp `rubricVersion`.
```

- [ ] **Step 2: Verify frontmatter parses and required keys exist**

```bash
node -e "const t=require('fs').readFileSync('skill/SKILL.md','utf8'); const m=t.match(/^---\n([\s\S]*?)\n---/); if(!m) throw new Error('no frontmatter'); if(!/name:\s*cognify/.test(m[1])) throw new Error('no name'); if(!/description:/.test(m[1])) throw new Error('no description'); console.log('ok')"
```
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add skill/SKILL.md
git commit -m "feat: add cognify SKILL.md with science-grounded rubric"
```

---

## Task 8: Dashboard — aggregate the Offloading Ratio

**Files:**
- Modify: `app/src/App.jsx` (`aggregateProfile`, ~lines 168-203)

- [ ] **Step 1: Add offloading aggregation inside `aggregateProfile`**

In `app/src/App.jsx`, in `aggregateProfile`, after `const allClaims = [];` (around line 175) add:
```js
  let totalOffload = 0;
  let offloadCount = 0;
```
Then inside the `for (const s of sessions)` loop, after `allClaims.push(...(s.claims || []));` add:
```js
    if (typeof s.offloadingRatio === 'number') {
      totalOffload += s.offloadingRatio;
      offloadCount += 1;
    }
```
Then in the returned object, after `sessionCount: sessions.length,` add:
```js
    avgOffloadingRatio: offloadCount ? Math.round(totalOffload / offloadCount) : null,
```

- [ ] **Step 2: Verify the build still compiles**

```bash
cd app && npm run build
```
Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/inteligentekris/skill/dignify
git add app/src/App.jsx
git commit -m "feat(dashboard): aggregate average offloading ratio"
```

---

## Task 9: Dashboard — Offloading Ratio card

**Files:**
- Modify: `app/src/App.jsx` (profile view "Cognitive Scores" area)

- [ ] **Step 1: Add the card to the profile view**

In `app/src/App.jsx`, find the profile view's score row (the block rendering `CircularScore` for the profile, near line 792 "Score Trend" / the profile scores section). Immediately after the existing profile score block that renders the avg critical thinking / depth `CircularScore`s, add a conditional card:
```jsx
                {profile.avgOffloadingRatio !== null && (
                  <div className="mt-6">
                    <h2 className="text-xs text-amber-400/80 uppercase tracking-widest mb-3">Cognitive Offloading Ratio</h2>
                    <div className="flex items-center gap-4">
                      <CircularScore value={profile.avgOffloadingRatio} label="Offloading" color="#f59e0b" />
                      <p className="text-sm text-gray-400 max-w-xs">
                        Share of cognitive work delegated to the AI vs. retained and verified. Lower is healthier —
                        it means you stay in the reasoning loop.
                      </p>
                    </div>
                  </div>
                )}
```
(`CircularScore(value, label, color)` already exists at line 245.)

- [ ] **Step 2: Verify the build compiles**

```bash
cd app && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Manual check**

```bash
cd app && npm run dev
```
Open the dev URL → click the Demo flow (seeds sessions; note the seed sessions have no `offloadingRatio`, so the card is hidden — expected). Then go to Task 10 to import a real profile and confirm the card appears.

- [ ] **Step 4: Commit**

```bash
cd /Users/inteligentekris/skill/dignify
git add app/src/App.jsx
git commit -m "feat(dashboard): add offloading ratio card to profile view"
```

---

## Task 10: Dashboard — import a real profile

**Files:**
- Modify: `app/src/App.jsx` (App component: add `handleImport`; profile view: add file input)

- [ ] **Step 1: Add the import handler**

In `app/src/App.jsx`, after the `persistSession` callback (around line 427) add:
```js
  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const imported = Array.isArray(data) ? data : data.sessions;
        if (!Array.isArray(imported)) throw new Error('no sessions array');
        setSessions(imported);
        storageSet('sessions', imported);
        setError(null);
      } catch {
        setError('Could not import profile — expected a Cognify profile.json file.');
      }
    };
    reader.readAsText(file);
  }, []);
```

- [ ] **Step 2: Add the file input to the profile view header**

In the profile view, next to the `<h1>Cognitive Profile</h1>` header (around line 761), add:
```jsx
                <label className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer">
                  Import profile.json
                  <input type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
                </label>
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd app && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Manual end-to-end check**

```bash
# Create a real profile via the skill store, then import it.
cat > /tmp/cog-s.json <<'JSON'
{ "id":"imp-1","timestamp":"2026-06-24T00:00:00.000Z","source":"claude-code","conversation":"AI + health claims",
  "scores":{"criticalThinking":58,"depth":67,"engagement":83},"offloadingRatio":35,
  "claims":[{"text":"Vitamin D cures depression","risk":"high","tag":"health"}],
  "topics":["ai","health"],"engagementSignals":["asks clarifying questions"],
  "summary":"Strong engagement, low scrutiny on health claims.","rubricVersion":"1.0" }
JSON
COGNIFY_DIR=/tmp/cog node skill/scripts/cognify-store.mjs append /tmp/cog-s.json
cat /tmp/cog/profile.json   # this is the file to import in the dashboard
cd app && npm run dev
```
In the browser: Profile view → "Import profile.json" → choose `/tmp/cog/profile.json`. Expected: trend/fingerprint render from the imported session AND the Offloading Ratio card now appears (value 35).

- [ ] **Step 5: Clean up and commit**

```bash
rm -rf /tmp/cog /tmp/cog-s.json
cd /Users/inteligentekris/skill/dignify
git add app/src/App.jsx
git commit -m "feat(dashboard): import ~/.cognify/profile.json"
```

---

## Task 11: Phase-2 hook doc + README

**Files:**
- Create: `hooks/cognify-stop-hook.md`
- Create: `README.md`

- [ ] **Step 1: Write the Phase-2 hook doc (documented, not wired)**

Create `hooks/cognify-stop-hook.md`:
```markdown
# Optional: auto-score every conversation (Phase 2)

This is a **documented add-on, not enabled by default.** It makes Cognify passive — like a real
fitness tracker — by invoking the `cognify` skill when a Claude Code session ends.

## How it works
Claude Code fires a `Stop` hook when a conversation ends. Point that hook at a command that asks
Claude to run the `cognify` skill on the just-finished conversation, which then persists a session
via `skill/scripts/cognify-store.mjs` exactly as the on-demand path does.

## Enable it
Add to your Claude Code `settings.json` (see Claude Code hooks docs for the exact schema in your
version):

```jsonc
{
  "hooks": {
    "Stop": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "echo 'Run the cognify skill on this conversation'" } ] }
    ]
  }
}
```

Tune the command to your workflow. Because scoring runs on session end, keep it lightweight.
```

- [ ] **Step 2: Write the README**

Create `README.md`:
```markdown
# Cognify

A cognitive-fitness tracker for your AI conversations. Cognify scores how you think *with* AI —
critical thinking, depth, engagement, and a **Cognitive Offloading Ratio** — straight from the
conversation Claude already has in context. No copy/paste.

Scoring is grounded in cognitive science (ICAP, Paul–Elder, SOLO, epistemic vigilance, cognitive
offloading). See `skill/reference/scientific-basis.md` for citations.

## Parts
- `skill/` — the Claude skill: `SKILL.md` (rubric), `scripts/cognify-store.mjs` (local persistence),
  `reference/` (`schema.json`, `scientific-basis.md`).
- `app/` — the React dashboard: trends, cognitive fingerprint, blind spots, strengths, offloading ratio.
- `hooks/` — optional auto-scoring (Phase 2).

## Install the skill (Claude Code)
Copy or symlink `skill/` into your Claude Code skills directory as `cognify`:
```bash
ln -s "$(pwd)/skill" ~/.claude/skills/cognify
```
Then in any conversation: **"score my thinking"** (or "cognify"). Requires Node ≥18 for persistence.

## View your profile
```bash
cd app && npm install && npm run dev
```
Open the dashboard → **Profile → Import profile.json** → choose `~/.cognify/profile.json`.
A built-in **Demo** runs with zero setup.

## Privacy
Cognify stores **labels + scores + signals**, never your raw transcripts, unless you opt in.
Everything lives locally in `~/.cognify/profile.json`.

## Roadmap
- **Phase 2** — auto-score on session end (`hooks/`).
- **Phase 3** — claude.ai Skills wrapper (reuses `SKILL.md` + `schema.json`).
- **Phase 4** — hosted backend + accounts, and a research arm studying how AI shapes thinking,
  using Cognify's unique behavioral/longitudinal data.

## Development
```bash
node --test skill/scripts/   # store unit tests
cd app && npm run build       # dashboard build
```
```

- [ ] **Step 3: Commit**

```bash
git add hooks/cognify-stop-hook.md README.md
git commit -m "docs: add README and Phase-2 hook guide"
```

---

## Task 12: Repo folder + remote reconciliation (manual, final)

**Files:**
- None (filesystem + git remote). Do this **after** the session ends — renaming the working directory mid-session breaks paths.

- [ ] **Step 1: Rename the folder**

```bash
cd /Users/inteligentekris/skill
mv dignify cognify
cd cognify
```

- [ ] **Step 2: Create the GitHub repo and push**

```bash
gh repo create cognify --public --source=. --remote=origin --push
```
Expected: repo created at `github.com/<you>/cognify`, `master` pushed.

- [ ] **Step 3: Verify**

```bash
git remote -v && gh repo view --web
```
Expected: `origin` points at the new `cognify` repo; the repo opens in the browser.

---

## Self-Review

**Spec coverage:**
- Architecture / repo shape (spec §2) → Task 1, 2, 12.
- SKILL.md + honesty guardrail (spec §3) → Task 7.
- Scientific grounding + offloading metric (spec §4) → Task 6, 7, 8, 9.
- schema.json + cognify-store.mjs incl. error handling (spec §5, §8) → Task 3, 4, 5.
- Dashboard import + offloading card + mock demo kept (spec §6) → Task 8, 9, 10.
- Components/boundaries (spec §7) → file structure table.
- Testing (spec §9) → Task 4 (unit), Task 5 (CLI smoke), Tasks 9–10 (manual dashboard).
- Roadmap / Phase 2 hook (spec §10) → Task 11.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output.

**Type consistency:** `appendSession`/`loadProfile`/`validateSession` signatures match between `cognify-store.mjs` and its tests; `avgOffloadingRatio` defined in Task 8 and consumed in Task 9; `handleImport` defined and wired in Task 10; `CircularScore(value,label,color)` used per its existing signature; session field names match `schema.json` throughout.
