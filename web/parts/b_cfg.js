/* ============================================================
   設定值、主題配色、介面大小
   ============================================================ */
var CFG_DEF = {
  theme: 'auto', palette: 'earth', uiScale: 100, motion: true, haptic: 2,
  mode: 'mobile', textZoom: 100, home: '', search: 'google', popups: 'smart',
  ads: true, adHosts: '', adCss: '', adAllow: '', pw: true,
  cap: {format: 'html', mode: 'full', removeAds: true, reader: false, embedImages: true, imgQ: 'orig', embedFonts: true, removeHidden: true, autoScroll: true, bg: true, banner: true, nameTpl: '{title}', paper: 'a4', landscape: false, margin: 10},
  media: {imgFmt: 'orig', imgMax: 0, imgQ: 90, minPx: 120, vidQ: 'max', vidOut: 'mp4', zip: true, audFmt: 'orig', nameMode: 'orig', customName: '', seqOn: true, seqMode: 'page', seqDigits: 3, seqSep: '_'},
  ytAds: true,
  yt: {bg: true, pip: true, sb: true, q: 'max', gest: true, bar: true, speed: true, skin: true, ryd: true, noShorts: false, codec: 'vp9'},
  fab: true,
  shareAsk: true,
  webVp: true,
  lib: {sort: 'time', dir: 'desc', view: 'grid', cat: 'all'},
  autoExport: false,
  proxies: 'https://corsproxy.io/?url={url}\nhttps://api.allorigins.win/raw?url={url}\nhttps://api.codetabs.com/v1/proxy?quest={url}'
};
function deepMerge(a, b){
  var o = Array.isArray(a) ? a.slice() : Object.assign({}, a);
  Object.keys(b || {}).forEach(function(k){
    if(b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') o[k] = deepMerge(a[k], b[k]);
    else o[k] = b[k];
  });
  return o;
}
var CFG = deepMerge(CFG_DEF, lsGet('ws.cfg', {}));
function saveCfg(){ lsSet('ws.cfg', CFG); }

var SEARCH = {
  google: ['Google', 'https://www.google.com/search?q='],
  bing: ['Bing', 'https://www.bing.com/search?q='],
  ddg: ['DuckDuckGo', 'https://duckduckgo.com/?q='],
  yahoo: ['Yahoo 奇摩', 'https://tw.search.yahoo.com/search?p='],
  baidu: ['百度', 'https://www.baidu.com/s?wd=']
};

/* 配色：背景、卡片、內文都維持大地色系，只換「重點色」（按鈕、選取中的項目、標題、圖示的顏色）。
   每個顏色都分淺色／深色主題各調一次，確保在米色或深咖啡底上都清楚好讀。 */
var PALETTES = {
  earth: {name: '大地棕', sw: '#a2613a', sd: '#e0a066'},
  moss: {name: '苔蘚綠', sw: '#5a7a44', sd: '#a8c787',
    l: {accent: '#5a7a44', 'accent-2': '#47622f'}, d: {accent: '#a8c787', 'accent-2': '#bcd69e', 'accent-fg': '#1a2410'}},
  teal: {name: '青瓷', sw: '#3f7a74', sd: '#86c4bb',
    l: {accent: '#3f7a74', 'accent-2': '#30625d'}, d: {accent: '#86c4bb', 'accent-2': '#9fd3cb', 'accent-fg': '#0d2421'}},
  indigo: {name: '靛藍', sw: '#3f6185', sd: '#97b7dc',
    l: {accent: '#3f6185', 'accent-2': '#304d6c'}, d: {accent: '#97b7dc', 'accent-2': '#adc7e6', 'accent-fg': '#0f1d2c'}},
  plum: {name: '紫藤', sw: '#6e5896', sd: '#b9a6e0',
    l: {accent: '#6e5896', 'accent-2': '#59467c'}, d: {accent: '#b9a6e0', 'accent-2': '#cabbe9', 'accent-fg': '#1e1430'}},
  rose: {name: '玫瑰', sw: '#a94f66', sd: '#eba0b2',
    l: {accent: '#a94f66', 'accent-2': '#8d3f54'}, d: {accent: '#eba0b2', 'accent-2': '#f2b5c3', 'accent-fg': '#2c0f17'}},
  amber: {name: '琥珀', sw: '#9a6b12', sd: '#e3b55a',
    l: {accent: '#9a6b12', 'accent-2': '#7e570d'}, d: {accent: '#e3b55a', 'accent-2': '#ecc679', 'accent-fg': '#2a1d04'}},
  ink: {name: '墨黑', sw: '#3f3a34', sd: '#ddd2c2',
    l: {accent: '#3f3a34', 'accent-2': '#2c2824'}, d: {accent: '#ddd2c2', 'accent-2': '#ebe2d5', 'accent-fg': '#1e1a15'}}
};
function isDark(){
  if(CFG.theme === 'dark') return true;
  if(CFG.theme === 'light') return false;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
}
var palStyle = null;
function applyTheme(){
  var root = document.documentElement;
  if(CFG.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', CFG.theme);
  if(!PALETTES[CFG.palette]){ var old = {olive: 'moss', ocean: 'indigo', wine: 'rose', graphite: 'ink', sakura: 'rose'}[CFG.palette]; CFG.palette = old || 'earth'; }
  var p = PALETTES[CFG.palette] || PALETTES.earth;
  var vars = (isDark() ? p.d : p.l) || {};
  if(!palStyle){ palStyle = document.createElement('style'); palStyle.id = 'palStyle'; document.head.appendChild(palStyle); }
  palStyle.textContent = ':root:root{' + Object.keys(vars).map(function(k){ return '--' + k + ':' + vars[k]; }).join(';') + '}';
  root.classList.toggle('no-motion', !CFG.motion);
  root.style.zoom = CFG.uiScale && CFG.uiScale !== 100 ? (CFG.uiScale / 100) : '';
  var bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#efe5d3';
  var meta = qs('meta[name="theme-color"]'); if(meta) meta.setAttribute('content', bg);
  if(isApp) NAT.call('theme', bg, isDark());
  fire('layout');
}
if(window.matchMedia) try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){ if(CFG.theme === 'auto') applyTheme(); }); }catch(e){}

