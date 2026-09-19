/**
 * Slice Zero 0.5 — seal cliff hairline + readable Raise (keep moss dome).
 *
 * Techniques (from old-prototype lessons §1.2, not HTML):
 *   shared vertex heights, neighbourhood colour, vertex light blur,
 *   continuous wetness field, height-aware rim silhouette.
 *
 * Draw path:
 *   1) Loaf = rim-height silhouette + LOAF_DEPTH belly via side quads (no east path-join seam)
 *   2) ONE continuous south loaf ribbon, LOAF_DEPTH ~110–140
 *   3) Moss = radial fans crown→rim with gridToIso(..., h), soft-blurred
 *   4) Dome shading + soft AO (no stamp lattices, no fringe ribbons)
 *   5) Wet = soft elliptical stream-bowl fill with feathered edge
 * No props / atlas / cabin / pines / gnomes.
 */

import type { Heightfield } from '../world/isleGrid'
import { getHeight, sampleHeight, streamDist, WATER_LEVEL } from '../world/isleGrid'
import type { CameraState } from '../world/fit'

export const CELL = 18
/** Gate: keep in 48–70. */
export const HEIGHT_SCALE = 70
/** Visible earth loaf depth (world px before zoom). Single ribbon thickness. */
const LOAF_DEPTH = 136
const STREAM_HALF = 3.2
/** Radial fan wedges for moss mound (shared center + rim verts). */
const MOSS_FANS = 40
/** Visual-only height boost for moss mesh/outline (HEIGHT_SCALE stays ≤70). */
const MOSS_VIS_BOOST = 2.15
