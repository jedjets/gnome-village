# Soft-iso retarget — headless note (no glance PASS claim)

Programmer will glance + ship URL. Metrics only.

## What changed (0.5 height-displaced outline + soft water mask)
- **Rolling silhouette:** `buildSilhouette` uses max-along-ray heights, remapped + silhouette-only Y boost so crest↔valley moves the green outline (not a flat disc rim). HEIGHT_SCALE = 108 (loaf band).
- **Soft water banks:** MS→Chaikin polygon shore removed. Cached wet-mask stamps + **CSS-pixel** `ctx.filter` blur (zoom-safe). Mesh shore tint removed so cell quads don’t own beige stairs.
- Keep: continuous turf, loaf sides, Raise live, Fit ~65–75%, no props.

## Headless checks
- `npm run build` PASS
- `node scripts/verify-sculpt.mjs` PASS — peakDelta ≥0.18
- Local stills: `/workspace/screenshots/softiso-05-ingame.png`, `softiso-05-raise.png` (no push)
- Pixel vs softiso-04 (Fit 390 dpr2): top-curve trend residual span ~15.5 → **~39.6 CSS px**; water-edge meanGrad ~19.6 → **~4.4**, p90 ~45.7 → **~5.3**

## Do not push / Pages — Programmer glances then ships. No PASS claim.
