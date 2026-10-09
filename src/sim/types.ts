import type { BuildingKey, CivId, GatherKind, NodeKind, ProjKind, Res, UnitClass, UnitKey } from '../data/defs';

export type TaskKind =
  | 'move' | 'attack' | 'gather' | 'build' | 'repair' | 'garrison' | 'heal' | 'convert'
  | 'patrol' | 'relic' | 'unload' | 'follow' | 'attackGround';

export interface Task {
  k: TaskKind;
  x?: number;
  y?: number;
  id?: number;
  am?: boolean; // attack-move
  x2?: number;
  y2?: number;
  leg?: number; // patrol direction
}

export type Anim = 'idle' | 'walk' | 'attack' | 'work' | 'dead';

export interface Unit {
  id: number;
  k: 'u';
  t: UnitKey;
  o: number;
  x: number;
  y: number;
  a: number;
  hp: number;
  task: Task | null;
  q: Task[];
  anim: Anim;
  at: number;
  path: number[] | null;
  pi: number;
  pgx: number;
  pgy: number;
  repath: number;
  cd: number;
  ct?: Res;
  ca: number;
  gk?: GatherKind | 'build';
  stance: 0 | 1 | 2 | 3; // aggressive, defensive, stand ground, no attack
  inside?: number;
  cargo?: number[];
  relic?: number;
  food?: number;
  dead?: number;
  packed?: boolean;
  packT?: number;
  conv?: number;
  rest?: number;
  hitBy?: number;
  hitT?: number;
  idleT: number;
  hx?: number;
  hy?: number;
  scan: number;
  stuck: number;
  lx: number;
  ly: number;
  fem?: boolean;
  /** The resource node a villager was last working (to return to after dropping off). */
  last?: number;
  /** Seconds this unit has been "working" (for anim / sounds). */
  wt?: number;
  /** Flash timer for when hit. */
  flash?: number;
  /** Sub-phase of the current task (0 = go/work, 1 = returning to drop-off). */
  sub: number;
  /** Previous tick position (render interpolation). */
  px: number;
  py: number;
  /** Game time of the last attack swing (render). */
  swing?: number;
  /** Task to resume after the town bell. */
  bell?: Task | null;
  /** Formation slot offset for group moves. */
  ox?: number;
  oy?: number;
}

export interface QueueItem {
  u?: UnitKey;
  tech?: string;
  t: number;
  total: number;
}

export interface Building {
  id: number;
  k: 'b';
  t: BuildingKey;
  o: number;
  x: number;
  y: number;
  hp: number;
  prog: number;
  done: boolean;
  q: QueueItem[];
  rally?: { x: number; y: number; id?: number };
  gar: number[];
  cd: number;
  tgt?: number;
  food?: number;
  relics?: number[];
  seen: number;
  dir?: number;
  farmer?: number;
  /** last-seen hp fraction for fogged display */
  burn?: number;
  /** Auto-reseed farms (mill / TC rally) */
  reseed?: boolean;
  /** Construction placeholder hp start */
  hp0?: number;
}

export interface ResNode {
  id: number;
  k: 'r';
  t: NodeKind;
  x: number;
  y: number;
  amt: number;
  max: number;
  v: number;
  seen: number;
}

export interface Relic {
  id: number;
  k: 'relic';
  x: number;
  y: number;
  carrier?: number;
  mon?: number;
}

export interface Projectile {
  kind: ProjKind;
  o: number;
  src: number;
  tgt: number;
  sx: number; sy: number; sz: number;
  tx: number; ty: number; tz: number;
  t: number;
  dur: number;
  atk: number;
  pierce: boolean;
  bonus: Partial<Record<UnitClass, number>>;
  splash: number;
  friendly: boolean;
  arc: number;
}

export interface PlayerStats {
  kills: number;
  losses: number;
  razed: number;
  bLost: number;
  gathered: Record<Res, number>;
  ageT: number[];
  trained: number;
  techs: number;
  converted: number;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  civ: CivId;
  human: boolean;
  team: number;
  diff: number; // 0 easy .. 3 hardest
  res: Record<Res, number>;
  age: number;
  techs: string[];
  pop: number;
  popCap: number;
  defeated: boolean;
  stats: PlayerStats;
  resigned?: boolean;
}

export interface Settings {
  mapType: 'arabia' | 'black_forest' | 'lakes' | 'coastal' | 'highland' | 'oasis';
  mapSize: number;
  players: { civ: CivId | 'random'; human: boolean; team: number; diff: number; color: number; name: string }[];
  startRes: 'standard' | 'medium' | 'high';
  startAge: number;
  popCap: number;
  victory: 'conquest' | 'standard';
  reveal: 'normal' | 'explored' | 'all';
  speed: number;
  seed: number;
}

export interface GameEvent {
  k: 'attack' | 'built' | 'trained' | 'research' | 'age' | 'defeat' | 'victory' | 'msg' | 'death' | 'hit' | 'convert' | 'relic' | 'wonder' | 'fire' | 'collapse' | 'housed' | 'deposit';
  o?: number;
  x?: number;
  y?: number;
  text?: string;
  t?: string;
  id?: number;
}
