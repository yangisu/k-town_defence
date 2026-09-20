# Stage badges

Three PNGs, one per stronghold stage. `StageBadge` loads them by exact name and
falls back to the small vector mark if a file is missing, so the app never shows
an empty frame while they are being made.

| File | Stage | Subject |
|---|---|---|
| `seed.png` | 씨앗 / Seed | A sprout breaking out of a seed |
| `tree.png` | 나무 / Tree | A full tree on a rise |
| `landmark.png` | 랜드마크 / Landmark | A columned monument |

Requirements: square, transparent background, 512×512 or larger (they render at
64px, so they need to stay legible small), and the same ring, outline weight and
lighting across all three — they are read side by side in My Record.
