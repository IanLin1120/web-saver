/* ============================================================
   核心：工具函式、圖示、主題、面板（sheet）、提示、原生橋接、頁面切換
   ============================================================ */
const APP_VERSION = '__VER__';
var GH = {user: 'IanLin1120', repo: 'web-saver',
  get pages(){ return 'https://' + this.user.toLowerCase() + '.github.io/' + this.repo + '/'; },
  get web(){ return 'https://github.com/' + this.user + '/' + this.repo; }};

function $(id){ return document.getElementById(id); }
function qs(s, r){ return (r || document).querySelector(s); }
function qsa(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
function lsGet(k, d){ try{ var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} if(typeof lsBackupSoon === 'function') lsBackupSoon(); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtSize(b){
  b = +b || 0;
  if(b < 1024) return b + ' B';
  if(b < 1048576) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
  if(b < 1073741824) return (b / 1048576).toFixed(b < 104857600 ? 1 : 0) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}
function fmtDate(t, full){
  var d = new Date(+t), now = new Date();
  var p = function(n){ return (n < 10 ? '0' : '') + n; };
  var hm = p(d.getHours()) + ':' + p(d.getMinutes());
  if(!full && d.toDateString() === now.toDateString()) return '今天 ' + hm;
  var y = new Date(now); y.setDate(now.getDate() - 1);
  if(!full && d.toDateString() === y.toDateString()) return '昨天 ' + hm;
  return (d.getFullYear() !== now.getFullYear() || full ? d.getFullYear() + '/' : '') + p(d.getMonth() + 1) + '/' + p(d.getDate()) + (full ? ' ' + hm : '');
}
function fmtDur(s){ s = Math.round(+s || 0); var m = Math.floor(s / 60); return (m >= 60 ? Math.floor(m / 60) + ':' + ('0' + m % 60).slice(-2) : m) + ':' + ('0' + s % 60).slice(-2); }
function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\./, ''); }catch(e){ return ''; } }
function h(tag, attrs){
  var el = document.createElement(tag);
  if(attrs) Object.keys(attrs).forEach(function(k){
    var v = attrs[k];
    if(v == null || v === false) return;
    if(k === 'class') el.className = v;
    else if(k === 'html') el.innerHTML = v;
    else if(k === 'text') el.textContent = v;
    else if(k.slice(0, 2) === 'on') el[k] = v;
    else if(k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  for(var i = 2; i < arguments.length; i++){
    var c = arguments[i];
    if(c == null || c === false) continue;
    if(Array.isArray(c)) c.forEach(function(x){ if(x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/* ---------- 圖示（線條 SVG） ---------- */
var IC = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  stop: '<path d="M6 6l12 12M18 6L6 18"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  fwd: '<path d="M9 5l7 7-7 7"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  books: '<path d="M4 19V5a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h12"/><path d="M9 7h6"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6L20 18M8.6 16.4L20 6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  book: '<path d="M2.5 5.5c3-1.5 6.5-1.5 9.5.5 3-2 6.5-2 9.5-.5v14c-3-1.5-6.5-1.5-9.5.5-3-2-6.5-2-9.5-.5z"/><path d="M12 6v14"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M14 6h7M14 12h5M14 18h3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  incog: '<path d="M3 11h18"/><path d="M6 11l1.5-5h9L18 11"/><circle cx="7.5" cy="16" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/><path d="M10 16h4"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  fingerprint: '<path d="M12 11v3.5a6 6 0 0 1-1.2 3.6"/><path d="M8.5 11a3.5 3.5 0 0 1 7 0v2.5c0 2.2-.6 4.3-1.7 6"/><path d="M5.5 15.5c.3-1 .5-2.1.5-3.2V11a6 6 0 0 1 10.7-3.7"/><path d="M18 11v2a16 16 0 0 1-.6 4.4"/><path d="M3.7 8A9.5 9.5 0 0 1 20 6.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  checks: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.5l3 3 5-6"/>',
  share: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  more: '<circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  html: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  pdf: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h5M8.5 13h7M8.5 17h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5.5-5.5L5 20"/>',
  video: '<rect x="2.5" y="5" width="14" height="14" rx="2.5"/><path d="M16.5 10l5-3v10l-5-3"/>',
  audio: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  sub: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6"/>',
  word: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h5"/><path d="M8 12l1.3 5 1.7-4 1.7 4 1.3-5"/>',
  excel: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h5"/><path d="M8.5 12l5 5M13.5 12l-5 5"/>',
  txt: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h5"/><path d="M8.5 12h7M8.5 15h7M8.5 18h4"/>',
  ppt: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h5"/><path d="M9.5 18v-6h2.5a2 2 0 0 1 0 4H9.5"/>',
  code: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  torch: '<path d="M8 3h8v3.5l-2 3V20a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V9.5l-2-3z"/><path d="M12 12.5v2"/>',
  listen: '<circle cx="12" cy="12" r="9.6"/><path d="M7.6 10.4v3.2M10.5 7.6v8.8M13.5 9.4v5.2M16.4 8.2v7.6"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18.2v2.3"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M8.5 21.5h7"/>',
  minus: '<path d="M5 12h14"/>',
  zip: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M11 3v2M11 7v2M11 11v2M10 15h2v3h-2z"/>',
  other: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h5"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/>',
  pc: '<rect x="2.5" y="4" width="19" height="12" rx="2"/><path d="M7 20h10M12 16v4"/>',
  inbox: '<path d="M3 13l2.5-8h13L21 13v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  type: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
  update: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H10"/>',
  storage: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9a4 4 0 0 1 0 9z"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  ytplay: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5M12 7.5V12l3 2"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>',
  grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'
};
function icon(name, cls){ return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24">' + (IC[name] || IC.other) + '</svg>'; }
function paintIcons(root){
  qsa('[data-ic]', root).forEach(function(el){
    if(el.__ic) return; el.__ic = 1;
    el.insertAdjacentHTML('afterbegin', icon(el.getAttribute('data-ic'), el.hasAttribute('data-sm') ? 'sm' : ''));
  });
}
var CAT = {
  html: {name: '網頁', ic: 'html', c: 'var(--c-html)'},
  pdf: {name: 'PDF', ic: 'pdf', c: 'var(--c-pdf)'},
  image: {name: '圖片', ic: 'image', c: 'var(--c-image)'},
  video: {name: '影片', ic: 'video', c: 'var(--c-video)'},
  audio: {name: '音樂', ic: 'audio', c: 'var(--c-audio)'},
  sub: {name: '字幕', ic: 'sub', c: '#4f8a8b'},
  word: {name: 'Word', ic: 'word', c: '#2f5fa8'},
  excel: {name: 'Excel', ic: 'excel', c: '#1f7a45'},
  ppt: {name: 'PPT', ic: 'ppt', c: '#c4512f'},
  txt: {name: '文字檔', ic: 'txt', c: '#7a6a55'},
  zip: {name: '壓縮檔', ic: 'zip', c: 'var(--c-zip)'},
  apk: {name: 'APK', ic: 'other', emo: '🤖', c: '#5d8a3a'},
  exe: {name: 'EXE', ic: 'other', emo: '🖥️', c: '#4a6fa5'},
  other: {name: '其他', ic: 'other', c: 'var(--c-other)'}
};

/* ---------- 原生橋接 ---------- */
var isApp = !!(window.WSB && typeof window.WSB.version === 'function');
var NAT = {
  call: function(fn){
    try{
      var a = Array.prototype.slice.call(arguments, 1);
      if(window.WSB && typeof window.WSB[fn] === 'function') return window.WSB[fn].apply(window.WSB, a);
    }catch(e){ console.error('WSB.' + fn, e); }
    return undefined;
  },
  has: function(fn){ return !!(window.WSB && typeof window.WSB[fn] === 'function'); },
  json: function(fn){ var r = NAT.call.apply(null, arguments); try{ return JSON.parse(r); }catch(e){ return null; } }
};
/* ---------- 設定與記錄的備份 ----------
   App 的設定、收藏、AI 記錄清單都放在瀏覽器的儲存空間（localStorage）。「清除 Cookie／網站資料」會把它一起清掉，
   所以：① 每次有變動就備份一份到 App 自己的檔案；② 啟動時發現是空的就從備份還原；③ 清除網站資料前後自動保留、寫回。 */
function lsSnapshot(){ var o = {}; try{ for(var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if(k && k.indexOf('ws.') === 0 && k.indexOf('ws.ai.') !== 0) o[k] = localStorage.getItem(k); } }catch(e){} return o; }
function lsPutBack(o){ var n = 0; try{ Object.keys(o || {}).forEach(function(k){ if(localStorage.getItem(k) == null){ localStorage.setItem(k, o[k]); n++; } }); }catch(e){} return n; }
var lsBackupT = 0;
function lsBackupSoon(){ if(!isApp || !NAT.has('lsBackup')) return; clearTimeout(lsBackupT); lsBackupT = setTimeout(function(){ try{ var o = lsSnapshot(); if(Object.keys(o).length) NAT.call('lsBackup', JSON.stringify(o)); }catch(e){} }, 3000); }
(function(){
  if(!isApp || !NAT.has('lsRestore')) return;
  try{
    var has = false; for(var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if(k && k.indexOf('ws.') === 0 && k !== 'ws.lang'){ has = true; break; } }
    if(!has){ var b = NAT.call('lsRestore'); if(b){ var n = lsPutBack(JSON.parse(b)); if(n) window.__lsRestored = n; } }
  }catch(e){}
  /* 會清掉網站資料的操作：先留一份，清完寫回去 */
  var call0 = NAT.call;
  NAT.call = function(fn, x, y){
    var wipe = (fn === 'clearData' && String(x).indexOf('cookies') >= 0) || (fn === 'brIncog' && x === false && y === true);
    var snap = wipe ? lsSnapshot() : null;
    var r = call0.apply(NAT, arguments);
    if(snap){ [600, 2000, 5000].forEach(function(ms){ setTimeout(function(){ lsPutBack(snap); }, ms); }); }
    return r;
  };
})();
document.documentElement.classList.add(isApp ? 'is-app' : 'is-web');

/* ---------- 事件匯流排（原生事件 → 各模組） ---------- */
var BUS = {};
function on(type, fn){ (BUS[type] = BUS[type] || []).push(fn); }
function fire(type, data){ (BUS[type] || []).forEach(function(fn){ try{ fn(data); }catch(e){ console.error(type, e); } }); }
window.onNativeEvent = function(type, data){
  var d = data;
  if(typeof data === 'string' && data && (data[0] === '{' || data[0] === '[')){ try{ d = JSON.parse(data); }catch(e){} }
  fire(type, d);
};

/* ---------- 提示 ---------- */
var toastT = 0;
function toast(msg, warn, action){
  /* 網頁或 YouTube 畫面上，App 的提示會被網頁蓋住：同時用手機系統的提示顯示 */
  try{ if(isApp && (curView === 'browse' || curView === 'yt') && !Sheets.stack.length && !(curView === 'browse' && BR.home)) NAT.call('nativeToast', String(msg)); }catch(e){}
  var t = $('toast'); $('toastT').textContent = msg;
  t.classList.toggle('warn', !!warn);
  var b = $('toastB');
  if(action){ b.textContent = action[0]; b.classList.remove('hide'); b.onclick = function(){ t.classList.remove('show'); action[1](); }; }
  else b.classList.add('hide');
  t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('show'); }, action ? 4800 : warn ? 3800 : 2400);
}
on('toast', function(d){ toast(d && d.msg || String(d)); });

/* ---------- 面板（從底部滑出）與對話框 ---------- */
var Sheets = {stack: []};
function coverNative(on){
  if(!isApp) return;
  NAT.call('cover', !!on);
  if(!on){ $('brSnap').classList.remove('on'); $('ytSnap').classList.remove('on'); var vs = $('vwSnap'); if(vs) vs.classList.remove('on'); }
}
on('snapYt', function(d){ if(d){ var s = $('ytSnap'); s.src = d; s.classList.add('on'); } });
on('snap', function(d){ if(d){ var s = $('brSnap'); s.src = d; s.classList.add('on'); } });
on('snapVw', function(d){ var s = $('vwSnap'); if(d && s){ s.src = d; s.classList.add('on'); } });

function openSheet(o){
  /* o: {title, icon, body(Node|html), foot(Node), tall, onClose, cls} */
  var wrap = h('div', {class: 'sheetWrap'});
  var bg = h('div', {class: 'sheetBg'});
  var sh = h('div', {class: 'sheet' + (o.tall ? ' tall' : '') + (o.cls ? ' ' + o.cls : '')});
  var grab = h('div', {class: 'grab'}, h('i'));
  var head = h('div', {class: 'sh-head'}, h('h3', {html: (o.icon ? icon(o.icon) : '') + '<span class="ell">' + esc(o.title || '') + '</span>'}), o.headExtra || null,
    h('button', {class: 'ib', html: icon('x'), onclick: function(){ api.close(); }}));
  var body = h('div', {class: 'sh-body'});
  if(typeof o.body === 'string') body.innerHTML = o.body; else if(o.body) body.appendChild(o.body);
  sh.appendChild(grab); sh.appendChild(head); sh.appendChild(body);
  if(o.foot) sh.appendChild(h('div', {class: 'sh-foot'}, o.foot));
  wrap.appendChild(bg); wrap.appendChild(sh);
  $('sheets').appendChild(wrap);
  paintIcons(wrap);
  if(!Sheets.stack.length) coverNative(true);
  var api = {el: sh, body: body, wrap: wrap, closed: false,
    close: function(){
      if(api.closed) return; api.closed = true;
      wrap.classList.remove('on');
      var i = Sheets.stack.indexOf(api); if(i >= 0) Sheets.stack.splice(i, 1);
      setTimeout(function(){ wrap.remove(); }, 320);
      if(!Sheets.stack.length) setTimeout(function(){ if(!Sheets.stack.length) coverNative(false); }, 200);
      if(o.onClose) o.onClose();
    },
    setTitle: function(t){ qs('h3 span', head).textContent = t; }
  };
  Sheets.stack.push(api);
  var openedAt = Date.now();
  /* 剛打開的 0.4 秒內不理背景點擊（避免同一下點擊把面板關掉） */
  bg.onclick = function(){ if(!o.modal && Date.now() - openedAt > 400) api.close(); };
  /* 下拉關閉 */
  var y0 = null, dy = 0;
  grab.addEventListener('pointerdown', function(e){ y0 = e.clientY; dy = 0; sh.style.transition = 'none'; grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', function(e){ if(y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = 'translateY(' + dy + 'px)'; });
  function end(){ if(y0 == null) return; y0 = null; sh.style.transition = ''; sh.style.transform = ''; if(dy > 90) api.close(); }
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ wrap.classList.add('on'); }); });
  return api;
}
function dialog(title, html, btns, opts){
  /* btns: [[label, fn, cls], …]；第一個是主要按鈕 */
  opts = opts || {};
  var wrap = h('div', {class: 'sheetWrap'});
  var bg = h('div', {class: 'sheetBg'});
  var box = h('div', {class: 'dlg'}, h('h3', {html: title}), h('div', {class: 'sub', style: {fontSize: '14px', color: 'var(--text-2)', lineHeight: '1.65'}, html: html}));
  var acts = h('div', {class: 'acts'});
  var api = {close: function(){
    if(api.closed) return; api.closed = true;
    wrap.classList.remove('on'); setTimeout(function(){ wrap.remove(); }, 260);
    var i = Sheets.stack.indexOf(api); if(i >= 0) Sheets.stack.splice(i, 1);
    if(!Sheets.stack.length) setTimeout(function(){ if(!Sheets.stack.length) coverNative(false); }, 150);
  }, el: box};
  (btns || [['好', null]]).forEach(function(b, i){
    acts.appendChild(h('button', {class: 'btn ' + (b[2] || (i === 0 ? 'pri' : '')), html: b[0], onclick: function(){ var keep = b[1] && b[1](box) === false; if(!keep) api.close(); }}));
  });
  box.appendChild(acts);
  wrap.appendChild(bg); wrap.appendChild(box);
  $('sheets').appendChild(wrap);
  if(!Sheets.stack.length) coverNative(true);
  Sheets.stack.push(api);
  var openedAt2 = Date.now();
  bg.onclick = function(){ if(!opts.modal && Date.now() - openedAt2 > 400) api.close(); };
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ wrap.classList.add('on'); }); });
  return api;
}
function confirmDlg(title, html, okLabel, danger){
  return new Promise(function(res){
    var done = false;
    var d = dialog(title, html, [[okLabel || '確定', function(){ done = true; res(true); }, danger ? 'dang' : 'pri'], ['取消', function(){ done = true; res(false); }, '']]);
    var oc = d.close; d.close = function(){ oc(); if(!done) res(false); };
  });
}
function promptDlg(title, value, placeholder, okLabel){
  return new Promise(function(res){
    var inp = h('input', {type: 'text', value: value || '', placeholder: placeholder || '', style: {width: '100%', marginTop: '6px'}});
    var d = dialog(title, '', [[okLabel || '確定', function(){ res(inp.value.trim()); }], ['取消', function(){ res(null); }, '']]);
    d.el.insertBefore(inp, d.el.querySelector('.acts'));
    inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ res(inp.value.trim()); d.close(); } });
    setTimeout(function(){ inp.focus(); inp.select(); }, 280);
  });
}
function menu(title, items){
  /* items: [[icon, label, fn, danger]] */
  var list = h('div', {class: 'opts'});
  var s = openSheet({title: title, body: list});
  /* items[5]（選用）：長按這一項時要做的事 */
  items.forEach(function(it){
    if(!it) return;
    var row = h('div', {class: 'opt', onclick: function(){ if(row._lp){ row._lp = false; return; } s.close(); setTimeout(it[2], 60); }},
      h('span', {class: 'oi', html: icon(it[0]), style: it[3] ? {color: 'var(--danger)', background: 'color-mix(in srgb,var(--danger) 14%,var(--surface-2))'} : null}),
      h('div', {class: 'grow'}, h('b', {text: it[1], style: it[3] ? {color: 'var(--danger)'} : null}), it[4] ? h('div', {class: 'sub', text: it[4]}) : null));
    if(it[5]){
      var t = 0, sx = 0, sy = 0;
      row.addEventListener('touchstart', function(e){ sx = e.touches[0].clientX; sy = e.touches[0].clientY; t = setTimeout(function(){ t = 0; row._lp = true; buzz(25); s.close(); setTimeout(it[5], 80); }, 480); }, {passive: true});
      row.addEventListener('touchmove', function(e){ if(t && (Math.abs(e.touches[0].clientX - sx) > 10 || Math.abs(e.touches[0].clientY - sy) > 10)){ clearTimeout(t); t = 0; } }, {passive: true});
      row.addEventListener('touchend', function(){ clearTimeout(t); t = 0; });
      row.addEventListener('contextmenu', function(e){ e.preventDefault(); row._lp = true; s.close(); setTimeout(it[5], 80); });
    }
    list.appendChild(row);
  });
  return s;
}

