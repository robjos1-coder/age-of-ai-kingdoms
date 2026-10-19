// Synthesised sound effects (no audio files needed) + simple music playlist.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const last = new Map<string, number>();

/** extraMusic: include the CC0 medieval pack (see public/music/CREDITS.md) in the playlists. */
export const audioSettings = { sfx: 0.7, music: 0.35, muted: false, extraMusic: true };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = audioSettings.muted ? 0 : 1;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = audioSettings.sfx;
  sfxGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function applyAudioSettings() {
  if (master) master.gain.value = audioSettings.muted ? 0 : 1;
  if (sfxGain) sfxGain.gain.value = audioSettings.sfx;
  music.setVolume();
}

function throttle(k: string, ms: number) {
  const now = performance.now();
  if ((last.get(k) ?? 0) + ms > now) return false;
  last.set(k, now);
  return true;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slide?: number) {
  if (!ctx || !sfxGain) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, freq: number, q: number, vol: number, when = 0, type: BiquadFilterType = 'bandpass') {
  if (!ctx || !sfxGain || !noiseBuf) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxGain);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export type Sfx =
  | 'click' | 'select' | 'move' | 'attackCmd' | 'build' | 'built' | 'trained' | 'research' | 'age' | 'alert' | 'sword'
  | 'arrow' | 'thud' | 'death' | 'collapse' | 'chop' | 'mine' | 'wololo' | 'error' | 'victory' | 'defeat' | 'bell' | 'cannon' | 'deposit' | 'place';

export function play(s: Sfx, vol = 1) {
  if (!ctx || audioSettings.muted) return;
  switch (s) {
    case 'click': if (throttle(s, 40)) tone(900, 0.05, 'triangle', 0.12 * vol); break;
    case 'select': if (throttle(s, 80)) { tone(520, 0.07, 'triangle', 0.12 * vol); tone(780, 0.08, 'triangle', 0.08 * vol, 0.04); } break;
    case 'move': if (throttle(s, 80)) { tone(440, 0.06, 'square', 0.05 * vol); tone(660, 0.07, 'square', 0.04 * vol, 0.05); } break;
    case 'attackCmd': if (throttle(s, 80)) { tone(330, 0.08, 'sawtooth', 0.06 * vol); tone(250, 0.1, 'sawtooth', 0.05 * vol, 0.06); } break;
    case 'place': tone(300, 0.1, 'triangle', 0.15 * vol); noise(0.12, 600, 1, 0.15 * vol); break;
    case 'build': if (throttle(s, 250)) { noise(0.06, 1800, 3, 0.18 * vol); tone(220, 0.05, 'square', 0.04 * vol); } break;
    case 'built': [523, 659, 784].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12 * vol, i * 0.08)); break;
    case 'trained': if (throttle(s, 300)) { tone(392, 0.12, 'triangle', 0.1 * vol); tone(523, 0.18, 'triangle', 0.1 * vol, 0.1); } break;
    case 'research': [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.3, 'sine', 0.09 * vol, i * 0.07)); break;
    case 'age': [392, 523, 659, 784, 1046].forEach((f, i) => { tone(f, 0.5, 'sawtooth', 0.05 * vol, i * 0.12); tone(f / 2, 0.5, 'triangle', 0.08 * vol, i * 0.12); }); break;
    case 'alert': if (throttle(s, 3000)) { tone(220, 0.5, 'sawtooth', 0.09 * vol, 0, 330); tone(220, 0.6, 'sawtooth', 0.09 * vol, 0.55, 330); } break;
    case 'bell': for (let i = 0; i < 4; i++) { tone(880, 0.5, 'sine', 0.12 * vol, i * 0.35); tone(1320, 0.4, 'sine', 0.05 * vol, i * 0.35); } break;
    case 'sword': if (throttle(s, 70)) { noise(0.08, 3200 + Math.random() * 1500, 8, 0.12 * vol); tone(1800 + Math.random() * 600, 0.08, 'square', 0.02 * vol); } break;
    case 'arrow': if (throttle(s, 90)) noise(0.15, 2400, 1.5, 0.06 * vol, 0, 'highpass'); break;
    case 'thud': if (throttle(s, 120)) { noise(0.3, 200, 1, 0.3 * vol, 0, 'lowpass'); tone(80, 0.25, 'sine', 0.2 * vol, 0, 40); } break;
    case 'cannon': if (throttle(s, 120)) { noise(0.5, 300, 0.7, 0.4 * vol, 0, 'lowpass'); tone(60, 0.4, 'sine', 0.3 * vol, 0, 30); } break;
    case 'death': if (throttle(s, 150)) { tone(300 + Math.random() * 120, 0.25, 'sawtooth', 0.04 * vol, 0, 120); } break;
    case 'collapse': noise(1.4, 180, 0.6, 0.45 * vol, 0, 'lowpass'); noise(0.8, 900, 0.8, 0.15 * vol, 0.1); break;
    case 'chop': if (throttle(s, 200)) noise(0.05, 900, 4, 0.12 * vol); break;
    case 'mine': if (throttle(s, 200)) { tone(2200, 0.06, 'square', 0.03 * vol); noise(0.04, 4000, 6, 0.08 * vol); } break;
    case 'deposit': if (throttle(s, 200)) tone(660, 0.05, 'triangle', 0.04 * vol); break;
    case 'wololo': {
      if (!throttle(s, 1500)) break;
      // "wo-lo-lo" vocal-ish synth
      const notes = [[196, 0.22], [262, 0.18], [196, 0.3]] as const;
      let t = 0;
      for (const [f, d] of notes) {
        tone(f, d, 'sawtooth', 0.07 * vol, t, f * 1.05);
        tone(f * 2, d, 'sine', 0.05 * vol, t);
        t += d * 0.9;
      }
      break;
    }
    case 'error': if (throttle(s, 200)) { tone(200, 0.12, 'square', 0.06 * vol); tone(150, 0.15, 'square', 0.06 * vol, 0.1); } break;
    case 'victory': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.45, 'triangle', 0.12, i * 0.18)); break;
    case 'defeat': [392, 349, 311, 262].forEach((f, i) => tone(f, 0.6, 'sawtooth', 0.06, i * 0.3)); break;
  }
}

