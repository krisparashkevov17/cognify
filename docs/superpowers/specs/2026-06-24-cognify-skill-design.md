# Cognify — Skill + Dashboard Design Spec

**Date:** 2026-06-24
**Status:** Approved (design) — pending implementation plan
**Author:** vp@seekadu.com (with Claude)

---

## 1. Summary

Cognify is a "cognitive fitness tracker" for AI conversations. Today it is a React/Vite/Tailwind
web app where a user pastes a transcript and receives scores for critical thinking, depth, and
engagement, flagged claims, and a longitudinal cognitive profile.

This spec turns the idea into a **Claude skill** distributed on GitHub, while keeping and reusing
the existing dashboard. The skill removes the product's biggest friction — copy/pasting chats —
because it analyzes the conversation Claude already has in context. The web app becomes the
showcase and longitudinal dashboard layer.

The rubric is grounded in established cognitive-science and psychology constructs so the scores are
defensible, and so the project can later support real research on how AI shapes human thinking.

### Goals
- Ship an open-source Claude skill that scores the *current* conversation with no copy/paste.
- Reuse the existing React dashboard for the longitudinal view, unchanged in its core logic.
- Ground the scoring rubric in real, cited cognitive-science frameworks.
- Add a signature behavioral metric — **Cognitive Offloading Ratio** — that no current study measures.
- Lay clean seams for later phases: auto-hook, claude.ai, hosted backend, research arm.

### Non-goals (explicitly out of scope for this spec)
- Hosted backend, user accounts, billing, or any server.
- The research study itself (designed later via the `/deep-research` pipeline).
- claude.ai Skills packaging (Phase 3) and the auto-scoring Stop hook (Phase 2) — documented, not built.

---

## 2. Architecture

One GitHub repo, restructured from the current flat layout into three cooperating parts that share
**one data contract** (`schema.json`). The skill never imports React; the dashboard never knows
about Claude; `schema.json` is the only shared surface.

```
cognify/
├── skill/                       # THE SKILL (new core)
│   ├── SKILL.md                 # rubric + procedure Claude follows
│   ├── scripts/
│   │   └── cognify-store.mjs    # append a session → ~/.cognify/profile.json
│   └── reference/
│       ├── schema.json          # shared session/profile contract
│       └── scientific-basis.md  # cited constructs behind every rubric band
├── hooks/
│   └── cognify-stop-hook.md     # OPTIONAL auto-trigger (Phase 2 — documented only)
├── app/                         # existing React dashboard (moved from repo root)
│   └── ...                      # reads ~/.cognify/profile.json via import
├── pitch.html / slides.html / demo.html / explainer.html  # showcase assets (kept)
└── README.md                    # install + usage + the cognitive-science story
```

### Data flow
1. User invokes the skill in any Claude session (on-demand) — or, in Phase 2, the Stop hook fires.
2. Claude reads the **current conversation from its own context**, applies the rubric in `SKILL.md`,
   and produces one session object matching `schema.json`. No Anthropic API call, no paste.
3. Claude prints a short score summary **in-chat**, then runs `cognify-store.mjs` to append the
   session to `~/.cognify/profile.json`.
4. The **dashboard** loads `~/.cognify/profile.json` (import/file-picker) and renders trend,
   fingerprint, blind spots, strengths, topic map, and the new Offloading Ratio card.

---

## 3. The skill (`SKILL.md`)

### Frontmatter
- `name: cognify`
- `description:` phrased to auto-load on triggers such as *"score my thinking", "analyze my
  conversation", "cognitive score", "how critical was I", "cognify"*. This discoverability is what
  removes the copy/paste step.

### Procedure Claude follows
1. **Scope the source.** Default = the current conversation in context. If the user points at a
   transcript file or pastes one, use that instead. One rubric, any source.
