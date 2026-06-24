# Phase 2 — auto-score every session (passive mode)

Make Cognify behave like a real fitness tracker: instead of asking it to "score my
thinking," it scores **automatically when a session ends** and appends the result to
`~/.cognify/profile.json`. You just open the dashboard later and watch the trend.

## How it works

```
session ends ──► SessionEnd hook ──► hooks/cognify-session-end.sh
                                          │  (returns instantly, never blocks you)
                                          └─► backgrounds a headless `claude -p`:
                                                 reads the just-ended transcript,
                                                 runs the cognify skill,
                                                 persists via cognify-store.mjs
```

- **Trigger:** Claude Code's `SessionEnd` event (fires once when a session terminates).
  `Stop` is deliberately *not* used — it fires after every turn, which would over-sample
  and cost a scoring call on each reply.
- **Non-blocking:** the hook script backgrounds the scoring run and exits 0 immediately, so
  ending a session is never delayed.
- **Recursion guard:** the headless scoring run is itself a Claude session, so it would fire
  `SessionEnd` again. The script exports `COGNIFY_AUTOSCORE_ACTIVE=1` before spawning the
  child; the child inherits it and the hook bails at the top. No infinite loop.
- **Least privilege:** the scoring run is launched with `--allowed-tools` scoped to
  `Read`, `Write(/private/tmp/**)`, and `Bash(node …/cognify-store.mjs *)` only. A
  prompt-injected transcript cannot run arbitrary commands or touch your files — worst case
  is a junk entry in the profile.
- **Model:** defaults to `sonnet` (fast + cheap; good enough for rubric scoring). Override
  with `COGNIFY_MODEL=opus` if you want.

## Requirements

- The `cognify` skill installed (e.g. `~/.claude/skills/cognify` → this repo's `skill/`).
- `claude` CLI on `PATH` and Node ≥ 18.
- `skipDangerousModePermissionPrompt` is **not** required — the run uses scoped
  `--allowed-tools`, not `--dangerously-skip-permissions`.

## Enable it

Register the `SessionEnd` hook in your Claude Code settings. User-level
(`~/.claude/settings.json`) scores **all** your sessions; project-level
(`.claude/settings.json`) scopes it to one repo.

```jsonc
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/skills/cognify/hooks/cognify-session-end.sh",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

`timeout` is small on purpose — the script only needs to *spawn* the background scorer and
return; the scoring itself outlives the hook.

> Note: the hook path must point at a real file. If you installed the skill as a symlink,
> point at the symlinked copy (`~/.claude/skills/cognify/hooks/cognify-session-end.sh`) — it
> resolves through the link to this repo.

## Logs & troubleshooting

- Scoring logs: `~/.cognify/logs/autoscore-*.log` (stdout/stderr of each background run).
- Nothing scored? Check: skill installed, `claude`/`node` on `PATH`, transcript had ≥ 4
  lines (trivial sessions are skipped), and the log for permission denials.
- Disable: remove the `SessionEnd` block from settings.

## Cost

One headless scoring call per session (~Sonnet pricing for a transcript-sized prompt).
For heavy users this adds up — scope it to a single project via `.claude/settings.json`, or
raise the skip threshold in the script, if that matters.
