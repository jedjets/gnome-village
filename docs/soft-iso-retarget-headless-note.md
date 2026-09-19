# Soft-iso retarget — headless note (no glance PASS claim)

Programmer will glance + ship URL. Metrics only.

## What changed (0.4 rolling + feather)
- **Rolling relief:** flatter interior mask (no radial multiply-dome); separated asymmetric lobes + valley dips + stream low path; stronger valley AO. HEIGHT_SCALE stays loaf (68).
- **Feathered banks:** wide shore↔water midtone cushion + inset alpha ladder + overpaint strokes; no dark shore stroke; interior depth sheet deeply inset + light shallow hues. Upsample×3 + blur×4 wet field.
- Loaf rim floor so stream does not notch the crust silhouette.

## Headless checks
- `npm run build` PASS
- `node scripts/verify-sculpt.mjs` PASS — peakDelta ≥0.18
- Local stills: `/workspace/screenshots/softiso-04-ingame.png`, `softiso-04-raise.png` (no push)
- Pixel vs softiso-03: dark-teal bank (R&lt;40 near water) ~698 → **0**; water-edge grad mean ~32 → ~9

## Do not push / Pages — Programmer glances then ships. No PASS claim.