// ---------------------------------------------------------------- music

const TRACKS = {
  menu: ['music/musicaabertura.mp3'],
  game: ['music/musicadefundodojogo.mp3', 'music/musicafundojogo2.mp3', 'music/musicafundojogo3.mp3'],
  battle: ['music/musicaataque.mp3'],
  end: ['music/fimdejogo.mp3'],
  victory: ['music/fimdejogo.mp3'],
};
/** CC0 medieval pack (RandomMind, CodeManu, Spring — OpenGameArt), toggled by Settings → Extra music. */
const EXTRA: Record<keyof typeof TRACKS, string[]> = {
  menu: ['music/x_legend_will_rise.mp3'],
  game: ['music/x_bards_tale.mp3', 'music/x_kings_feast.mp3', 'music/x_minstrel_dance.mp3', 'music/x_old_tower_inn.mp3', 'music/x_legend_will_rise.mp3'],
  battle: ['music/x_medieval_battle.mp3', 'music/x_war_theme.mp3'],
  end: [],
  victory: ['music/x_victory.mp3'],
};
type MusicMode = keyof typeof TRACKS;

function playlist(mode: MusicMode) {
  if (!audioSettings.extraMusic) return TRACKS[mode];
  // the victory fanfare comes first when the pack is on
  return mode === 'victory' ? [...EXTRA.victory, ...TRACKS.victory] : [...TRACKS[mode], ...EXTRA[mode]];
}

class Music {
  el: HTMLAudioElement | null = null;
  mode: MusicMode | null = null;
  idx = 0;

  play(mode: MusicMode) {
    if (this.mode === mode && this.el && !this.el.paused) return;
    this.mode = mode;
    this.idx = mode === 'victory' ? 0 : Math.floor(Math.random() * playlist(mode).length);
    this.start();
  }

  /** Playlist changed (extra music toggled): carry on with the current track, pick from the new list next. */
  refresh() {
    if (this.mode && this.el) this.idx = Math.floor(Math.random() * playlist(this.mode).length);
  }

  private start() {
    if (!this.mode) return;
    this.el?.pause();
    const list = playlist(this.mode);
    const el = new Audio(list[this.idx % list.length]);
    el.volume = audioSettings.muted ? 0 : audioSettings.music;
    el.loop = list.length === 1 && this.mode === 'menu';
    el.onended = () => { this.idx++; this.start(); };
    el.onerror = () => { /* missing file: stay silent */ };
    this.el = el;
    void el.play().catch(() => { /* autoplay blocked until interaction */ });
  }

  resume() {
    if (this.el && this.el.paused) void this.el.play().catch(() => {});
  }

  stop() {
    this.el?.pause();
    this.el = null;
    this.mode = null;
  }

  setVolume() {
    if (this.el) this.el.volume = audioSettings.muted ? 0 : audioSettings.music;
  }
}

export const music = new Music();
