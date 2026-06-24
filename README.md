# Cognify

A cognitive-fitness tracker for your AI conversations. Cognify scores how you think *with* AI —
critical thinking, depth, engagement, and a **Cognitive Offloading Ratio** — straight from the
conversation Claude already has in context. No copy/paste.

Scoring is grounded in cognitive science (ICAP, Paul–Elder, SOLO, epistemic vigilance, cognitive
offloading). See [`skill/reference/scientific-basis.md`](skill/reference/scientific-basis.md) for citations.

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
- **Phase 2** — auto-score on session end ([`hooks/`](hooks/cognify-stop-hook.md)).
- **Phase 3** — claude.ai Skills wrapper (reuses `SKILL.md` + `schema.json`).
- **Phase 4** — hosted backend + accounts, and a research arm studying how AI shapes thinking,
  using Cognify's unique behavioral/longitudinal data.

## Development
```bash
node --test 'skill/scripts/*.test.mjs'   # store unit tests (4 passing)
cd app && npm run build                    # dashboard build
```
