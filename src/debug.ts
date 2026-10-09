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
  w.dbg = { app, pump, touch, tap, tapWorld, cmd, start };
}
