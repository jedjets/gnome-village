# Soft-iso retarget — headless note (no glance PASS claim)

Programmer will glance + ship URL. Metrics only.

## What changed
- Retired Slice Zero moss-dome / radial fans / crater wet bowl (`renderIsleMoss` stubbed).
- Soft-iso heightfield mesh: shared vertex heights, neighbourhood colour blend, blurred vertex light, valley AO, off-grid grain, slope gradients (`renderIsleMesh`).
- Water via continuous wetness corner field + marching squares + Chaikin banks (`renderIsleWater`) — stream ribbon, not cyan knife / saw-tooth / diamond water.
- Soft loaf earth sides from land silhouette (`renderIsleForms`).
- Terrain generator retargeted to rolling village plateau + winding stream (`isleGrid`) — peak ~0.55–0.72, not skyscraper dome.
- HEIGHT_SCALE 56, LOAF_DEPTH 92 (gate 48–70; no MOSS_VIS_BOOST).
- Look/Raise/Lower kept; Auto-Fit on Begin/Continue (~70% width); paper HUD unchanged; no props.

## Headless checks
- `npm run build` PASS
- `node scripts/verify-sculpt.mjs` PASS — peakDelta ≥0.18, approxCrestCssPx ≥6

## Stolen vs invented
**Stolen (reimplemented):** shared vertex heights; neighbourhood material blend; vertex light blur; valley AO; off-grid grain; wetness corner field; marching squares + Chaikin shoreline; soft-iso camera pan/pinch/twist/Fit; bottom Look/Raise/Lower rail; paper/glass HUD patterns; Auto-Fit 65–75% width.

**Invented:** Vite/React/TS module split; Canvas2D soft-iso mesh with fattened quads + slope gradients; soft loaf silhouette extrusion; calmer parchment sky; click-faithful Raise pick (no dome-crown bias).

## Honest risk vs old HTML side-by-side
- Still Canvas2D procedural — not Ref1 painted diorama craft yet; materials are continuous but flatter than prototype’s shaded-tile epoch system.
- Stream wetness is distance+lowland field, not full edge-discharge water sim — banks read living but won’t dig channels yet.
- Soft-iso mesh can still show faint facets at extreme zoom-out; blur + neighbourhood blend mitigate but don’t match prototype’s phone quality ladder.
- Raise/Lower mutate heights and silhouette; Fit framing depends on `isleWorldSize` — if loaf math drifts, width target can undershoot 65%.
- Do **not** claim Stylist glance PASS until Programmer screenshots vs old prototype + playable refs.

## Do not push / Pages — Programmer glances then ships.
