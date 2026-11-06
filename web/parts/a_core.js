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
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
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
  zip: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M11 3v2M11 7v2M11 11v2M10 15h2v3h-2z"/>',
  other: '<path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h5"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/>',
  pc: '<rect x="2.5" y="4" width="19" height="12" rx="2"/><path d="M7 20h10M12 16v4"/>',
  inbox: '<path d="M3 13l2.5-8h13L21 13v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
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
  audio: {name: '音訊', ic: 'audio', c: 'var(--c-audio)'},
  zip: {name: '壓縮檔', ic: 'zip', c: 'var(--c-zip)'},
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
  if(!on){ $('brSnap').classList.remove('on'); var vs = $('vwSnap'); if(vs) vs.classList.remove('on'); }
}
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
  bg.onclick = function(){ if(!o.modal) api.close(); };
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
  bg.onclick = function(){ if(!opts.modal) api.close(); };
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
  items.forEach(function(it){
    if(!it) return;
    list.appendChild(h('div', {class: 'opt', onclick: function(){ s.close(); setTimeout(it[2], 60); }},
      h('span', {class: 'oi', html: icon(it[0]), style: it[3] ? {color: 'var(--danger)', background: 'color-mix(in srgb,var(--danger) 14%,var(--surface-2))'} : null}),
      h('div', {class: 'grow'}, h('b', {text: it[1], style: it[3] ? {color: 'var(--danger)'} : null}), it[4] ? h('div', {class: 'sub', text: it[4]}) : null)));
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
  changed: function(){ requestAnimationFrame(function(){ var hgt = $('dock').getBoundingClientRect().height / uiZoom(); document.documentElement.style.setProperty('--dock', Math.round(hgt) + 'px'); fire('layout'); }); }
};
function ring(pct){
  var r = 13, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return '<svg class="ring" viewBox="0 0 30 30"><circle cx="15" cy="15" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="4"/>' +
    '<circle cx="15" cy="15" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - p)) + '" transform="rotate(-90 15 15)"/></svg>';
}

function uiZoom(){ var z = parseFloat(document.documentElement.style.zoom); return z > 0 ? z : 1; }

/* ---------- 頁面切換 ---------- */
var VIEWS = ['browse', 'lib', 'set'];
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
