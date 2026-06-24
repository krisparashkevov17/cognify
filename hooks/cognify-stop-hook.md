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
