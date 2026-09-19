# Soft-iso retarget — headless note (no glance PASS claim)

Programmer will glance + ship URL. Metrics only.

## What changed (0.6 thick loaf sides, no needle spur)
- **Loaf ribbon only:** `drawLoafFromSilhouette` blurs + spike-kills + Chaikin-smooths + slope-limits the extrusion path (max |ΔY|). Green rolling outline from `buildSilhouette` unchanged (keep crest↔valley).
- No single-vertex brown needles / comb fringe on left/right loaf silhouette; thicker continuous side stroke/fill.
- Keep: continuous turf, soft water mask, Raise live, Fit ~65–75%, no props. Do not reintroduce lattice/saw water.

## Prior (0.5 height-displaced outline + soft water mask)
- Rolling silhouette + soft CSS-pixel wet-mask banks. HEIGHT_SCALE = 108.

## Headless checks
- `npm run build` PASS
- `node scripts/verify-sculpt.mjs` PASS — peakDelta ≥0.18
- Local stills: programmer re-shoots softiso-06 after glance (no push)

## Do not push / Pages — Programmer glances then ships. No PASS claim.
