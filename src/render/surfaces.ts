/** Stable atlas slots shared by model generation and the CC0 asset importer. */
export const SURFACE = {
  wood: 0, stone: 1, plaster: 2, tile: 3, slate: 4, thatch: 5, bark: 6, leaf: 7,
  soil: 8, metal: 9, cloth: 10, leather: 11, wool: 12, skin: 13, rock: 14, gold: 15,
  /** alpha-cut foliage cards: sampled from the generated foliage texture, not the scan atlas */
  foliage: 16,
} as const;
export type Surface = keyof typeof SURFACE;

const PALETTE: Partial<Record<Surface, string[]>> = {
  wood: ['#8b5a2b', '#5a3a1e', '#a87842', '#6e4c2c', '#6e4a2a', '#5a3b20', '#6b4428', '#5a3a22', '#3a2a1c', '#2a1d12', '#7b5a3a', '#9c7247'],
  bark: ['#6b4a2d', '#8a6a42', '#7b5636'],
  stone: ['#aaa59b', '#827c72', '#9d968a', '#b0a898', '#7d7366', '#8f877a', '#8a8378', '#9a9284', '#6b625a', '#d8cfb8', '#ece4d0', '#e0d6bf'],
  plaster: ['#ebe2cd', '#e8dcc0', '#d4ccb9', '#ece6da'],
  metal: ['#a8b0b8', '#b4bcc4', '#646b73', '#69717a', '#8d949b', '#cfd4da', '#dce1e6', '#4a4f55'],
  gold: ['#e8b830', '#d4a83a', '#f4d26a'],
  leaf: ['#4c8a2c', '#3a7424', '#5d9c34', '#2f6236', '#3c7440', '#3f7a2a', '#4a8a30', '#3f7a28', '#5f9a35', '#6fae3d', '#6f8a3a', '#4f8a4a', '#6aa83a', '#7a9a4a'],
  soil: ['#6d4a2e', '#5b3d25', '#a08a64', '#9c8f7a'],
  wool: ['#f0ece2'],
  skin: ['#e2ae86', '#b9805a', '#e5b18a', '#c98f66', '#9a6542', '#f0c4a0', '#b56d5a'],
  leather: ['#6b4a2b', '#3e2c1e', '#3b2a1c', '#2a1e14', '#8d7a5e'],
  thatch: ['#c39a48', '#c9a04d', '#a8813b', '#d9b862', '#d8b851'],
  tile: ['#b0503a', '#8f3d2c', '#8e5a34', '#6e4428'],
  slate: ['#3f5f8a', '#2f4a6e'],
  rock: ['#7a7066', '#8a8076', '#9c968c', '#b5afa4', '#c8c2b8', '#8d877c'],
};
const BY_COLOR = new Map<string, Surface>();
for (const [surface, colors] of Object.entries(PALETTE)) for (const color of colors!) BY_COLOR.set(color, surface as Surface);

export function surfaceFor(color: string | number, context: string): Surface {
  const known = BY_COLOR.get(typeof color === 'string' ? color.toLowerCase() : '#' + color.toString(16).padStart(6, '0'));
  return known ?? (context === 'building' ? 'stone' : context === 'natural' ? 'bark' : 'cloth');
}

/** Repeats per world unit; buildings keep brick courses and timber grain at a common scale. */
export const SURFACE_SCALE = [0.8, 1.15, 1.4, 1.0, 1.1, 1.1, 1.25, 3.0, 0.8, 3.0, 7.0, 5.0, 6.0, 8.0, 1.6, 2.0, 1.0];
