# Gnome Village art lock — Slice 1e atlas

Style: soft storybook diorama (Ref1), mossy, layered rock, cozy props.

| File | Use |
|---|---|
| `moss-tile.png` | Ground moss detail stamps on soft-iso tops |
| `moss-atlas.png` | Fallback mottled moss stamp strip (4 tiles) |
| `rock-strata.png` | Cliff / loaf shelf strips |
| `stream-sparkles.png` | Living stream sparkle / ripple overlays |
| `water-sparkle.png` | Compact 3-frame sparkle strip fallback |
| `shore-stones.png` | Shore stone row along stream banks |
| `pine.png` | Story prop |
| `cabin-moss-roof.png` | Moss-roof cabin prop |
| `cabin-moss.png` | Compact cabin fallback |
| `hat-wren.png` / `hat-bram.png` | Red/blue felt hats (Ref1 recognition) |
| `gnome-red.png` / `gnome-blue.png` | Gnome body sprites |

## Wiring
- Soft-iso height mesh (sculptable); moss stamps from height each edit
- Rock-strata on neighbor-delta cliff faces + rounded loaf shelves
- Stream ribbon + sparkles each frame (never frozen in moss cache)
- Props depth-rebucketed so ground doesn’t clip feet/eaves
