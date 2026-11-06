/* ============================================================
   設定值、主題配色、介面大小
   ============================================================ */
var CFG_DEF = {
  theme: 'auto', palette: 'earth', uiScale: 100, motion: true,
  mode: 'mobile', textZoom: 100, home: '', search: 'google', popups: 'smart',
  ads: true, adHosts: '', adCss: '', adAllow: '', pw: true,
  cap: {format: 'html', mode: 'full', removeAds: true, reader: false, embedImages: true, imgQ: 'orig', embedFonts: true, removeHidden: true, autoScroll: true, bg: true, banner: true, nameTpl: '{title}', paper: 'a4', landscape: false, margin: 10},
  media: {imgFmt: 'orig', imgMax: 0, imgQ: 90, minPx: 120, vidQ: 'max', vidOut: 'mp4', zip: true, audFmt: 'orig', nameMode: 'orig', customName: '', seqOn: true, seqMode: 'page', seqDigits: 3, seqSep: '_'},
  ytAds: true,
  yt: {bg: true, pip: true, sb: true, q: 'max', gest: true, bar: true, speed: true, skin: true, ryd: true, noShorts: false, codec: 'vp9'},
  fab: true,
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

/* 配色：只覆寫需要的色票；地球棕是預設 */
var PALETTES = {
  earth: {name: '大地棕', sw: '#a2613a'},
  olive: {name: '橄欖綠', sw: '#6f7d4c',
    l: {accent: '#5f7a3c', 'accent-2': '#4c6330', olive: '#a2613a', bg: '#ebe9d6', 'bg-2': '#c9cfa6', surface: '#f2f1e1', 'surface-2': '#e4e4cc', 'surface-3': '#f7f7ea', text: '#2f3322', 'text-2': '#4d5236', 'text-muted': '#71765a'},
    d: {accent: '#b4c77e', 'accent-2': '#c6d78f', olive: '#e0a066', bg: '#171a12', 'bg-2': '#2e3521', surface: '#22261a', 'surface-2': '#2a2f20', 'surface-3': '#323826', 'accent-fg': '#1b200c'}},
  ocean: {name: '湖水藍', sw: '#2f6f8f',
    l: {accent: '#2f6f8f', 'accent-2': '#245a75', olive: '#4f8a7a', bg: '#e4ecee', 'bg-2': '#b5ccd4', surface: '#edf3f4', 'surface-2': '#dbe6e9', 'surface-3': '#f5f9fa', text: '#1f3039', 'text-2': '#3b5260', 'text-muted': '#5f7684', border: '#9fb7c0', 'border-soft': 'rgba(40,80,100,.25)'},
    d: {accent: '#7cc0e0', 'accent-2': '#97d0ea', olive: '#8cc7b5', bg: '#10171b', 'bg-2': '#1f3440', surface: '#18232a', 'surface-2': '#1e2b33', 'surface-3': '#24343d', text: '#dcebf2', 'text-2': '#a9c4d1', 'text-muted': '#87a2af', 'accent-fg': '#08202c', border: '#36505e'}},
  wine: {name: '酒紅', sw: '#8e3b46',
    l: {accent: '#8e3b46', 'accent-2': '#732f39', olive: '#7a7448', bg: '#f0e5e3', 'bg-2': '#d8b6b2', surface: '#f5edeb', 'surface-2': '#eadbd8', 'surface-3': '#faf4f3', text: '#3a2326', 'text-2': '#5a3a3e', 'text-muted': '#7e6064'},
    d: {accent: '#e88c98', 'accent-2': '#f2a4ae', bg: '#1c1213', 'bg-2': '#3b2226', surface: '#2a1b1d', 'surface-2': '#332124', 'surface-3': '#3c272a', 'accent-fg': '#2a0a0f'}},
  graphite: {name: '石墨灰', sw: '#4a5560',
    l: {accent: '#45505c', 'accent-2': '#363f49', olive: '#7b8a6a', bg: '#e9e8e5', 'bg-2': '#c7c6c1', surface: '#f1f0ed', 'surface-2': '#e2e1dd', 'surface-3': '#f7f7f5', text: '#25282b', 'text-2': '#45494e', 'text-muted': '#6c7177', border: '#aeb0b2', 'border-soft': 'rgba(60,65,70,.22)'},
    d: {accent: '#c3ccd6', 'accent-2': '#d6dde4', olive: '#a9b88f', bg: '#131416', 'bg-2': '#2a2d31', surface: '#1d1f22', 'surface-2': '#24272a', 'surface-3': '#2c2f33', text: '#e6e8ea', 'text-2': '#b9bec4', 'text-muted': '#959ba2', 'accent-fg': '#16191c', border: '#474c52'}},
  sakura: {name: '櫻花粉', sw: '#c0607a',
    l: {accent: '#b8566f', 'accent-2': '#9c465c', olive: '#7d8a5a', bg: '#f5e8eb', 'bg-2': '#e5bfc9', surface: '#f9eff1', 'surface-2': '#f0dde2', 'surface-3': '#fdf6f7', text: '#3b2329', 'text-2': '#5e3e46', 'text-muted': '#85646c'},
    d: {accent: '#f0a0b6', 'accent-2': '#f6b7c8', bg: '#1c1215', 'bg-2': '#3d2530', surface: '#2a1c20', 'surface-2': '#332227', 'surface-3': '#3d2a2f', 'accent-fg': '#2c0c16'}}
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
  return h('div', {class: 'field'}, h('div', {class: 'lbl'}, h('span', null, label), val), r);
}
function paletteRow(){
  var box = h('div', {class: 'pal'});
  Object.keys(PALETTES).forEach(function(k){
    var p = PALETTES[k];
    box.appendChild(h('button', {class: CFG.palette === k ? 'on' : '', title: p.name, style: {background: 'linear-gradient(140deg,' + p.sw + ',' + p.sw + 'aa)'}, onclick: function(){
      qsa('button', box).forEach(function(b){ b.classList.remove('on'); }); this.classList.add('on'); setCfg('palette', k); toast('配色：' + p.name);
    }}));
  });
  return box;
}
