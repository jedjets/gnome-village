#!/bin/bash
# SessionStart: install rtk (Apache-2.0 OSS edition) in cloud sessions if missing.
# Release downloads may be blocked by the cloud proxy, so fall back to a pinned source build.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
RTK_VERSION="v1.0.1"
RTK_BIN="$HOME/.local/bin/rtk"
if command -v rtk >/dev/null 2>&1 || [ -x "$RTK_BIN" ]; then exit 0; fi
(
  curl -fsSL "https://raw.githubusercontent.com/rtk-ai/rtk/refs/tags/$RTK_VERSION/install.sh" \
    | RTK_EDITION=oss RTK_VERSION="$RTK_VERSION" sh
  [ -x "$RTK_BIN" ] || cargo install --locked --git https://github.com/rtk-ai/rtk --tag "$RTK_VERSION" \
    --no-default-features --root "$HOME/.local" rtk
) >"${TMPDIR:-/tmp}/rtk-install.log" 2>&1 &
exit 0
