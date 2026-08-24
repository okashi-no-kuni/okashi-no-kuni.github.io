/* ==========================================================================
   GLOWZ アイコン
   ブランドガイドの ICONS SET は線画。絵文字だと色がにぎやかすぎて、
   パールとシルバーの上品さが消えるので、1.6px の線で描いたSVGに統一する。
   <svg class="i"><use href="#i-home"/></svg> の1行で置ける。
   色は currentColor なので、親の文字色にそのまま追従する。
   ========================================================================== */
const GLOWZ_ICONS = {
  home:    '<path d="M3.5 10.6 12 3.8l8.5 6.8V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.6H9.2v5.6H5A1.5 1.5 0 0 1 3.5 19z"/>',
  grid:    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  calendar:'<rect x="3.5" y="5.5" width="17" height="15" rx="2.4"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/>',
  chart:   '<path d="M4 3.8v16.4h16.2"/><path d="m7.4 15.6 3.7-4.4 3.1 2.6 4.6-5.6"/>',
  bars:    '<path d="M4 20.2h16.2"/><path d="M7 20V12M12 20V6.4M17 20V14.6"/>',
  pie:     '<path d="M12 3.6a8.4 8.4 0 1 0 8.4 8.4H12z"/><path d="M12 3.6V12h8.4"/>',
  message: '<path d="M20 4.2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 2 2h3v4.2l5-4.2h8a2 2 0 0 0 2-2V6.2a2 2 0 0 0-2-2z"/>',
  menu:    '<path d="M4 7.2h16M4 12h16M4 16.8h16"/>',
  user:    '<circle cx="12" cy="8" r="3.6"/><path d="M5 20.2c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/>',
  users:   '<circle cx="9.5" cy="8.2" r="3.2"/><path d="M3.4 20c0-3.2 2.7-5 6.1-5s6.1 1.8 6.1 5"/><path d="M16.4 5.4a3.2 3.2 0 0 1 0 6.2M17.6 15.4c2.1.5 3.4 2.1 3.4 4.6"/>',
  heart:   '<path d="M12 20.2s-7.4-4.7-7.4-9.6A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.4 2.9c0 4.9-7.4 9.6-7.4 9.6z"/>',
  sparkle: '<path d="m12 2.8 1.9 5.3 5.3 1.9-5.3 1.9L12 17.2l-1.9-5.3L4.8 10l5.3-1.9z"/><path d="m18.6 15.4.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
  crown:   '<path d="M4 18.4h16"/><path d="m4 18.4-1.2-9.6 5.4 3.9L12 5.4l3.8 7.3 5.4-3.9-1.2 9.6"/>',
  doc:     '<path d="M6 2.8h7.6L18.6 8v13.2H6z"/><path d="M13.6 2.8V8h5"/><path d="M9 12.6h6.4M9 16.2h4.4"/>',
  gear:    '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2 5.4 5.4"/>',
  bell:    '<path d="M18.2 16.4v-5a6.2 6.2 0 1 0-12.4 0v5l-2 2.2h16.4z"/><path d="M9.8 21a2.4 2.4 0 0 0 4.4 0"/>',
  search:  '<circle cx="11" cy="11" r="6.4"/><path d="m20.2 20.2-4.7-4.7"/>',
  shield:  '<path d="m12 2.8 8.2 3v6.1c0 5.1-3.6 8.2-8.2 9.3-4.6-1.1-8.2-4.2-8.2-9.3V5.8z"/><path d="m8.8 11.8 2.2 2.2 4.2-4.4"/>',
  lock:    '<rect x="4.4" y="10.6" width="15.2" height="10" rx="2.2"/><path d="M8.2 10.6V7.8a3.8 3.8 0 0 1 7.6 0v2.8"/>',
  clock:   '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 2"/>',
  wallet:  '<rect x="3" y="5.8" width="18" height="13.4" rx="2.4"/><path d="M3 10h18"/><circle cx="16.6" cy="14.6" r="1.1"/>',
  note:    '<rect x="4.4" y="3" width="15.2" height="18" rx="2.2"/><path d="M8.4 8h7.2M8.4 12h7.2M8.4 16h4.6"/>',
  target:  '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  building:'<path d="M4.4 21V4.4A1.4 1.4 0 0 1 5.8 3h8.4a1.4 1.4 0 0 1 1.4 1.4V21"/><path d="M15.6 9.6h3.2a1.4 1.4 0 0 1 1.4 1.4V21M3 21h18"/><path d="M8 7.4h1.2M11.4 7.4h1.2M8 11.4h1.2M11.4 11.4h1.2M8 15.4h1.2M11.4 15.4h1.2"/>',
  star:    '<path d="m12 3.4 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6L3.2 9.8l6.1-.9z"/>',
  check:   '<path d="m5 12.6 4.6 4.6L19 7.4"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  mail:    '<rect x="2.8" y="5" width="18.4" height="14" rx="2.2"/><path d="m3.4 6.6 8.6 6 8.6-6"/>',
  globe:   '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/><path d="M12 3.6c2.3 2.3 3.4 5.2 3.4 8.4s-1.1 6.1-3.4 8.4c-2.3-2.3-3.4-5.2-3.4-8.4s1.1-6.1 3.4-8.4z"/>',
  tag:     '<path d="M11.2 2.8H21v9.8l-9.4 9.4a1.6 1.6 0 0 1-2.3 0l-7.5-7.5a1.6 1.6 0 0 1 0-2.3z"/><circle cx="17" cy="7" r="1.5"/>',
  copy:    '<rect x="8.4" y="8.4" width="12.2" height="12.2" rx="2.2"/><path d="M15.6 5.6V4.8a1.4 1.4 0 0 0-1.4-1.4H4.8a1.4 1.4 0 0 0-1.4 1.4v9.4a1.4 1.4 0 0 0 1.4 1.4h.8"/>',
};

(function mountIcons(){
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = Object.entries(GLOWZ_ICONS).map(([k, v]) =>
    `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('');
  const put = () => document.body.prepend(svg);
  document.body ? put() : document.addEventListener('DOMContentLoaded', put);
})();
