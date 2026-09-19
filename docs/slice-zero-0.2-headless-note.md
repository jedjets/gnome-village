# Slice Zero 0.2 — headless note (no glance PASS claim)

Programmer will re-shoot screenshots. This note is metrics only.

## Deleted (root cause)
- `wetStep` / `hiStep` nested loops that drew `ctx.ellipse` radial stamps on moss
- Loaf `shelves = 4` stacked band polygons
- 3 belly `ctx.ellipse` discs under loaf

## Kept (allowed)
- One ground-plane shadow `ellipse` (not land-surface stamps)
- Solid silhouette fills + radial/linear gradients for moss
- One continuous wet contour path + gradient fill + soft bank stroke
- One continuous loaf ribbon (silhouette → silhouette + LOAF_DEPTH)

## Headless checks
- `npm run build` PASS
- `node scripts/verify-sculpt.mjs` PASS (Raise/Lower mutate sum/max)
- Silhouette avgY shifts on Raise (~5+ world px after crown strokes) — height-aware outline
- Fit still width-primary ~70% (`fit.ts` unchanged)
- Peak seed ~0.80; loaf ~128 world ≈ ~32 CSS px thick at phone Fit zoom

## Honest risk
- Peak-vs-rim moss relief at Fit zoom is modest in CSS px (~10–15) under HEIGHT_SCALE≤70 + current footprint; loaf thickness carries most volume.
- Wet contour is a radial wet-extent blob (continuous field), not marching-squares banks — may read soft/wide vs Ref1 ribbon until a later shoreline pass.
- No new screenshots in this commit — do not treat as glance PASS.
