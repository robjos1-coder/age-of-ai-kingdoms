# Realistic world assets

Photographic materials and daylight environment: **Poly Haven**, https://polyhaven.com/.

All downloaded textures and the environment are **CC0 1.0 Universal** (public domain): https://polyhaven.com/license and https://creativecommons.org/publicdomain/zero/1.0/.

Asset import powered by the Poly Haven API: https://polyhaven.com/our-api.
The game serves its bundled files locally and does not use the live API during play.

`sources.json` records each atlas slot, asset page, license and exact original map URL.
The scans were resized and packed into atlases with wrap-around gutters; linen/leather/wool were neutralized for authored/team colors, steel was neutralized, and the gold slot was recolored. Skin and leaf microtextures, all model geometry and water normals are original procedural game assets.

Regenerate with `python scripts/import-realism-assets.py` from the repository root (Python + Pillow). Download caching is local to the ignored `.asset-cache` folder.