2. **Apply the anchored rubric** (see §4) to produce three 0–100 scores plus the Offloading Ratio.
3. **Extract** flagged claims (text + risk + tag), topics, engagement signals, and a 2–3 sentence summary.
4. **Emit** a session object that exactly matches `schema.json`.
5. **Present in-chat:** compact markdown summary — scores, top flagged claims, one-line takeaway.
6. **Persist:** call `scripts/cognify-store.mjs append <session.json>`.
7. **Point to the dashboard** for the longitudinal view.

### Honesty guardrail (make-or-break)
The rubric instructs Claude to:
- Score only the **user's** contributions, not the assistant's.
- Be honest rather than flattering — an explicit anti-sycophancy instruction. Without it every score
  drifts upward and the product is worthless.
- Score **observable behavior** confidently, but surface **trait-level** inferences (e.g. Need for
  Cognition, System 1/2) as soft signals **with explicit uncertainty**. Over-claiming a disposition
  from a short transcript is itself a calibration error the rubric must avoid.

---

## 4. Scientific grounding (rubric foundation)

The three scores map onto convergent, text-observable literatures. Each band is anchored to behavior,
not vibes. Full citations live in `reference/scientific-basis.md`.

### Score dimensions
- **Critical thinking** ← Paul–Elder intellectual standards (clarity, accuracy, relevance, depth,
  breadth, logic, fairness); epistemic vigilance (Sperber et al. 2010); argument hygiene
  (Watson–Glaser; Ennis–Weir; Halpern 2010).
  *Observable:* makes assumptions explicit, requests evidence, weighs counterarguments, calibrates confidence.
- **Depth** ← SOLO taxonomy (Biggs & Collis 1982); Bloom's revised (Anderson & Krathwohl 2001);
  Levels of Processing (Craik & Lockhart 1972).
  *Observable:* isolated facts (low) → integrated, generalized reasoning (high).
- **Engagement** ← ICAP framework (Chi & Wylie 2014: Passive→Active→Constructive→Interactive);
  Need for Cognition (Cacioppo & Petty 1982).
  *Observable:* restating (low) → building on / extending the other party's ideas (high).

### Five-band 0–100 ladder (applied per score)
- **0–20 — Passive / Surface / Remember:** restating, agreeing without content; no reasoning visible.
- **21–40 — Active / Unistructural:** manipulates given content (summarize, rephrase) but adds nothing new.
- **41–60 — Constructive / Multistructural / Understand–Apply:** generates explanations/examples/
  inferences beyond the given; several relevant but loosely connected points.
- **61–80 — Interactive-emerging / Relational / Analyze–Evaluate:** integrates into a coherent
  argument, weighs evidence and counterarguments, makes assumptions explicit.
- **81–100 — Interactive / Extended Abstract / Create:** co-constructs and extends others' reasoning,
  synthesizes novel connections, considers multiple viewpoints fairly, calibrates confidence, self-corrects.

### Output buckets (grounding)
- **Flagged claims** ← low epistemic vigilance (Sperber 2010); miscalibration (Fleming & Lau 2014);
  single-source reliance (Barzilai & Zohar 2012); no lateral reading (Wineburg & McGrew 2019).
- **Engagement signals** ← metacognition (Flavell 1979); System-2 effort (Kahneman 2011); cognitive
  miser override (Stanovich 2009).
- **Blind spots** ← confirmation bias (Nickerson 1998); motivated reasoning (Kunda 1990); anchoring
  (Tversky & Kahneman 1974).
- **Strengths** ← good calibration; disconfirmation-seeking; source corroboration (lateral reading).

### Signature metric — Cognitive Offloading Ratio
A 0–100 behavioral measure of effortful engagement vs. wholesale offloading to the AI within a
conversation. This is the project's differentiator: the major 2025 studies (Lee et al., Microsoft
Research/CMU, CHI 2025; Gerlich 2025, *Societies*) are bottlenecked by self-report, and there is no
validated instrument for measuring offloading in naturalistic AI conversations. Grounded in
cognitive-offloading theory (Sparrow, Liu & Wegner 2011; Risko & Gilbert 2016). Stored as an optional
schema field so the existing dashboard remains backward-compatible.