/* ---------- 底部任務卡（擷取、下載進度、密碼提示） ---------- */
var Dock = {
  cards: {},
  set: function(id, node, scope){
    if(scope) node.dataset.scope = scope;
    node.classList.toggle('hide', !!scope && scope !== curView);
    var old = this.cards[id];
    if(old && old.parentNode){ old.parentNode.replaceChild(node, old); }
    else $('dockCards').appendChild(node);
    this.cards[id] = node; paintIcons(node); Dock.changed();
  },
  scope: function(){ Object.keys(this.cards).forEach(function(k){ var n = Dock.cards[k]; if(n.dataset.scope) n.classList.toggle('hide', n.dataset.scope !== curView); }); Dock.changed(); },
  remove: function(id){ var n = this.cards[id]; if(n){ n.remove(); delete this.cards[id]; Dock.changed(); } },
  changed: function(){ requestAnimationFrame(function(){ var z = uiZoom(), hgt = $('dock').getBoundingClientRect().height / z, nb = $('nav').getBoundingClientRect(); document.documentElement.style.setProperty('--dock', Math.round(hgt) + 'px'); document.documentElement.style.setProperty('--nav', Math.round((innerHeight - nb.top) / z) + 'px'); fire('layout'); }); }
};
/* ---------- 進行中的工作（下載、擷取、轉檔…）：APK 版統一顯示在懸浮下載按鈕（綠色外圈＋選單），不再佔用底部 ---------- */
var Tasks = {
  m: {},
  set: function(id, o){
    var cur = this.m[id] || {t: Date.now()};
    this.m[id] = Object.assign(cur, o);
    if(!isApp) Dock.set(id, this.card(id));
    this.sync();
  },
  del: function(id){ var had = !!this.m[id]; delete this.m[id]; Dock.remove(id); if(had) this.sync(); },
  has: function(id){ return !!this.m[id]; },
  list: function(){ var m = this.m; return Object.keys(m).map(function(k){ return Object.assign({id: k}, m[k]); }).sort(function(a, b){ return a.t - b.t; }); },
  card: function(id){
    var o = this.m[id];
    return h('div', {class: 'dockCard glass'}, o.pct == null || o.pct < 0 ? h('div', {class: 'spin'}) : h('span', {html: ring(o.pct)}),
      h('div', {class: 't'}, h('b', {text: o.title || ''}), h('div', {class: 'sub ell', text: o.sub || ''})),
      o.cancel ? h('button', {class: 'btn sm ghost', text: '取消', onclick: function(){ o.cancel(); toast('正在取消…'); }}) : null);
  },
  sync: function(){
    if(this._p) return;
    var self = this;
    this._p = setTimeout(function(){
      self._p = 0;
      var L = self.list(), p = -1;
      if(L.length){ var sum = 0; L.forEach(function(x){ sum += x.pct > 0 ? Math.min(1, x.pct) : 0; }); p = Math.max(0.03, sum / L.length); }
      if(isApp) NAT.call('fabProg', p);
      fire('tasks', L);
    }, 120);
  }
};
function ring(pct){
  var r = 13, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return '<svg class="ring" viewBox="0 0 30 30"><circle cx="15" cy="15" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="4"/>' +
    '<circle cx="15" cy="15" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - p)) + '" transform="rotate(-90 15 15)"/></svg>';
}

