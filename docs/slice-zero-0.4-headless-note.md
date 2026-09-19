# Slice Zero 0.4 — headless note (no glance PASS claim)

Programmer will re-shoot screenshots. This note is metrics only.

## Fixes vs 0.3 glance NO on cliffs/water
1. **Deleted** south per-edge `MOSS_VIS_BOOST` fringe ribbons (needle comb).
2. **Loaf** = rim-height silhouette + `LOAF_DEPTH` 136 extrusion; `sealLoafToMoss` raises loaf top under moss lip (sky gap / white seam closed). No atan2 re-sort of loaf path.
3. **Moss south lip** unboosted (`boost = 1 + (MOSS_VIS_BOOST-1)*facing`) + southDrop overlap; northern dome lift kept.
4. **Wet** = soft oriented ellipse from wet-field moments + feathered radial edge (replaced radial farthest-wet polygon / X wedges).

## Headless checks (390×844)
- `npm run build` PASS
- `node scripts/verify-sculpt.mjs` PASS
- Fit width ~69%; island H ~216 CSS px
- Teal radial CV ~0.12 (was ~0.33 in 0.3) — soft blob, not star/X
- Center seam green→brown with **0** sky-gap px (was ~10 in 0.3)
- South green horizontal transitions ~204 (was ~484) — fringe ribbons gone
- Brown contiguous belly ~33 CSS px (= LOAF_DEPTH×Fit zoom); reads as one sealed mass under moss

## Kept
- Moss dome fans + neighbourhood light + MOSS_VIS_BOOST on northern arcs
- Raise/Lower mutate heights (verify-sculpt)
- No props / no stamp lattices

## Honest risk
- Absolute brown CSS px still ~LOAF_DEPTH×zoom (~33); thickness read depends on sealed seam, not a deeper extrusion beyond the 110–140 gate.
- Soft ellipse wet follows wet covariance, not marching-squares stream banks — may read as a bowl more than a ribbon.
- Facing-scaled outline boost + southDrop change south silhouette vs 0.3; extreme Raise can still overshoot visual height.
- **Do not claim glance PASS** — programmer re-shoots.
