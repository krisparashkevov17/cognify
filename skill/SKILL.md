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
