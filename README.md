# Age of AI: Kingdoms

A browser real-time strategy game inspired by **Age of Empires II**, built for **phones and desktop**.
Single player against computer opponents — no install, no server.

**▶ Play:** https://robjos1-coder.github.io/age-of-ai-kingdoms/ *(once GitHub Pages is enabled)*

## Features

- **Four ages** — Dark, Feudal, Castle, Imperial — with the AoE2 "two buildings + resources" advancement rule; buildings change style each age.
- **10 civilizations** (Britons, Franks, Teutons, Mongols, Byzantines, Japanese, Vikings, Saracens, Persians, Chinese) with bonuses, unique units and unique technologies.
- **~45 unit types**: militia → champion line, spearman → halberdier, archers, skirmishers, cavalry archers, hand cannoneers, scouts → hussars, knights → paladins, camels, rams, mangonels/onagers, scorpions, bombard cannons, trebuchets (pack/unpack), monks, fishing ships, transports, galleys/galleons, fire galleys, cannon galleons, and 10 unique units.
- **~80 technologies**: Loom, Wheelbarrow, farming/woodcutting/mining upgrades, Blacksmith attack & armour lines, University, Monastery, unit upgrade lines, Conscription, unique techs.
- AoE2-style **combat**: melee/pierce armour, attack bonuses, counters, splash damage, high-ground bonus, garrisoned buildings firing arrows.
- **Economy**: sheep herding, deer, boar (fight back!), berries, farms with auto-reseed, shore & deep fishing, gold, stone, market trading with dynamic prices.
- **Monks & relics**: healing, conversion ("wololo"), relics generate gold in Monasteries.
- **Walls & gates**, watch towers, castles, town bell, garrisoning, transports, stances, patrol, attack-move, attack ground, formations, control groups.
- **Victory**: conquest, wonder (hold 400 s), or all relics (hold 400 s).
- **Maps**: Arabia, Black Forest, Lakes, Coastal, Highland, Oasis — 4 sizes, up to 6 players, teams, 4 AI difficulties.
- **Fog of war**, explored terrain, minimap, autosave + 3 save slots, classic cheat codes (`lumberjack`, `robin hood`, `marco`, `aegis`…).
- Low-poly 3D art generated in code (no image assets), soft shadows, animated units, fire/smoke/dust effects, drifting cloud shadows.
- Installable as an app (PWA) and works offline after the first load.

## Controls

**Touch:** tap to select · tap ground/enemy/resource to command · two-finger drag to scroll · pinch to zoom · twist to rotate · long-press + drag to box-select · long-press a button for info.
**Mouse/keyboard:** left-click select, drag box, right-click command, arrows scroll, wheel zoom, PageUp/PageDown rotate, grid hotkeys (Q W E R…), `.` idle villager, `,` army, `H` Town Center, Ctrl+1–9 groups, `Enter` cheat/chat.

## Development

```bash
npm install
npm run dev        # http://localhost:5299
npm run build      # production build in dist/
node --import tsx scripts/simtest.ts 30 arabia 42   # headless AI-vs-AI soak test
```

Open `#gallery`, `#gallery=buildings` or `#gallery=misc` on the dev server to browse every model.

## Deployment

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`
(set **Settings → Pages → Source: GitHub Actions** once).

## Credits

- Inspired by and forked in spirit from [alexvilelabah/age-of-ai](https://github.com/alexvilelabah/age-of-ai) (MIT). The music tracks in `public/music/` come from that project.
- Built with [Three.js](https://threejs.org) and [Vite](https://vitejs.dev).
- Age of Empires is a trademark of Microsoft; this is an unaffiliated fan project with original code and art.

## License

MIT