function pushNativeCfg(){
  if(!isApp) return;
  NAT.call('brConfig', JSON.stringify({mode: CFG.mode, textZoom: CFG.textZoom, popups: CFG.popups, ads: CFG.ads, ytAds: CFG.ytAds, yt: CFG.yt, pw: CFG.pw, adHosts: CFG.adHosts, adCss: CFG.adCss, adAllow: CFG.adAllow}));
  NAT.call('setPref', 'autoExport', CFG.autoExport ? '1' : '0');
  NAT.call('setPref', 'webVp', CFG.webVp === false ? '0' : '1');
}
function setCfg(path, val, opts){
  var ks = path.split('.'), o = CFG;
  for(var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = val;
  saveCfg();
  if(/^(theme|palette|uiScale|motion)$/.test(path)) applyTheme();
  if(/^(mode|textZoom|popups|ads|ytAds|yt\..*|pw|adHosts|adCss|adAllow|autoExport)$/.test(path) && !(opts && opts.noPush)) pushNativeCfg();
  fire('cfg', path);
}

/* 小工具：產生設定元件 */
function swRow(label, sub, path, onchg){
  var cur = path.split('.').reduce(function(o, k){ return o[k]; }, CFG);
  var inp = h('input', {type: 'checkbox'}); inp.checked = !!cur;
  inp.onchange = function(){ setCfg(path, inp.checked); if(onchg) onchg(inp.checked); };
  return h('label', {class: 'lab'}, h('span', null, label, sub ? h('span', {class: 'sub', html: sub}) : null), h('span', {class: 'sw'}, inp, h('span')));
}
function segRow(items, path, onchg){
  var cur = path.split('.').reduce(function(o, k){ return o[k]; }, CFG);
  var seg = h('div', {class: 'seg'});
  items.forEach(function(it){
    seg.appendChild(h('button', {class: String(it[0]) === String(cur) ? 'on' : '', html: (it[2] ? icon(it[2], 'sm') : '') + esc(it[1]), onclick: function(){
      qsa('button', seg).forEach(function(b){ b.classList.remove('on'); }); this.classList.add('on');
      setCfg(path, it[0]); if(onchg) onchg(it[0]);
    }}));
  });
  return seg;
}
function selRow(label, items, path, onchg){
  var cur = path.split('.').reduce(function(o, k){ return o[k]; }, CFG);
  var s = h('select');
  items.forEach(function(it){ var o = h('option', {value: it[0]}, it[1]); if(String(it[0]) === String(cur)) o.selected = true; s.appendChild(o); });
  s.onchange = function(){ var v = s.value; var num = items.some(function(it){ return typeof it[0] === 'number'; }); setCfg(path, num ? +v : v); if(onchg) onchg(v); };
  return h('div', {class: 'field'}, h('div', {class: 'lbl'}, h('span', null, label)), s);
}
function rangeRow(label, path, min, max, step, fmt, onchg){
  var cur = path.split('.').reduce(function(o, k){ return o[k]; }, CFG);
  var val = h('span', {text: fmt(cur)});
  var r = h('input', {type: 'range', min: min, max: max, step: step, value: cur});
  r.oninput = function(){ val.textContent = fmt(+r.value); };
  r.onchange = function(){ setCfg(path, +r.value); if(onchg) onchg(+r.value); };
  holdRange(r);
  return h('div', {class: 'field'}, h('div', {class: 'lbl'}, h('span', null, label), val), r);
}
function paletteRow(){
  var box = h('div', {class: 'pal'});
  Object.keys(PALETTES).forEach(function(k){
    var p = PALETTES[k];
    var bt = h('button', {class: CFG.palette === k ? 'on' : '', title: p.name, onclick: function(){
      qsa('button', box).forEach(function(b){ b.classList.remove('on'); }); this.classList.add('on'); setCfg('palette', k); toast('配色：' + p.name);
    }}, h('b', {text: 'Aa'}), h('i'), h('small', {text: p.name}));
    bt.style.setProperty('--pcl', p.sw); bt.style.setProperty('--pcd', p.sd);
    box.appendChild(bt);
  });
  return box;
}