---

## 5. Profile store (`schema.json` + `cognify-store.mjs`)

### `schema.json` (the single contract)
Extends the existing session shape minimally so the current dashboard keeps working.

```jsonc
{
  "id": "string",                 // generated
  "timestamp": "ISO-8601",
  "source": "claude-code|claude-ai|manual",
  "conversation": "string",       // short label, NOT the full transcript (privacy)
  "scores": { "criticalThinking": 0, "depth": 0, "engagement": 0 },  // each 0-100
  "offloadingRatio": 0,           // NEW signature metric, 0-100, optional → back-compatible
  "claims":  [{ "text": "string", "risk": "high|medium|low", "tag": "string" }],
  "topics": ["string"],
  "engagementSignals": ["string"],
  "summary": "string",
  "rubricVersion": "1.0"          // keeps scores comparable as the rubric evolves
}
```

Profile file shape: `{ "version": 1, "sessions": [ <session>, ... ] }` at `~/.cognify/profile.json`.

### `cognify-store.mjs` (tiny, dependency-free Node)
- `append <session.json>` — read profile (or init), push session, write back atomically (temp file +
  rename). Creates `~/.cognify/` if absent.
- `export` — print the profile path (and optionally copy it to a location the dashboard can import).
- Validates the incoming session against the required fields of `schema.json`; rejects malformed input.
- **Privacy by default:** stores label + scores + signals, not the raw transcript, unless the user
  opts in.

---

## 6. Dashboard integration

The React app's core logic (`aggregateProfile`, `generateFingerprint`, all views) is unchanged — it
already consumes exactly this session shape. Additions only:
- **Import profile** affordance (drag-drop or file picker for `~/.cognify/profile.json`) so real skill
  data replaces seed/mock data.
- **Offloading Ratio** card on the profile view — one new component, reusing `CircularScore`.
- `runMockAnalysis` stays as the **demo path** so the live showcase/pitch works with zero setup.
- The app moves from repo root to `app/`; build/showcase HTML assets are preserved.

---

## 7. Components & boundaries

| Unit | Purpose | Consumes | Produces |
|------|---------|----------|----------|
| `SKILL.md` | Instructs Claude to score a conversation | conversation context, rubric | session object (schema), in-chat summary |
| `scientific-basis.md` | Cited justification per rubric band | — | reference doc |
| `schema.json` | The shared contract | — | validation source of truth |
| `cognify-store.mjs` | Persist sessions locally | session JSON | `~/.cognify/profile.json` |
| `app/` dashboard | Longitudinal visualization | `profile.json` (or mock) | rendered UI |
| `cognify-stop-hook.md` | (Phase 2) auto-invoke skill on session end | — | triggers SKILL.md |
| `README.md` | Install, usage, story, roadmap | — | docs |

Each unit is understandable and testable in isolation; the only cross-unit coupling is `schema.json`.

---

## 8. Error handling

- **No conversation to score / empty source:** skill explains it needs a conversation or a transcript;
  does not fabricate a session.
- **Node missing / not on PATH:** skill reports the in-chat scores anyway and tells the user how to
  install Node so persistence works; scoring is never blocked by the store failing.
- **`~/.cognify/profile.json` corrupt or unreadable:** store backs up the bad file to
  `profile.corrupt-<n>.json` and starts fresh rather than crashing.
- **Malformed session from the model:** store validates required fields and exits non-zero with a clear
  message; the skill surfaces it.
- **Dashboard import of an old-schema file:** missing `offloadingRatio` renders as "n/a"; existing
  views unaffected (back-compatible by design).

---

## 9. Testing

- **`cognify-store.mjs` (unit):** append to empty/missing profile; append to existing; atomic write;
  corrupt-file recovery; malformed-session rejection. Pure Node, no network.
