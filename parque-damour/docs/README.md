# Parque D'Amour: the design pack

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis

This folder holds the complete design for v1 of Parque D'Amour, a phone-first Canvas 2D game in TypeScript built on the architecture of the owner's single-file game Gnome Village (GV). The register (`01`) is the spine: every number, name and id lives there and every other document must agree with it. The brief (`00`) fixes intent, scope, non-goals and success criteria. The numbered documents `02` to `09` turn those into rules of play, a code contract, art and audio specifications, content tables, task briefs, a test plan and a porting map. `10` and `gv-review-notes/` are line-referenced reference about GV, not rules for Parque; `reference-art/` holds the owner's three aesthetic references. Precedence is register > brief > `02` to `09` > code comments: a conflict is a bug in the lower document, to be reported and never resolved by choice. The standing instructions for any model working in the repository are in `../AGENTS.md` (`../CLAUDE.md` is a verbatim copy).

## 1. Documents

| File | Purpose | Who reads it |
|---|---|---|
| `00-Product-Brief.md` | Locked intent: vision, stack, visual and audio identity, the two modes, a day of play, v1 scope, non-goals, success criteria, governance | every model, first; the owner |
| `01-Decision-Register.md` | The spine: the owner's 27 answers and the resolved decisions, the design numbers (sections 3.1 to 3.15), the gates (section 4), fixed names (section 5), GV facts verified, the optional repository recipe (closed: the app stays in `gnome-village`), the document index | every model, second; the owner records gate picks here |
| `02-Game-Design.md` | Complete rules of play: park, time and weather, visitors, needs and brain, romance, points and tiers, Creator mode tools, abilities, Avatar mode cascades, emergent life, HUD, tone rules as tests, the two-player hook | design and feature slices (S3 to S7, S10) |
| `03-Technical-Architecture.md` | The engineering contract: principles P1 to P10, module map and layer rule, data model, loop, commands, subsystems, rendering, input, audio, UI shell, persistence, i18n, debug harness, build and tooling, performance plan | every code slice |
| `04-Art-and-UI-Style-Guide.md` | What GV looks like, the three references analysed, the three style directions, the Style Gate board, the locked HUD identity, prop and character vocabulary, effects, motion, light and seasons, accessibility, the art checklist | art slices (S1, S2 part B, the S4 and S10 drawing sub-briefs, S9) |
| `05-Audio-and-Music-Design.md` | Engine port from GV, the 38-cue vocabulary, the ambience scheduler, the procedural musette waltz, the Music Gate board | audio slices (S1, S8) |
| `06-Content-Tables.md` | Every tunable number and every string key: constants, tile kinds, tools, props, archetypes, names, needs, stages, charm, embarrassments, abilities, avatars, tiers, weather, seasons, strings (EN and ES), cues | data entry and balancing (Tier C tasks); every slice for its own ids |
| `07-Build-Plan.md` | How to brief a model (section 0: tiers, prompt template, precedence, options rule, common gate, hand-back format), then slices S0 to S12 as self-contained task briefs, the dependency graph, estimates, definition of done | whoever runs the project; the model running a slice reads section 0 and its own slice |
| `08-Test-Plan.md` | Unit tests per module, the determinism harness, screenshot regression, performance budgets, manual phone QA, content QA, the release checklist | every slice for its done-when; test-writing tasks |
| `09-Porting-Map-from-Gnome-Village.md` | How to port (verdicts, rules, header comment), the GV line ranges to PORT, ADAPT or DROP per module, known GV bugs not to carry over, the debug harness | every slice that ports GV code (most of S0 to S10); the header-comment rule applies to all of them |
| `10-Gnome-Village-HTML-Architecture-Review.md` | Line-referenced review of the 12,246-line GV single-file build: layout, engine, entities, render, audio, UI, bugs, dead code, what carries to Parque | reference only; cite its line numbers when porting |
| `gv-review-notes/01-notes.md` to `21-notes.md` | The 21 per-section working notes behind the review, one per GV section | reference only, when the review's summary is not enough |
| `reference-art/` | The owner's three references: `ref1-paris-park-map-flat-vector.jpg` (flat pastel vector map, direction B), `ref2-girl-baguette-watercolour.jpg` (the matchmaker avatar, the figure rig, direction C), `ref3-arc-de-triomphe-line-and-wash.jpg` (line and wash, autumn palette, lamps, direction C) | art slices; the owner at the Style Gate |

## 2. Gate status

Register section 4 is the authority for the gates; this table mirrors it. A gate is passed when the owner's pick (a letter and a date) is written into the register row. Until then, no final art (Style) and no music or cue tuning (Music) may be built; Slice 1 builds only the boards.

| Gate | What the owner sees | What it blocks | Status |
|---|---|---|---|
| Style Gate (S1) | `style-board.html`: directions A Storybook, B Pastel Postcard, C Line and Wash, each rendered with the real primitives (palette, ground, path, bed, tree in three seasons, bench, lamp, fountain, two lovers, pigeon, pomeranian, facade, HUD chips) | all art work from S2 on | pending |
| Music Gate (S1) | `music-board.html`: motifs A musette waltz, B music-box lullaby, C café swing, each with a romance-rising and a parted variant | music and cue work from S8 on | pending |
| Repository | Closed: the owner keeps building in gnome-village (2026-10-11) | nothing; Pages deployment is deferred and `.github/workflows/pages.yml` stays inert (register row 4, section 7) | closed |

## 3. Start here

- **Owner:** read `00-Product-Brief.md`, then register sections 1 and 4; the two gates in section 4 are waiting on your picks; the repository question is closed (row 4: the app stays in `gnome-village`; section 7 keeps an optional recipe). Changes go into the register first, then the documents, then the code.
- **Model running a slice:** read `../AGENTS.md`, then `01-Decision-Register.md`, then `00-Product-Brief.md` sections 2, 8, 9 and 10, then `07-Build-Plan.md` section 0 and your slice `Sx`, then the documents your slice lists under `Sx.3 Read first`; finish with the common gate (07 0.5) and the hand-back (07 0.6).
- **Model doing art or music:** check register section 4 first; if your gate is pending, build only the board your slice names (04 section 4 or 05 section 6). After the pick, read `04-Art-and-UI-Style-Guide.md` or `05-Audio-and-Music-Design.md` in full, render two or three variants on a scratch page, screenshot them at 390 x 844 and show the owner before building the final one (07 0.4).
