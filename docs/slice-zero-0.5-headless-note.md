# Slice Zero 0.5 — headless note (no glance PASS claim)

Programmer will re-shoot screenshots. This note is metrics only.

## Fixes vs 0.4 glance NO on (2) cliff hairline + (4) Raise
1. **Cliff hairline** — `drawLoafFromSilhouette` east path-join (silhouette start at ang=0) left a vertical sky sliver through the right belly. Fix: south-started silhouette, X inflate ~2px, solid fill + earth seal stroke, overlapping side quads; no light/sky strokes on cliff.
2. **`sealLoafToMoss`** — north arcs no longer pulled up into the moss dome (that painted brown on the crest). South/side lip still overlaps under moss.
3. **Raise** — `DEFAULT_BRUSH` strength 0.28 / radius 10.5; live outline `yLift` tracks relief/crown; paint snaps toward isle crown (iso pick biased to far rim); live height clamp 1.25 for session headroom (HEIGHT_SCALE stays 70).
4. Kept moss dome, soft teal wet ellipse, no props / no stamp lattices / no fringe ribbons / no wet X wedges.

## Headless checks (390×844)
- `npm run build` PASS
- `node scripts/verify-sculpt.mjs` PASS — peakDelta ≥0.18, approxCrestCssPx ≥6
- Right-belly internal pale band x=270–300: **0** (was **51** in 0.4 glance still)
- Continuous crown Raise stroke: crest Y moved ~tens of CSS px at Fit (seed-dependent); do not claim glance PASS

## Honest risk
- Save pack is still 0–255 → restores ≤1.0; session sculpt can briefly exceed 1.0 until save/reload.
- Crown paint snap blends strongly toward center — Raise on a far rim click still lifts near-crown land.
- South-only loaf lip stroke may leave a soft junction AA on extreme east/west; not the old vertical east join crack.

## Do not claim glance PASS — programmer re-shoots.
