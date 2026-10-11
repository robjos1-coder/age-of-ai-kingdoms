// Inline SVG glyphs for resources, commands and technologies.

const S = (body: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ICON: Record<string, string> = {
  food: S('<path d="M7 3c3 0 6 3 6 7 0 2-1 3-2 4l6 6-2 2-6-6c-1 1-2 2-4 2-3 0-4-3-4-6 0-5 3-9 6-9z" fill="#e0603a"/><circle cx="6" cy="8" r="2" fill="#ffb08a"/><path d="M15 17l3 3" stroke="#f3e5c8" stroke-width="2"/>'),
  wood: S('<rect x="2" y="9" width="20" height="7" rx="3.5" fill="#9a6232"/><ellipse cx="20" cy="12.5" rx="2.5" ry="3.5" fill="#e0b070"/><ellipse cx="20" cy="12.5" rx="1" ry="1.6" fill="#9a6232"/><rect x="2" y="4" width="14" height="5" rx="2.5" fill="#7a4a22"/><ellipse cx="15" cy="6.5" rx="2" ry="2.5" fill="#d8a868"/>'),
  gold: S('<ellipse cx="12" cy="17" rx="8" ry="3" fill="#b8860b"/><rect x="4" y="11" width="16" height="6" fill="#d4a017"/><ellipse cx="12" cy="11" rx="8" ry="3" fill="#ffd54a"/><ellipse cx="12" cy="11" rx="4" ry="1.4" fill="#fff0a0"/>'),
  stone: S('<path d="M3 18l3-8 6-4 7 3 2 9z" fill="#9e9a92"/><path d="M6 10l6-4 7 3-6 3z" fill="#c8c4bc"/><path d="M12 12l7-3 2 9-8 0z" fill="#7e7a72"/>'),
  pop: S('<circle cx="9" cy="7" r="3.2" fill="#f2d6b0"/><path d="M3 20c0-5 3-8 6-8s6 3 6 8z" fill="#5a8fd8"/><circle cx="17" cy="8" r="2.6" fill="#e8c8a0"/><path d="M13 20c0-4 2-7 4-7s5 3 5 7z" fill="#c05a3a"/>'),
  menu: S('<rect x="3" y="5" width="18" height="2.6" rx="1.3" fill="#f0c860"/><rect x="3" y="11" width="18" height="2.6" rx="1.3" fill="#f0c860"/><rect x="3" y="17" width="18" height="2.6" rx="1.3" fill="#f0c860"/>'),
  stop: S('<defs><linearGradient id="gSt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef5a48"/><stop offset="1" stop-color="#a8261a"/></linearGradient></defs><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" fill="url(#gSt)" stroke="#fff" stroke-width="1.4"/><rect x="6.5" y="10.4" width="11" height="3.2" rx="1" fill="#fff"/>'),
  attackmove: S('<path d="M3 21l10-10" stroke="#e8edf2" stroke-width="3" stroke-linecap="round"/><path d="M2 22l2.5-.5-2-2z" fill="#9a6232"/><path d="M6 14l4 4" stroke="#c9a040" stroke-width="2.4"/><path d="M12 4h8v8" stroke="#ff6a4a" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 4l-6 6" stroke="#ff6a4a" stroke-width="2.6" stroke-linecap="round"/>'),
  patrol: S('<path d="M4 8h13l-3.4-3.4" stroke="#8fd0ff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 16H7l3.4 3.4" stroke="#8fd0ff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="16" r="2" fill="#ffd060"/><circle cx="20" cy="8" r="2" fill="#ffd060"/>'),
  garrison: S('<defs><linearGradient id="gGa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d0cabe"/><stop offset="1" stop-color="#8a8478"/></linearGradient></defs><path d="M4 21V7l2-1.4V4h2.4v1.6h2.2V4h2.8v1.6h2.2V4H18v1.6L20 7v14z" fill="url(#gGa)" stroke="#3a3a3a" stroke-width=".9"/><path d="M9 21v-5a3 3 0 0 1 6 0v5z" fill="#2a1d12"/><path d="M12 7.5v6.5M9 11l3 3 3-3" stroke="#7be07a" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  ungarrison: S('<defs><linearGradient id="gUg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d0cabe"/><stop offset="1" stop-color="#8a8478"/></linearGradient></defs><path d="M4 21V7l2-1.4V4h2.4v1.6h2.2V4h2.8v1.6h2.2V4H18v1.6L20 7v14z" fill="url(#gUg)" stroke="#3a3a3a" stroke-width=".9"/><path d="M9 21v-5a3 3 0 0 1 6 0v5z" fill="#2a1d12"/><path d="M12 14V7.5M9 10.5l3-3 3 3" stroke="#ffd060" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  del: S('<defs><linearGradient id="gDe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d04a38"/><stop offset="1" stop-color="#7a1e12"/></linearGradient></defs><path d="M6 7.5h12l-1.2 13a1.5 1.5 0 0 1-1.5 1.4H8.7a1.5 1.5 0 0 1-1.5-1.4z" fill="url(#gDe)" stroke="#2a0a06" stroke-width=".9"/><rect x="3.5" y="4.5" width="17" height="3" rx="1.2" fill="#e05a48" stroke="#2a0a06" stroke-width=".9"/><path d="M10 2.5h4v2h-4z" fill="#e05a48" stroke="#2a0a06" stroke-width=".8"/><path d="M10 11v8M14 11v8" stroke="#ffd6cc" stroke-width="1.6" stroke-linecap="round"/>'),
  buildeco: S('<defs><linearGradient id="gBe1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2d08a"/><stop offset="1" stop-color="#b98a44"/></linearGradient></defs><defs><linearGradient id="gBe2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4553a"/><stop offset="1" stop-color="#7e2a1c"/></linearGradient></defs><path d="M3 12.5l8-6.5 8 6.5V21H3z" fill="url(#gBe1)" stroke="#3a2410" stroke-width="1"/><path d="M1.2 13L11 5l9.8 8" stroke="url(#gBe2)" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="15" width="4" height="6" fill="#4a2e16"/><rect x="5" y="14" width="2.6" height="2.6" fill="#3a5f88"/><g transform="rotate(35 18 7)"><rect x="17" y="3" width="2" height="10" rx="1" fill="#8b5a2b" stroke="#2a1a0a" stroke-width=".6"/><rect x="14" y="2" width="8" height="3.4" rx="1" fill="#c8ccd2" stroke="#2a2a2a" stroke-width=".6"/></g>'),
  buildmil: S('<defs><linearGradient id="gBm1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6d0c4"/><stop offset="1" stop-color="#8a8478"/></linearGradient></defs><defs><linearGradient id="gBm2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e94a3a"/><stop offset="1" stop-color="#8a1e14"/></linearGradient></defs><path d="M2.5 21V10.5l2.4-1.6 2.4 1.6 2.4-1.6 2.4 1.6 2.4-1.6 2.4 1.6 2.4-1.6 2.4 1.6V21z" fill="url(#gBm1)" stroke="#3a3a3a" stroke-width=".9"/><rect x="9.6" y="15.5" width="4.2" height="5.5" rx="2" fill="#3a2a1c"/><path d="M5 3l9 9M14 3l-9 9" stroke="#eef2f6" stroke-width="2.2" stroke-linecap="round"/><path d="M4 5l3-3M15 5l-3-3" stroke="#c9a040" stroke-width="2"/><path d="M17.5 2.5h5v4.2c0 2.5-2.5 4-2.5 4s-2.5-1.5-2.5-4z" fill="url(#gBm2)" stroke="#2a0a06" stroke-width=".8"/>'),
  repair: S('<path d="M13.8 3.2a5 5 0 0 0-5.6 6.4L2.6 15.2a1.9 1.9 0 0 0 2.7 2.7l5.6-5.6a5 5 0 0 0 6.4-5.6l-2.9 2.9-2.4-.6-.6-2.4z" fill="#cfd4da" stroke="#2a2e33" stroke-width="1"/><g transform="rotate(-40 16 16)"><rect x="15" y="10" width="2.4" height="12" rx="1" fill="#9a6232" stroke="#2a1a0a" stroke-width=".6"/><rect x="11.5" y="8" width="9.5" height="4" rx="1" fill="#8d949b" stroke="#2a2a2a" stroke-width=".7"/></g>'),
  back: S('<path d="M15 3.5L6.5 12l8.5 8.5" stroke="#f0c860" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  bell: S('<defs><linearGradient id="gBl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe07a"/><stop offset="1" stop-color="#b8860b"/></linearGradient></defs><path d="M12 2.5a6.2 6.2 0 0 0-6.2 6.2v5L3.5 17.5h17L18.2 13.7v-5A6.2 6.2 0 0 0 12 2.5z" fill="url(#gBl)" stroke="#5a3a08" stroke-width="1"/><circle cx="12" cy="19.6" r="2.2" fill="#a07818" stroke="#5a3a08" stroke-width=".8"/><path d="M1.5 9a10 10 0 0 1 2.5-5M22.5 9a10 10 0 0 0-2.5-5" stroke="#ffd060" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  allclear: S('<defs><linearGradient id="gAc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9af08a"/><stop offset="1" stop-color="#3a9a3a"/></linearGradient></defs><path d="M12 2.5a6.2 6.2 0 0 0-6.2 6.2v5L3.5 17.5h17L18.2 13.7v-5A6.2 6.2 0 0 0 12 2.5z" fill="url(#gAc)" stroke="#143a14" stroke-width="1"/><circle cx="12" cy="19.6" r="2.2" fill="#2a7a2a"/><path d="M8.2 10.2l2.8 2.8 5-5.6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  rally: S('<path d="M6 22V2.5" stroke="#6b4a2b" stroke-width="2.6" stroke-linecap="round"/><path d="M7 3.5h12.5l-3.2 4.2 3.2 4.2H7z" fill="#4aa8f0" stroke="#123a5a" stroke-width=".9" stroke-linejoin="round"/><ellipse cx="6" cy="21.6" rx="4" ry="1.2" fill="#00000055"/>'),
  unload: S('<path d="M2.5 13h19l-3.2 6.5H5.7z" fill="#9a6232" stroke="#2a1a0a" stroke-width=".9"/><path d="M2 21.5c3 1 6-1 10 0s7 1 10 0" stroke="#5ab8ff" stroke-width="1.6" fill="none"/><path d="M12 11V2.5M8.5 7.5L12 11l3.5-3.5" stroke="#ffd060" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  target: S('<circle cx="12" cy="12" r="8" fill="none" stroke="#ff5a4a" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#ff5a4a" stroke-width="2"/><circle cx="12" cy="12" r="1.3" fill="#ff5a4a"/>'),
  aggressive: S('<path d="M4 20L18 6" stroke="#e0e6ee" stroke-width="3"/><path d="M15 4l5 0 0 5z" fill="#e0e6ee"/><path d="M5 15l4 4" stroke="#c0392b" stroke-width="3"/>'),
  defensive: S('<path d="M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z" fill="#5a8fd8"/><path d="M12 5v14" stroke="#fff" stroke-width="1.5"/>'),
  stand: S('<rect x="10" y="3" width="4" height="15" fill="#c8ccd2"/><rect x="6" y="18" width="12" height="3" fill="#8b5a2b"/><path d="M12 2l3 4H9z" fill="#c8ccd2"/>'),
  noattack: S('<circle cx="12" cy="12" r="8" fill="none" stroke="#c0392b" stroke-width="2.4"/><path d="M6 18L18 6" stroke="#c0392b" stroke-width="2.4"/><path d="M9 9l6 6" stroke="#e0e6ee" stroke-width="2"/>'),
  idle: S('<circle cx="12" cy="6" r="3.5" fill="#f2d6b0"/><path d="M6 21c0-6 3-9 6-9s6 3 6 9z" fill="#d9ccab"/><text x="17" y="9" font-size="9" fill="#f0c860" font-weight="bold">z</text>'),
  army: S('<path d="M5 19L17 7M14 5l4 0 0 4" stroke="#e0e6ee" stroke-width="2.6" fill="none"/><path d="M19 19L7 7M10 5L6 5 6 9" stroke="#e0e6ee" stroke-width="2.6" fill="none"/><circle cx="12" cy="20" r="2" fill="#c0392b"/>'),
  home: S('<path d="M3 12l9-8 9 8v9H3z" fill="#d8b070"/><path d="M1 12l11-10 11 10" stroke="#a5432e" stroke-width="2.4" fill="none"/><rect x="10" y="14" width="4" height="7" fill="#5a3a1e"/>'),
  box: S('<rect x="4" y="4" width="16" height="16" rx="1" fill="#7be07a22" stroke="#7be07a" stroke-width="2" stroke-dasharray="3 2"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18" stroke="#f4ecd8" stroke-width="3" stroke-linecap="round"/>'),
  speed: S('<path d="M3 5l8 7-8 7zM12 5l8 7-8 7z" fill="#f0c860"/>'),
  pause: S('<rect x="6" y="4" width="4" height="16" fill="#f0c860"/><rect x="14" y="4" width="4" height="16" fill="#f0c860"/>'),
  collapse: S('<path d="M5 9l7 7 7-7" stroke="#f0c860" stroke-width="3" fill="none"/>'),
  expand: S('<path d="M5 15l7-7 7 7" stroke="#f0c860" stroke-width="3" fill="none"/>'),
  sound: S('<path d="M4 9h4l5-4v14l-5-4H4z" fill="#f0c860"/><path d="M16 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14" stroke="#f0c860" stroke-width="2" fill="none"/>'),
  mute: S('<path d="M4 9h4l5-4v14l-5-4H4z" fill="#a08a64"/><path d="M16 9l5 6M21 9l-5 6" stroke="#c0392b" stroke-width="2.4"/>'),
  buy: S('<circle cx="12" cy="12" r="9" fill="#2f5a2a"/><path d="M12 6v12M6 12h12" stroke="#fff" stroke-width="2.6"/>'),
  sell: S('<circle cx="12" cy="12" r="9" fill="#6a2a22"/><path d="M6 12h12" stroke="#fff" stroke-width="2.6"/>'),
  reseed: S('<path d="M4 18h16" stroke="#6d4a2e" stroke-width="3"/><path d="M8 17c0-4 2-7 4-8 2 1 4 4 4 8" fill="#7fbf3f"/><path d="M12 4a4 4 0 1 1-4 4" stroke="#f0c860" stroke-width="2" fill="none"/>'),
  techtree: S('<rect x="9" y="2" width="6" height="5" rx="1" fill="#f0c860"/><rect x="2" y="16" width="6" height="5" rx="1" fill="#f0c860"/><rect x="16" y="16" width="6" height="5" rx="1" fill="#f0c860"/><path d="M12 7v5M5 16v-4h14v4" stroke="#f0c860" stroke-width="1.8" fill="none"/>'),
  heal: S('<rect x="9" y="3" width="6" height="18" rx="1" fill="#7be07a"/><rect x="3" y="9" width="18" height="6" rx="1" fill="#7be07a"/>'),
  convert: S('<circle cx="12" cy="12" r="9" fill="none" stroke="#ffe68a" stroke-width="2"/><path d="M8 12c2-4 6-4 8 0-2 4-6 4-8 0z" fill="#ffe68a"/>'),
  pack: S('<path d="M4 16h16M7 16l5-10 5 10" stroke="#c8a060" stroke-width="2.4" fill="none"/><circle cx="7" cy="19" r="2" fill="#6b4a2b"/><circle cx="17" cy="19" r="2" fill="#6b4a2b"/>'),
  // tech glyphs
  up: S('<path d="M12 3l8 9h-5v9H9v-9H4z" fill="#f0c860" stroke="#5a3a10" stroke-width="1"/>'),
  axe: S('<path d="M6 21L16 6" stroke="#8b5a2b" stroke-width="2.6"/><path d="M13 3c4 0 7 3 7 7l-6-1z" fill="#c8ccd2"/>'),
  farm: S('<path d="M12 21V8" stroke="#c9a040" stroke-width="2"/><path d="M12 8c-3-1-4-4-4-6 3 1 4 3 4 6zM12 8c3-1 4-4 4-6-3 1-4 3-4 6zM12 13c-3-1-4-4-4-6 3 1 4 3 4 6zM12 13c3-1 4-4 4-6-3 1-4 3-4 6z" fill="#e8c860"/>'),
  sword: S('<path d="M5 19L17 7" stroke="#e0e6ee" stroke-width="3"/><path d="M17 7l3-4-4 3z" fill="#e0e6ee"/><path d="M4 15l5 5" stroke="#c9a040" stroke-width="2.6"/><path d="M4 20l2-2" stroke="#6b4a2b" stroke-width="3"/>'),
  armor: S('<path d="M6 4l6 2 6-2 2 4-2 3v9H6v-9L4 8z" fill="#aab2bc"/><path d="M12 6v14" stroke="#7a828c" stroke-width="1.4"/>'),
  arrow: S('<path d="M4 20L18 6" stroke="#8b5a2b" stroke-width="2.2"/><path d="M18 6l-5 1 4 4z" fill="#c8ccd2"/><path d="M4 20l1-4 3 3z" fill="#f4ecd8"/>'),
  horse: S('<path d="M5 20v-6c0-4 3-7 7-8l2-3 2 3 3 2-1 3-3-1-1 4v6h-2v-5H8v5z" fill="#a0683a"/>'),
  boot: S('<path d="M8 3h6v10l6 3v4H6z" fill="#8b5a2b"/><path d="M6 18h14" stroke="#5a3a1e" stroke-width="2"/>'),
  bow: S('<path d="M6 3c8 4 8 14 0 18" stroke="#8b5a2b" stroke-width="2.4" fill="none"/><path d="M6 3v18" stroke="#f4ecd8" stroke-width="1"/><path d="M4 12h16" stroke="#c8ccd2" stroke-width="1.8"/>'),
  wall: S('<path d="M2 21V9h4V6h3v3h6V6h3v3h4v12z" fill="#a8a296"/><path d="M2 14h20M8 9v5M16 9v5M12 14v7" stroke="#7a756c" stroke-width="1.2"/>'),
  tower: S('<path d="M7 21V8h10v13z" fill="#a8a296"/><path d="M6 8V4h2v2h2V4h4v2h2V4h2v4z" fill="#8a857c"/><rect x="11" y="11" width="2" height="4" fill="#3a2a1c"/>'),
  fire: S('<path d="M12 2c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 0 3 1 4 2 4 0-3 0-5 1-8z" fill="#ff7a1c"/><path d="M12 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5z" fill="#ffd35a"/>'),
  siege: S('<circle cx="7" cy="18" r="3" fill="#6b4a2b"/><circle cx="17" cy="18" r="3" fill="#6b4a2b"/><path d="M4 15h16" stroke="#8b5a2b" stroke-width="2.4"/><path d="M8 15L16 4" stroke="#8b5a2b" stroke-width="2.4"/><circle cx="16" cy="4" r="2.2" fill="#7a756c"/>'),
  monk: S('<path d="M12 3a4 4 0 0 1 4 4v2H8V7a4 4 0 0 1 4-4z" fill="#8a6a45"/><path d="M7 21l2-12h6l2 12z" fill="#8a6a45"/><circle cx="12" cy="8" r="2" fill="#f2d6b0"/>'),
  castle: S('<path d="M3 21V9h3V6h3v3h6V6h3v3h3v12z" fill="#a8a296"/><rect x="10" y="14" width="4" height="7" fill="#3a2a1c"/><path d="M12 6V2l4 1-4 1" fill="#c0392b" stroke="#6b4a2b"/>'),
  clock: S('<circle cx="12" cy="12" r="9" fill="#f4ecd8"/><path d="M12 6v6l4 3" stroke="#3a2a1c" stroke-width="2" fill="none"/>'),
  unique: S('<path d="M12 2l3 7 7 .5-5.5 4.5 2 7.5L12 17l-6.5 4.5 2-7.5L2 9.5 9 9z" fill="#f0c860" stroke="#7a5a10"/>'),
  watch: S('<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" fill="#f4ecd8"/><circle cx="12" cy="12" r="4" fill="#3b6fb0"/><circle cx="12" cy="12" r="1.8" fill="#111"/>'),
  loom: S('<rect x="4" y="4" width="16" height="16" rx="2" fill="#d9ccab"/><path d="M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16" stroke="#8a6a45" stroke-width="1.2"/>'),
  wheelbarrow: S('<path d="M3 9h13l-2 6H5z" fill="#8b5a2b"/><circle cx="16" cy="18" r="3" fill="#5a3a1e"/><path d="M16 15l5-4M5 15l-2 4" stroke="#6b4a2b" stroke-width="2"/>'),
  handcart: S('<path d="M4 8h14l-2 7H6z" fill="#8b5a2b"/><circle cx="7" cy="18" r="3" fill="#5a3a1e"/><circle cx="15" cy="18" r="3" fill="#5a3a1e"/><path d="M18 8l4-3" stroke="#6b4a2b" stroke-width="2"/>'),
  fish: S('<path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0z" fill="#8fb4c4"/><path d="M17 12l5-4v8z" fill="#8fb4c4"/><circle cx="7" cy="11" r="1.2" fill="#111"/>'),
  ship: S('<path d="M3 15h18l-3 5H6z" fill="#8b5a2b"/><path d="M12 14V3" stroke="#5a3a1e" stroke-width="1.8"/><path d="M12 4l7 8h-7z" fill="#f4ecd8"/>'),
  age2: S('<circle cx="12" cy="12" r="10" fill="#6b4a2b" stroke="#f0c860" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-family="serif" font-weight="bold" fill="#f0c860">II</text>'),
  age3: S('<circle cx="12" cy="12" r="10" fill="#4a4a5a" stroke="#f0c860" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-family="serif" font-weight="bold" fill="#f0c860">III</text>'),
  age4: S('<circle cx="12" cy="12" r="10" fill="#2f4a6e" stroke="#f0c860" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-family="serif" font-weight="bold" fill="#f0c860">IV</text>'),
  atk: S('<path d="M5 19L17 7" stroke="#e0e6ee" stroke-width="3"/><path d="M4 15l5 5" stroke="#c9a040" stroke-width="2.6"/>'),
  marmor: S('<path d="M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z" fill="#aab2bc"/>'),
  parmor: S('<path d="M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z" fill="#8a9ab0"/><path d="M7 12h10" stroke="#3a2a1c" stroke-width="1.6"/><path d="M15 9l3 3-3 3" stroke="#3a2a1c" stroke-width="1.6" fill="none"/>'),
  range: S('<circle cx="12" cy="12" r="9" fill="none" stroke="#8fd0ff" stroke-width="2" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="2" fill="#8fd0ff"/>'),
  los: S('<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" fill="#f4ecd8"/><circle cx="12" cy="12" r="3" fill="#3b6fb0"/>'),
  relic: S('<rect x="5" y="8" width="14" height="10" rx="1" fill="#e8b830"/><path d="M5 8l7-5 7 5" fill="#f4d26a"/><rect x="11" y="11" width="2" height="5" fill="#b6402f"/><rect x="9" y="12.5" width="6" height="2" fill="#b6402f"/>'),
  trophy: S('<path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#f0c860"/><path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" stroke="#f0c860" stroke-width="1.6" fill="none"/><rect x="10" y="13" width="4" height="4" fill="#c09030"/><rect x="7" y="17" width="10" height="3" fill="#8a6a2a"/>'),
};

export function resIcon(r: string) {
  return ICON[r] ?? '';
}

let uid = 0;
/** Give gradient ids in an icon a unique suffix so several copies (some hidden) never share a definition. */
export function uniqIds(html: string) {
  if (!html.includes('id="')) return html;
  const n = ++uid;
  return html.replace(/id="(g[A-Za-z0-9]+)"/g, `id="$1-${n}"`).replace(/url\(#(g[A-Za-z0-9]+)\)/g, `url(#$1-${n})`);
}
