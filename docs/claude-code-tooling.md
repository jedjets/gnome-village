# Claude Code tooling

Committed in `.claude/`, so it loads automatically in every Claude Code session on this repo (local or cloud).

| Tool | Where | State |
|---|---|---|
| [ponytail](https://github.com/DietrichGebert/ponytail) 5.3.2 | plugin `ponytail@ponytail` | on |
| [small-business](https://github.com/anthropics/knowledge-work-plugins/tree/main/small-business) 1.35.1 | plugin `small-business@knowledge-work-plugins` | **off** (~11.7k tokens per session) |
| [ECC](https://github.com/affaan-m/ECC) | plugin `ecc@ecc` | **off** (~47k tokens per session) |
| [lavish-axi](https://github.com/kunchenguid/lavish-axi) | skill `.claude/skills/lavish` (`skills-lock.json`) | on |
| [rtk](https://github.com/rtk-ai/rtk) v1.0.1, OSS edition | `.claude/hooks/` (SessionStart install + Bash PreToolUse) | on when `rtk` is on PATH (cloud: auto-installed at session start, source build ~5 min if release downloads are blocked) |

Not installed: caveman (ponytail chosen instead), firstmate, BuildPartner.

## ECC / small-business on demand

Enable for yourself only (not committed): `claude plugin enable <plugin> --scope local`, then restart the session.
Turn off again: `claude plugin disable <plugin> --scope local`.
`<plugin>` is `ecc@ecc` or `small-business@knowledge-work-plugins`.

## Local machine

The plugins and skill come with the repo. rtk needs its binary:

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/tags/v1.0.1/install.sh | RTK_EDITION=oss RTK_VERSION=v1.0.1 sh
```

To use the same tools in every project, install them at user scope:

```bash
claude plugin marketplace add DietrichGebert/ponytail && claude plugin install ponytail@ponytail
claude plugin marketplace add anthropics/knowledge-work-plugins && claude plugin install small-business@knowledge-work-plugins
claude plugin marketplace add affaan-m/ECC   # install only when needed
npx skills add kunchenguid/lavish-axi --skill lavish -g
rtk init -g
```