function uiZoom(){ var z = parseFloat(document.documentElement.style.zoom); return z > 0 ? z : 1; }

/* ---------- 頁面切換 ---------- */
var VIEWS = ['browse', 'yt', 'ai', 'lib', 'set'];
var curView = 'browse';
function showView(v){
  if(VIEWS.indexOf(v) < 0) v = 'browse';
  if(v === curView && $('v-' + v).classList.contains('on')) { fire('reselect:' + v); return; }
  var prev = curView; curView = v;
  VIEWS.forEach(function(x){ $('v-' + x).classList.toggle('on', x === v); });
  qsa('#nav button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === v); });
  if(isApp) NAT.call('hideKeyboard');
  Dock.scope();
  fire('view', {v: v, prev: prev});
  lsSet('ws.view', v);
}
qsa('#nav button').forEach(function(b){ b.addEventListener('click', function(){ showView(b.dataset.v); }); });

/* 外部連結 */
function openExternal(u){ if(isApp) NAT.call('openUrl', u); else window.open(u, '_blank', 'noopener'); }
function copyText(t){
  try{ navigator.clipboard.writeText(t).then(function(){ toast('已複製'); }, function(){ fallback(); }); }catch(e){ fallback(); }
  function fallback(){ var ta = h('textarea', {style: {position: 'fixed', opacity: 0}}); ta.value = t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); toast('已複製'); }catch(e){} ta.remove(); }
}
function b64ToBlob(b64, mime){ var bin = atob(b64), u = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], {type: mime || 'application/octet-stream'}); }
function blobToB64(blob){
  return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(String(r.result).split(',')[1] || ''); }; r.onerror = function(){ rej(r.error); }; r.readAsDataURL(blob); });
}
function downloadBlob(blob, name){
  var a = h('a', {href: URL.createObjectURL(blob), download: name});
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* ---------- 長按拖動排序：震動＋提示線 ---------- */
function dragSort(list, onMove, opt){
  opt = opt || {};
  if(getComputedStyle(list).position === 'static') list.style.position = 'relative';
  var line = null, D = null;
  function rows(){ return Array.prototype.filter.call(list.children, function(x){ return x !== line && !x.classList.contains('dsLine'); }); }
  function scroller(){ var e = list; while(e && e !== document.body){ var o = getComputedStyle(e).overflowY; if((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight) return e; e = e.parentElement; } return null; }
  rows().forEach(function(row, idx){
    var t = 0, sy = 0, sx = 0;
    row.addEventListener('touchstart', function(e){
      if(e.touches.length > 1) return;
      sy = e.touches[0].clientY; sx = e.touches[0].clientX;
      clearTimeout(t);
      t = setTimeout(function(){ t = 0; begin(row, sy); }, opt.hold || 320);
    }, {passive: true});
    row.addEventListener('touchmove', function(e){
      var y = e.touches[0].clientY, x = e.touches[0].clientX;
      if(t && (Math.abs(y - sy) > 8 || Math.abs(x - sx) > 8)){ clearTimeout(t); t = 0; }
      if(D && D.row === row){ e.preventDefault(); move(y); }
    }, {passive: false});
    row.addEventListener('touchend', function(){ clearTimeout(t); t = 0; if(D && D.row === row) end(); });
    row.addEventListener('touchcancel', function(){ clearTimeout(t); t = 0; if(D && D.row === row) end(true); });
  });
  function begin(row, y){
    var R = rows();
    D = {row: row, from: R.indexOf(row), to: R.indexOf(row), y0: y, sc: scroller()};
    D.st0 = D.sc ? D.sc.scrollTop : 0;
    row.classList.add('dsDrag');
    line = h('div', {class: 'dsLine'}); list.appendChild(line);
    buzz(25);
    place();
    row.addEventListener('click', swallow, true);
  }
  function swallow(e){ e.stopPropagation(); e.preventDefault(); D || this.removeEventListener('click', swallow, true); }
  function move(y){
    var sc = D.sc;
    if(sc){ var r = sc.getBoundingClientRect(); if(y < r.top + 50) sc.scrollTop -= 8; else if(y > r.bottom - 50) sc.scrollTop += 8; }
    var dy = y - D.y0 + (sc ? sc.scrollTop - D.st0 : 0);
    D.row.style.transform = 'translateY(' + dy + 'px)';
    var R = rows(), to = 0;
    for(var i = 0; i < R.length; i++){ if(R[i] === D.row) continue; var b = R[i].getBoundingClientRect(); if(y > b.top + b.height / 2) to = i + 1; }
    if(to > D.from) to--;   /* 拿掉自己之後的位置 */
    to = Math.max(0, Math.min(R.length - 1, to));
    if(to !== D.to){ D.to = to; buzz(8); place(); }
  }
  function place(){
    var R = rows().filter(function(x){ return x !== D.row; });
    var lr = list.getBoundingClientRect(), y;
    if(D.to >= R.length){ var last = R[R.length - 1]; y = last ? last.getBoundingClientRect().bottom - lr.top : 0; }
    else y = R[D.to].getBoundingClientRect().top - lr.top;
    line.style.top = (y - 2 + list.scrollTop) + 'px';
  }
  function end(cancel){
    var d = D; D = null;
    d.row.classList.remove('dsDrag'); d.row.style.transform = '';
    if(line){ line.remove(); line = null; }
    setTimeout(function(){ d.row.removeEventListener('click', swallow, true); }, 50);
    if(!cancel && d.to !== d.from){ buzz(15); onMove(d.from, d.to); }
  }
}

/* ---------- 滑桿：要先在圓點上長按 0.2 秒才能拖動，拖動時每一格震動一下（避免捲動時誤觸） ---------- */
function holdRange(r, holdMs){
  holdMs = holdMs || 200;
  var t = 0, armed = false, sx = 0, sy = 0, last = 0, sc = null;
  function geo(){ var b = r.getBoundingClientRect(), tw = 22, min = +r.min || 0, max = +r.max || 100; return {b: b, tw: tw, min: min, max: max}; }
  function thumbX(g){ return g.b.left + g.tw / 2 + ((+r.value - g.min) / ((g.max - g.min) || 1)) * (g.b.width - g.tw); }
  function valAt(x, g){ var f = Math.max(0, Math.min(1, (x - g.b.left - g.tw / 2) / ((g.b.width - g.tw) || 1))), st = +r.step || 1, v = g.min + f * (g.max - g.min); return Math.round(v / st) * st; }
  r.addEventListener('touchstart', function(e){
    e.preventDefault();
    var p = e.touches[0]; sx = p.clientX; sy = p.clientY; last = sy; armed = false;
    sc = r.closest('.scroll, .sh-body, .view');
    var g = geo();
    if(Math.abs(sx - thumbX(g)) > 30) return;   /* 只有按在圓點上才算 */
    t = setTimeout(function(){ t = 0; armed = true; r.classList.add('hrArmed'); buzz(20); }, holdMs);
  }, {passive: false});
  r.addEventListener('touchmove', function(e){
    e.preventDefault();
    var p = e.touches[0];
    if(armed){
      var v = valAt(p.clientX, geo());
      if(v !== +r.value){ r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); buzz(6); }
      return;
    }
    if(t && (Math.abs(p.clientX - sx) > 8 || Math.abs(p.clientY - sy) > 8)){ clearTimeout(t); t = 0; }
    if(sc){ sc.scrollTop -= (p.clientY - last); }   /* 沒長按就當作捲動畫面 */
    last = p.clientY;
  }, {passive: false});
  function up(){ clearTimeout(t); t = 0; if(armed){ armed = false; r.classList.remove('hrArmed'); r.dispatchEvent(new Event('change', {bubbles: true})); } }
  r.addEventListener('touchend', up);
  r.addEventListener('touchcancel', up);
  return r;
}

/* ---------- 所有可以點的地方（按鈕、卡片、選項、分類、清單項目、開關…）：點下去輕震一下 ---------- */
var BUZZ_SEL = 'button, a[href], label, select, input[type=checkbox], input[type=radio], summary, [role=button], .tile, .chip, .setRow, .opt, .bmItem, .row, .hoBtn, .ydRow, .ydMore, .aiHRow, .aiFRow, .aiLine, .aiCh, .crumb, .crumbs > *, .fav';
var lastBuzzT = 0;
document.addEventListener('click', function(e){
  if(typeof buzz !== 'function' || !e.target.closest) return;
  var el = e.target, hit = null;
  /* 往上找：有 onclick 的元素或常見的可點元件 */
  for(var n = el, k = 0; n && n !== document.body && k < 8; n = n.parentElement, k++){
    if(n.onclick || (n.matches && n.matches(BUZZ_SEL))){ hit = n; break; }
  }
  if(!hit || hit.disabled || hit.classList.contains('dis')) return;
  if(hit.tagName === 'LABEL' && e.target.tagName === 'INPUT') return;   /* 點 label 會再觸發一次 input 的 click，只震一次 */
  var now = Date.now(); if(now - lastBuzzT < 60) return; lastBuzzT = now;
  buzz(10);
}, true);
