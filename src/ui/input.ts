import type { App } from './app';

interface Ptr { id: number; x: number; y: number; sx: number; sy: number; t: number; type: string; button: number }

export class Input {
  app: App;
  ptrs = new Map<number, Ptr>();
  private mode: 'none' | 'pan' | 'box' | 'pinch' | 'pending' | 'rpan' = 'none';
  private longTimer = 0;
  private lastTap = { t: 0, x: 0, y: 0 };
  private pinch = { d: 0, a: 0, mx: 0, my: 0 };
  private keys = new Set<string>();
  private mouse = { x: -1, y: -1 };
  private moved = false;

  constructor(app: App) {
    this.app = app;
    const c = app.canvas;
    c.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
    c.addEventListener('wheel', this.wheel, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private get ready() {
    return !!this.app.game && !!this.app.renderer && !document.querySelector('.screen:not(.hidden)');
  }

  private down = (e: PointerEvent) => {
    if (!this.ready) return;
    e.preventDefault();
    this.app.hud.hideTip();
    this.app.canvas.setPointerCapture?.(e.pointerId);
    const p: Ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), type: e.pointerType, button: e.button };
    this.ptrs.set(e.pointerId, p);
    this.moved = false;
    if (this.ptrs.size === 2) {
      clearTimeout(this.longTimer);
      this.hideBox();
      const [a, b] = [...this.ptrs.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.mode = 'pinch';
      return;
    }
    if (this.ptrs.size > 2) return;
    if (e.pointerType === 'mouse') {
      if (e.button === 1 || e.button === 2) { this.mode = 'pending'; return; }
      this.mode = 'pending';
      return;
    }
    // touch
    this.mode = this.app.boxMode ? 'box' : 'pending';
    clearTimeout(this.longTimer);
    if (!this.app.boxMode && this.app.mode.k === 'normal') {
      this.longTimer = window.setTimeout(() => {
        if (this.mode === 'pending' && !this.moved) {
          this.mode = 'box';
          if (navigator.vibrate) navigator.vibrate(20);
          this.showBox(p.sx, p.sy, p.x, p.y);
        }
      }, 380);
    }
  };

  private move = (e: PointerEvent) => {
    if (!this.ready) return;
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    const p = this.ptrs.get(e.pointerId);
    const app = this.app;
    if (!p) {
      // hover (mouse)
      if (e.pointerType === 'mouse' && (e.target === app.canvas)) {
        const r = app.renderer!;
        if (app.mode.k === 'place') {
          const gp = r.groundAt(e.clientX, e.clientY);
          if (gp) app.placeAt(gp.x, gp.y);
        } else if (app.mode.k === 'wall' && app.mode.sx !== undefined) {
          const gp = r.groundAt(e.clientX, e.clientY);
          if (gp) { app.mode.ex = Math.floor(gp.x); app.mode.ey = Math.floor(gp.y); }
        }
        const hit = r.pickEntity(e.clientX, e.clientY);
        app.view.hover = hit && hit.k === 'u' ? hit.id : 0;
      }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const dist = Math.hypot(p.x - p.sx, p.y - p.sy);
    if (this.mode === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const r = app.renderer!;
      if (this.pinch.d > 10 && d > 10) r.zoomBy(this.pinch.d / d, mx, my);
      let da = ang - this.pinch.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 0.5) r.rotate(-da);
      r.pan(mx - this.pinch.mx, my - this.pinch.my);
      this.pinch = { d, a: ang, mx, my };
      return;
    }
    const thresh = p.type === 'mouse' ? 5 : 9;
    if (dist > thresh) this.moved = true;
    if (this.mode === 'pending' && dist > thresh) {
      clearTimeout(this.longTimer);
      if (p.type === 'mouse') {
        if (p.button === 0) {
          if (app.mode.k === 'wall') this.mode = 'none';
          else { this.mode = 'box'; }
        } else this.mode = 'rpan';
      } else {
        this.mode = app.mode.k === 'wall' && app.mode.sx !== undefined ? 'none' : 'pan';
      }
    }
    if (this.mode === 'pan' || this.mode === 'rpan') app.renderer!.pan(dx, dy);
    else if (this.mode === 'box') this.showBox(p.sx, p.sy, p.x, p.y);
    // desktop wall drag
    if (p.type === 'mouse' && app.mode.k === 'wall' && app.mode.sx !== undefined && p.button === 0) {
      const gp = app.renderer!.groundAt(p.x, p.y);
      if (gp) { app.mode.ex = Math.floor(gp.x); app.mode.ey = Math.floor(gp.y); }
    }
  };

  private up = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (!this.ready) { this.mode = 'none'; return; }
    const app = this.app;
    if (this.mode === 'pinch') {
      if (this.ptrs.size === 0) this.mode = 'none';
      return;
    }
    const touch = p.type !== 'mouse';
    if (this.mode === 'box') {
      this.hideBox();
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) app.boxSelect(p.sx, p.sy, p.x, p.y, e.shiftKey);
      if (touch && app.boxMode) { app.boxMode = false; document.getElementById('sb-box')?.classList.remove('on'); }
      this.mode = 'none';
      return;
    }
    if (this.mode === 'pending') {
      const now = performance.now();
      const double = now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30;
      this.lastTap = { t: double ? 0 : now, x: p.x, y: p.y };
      if (!touch && p.button === 2) {
        if (app.mode.k === 'wall' && app.mode.sx !== undefined) app.setMode({ k: 'normal' });
        else if (app.mode.k !== 'normal') app.setMode({ k: 'normal' });
        else app.command(p.x, p.y, undefined, undefined, e.shiftKey);
      } else if (!touch && p.button === 0 && app.mode.k === 'wall') {
        const gp = app.renderer!.groundAt(p.x, p.y);
        if (gp) {
          if (app.mode.sx === undefined) { app.mode.sx = Math.floor(gp.x); app.mode.sy = Math.floor(gp.y); app.mode.ex = app.mode.sx; app.mode.ey = app.mode.sy; app.hud.updateModebar(); }
          else app.confirmPlace();
        }
      } else if (p.button === 0 || touch) {
        app.tapWorld(p.x, p.y, { touch, shift: e.shiftKey, double });
      }
    }
    this.mode = 'none';
  };

  private cancel = (e: PointerEvent) => {
    this.ptrs.delete(e.pointerId);
    clearTimeout(this.longTimer);
    this.hideBox();
    this.mode = 'none';
  };

  private wheel = (e: WheelEvent) => {
    if (!this.ready) return;
    e.preventDefault();
    const f = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    this.app.renderer!.zoomBy(f, e.clientX, e.clientY);
  };

  private showBox(x0: number, y0: number, x1: number, y1: number) {
    const el = document.getElementById('selbox')!;
    el.classList.remove('hidden');
    el.style.left = Math.min(x0, x1) + 'px';
    el.style.top = Math.min(y0, y1) + 'px';
    el.style.width = Math.abs(x1 - x0) + 'px';
    el.style.height = Math.abs(y1 - y0) + 'px';
  }

  private hideBox() {
    document.getElementById('selbox')!.classList.add('hidden');
  }

  private keydown = (e: KeyboardEvent) => {
    if (!this.ready) {
      if (e.key === 'Escape' && this.app.game && !this.app.game.over) this.app.menus.resumeIfPause();
      return;
    }
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    const app = this.app;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (e.ctrlKey && /^[1-9]$/.test(k)) { e.preventDefault(); app.setGroup(+k); return; }
    if (/^[1-9]$/.test(k)) { app.recallGroup(+k); return; }
    switch (k) {
      case 'escape':
        if (app.mode.k !== 'normal') app.setMode({ k: 'normal' });
        else if (app.menuPath !== 'root') { app.menuPath = 'root'; app.hud.dirty = true; }
        else if (app.view.selection.size) app.deselect();
        else app.menus.showPause();
        return;
      case 'f10': e.preventDefault(); app.menus.showPause(); return;
      case 'p': case 'pause': app.paused = !app.paused; app.hud.toast(app.paused ? 'Paused' : 'Resumed', undefined, 1000); return;
      case 'delete': {
        const own = app.ownUnits().map((u) => u.id);
        if (own.length) { app.game!.cmdDelete(app.game!.human, own); app.deselect(); }
        return;
      }
      case '.': app.selectIdleVillager(); return;
      case ',': app.selectArmy(); return;
      case 'h': if (!e.ctrlKey && !app.hud.hotkey('h', false)) app.goHome(); return;
      case ' ': e.preventDefault(); app.jumpToAlert(); return;
      case 'home': app.goHome(); return;
      case '+': case '=': app.renderer!.zoomBy(0.85); return;
      case '-': case '_': app.renderer!.zoomBy(1.18); return;
      case 'pageup': app.renderer!.rotate(-Math.PI / 8); return;
      case 'pagedown': app.renderer!.rotate(Math.PI / 8); return;
      case 'enter':
        if (app.mode.k === 'place' || app.mode.k === 'wall') { app.confirmPlace(); return; }
        {
          const code = prompt('Chat / cheat code:');
          if (code) { const res = app.game!.cheat(app.game!.human, code); app.hud.toast(res ?? 'Unknown code.', res ? 'gold' : undefined, 2500); }
          this.keys.clear();
        }
        return;
    }
    if (k.length === 1 && /[a-z]/.test(k) && !e.ctrlKey && !e.metaKey) app.hud.hotkey(k, e.shiftKey);
  };

  update(dt: number) {
    const app = this.app;
    const r = app.renderer;
    if (!r) return;
    const sp = 700 * dt;
    let dx = 0, dy = 0;
    if (this.keys.has('arrowleft')) dx += sp;
    if (this.keys.has('arrowright')) dx -= sp;
    if (this.keys.has('arrowup')) dy += sp;
    if (this.keys.has('arrowdown')) dy -= sp;
    if (app.prefs.edgeScroll && this.mouse.x >= 0 && document.hasFocus()) {
      const m = 8;
      if (this.mouse.x < m) dx += sp;
      if (this.mouse.x > window.innerWidth - m) dx -= sp;
      if (this.mouse.y < m) dy += sp;
      if (this.mouse.y > window.innerHeight - m) dy -= sp;
    }
    if (dx || dy) r.pan(dx, dy);
  }
}
