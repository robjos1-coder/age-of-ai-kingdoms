// Dev-only helpers for automated testing from the browser console (not included in production builds).
import type { App } from './ui/app';
import type { Settings } from './sim/types';

export function installDebug(app: App) {
  const w = window as unknown as Record<string, unknown>;
  const pump = (sec: number, step = 1 / 30) => {
    let t = performance.now();
    (app as unknown as { lastT: number }).lastT = t;
    const frame = (app as unknown as { frame: (t: number) => void }).frame;
    for (let i = 0; i < sec / step; i++) { t += step * 1000; frame(t); }
  };
  const touch = (type: string, x: number, y: number, id = 11) => {
    const opts = { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 };
    (type === 'pointerdown' ? app.canvas : window).dispatchEvent(new PointerEvent(type, opts));
  };
  const tap = (x: number, y: number, id = 11) => { touch('pointerdown', x, y, id); touch('pointerup', x, y, id); pump(0.1); };
  const tapWorld = (x: number, y: number, h = 0.3) => {
    const r = app.renderer!;
    r.lookAt(x, y);
    const p = r.toScreen(x, y, app.game!.grid.h(x, y) + h);
    tap(p.x, p.y);
  };
  const cmd = (key: string) => {
    pump(0.15);
    const hud = app.hud as unknown as { cmds: { key: string }[]; cmdEls: HTMLButtonElement[] };
    const i = hud.cmds.findIndex((c) => c.key === key);
    if (i < 0) throw new Error(`no command ${key}; have ${hud.cmds.map((c) => c.key).join(',')}`);
    hud.cmdEls[i].click();
    pump(0.15);
  };
  const start = (over: Partial<Settings> = {}) => {
    const s: Settings = {
      mapType: 'arabia', mapSize: 120, startRes: 'standard', startAge: 1, popCap: 150, victory: 'standard', reveal: 'normal', speed: 1.7, seed: 1234,
      players: [
        { civ: 'franks', human: true, team: 0, diff: 1, color: 1, name: 'You' },
        { civ: 'britons', human: false, team: 0, diff: 1, color: 2, name: 'AI' },
      ],
      ...over,
    };
    app.start(s);
  };
  /** Triangles drawn per frame by category (main pass + shadow pass). */
  const breakdown = () => {
    const r = app.renderer!;
    const cat = (k: string) => k.startsWith('r:') ? 'units (rigged)' : k.startsWith('u:') ? 'siege & ships' : k.startsWith('tree') ? 'trees'
      : k.startsWith('d:') ? 'grass & decorations' : k.startsWith('n:') ? 'resources' : /^(b:|found|scaffold|rubble)/.test(k) ? 'buildings' : 'effects & UI';
    const out: Record<string, { instances: number; main: number; shadow: number; models: number }> = {};
    const b = (r as unknown as { batches: { map: Map<string, { base: { geometry: { getAttribute(n: string): { count: number } }; castShadow: boolean; visible: boolean }; team: { geometry: { getAttribute(n: string): { count: number } } } | null; n: number }> } }).batches;
    for (const [key, bt] of b.map) {
      if (!bt.n) continue;
      const tris = (bt.base.geometry.getAttribute('position').count + (bt.team ? bt.team.geometry.getAttribute('position').count : 0)) / 3;
      const c = (out[cat(key)] ??= { instances: 0, main: 0, shadow: 0, models: 0 });
      c.instances += bt.n; c.models++;
      c.main += tris * bt.n;
      if (bt.base.castShadow) c.shadow += tris * bt.n;
    }
    const t = (r as unknown as { terrain: { mesh: { geometry: { index: { count: number } | null } } } }).terrain;
    out['terrain'] = { instances: 1, main: (t.mesh.geometry.index?.count ?? 0) / 3, shadow: 0, models: 1 };
    const rows = Object.entries(out).sort((a, z) => z[1].main + z[1].shadow - a[1].main - a[1].shadow)
      .map(([k, v]) => ({ category: k, instances: v.instances, models: v.models, mainK: Math.round(v.main / 1000), shadowK: Math.round(v.shadow / 1000) }));
    return { rows, totalK: Math.round(rows.reduce((s, x) => s + x.mainK + x.shadowK, 0)), glInfoK: Math.round(r.gl.info.render.triangles / 1000), draws: r.gl.info.render.calls };
  };
  w.dbg = { app, pump, touch, tap, tapWorld, cmd, start, breakdown };
}
