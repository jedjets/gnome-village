#!/bin/sh
# PreToolUse(Bash): hand off to rtk's rewrite hook when rtk is on PATH; no-op otherwise.
# (Rewritten commands call `rtk` by name, so it must be on PATH, not just installed.)
command -v rtk >/dev/null 2>&1 && exec rtk hook claude
exit 0
