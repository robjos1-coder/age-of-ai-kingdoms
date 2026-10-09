import './ui/style.css';
import { App } from './ui/app';
import { applyAudioSettings, audioSettings, music } from './audio/sfx';

if (location.hash.startsWith('#gallery')) {
  // debug: model gallery
  void import('./gallery').then((m) => m.runGallery(location.hash.split('=')[1] ?? ''));
} else {
  const app = new App();
  Object.assign(audioSettings, { sfx: app.prefs.sfx, music: app.prefs.music, muted: app.prefs.muted });
  applyAudioSettings();
  app.menus.showMain();
  music.play('menu');
  // expose for debugging in the console
  (window as unknown as { app: App }).app = app;
  if (import.meta.env.DEV) void import('./debug').then((m) => m.installDebug(app));
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ }); });
  }
}
