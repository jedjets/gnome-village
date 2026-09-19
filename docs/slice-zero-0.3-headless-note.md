# Slice Zero 0.3 — headless note (no glance PASS claim)

Programmer will re-shoot screenshots. This note is metrics only.

## Root cause of pancake (0.2)
`buildSilhouette` used **max height along every rim ray**, so every outline point sat near peak height → flat elevated green disc on brown.

## Fix (0.3)
1. **Loaf seam** at **local rim height** (not max-along-ray).
2. **Moss = radial fans** crown→mid→rim with `gridToIso(..., h)` + `MOSS_VIS_BOOST` (~2.15) so crown sits above rim in screen Y; soft-blurred offscreen to kill fan lattice.
3. **Moss outline** peak-vs-rim lift biased to northern arcs + extra Y lift so silhouette is taller than a flat iso ellipse.
4. **Dome shading** (vertex light blur, crown lit / sides darker) + soft stream AO.
5. **South thickness segments** (per-edge quads) for cushion lip cue.
6. Heightfield: taller mound / lower shoulders (peak ~0.86).
7. Wet: continuous contour with soft crown fade (not stamp grids).

## Headless checks
- `npm run build` PASS
- `node scripts/verify-sculpt.mjs` PASS
- Silhouette Fit 390×844 vs 0.2: topMin 357→~317 CSS px; ellipseB ~57→~100+ (taller mound outline)
- Raise lifts moss topMin by a few CSS px (unclamped visual height)
- `HEIGHT_SCALE` = 70 (gate 48–70); Fit width-primary unchanged
- No props / no wetStep/hiStep stamps / no loaf shelves

## Honest risk
- Visual boost >1 is draw-only; sim heights still ∈[0,1]. Extreme Raise can overshoot silhouette.
- Soft blur + fans may still show faint radial structure at some zooms.
- Wet contour is still a radial wet-extent blob, not marching-squares banks.
- Peak-vs-rim CSS px under Fit zoom remains modest without visual boost; boost is what makes the outline read as a mound at phone Fit.
- **Do not claim glance PASS** — programmer re-shoots.
