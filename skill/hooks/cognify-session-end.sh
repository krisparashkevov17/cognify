#!/usr/bin/env bash
#
# Cognify Phase-2 auto-scorer — SessionEnd hook.
#
# Fires once when a Claude Code session ends. Detaches a headless, READ-ONLY
# `claude -p` run that scores the just-ended transcript and PRINTS the session
# JSON to stdout; this script then persists that JSON via cognify-store.mjs.
# The scoring agent only reads — no Write, no Bash — so a prompt-injected
# transcript has no reach. The hook returns immediately and never blocks you.
#
# Two entry points:
#   (hook)    stdin = SessionEnd JSON payload  → detaches `__score` and exits 0
#   __score   internal: synchronous score+persist for one transcript path
#
# Install: register under hooks.SessionEnd in settings.json (see
# hooks/cognify-autoscore.md). Requires the `cognify` skill, `claude` CLI, Node >=18.
#
set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SKILL_DIR="${COGNIFY_SKILL_DIR:-$HOME/.claude/skills/cognify}"
STORE="$SKILL_DIR/scripts/cognify-store.mjs"
LOG_DIR="${COGNIFY_LOG_DIR:-$HOME/.cognify/logs}"

# ===========================================================================
# Internal mode: score one transcript synchronously and persist it.
# ===========================================================================
if [ "${1:-}" = "__score" ]; then
  TRANSCRIPT="${2:-}"
  [ -f "$TRANSCRIPT" ] || exit 0
  mkdir -p "$LOG_DIR"
  STAMP="$(date +%s 2>/dev/null || echo run)"
  LOG="$LOG_DIR/autoscore-$STAMP.log"

  PROMPT="You are an automated, non-interactive background scorer. Score the Claude Code conversation in the JSONL transcript at: ${TRANSCRIPT}

Apply the Cognify rubric. Read these files for the rubric and schema:
  ${SKILL_DIR}/SKILL.md
  ${SKILL_DIR}/reference/scientific-basis.md
  ${SKILL_DIR}/reference/schema.json

Score ONLY the user's contributions. Be accurate, not flattering.

OUTPUT CONTRACT: print EXACTLY ONE JSON object — the session — matching reference/schema.json, and NOTHING else. No prose, no markdown, no code fences. Required fields: id (\"session-<ms>\"), timestamp (ISO-8601), source (\"claude-code\"), conversation (a SHORT label, never the raw transcript), scores {criticalThinking, depth, engagement} each 0-100, offloadingRatio 0-100, claims [{text,risk,tag}], topics [], engagementSignals [], summary, rubricVersion (\"1.0\"). Do NOT write files or run commands — only read. Your entire final message must be the JSON object."

  export COGNIFY_AUTOSCORE_ACTIVE=1   # recursion guard for the child's own SessionEnd
  RAW="$(claude -p "$PROMPT" \
            --model "${COGNIFY_MODEL:-sonnet}" \
            --allowed-tools "Read" \
            --permission-mode default \
            --output-format json \
            </dev/null 2>>"$LOG")" || { echo "claude run failed" >>"$LOG"; exit 0; }
  echo "$RAW" >>"$LOG"

  SESSION_FILE="$(mktemp -t cognify-session.XXXXXX)" || exit 0
  printf '%s' "$RAW" | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      let result; try { result = JSON.parse(s).result ?? s; } catch { result = s; }
      let txt = String(result).trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
      if (txt[0] !== "{") { const a=txt.indexOf("{"), b=txt.lastIndexOf("}"); if(a>=0&&b>a) txt=txt.slice(a,b+1); }
      let obj; try { obj = JSON.parse(txt); } catch(e){ console.error("unparseable session JSON:",e.message); process.exit(3); }
      process.stdout.write(JSON.stringify(obj));
    });
  ' > "$SESSION_FILE" 2>>"$LOG" || { echo "parse failed" >>"$LOG"; rm -f "$SESSION_FILE"; exit 0; }

  if [ -s "$SESSION_FILE" ]; then
    node "$STORE" append "$SESSION_FILE" >>"$LOG" 2>&1 && echo "scored+persisted from $TRANSCRIPT" >>"$LOG" \
      || echo "store rejected session" >>"$LOG"
  fi
  rm -f "$SESSION_FILE"
  exit 0
fi

# ===========================================================================
# Hook mode: read the SessionEnd payload, then detach __score and return fast.
# ===========================================================================

# Recursion guard: the child scoring run fires SessionEnd too; it inherits this.
if [ -n "${COGNIFY_AUTOSCORE_ACTIVE:-}" ]; then
  exit 0
fi

INPUT="$(cat || true)"
TRANSCRIPT=""
if command -v node >/dev/null 2>&1; then
  TRANSCRIPT="$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).transcript_path||"")}catch{}})' 2>/dev/null || true)"
fi

# Bail quietly on anything missing — auto-scoring must never disrupt a session.
[ -z "$TRANSCRIPT" ] && exit 0
[ ! -f "$TRANSCRIPT" ] && exit 0
LINES="$(wc -l < "$TRANSCRIPT" 2>/dev/null || echo 0)"
[ "$LINES" -lt 4 ] && exit 0
command -v claude >/dev/null 2>&1 || exit 0
command -v node   >/dev/null 2>&1 || exit 0
[ -f "$STORE" ] || exit 0
[ -f "$SKILL_DIR/SKILL.md" ] || exit 0

# Detach so the scorer survives the session/process-group teardown.
# Prefer setsid (own session); fall back to nohup. Either way, fully redirected.
if command -v setsid >/dev/null 2>&1; then
  setsid nohup bash "$SELF" __score "$TRANSCRIPT" </dev/null >/dev/null 2>&1 &
else
  nohup bash "$SELF" __score "$TRANSCRIPT" </dev/null >/dev/null 2>&1 &
fi
disown 2>/dev/null || true

exit 0