- **`schema.json` (validation):** a known-good session validates; known-bad sessions fail with useful errors.
- **Rubric (qualitative fixtures):** a small set of canned conversations (high-skeptic, low-skeptic,
  high-offloading) with expected score *bands* (not exact numbers) to catch rubric drift and the
  sycophancy failure mode.
- **Dashboard (manual + existing):** import a sample `profile.json`, confirm trend/fingerprint/
  offloading render; confirm mock/demo path still works with no file.

---

## 10. Roadmap (post-v1)

- **Phase 2 — Auto-hook:** optional Claude Code Stop hook scores every conversation on exit (truly
  passive). Documented in `hooks/`; reuses `SKILL.md`.
- **Phase 3 — claude.ai Skills:** wrapper reusing `SKILL.md` + `schema.json`; swaps the file-write for
  a hosted store.
- **Phase 4 — Hosted backend + accounts:** the revenue architecture; plus the **research arm** — a real
  study leveraging the unique behavioral/longitudinal offloading dataset, designed via the full
  `/deep-research` pipeline. Candidate research questions captured separately.

---

## Appendix A — Key citations

- Chi, M. T. H., & Wylie, R. (2014). The ICAP framework. *Educational Psychologist, 49*(4), 219–243.
- Paul, R., & Elder, L. (2006/2014). *Critical Thinking: Tools for Taking Charge of Your Learning and Your Life.*
- Biggs, J. B., & Collis, K. F. (1982). *Evaluating the Quality of Learning: The SOLO Taxonomy.*
- Anderson, L. W., & Krathwohl, D. R. (2001). *A Taxonomy for Learning, Teaching, and Assessing.*
- Craik, F. I. M., & Lockhart, R. S. (1972). Levels of processing. *JVLVB, 11*(6), 671–684.
- Cacioppo, J. T., & Petty, R. E. (1982). The need for cognition. *JPSP, 42*(1), 116–131.
- Frederick, S. (2005). Cognitive reflection and decision making. *J. Economic Perspectives, 19*(4), 25–42.
- Sperber, D., et al. (2010). Epistemic vigilance. *Mind & Language, 25*(4), 359–393.
- Flavell, J. H. (1979). Metacognition and cognitive monitoring. *American Psychologist, 34*(10), 906–911.
- Fleming, S. M., & Lau, H. C. (2014). How to measure metacognition. *Front. Hum. Neurosci., 8*, 443.
- Nickerson, R. S. (1998). Confirmation bias. *Review of General Psychology, 2*(2), 175–220.
- Kunda, Z. (1990). The case for motivated reasoning. *Psychological Bulletin, 108*(3), 480–498.
- Tversky, A., & Kahneman, D. (1974). Judgment under uncertainty. *Science, 185*(4157), 1124–1131.
- Wineburg, S., & McGrew, S. (2019). Lateral reading. *Teachers College Record, 121*(11).
- Barzilai, S., & Zohar, A. (2012). Epistemic thinking in action. *Cognition and Instruction, 30*(1), 39–85.
- Kahneman, D. (2011). *Thinking, Fast and Slow.*
- Stanovich, K. E. (2009). *What Intelligence Tests Miss.*
- Sparrow, B., Liu, J., & Wegner, D. M. (2011). Google effects on memory. *Science, 333*, 776–778.
- Risko, E. F., & Gilbert, S. J. (2016). Cognitive offloading. *Trends in Cognitive Sciences.*
- Lee, H.-P., Tankelevitch, L., et al. (2025). The impact of generative AI on critical thinking. *CHI 2025* (Microsoft Research / CMU).
- Gerlich, M. (2025). AI tools in society: impacts on cognitive offloading and critical thinking. *Societies, 15*(1), 6.

*Caveats for the research arm: Sparrow et al. (2011) has faced replication scrutiny; Gerlich (2025) is
cross-sectional/correlational with a published table correction; Kosmyna et al. (2025, "Your Brain on
ChatGPT") is a small-N preprint with a formal critique. Cite accordingly.*
