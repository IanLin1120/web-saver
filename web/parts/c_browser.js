/* ============================================================
   瀏覽頁：網址列、導覽、起始頁、收藏、快速設定、密碼提示
   APK：原生 WebView 疊在 #brArea 上；網頁版：透過代理讀取網頁，顯示在 iframe（不執行網頁程式）
   ============================================================ */
var BR = {url: '', title: '', host: '', progress: 100, back: false, fwd: false, loaded: false, home: true, secure: false, blocked: 0, mediaN: 0, zap: false};

/* ---------- 版面同步（原生瀏覽器的位置） ---------- */
function syncLayout(){
  var top = $('brTop').getBoundingClientRect();
  document.documentElement.style.setProperty('--brTop', Math.round(top.bottom / uiZoom() + 6) + 'px');
  if(!isApp) return;
  requestAnimationFrame(function(){
    var a = $('brArea').getBoundingClientRect();
    NAT.call('brRect', a.top, Math.max(0, innerHeight - a.bottom), a.left, Math.max(0, innerWidth - a.right));
    updateBrVisible();
  });
}
function updateBrVisible(){
  if(!isApp) return;
  var on = curView === 'browse' && BR.loaded && !BR.home && !Viewer.isOpen();
  NAT.call('brShow', on);
  $('brArea').classList.toggle('page', BR.loaded && !BR.home);
}
on('layout', syncLayout);
on('view', function(){ syncLayout(); updateBrVisible(); });
window.addEventListener('resize', function(){ clearTimeout(syncLayout.t); syncLayout.t = setTimeout(syncLayout, 60); });
if(window.ResizeObserver) new ResizeObserver(function(){ syncLayout(); }).observe($('brTop'));

/* ---------- 網址列 ---------- */
function looksLikeUrl(s){
  return /^(https?:\/\/|about:|data:)/i.test(s) || (/^[^\s]+\.[a-z]{2,}(:\d+)?([\/?#].*)?$/i.test(s) && !/\s/.test(s)) || /^localhost(:\d+)?/.test(s) || /^\d+\.\d+\.\d+\.\d+/.test(s);
}
function toUrl(s){
  s = (s || '').trim();
  if(!s) return '';
  if(looksLikeUrl(s)) return /^[a-z]+:/i.test(s) ? s : 'https://' + s;
  return (SEARCH[CFG.search] || SEARCH.google)[1] + encodeURIComponent(s);
}
var urlIn = $('urlIn');
function setUrlText(){
  if(document.activeElement === urlIn) return;
  urlIn.value = BR.home || !BR.url ? '' : (BR.host && BR.url.indexOf('http') === 0 ? decodeURI(BR.url).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : BR.url);
  var lk = $('urlLock');
  lk.innerHTML = icon(BR.home || !BR.url ? 'search' : (BR.secure ? 'lock' : 'globe'), 'sm');
  lk.classList.toggle('warn', !BR.secure || BR.home);
}
urlIn.addEventListener('focus', function(){
  $('urlBox').classList.add('focus');
  if(!BR.home && BR.url) urlIn.value = BR.url;
  setTimeout(function(){ if(document.activeElement === urlIn) urlIn.select(); }, 30);
  $('urlClear').classList.remove('hide');
});
urlIn.addEventListener('blur', function(){ $('urlBox').classList.remove('focus'); setTimeout(function(){ $('urlClear').classList.add('hide'); setUrlText(); }, 150); });
urlIn.addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); var u = toUrl(urlIn.value); urlIn.blur(); if(u) navigate(u); }
});
$('urlClear').classList.add('hide');
$('urlClear').addEventListener('mousedown', function(e){ e.preventDefault(); urlIn.value = ''; urlIn.focus(); });
$('urlClear').addEventListener('click', function(){ urlIn.value = ''; urlIn.focus(); });
urlIn.addEventListener('paste', function(){ setTimeout(function(){ var v = urlIn.value.trim(); if(/^https?:\/\/\S+$/.test(v)){ urlIn.blur(); navigate(v); } }, 10); });
$('urlAct').addEventListener('click', function(){
  if(BR.home){ urlIn.focus(); return; }
  if(BR.progress < 100){ if(isApp) NAT.call('brNav', 'stop'); else WEB.stop(); }
  else { if(isApp) NAT.call('brNav', 'reload'); else WEB.load(BR.url, false); }
});

function navigate(url){
  if(!url) return;
  if(curView !== 'browse') showView('browse');
  BR.home = false; BR.loaded = true;
  $('startPage').classList.add('hide');
  rememberRecent(url);
  if(isApp){ NAT.call('brLoad', url); BR.url = url; BR.progress = 5; renderBr(); updateBrVisible(); syncLayout(); }
  else WEB.load(url, true);
}
function goHome(){
  BR.home = true;
  if(typeof fabClear === 'function') fabClear();
  $('startPage').classList.remove('hide');
  renderStart();
  updateBrVisible();
  if(!isApp) $('webFrame').classList.remove('on');
  renderBr();
}
function leaveHome(){
  if(!BR.loaded) return false;
  BR.home = false;
  $('startPage').classList.add('hide');
  if(!isApp) $('webFrame').classList.add('on');
  updateBrVisible(); renderBr(); return true;
}
$('bHome').addEventListener('click', function(){ if(BR.home) leaveHome(); else goHome(); });
$('bBack').addEventListener('click', function(){
  if(BR.home){ leaveHome(); return; }
  if(isApp) NAT.call('brNav', 'back'); else WEB.back();
});
$('bFwd').addEventListener('click', function(){ if(isApp) NAT.call('brNav', 'fwd'); else WEB.fwd(); });

function renderBr(){
  setUrlText();
  var loading = !BR.home && BR.progress < 100;
  $('urlAct').innerHTML = icon(BR.home ? 'search' : loading ? 'stop' : 'reload', 'sm');
  var bar = $('brBar'); bar.classList.toggle('on', loading);
  bar.firstChild.style.width = (loading ? Math.max(8, BR.progress) : 100) + '%';
  $('bBack').disabled = BR.home ? !BR.loaded : !BR.back;
  $('bFwd').disabled = BR.home || !BR.fwd;
  var page = !BR.home && BR.loaded && !!BR.url && !/^(about|data):/.test(BR.url);
  $('bCap').disabled = !page; $('bMedia').disabled = !page; $('bStar').disabled = !page; $('bZap').disabled = !page;
  var bm = page && BM.find(BR.url);
  $('bStar').innerHTML = '<svg class="i' + (bm ? ' fill' : '') + '" viewBox="0 0 24 24">' + IC.star + '</svg>';
  $('bStar').classList.toggle('on', !!bm);
  $('mediaN').textContent = BR.mediaN > 99 ? '99+' : BR.mediaN;
  $('bMode').innerHTML = icon(CFG.mode === 'desktop' ? 'monitor' : CFG.mode === 'reader' ? 'book' : 'phone');
  $('bMode').classList.toggle('on', CFG.mode !== 'mobile');
  $('bZap').classList.toggle('on', BR.zap);
  $('bHome').classList.toggle('on', BR.home);
}

on('br', function(d){
  if(!d) return;
  var urlChanged = d.url !== BR.url;
  BR.url = d.url || ''; BR.title = d.title || ''; BR.host = d.host || hostOf(BR.url); BR.progress = d.progress; BR.back = d.back; BR.fwd = d.fwd; BR.secure = d.secure; BR.blocked = d.blocked || 0;
  if(urlChanged){ BR.mediaN = 0; Dock.remove('credAvail'); if(BR.zap){ BR.zap = false; Dock.remove('zap'); } }
  if(BR.url && !/^about:/.test(BR.url) && BR.home && urlChanged && BR.loaded){ BR.home = false; $('startPage').classList.add('hide'); updateBrVisible(); }
  renderBr();
});
on('mediaCount', function(d){ BR.mediaN = (d.dom || 0) + (d.net || 0); renderBr(); });
on('openUrl', function(u){ u = String(u); if(isApp && YT.idOf(u)){ ytOpen('https://m.youtube.com/watch?v=' + YT.idOf(u)); return; } navigate(u); });

/* ---------- 版面模式（手機版／電腦版／閱讀模式） ---------- */
var MODES = [['mobile', '手機版', 'phone', '一般手機網頁'], ['desktop', '電腦版', 'monitor', '要求網站顯示電腦版版面'], ['reader', '閱讀模式', 'book', '只顯示文章內容，去除干擾']];
function setMode(m){
  setCfg('mode', m);
  renderBr();
  toast('已切換：' + MODES.filter(function(x){ return x[0] === m; })[0][1]);
  if(!isApp && BR.loaded && !BR.home) WEB.load(BR.url, false);
}
$('bMode').addEventListener('click', function(){
  menu('版面模式', MODES.map(function(m){ return [m[2], m[1] + (CFG.mode === m[0] ? '　✓' : ''), function(){ setMode(m[0]); }, false, m[3]]; }));
});

/* ---------- 收藏 ---------- */
var BM = lsGet('ws.bm', null) || {folders: [{id: 'f_def', name: '未分類', icon: '📁'}, {id: 'f_read', name: '稍後閱讀', icon: '📖'}], items: []};
BM.save = function(){ lsSet('ws.bm', {folders: BM.folders, items: BM.items}); };
BM.norm = function(u){ return String(u || '').replace(/#.*$/, '').replace(/\/$/, ''); };
BM.find = function(u){ var n = BM.norm(u); return BM.items.filter(function(x){ return BM.norm(x.url) === n; })[0]; };
BM.folder = function(id){ return BM.folders.filter(function(f){ return f.id === id; })[0] || BM.folders[0]; };
BM.count = function(fid){ return BM.items.filter(function(x){ return x.folder === fid; }).length; };
var FOLDER_ICONS = ['📁', '⭐', '📖', '📰', '🛒', '🍳', '🎬', '🎵', '💼', '📚', '✈️', '💡', '🧪', '🏠', '❤️', '🎮', '🏃', '💰', '🧾', '🔧'];
function favEl(it, sm){
  var letter = (it.title || hostOf(it.url) || '?').replace(/^www\./, '').trim().charAt(0).toUpperCase();
  return h('div', {class: 'fav' + (sm ? ' sm' : ''), html: it.icon ? '<img src="' + esc(it.icon) + '" alt="">' : esc(letter)});
}
async function newFolderDlg(){
  var name = await promptDlg('新增收藏夾', '', '例如：食譜、工作、旅遊');
  if(!name) return null;
  var f = {id: 'f' + uid(), name: name.slice(0, 30), icon: FOLDER_ICONS[(BM.folders.length + 1) % FOLDER_ICONS.length]};
  BM.folders.push(f); BM.save(); return f;
}
function folderChips(sel, onPick, opts){
  opts = opts || {};
  var box = h('div', {class: 'chips'});
  function draw(){
    box.textContent = '';
    if(opts.all) box.appendChild(h('button', {class: 'fchip' + (sel === '' ? ' on' : ''), onclick: function(){ sel = ''; draw(); onPick(''); }}, '全部 ', h('span', {class: 'c', text: BM.items.length})));
    BM.folders.forEach(function(f){
      box.appendChild(h('button', {class: 'fchip' + (sel === f.id ? ' on' : ''), onclick: function(){ sel = f.id; draw(); onPick(f.id); }}, f.icon + ' ' + f.name + ' ', h('span', {class: 'c', text: BM.count(f.id)})));
    });
    if(opts.add !== false) box.appendChild(h('button', {class: 'fchip add', html: icon('plus', 'sm') + '新增收藏夾', onclick: async function(){ var f = await newFolderDlg(); if(f){ sel = f.id; draw(); onPick(f.id); } }}));
  }
  draw();
  box.redraw = draw;
  return box;
}
function openStar(){
  if(!BR.url) return;
  var ex = BM.find(BR.url);
  var it = ex || {id: 'b' + uid(), url: BR.url, title: BR.title || BR.host, folder: lsGet('ws.lastFolder', BM.folders[0].id), time: Date.now(), icon: isApp ? (NAT.call('brFavicon') || '') : ''};
  var sel = it.folder;
  var title = h('input', {type: 'text', value: it.title});
  var body = h('div', null,
    h('div', {class: 'row', style: {marginBottom: '10px'}}, favEl(it), h('div', {class: 'grow'}, h('div', {class: 'sub ell', text: it.url}))),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '名稱'), title),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '放到哪個收藏夾'), folderChips(sel, function(id){ sel = id; })));
  var save = h('button', {class: 'btn pri', html: icon('star', 'sm') + (ex ? '更新收藏' : '加入收藏')});
  var foot = [ex ? h('button', {class: 'btn dang', html: icon('trash', 'sm') + '移除', onclick: function(){ BM.items = BM.items.filter(function(x){ return x !== ex; }); BM.save(); s.close(); renderBr(); toast('已移除收藏'); }}) : null, save];
  var s = openSheet({title: ex ? '編輯收藏' : '加入收藏', icon: 'star', body: body, foot: h('div', {style: {display: 'contents'}}, foot)});
  save.onclick = function(){
    it.title = title.value.trim() || it.title; it.folder = sel;
    if(!ex) BM.items.unshift(it);
    BM.save(); lsSet('ws.lastFolder', sel); s.close(); renderBr();
    toast((ex ? '已更新：' : '已收藏到「') + BM.folder(sel).name + (ex ? '' : '」'));
  };
}
$('bStar').addEventListener('click', openStar);

function openBmList(startFolder){
  var sel = startFolder || '', q = '';
  var list = h('div');
  var search = h('input', {type: 'search', placeholder: '搜尋收藏…', style: {width: '100%', marginBottom: '10px'}});
  search.oninput = function(){ q = search.value.trim().toLowerCase(); draw(); };
  var chips = folderChips(sel, function(id){ sel = id; draw(); }, {all: true});
  chips.className = 'folderBar';
  var body = h('div', null, search, chips, list);
  var manage = h('span', {style: {display: 'contents'}}, h('button', {class: 'ib', html: icon('history'), title: '瀏覽記錄', onclick: function(){ s.close(); openHistory(); }}), h('button', {class: 'ib', html: icon('edit'), title: '管理收藏夾', onclick: function(){ manageFolders(function(){ chips.redraw(); draw(); }); }}));
  var s = openSheet({title: '我的收藏', icon: 'books', body: body, tall: true, headExtra: manage});
  function draw(){
    list.textContent = '';
    var items = BM.items.filter(function(x){ return (!sel || x.folder === sel) && (!q || (x.title + ' ' + x.url).toLowerCase().indexOf(q) >= 0); });
    if(!items.length){ list.appendChild(h('div', {class: 'empty', html: '<div class="big">☆</div>' + (BM.items.length ? '這裡沒有符合的收藏' : '還沒有收藏任何網頁<br><span class="sub">瀏覽時按上方的 ☆ 就能收藏，並放進自訂的收藏夾</span>')})); return; }
    items.forEach(function(it){
      var f = BM.folder(it.folder);
      list.appendChild(h('div', {class: 'bmItem', onclick: function(){ s.close(); navigate(it.url); }},
        favEl(it, true),
        h('div', {class: 't'}, h('b', {text: it.title || it.url}), h('div', {class: 'sub', text: (sel ? '' : f.icon + ' ' + f.name + '・') + hostOf(it.url) + '・' + fmtDate(it.time)})),
        h('button', {class: 'ib', html: icon('more'), onclick: function(e){ e.stopPropagation(); bmItemMenu(it, draw); }})));
    });
  }
  draw();
}
function bmItemMenu(it, redraw){
  menu(it.title || it.url, [
    ['open', '開啟', function(){ Sheets.stack.slice().forEach(function(s){ s.close(); }); navigate(it.url); }],
    ['edit', '重新命名', async function(){ var n = await promptDlg('重新命名', it.title); if(n){ it.title = n; BM.save(); redraw(); } }],
    ['folder', '移到其他收藏夾', function(){
      var s2 = openSheet({title: '移到…', icon: 'folder', body: folderChips(it.folder, function(id){ it.folder = id; BM.save(); s2.close(); redraw(); toast('已移到「' + BM.folder(id).name + '」'); })});
    }],
    ['copy', '複製網址', function(){ copyText(it.url); }],
    ['trash', '刪除收藏', function(){ BM.items = BM.items.filter(function(x){ return x !== it; }); BM.save(); redraw(); renderBr(); toast('已刪除'); }, true]
  ]);
}
function manageFolders(after){
  var list = h('div');
  var s = openSheet({title: '管理收藏夾', icon: 'folder', body: list, onClose: after,
    foot: h('button', {class: 'btn pri', html: icon('plus', 'sm') + '新增收藏夾', onclick: async function(){ await newFolderDlg(); draw(); }})});
  function draw(){
    list.textContent = '';
    BM.folders.forEach(function(f, i){
      list.appendChild(h('div', {class: 'bmItem'},
        h('div', {class: 'fav sm', text: f.icon, style: {fontSize: '20px'}, onclick: function(){
          var grid = h('div', {class: 'chips'});
          var s3 = openSheet({title: '選擇圖示', body: grid});
          FOLDER_ICONS.forEach(function(ic){ grid.appendChild(h('button', {class: 'fchip' + (ic === f.icon ? ' on' : ''), text: ic, style: {fontSize: '20px'}, onclick: function(){ f.icon = ic; BM.save(); s3.close(); draw(); }})); });
        }}),
        h('div', {class: 't'}, h('b', {text: f.name}), h('div', {class: 'sub', text: BM.count(f.id) + ' 個網頁'})),
        i > 0 ? h('button', {class: 'ib', html: icon('back'), style: {transform: 'rotate(90deg)'}, title: '往上移', onclick: function(){ BM.folders.splice(i, 1); BM.folders.splice(i - 1, 0, f); BM.save(); draw(); }}) : null,
        h('button', {class: 'ib', html: icon('edit'), onclick: async function(){ var n = await promptDlg('重新命名收藏夾', f.name); if(n){ f.name = n.slice(0, 30); BM.save(); draw(); } }}),
        BM.folders.length > 1 ? h('button', {class: 'ib', html: icon('trash'), style: {color: 'var(--danger)'}, onclick: async function(){
          var n = BM.count(f.id);
          if(!(await confirmDlg('刪除「' + esc(f.name) + '」？', n ? '裡面的 ' + n + ' 個收藏會移到「' + esc(BM.folders.filter(function(x){ return x !== f; })[0].name) + '」。' : '這個收藏夾是空的。', '刪除', true))) return;
          var to = BM.folders.filter(function(x){ return x !== f; })[0];
          BM.items.forEach(function(x){ if(x.folder === f.id) x.folder = to.id; });
          BM.folders = BM.folders.filter(function(x){ return x !== f; }); BM.save(); draw();
        }}) : null));
    });
  }
  draw();
}
$('bBm').addEventListener('click', function(){ openBmList(''); });

/* ---------- 最近造訪（網址列建議、起始頁） ---------- */
function rememberRecent(u){
  if(!/^https?:/.test(u) || /google\.com\/search|bing\.com\/search|duckduckgo\.com\/\?q|search\.yahoo/.test(u)) return;
  var r = lsGet('ws.recent', []).filter(function(x){ return x !== u; }); r.unshift(u); lsSet('ws.recent', r.slice(0, 30));
}

/* ---------- 起始頁 ---------- */
function renderStart(){
  var sp = $('startPage'); sp.textContent = '';
  var sects = h('div', {class: 'sects'});
  sp.appendChild(h('div', {class: 'hero'}, h('div', {class: 'mark', text: '擷'}), h('h1', {text: '網頁擷取'}), h('p', {text: '瀏覽 → 去廣告 → 存成離線 HTML／PDF，圖片影片一鍵打包'})));
  sp.appendChild(h('div', {class: 'searchBig glass', onclick: function(){ urlIn.focus(); }}, h('span', {class: 'ell', html: icon('search', 'sm') + ' 貼上網址或輸入關鍵字'}),
    h('button', {class: 'btn pri sm', html: icon('copy', 'sm') + '貼上', onclick: async function(e){
      e.stopPropagation();
      try{ var t = (await navigator.clipboard.readText() || '').trim(); var m = t.match(/https?:\/\/\S+/); if(m) navigate(m[0]); else if(t){ urlIn.value = t; urlIn.focus(); } else toast('剪貼簿是空的', true); }
      catch(err){ urlIn.focus(); toast('請長按網址列貼上'); }
    }})));
  if(!isApp) sects.appendChild(h('div', {class: 'note', html: '🌐 <b>網頁版</b>：瀏覽器的安全限制讓網頁無法直接開啟其他網站，這裡會透過「代理伺服器」讀取網頁內容（不執行網頁程式、無法登入）。完整的瀏覽、登入、廣告阻擋與影片偵測請使用 <b>APK 版</b>。代理伺服器可在「設定 → 網頁版代理」修改。'}));
  if(BR.loaded) sects.appendChild(h('div', {class: 'opt', style: {marginTop: '12px'}, onclick: leaveHome}, h('span', {class: 'oi', html: icon('back')}), h('div', {class: 'grow'}, h('b', {text: '回到目前網頁'}), h('div', {class: 'sub ell', text: BR.title || BR.url}))));
  /* 收藏與瀏覽記錄（只放入口按鈕，畫面保持清爽） */
  var tiles = h('div', {class: 'tiles'});
  tiles.appendChild(h('div', {class: 'tile', onclick: function(){ openBmList(''); }}, h('div', {class: 'fav', html: icon('books')}), h('span', {text: '全部收藏'}), h('small', {class: 'sub', text: BM.items.length + ' 個'})));
  tiles.appendChild(h('div', {class: 'tile', onclick: function(){ openHistory(); }}, h('div', {class: 'fav', html: icon('history')}), h('span', {text: '瀏覽記錄'}), h('small', {class: 'sub', text: Hist.items.length + ' 筆'})));
  tiles.appendChild(h('div', {class: 'tile', onclick: function(){ ytOpen(); }}, h('div', {class: 'fav', html: icon('ytplay')}), h('span', {text: 'YouTube'}), h('small', {class: 'sub', text: '無廣告播放器'})));
  sects.appendChild(h('div', {class: 'sect-h'}, h('span', {text: '⭐ 收藏'}), h('button', {text: '管理收藏夾', onclick: function(){ manageFolders(renderStart); }})));
  sects.appendChild(tiles);
  /* 說明 */
  sects.appendChild(h('div', {class: 'sect-h'}, h('span', {text: '💡 怎麼用'})));
  sects.appendChild(h('div', {class: 'tips'},
    h('div', {class: 'tip glass', html: '<b>' + icon('download', 'sm') + '擷取網頁</b>開啟網頁後按「擷取」，去除廣告，存成單一離線 HTML 或 PDF'}),
    h('div', {class: 'tip glass', html: '<b>' + icon('film', 'sm') + '媒體下載</b>自動偵測圖片與影片，可選格式、解析度，打包成 ZIP'}),
    h('div', {class: 'tip glass', html: '<b>' + icon('star', 'sm') + '分類收藏</b>按 ☆ 收藏網頁，放進自己命名的收藏夾'}),
    h('div', {class: 'tip glass', html: '<b>' + icon('scissors', 'sm') + '手動清理</b>還有漏網的廣告？按 ✂ 點選區塊移除後再擷取'})));
  sp.appendChild(sects);
  paintIcons(sp);
}

/* ---------- 快速設定（瀏覽頁右上角） ---------- */
function openQuick(){
  var body = h('div');
  body.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '版面模式'), segRow(MODES.map(function(m){ return [m[0], m[1], m[2]]; }), 'mode', function(){ renderBr(); if(!isApp && BR.loaded) WEB.load(BR.url, false); })));
  body.appendChild(rangeRow('網頁文字大小', 'textZoom', 70, 200, 5, function(v){ return v + '%'; }));
  body.appendChild(rangeRow('App 介面大小', 'uiScale', 85, 125, 5, function(v){ return v + '%'; }));
  body.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '介面顏色'), segRow([['auto', '跟隨系統'], ['light', '淺色'], ['dark', '深色']], 'theme'), h('div', {style: {height: '10px'}}), paletteRow()));
  var credN = isApp ? ((NAT.json('credList') || {list: []}).list || []).length : 0;
  body.appendChild(h('div', {class: 'card glass', style: {marginTop: '14px', padding: '6px 12px'}},
    h('div', {class: 'setRow', onclick: function(){ openCreds(); }}, h('span', {class: 'ic', html: icon('key')}), h('div', {class: 'grow'}, h('b', {text: '帳號密碼'}), h('div', {class: 'sub', text: isApp ? '已儲存 ' + credN + ' 組・登入時自動詢問、可一鍵填入' : '網頁版無法登入其他網站（需 APK）'})), h('span', {class: 'chev', text: '›'})),
    swRow('登入時詢問是否儲存密碼', '密碼以手機的 Keystore 金鑰加密，只存在這支手機', 'pw'),
    swRow('廣告阻擋', isApp ? '本頁已阻擋 ' + BR.blocked + ' 個廣告請求' : '擷取時移除廣告元素', 'ads'),
    selRow('彈出視窗', [['smart', '聰明模式：允許你點擊開啟的（登入視窗），阻擋自動彈出的'], ['all', '全部允許'], ['block', '全部阻擋']], 'popups')));
  body.appendChild(h('button', {class: 'btn block', style: {marginTop: '6px'}, html: icon('gear', 'sm') + '更多設定', onclick: function(){ Sheets.stack.slice().forEach(function(s){ s.close(); }); showView('set'); }}));
  openSheet({title: '瀏覽設定', icon: 'sliders', body: body, onClose: function(){ renderBr(); }});
}
$('bQuick').addEventListener('click', openQuick);

/* ---------- 帳號密碼管理 ---------- */
function openCreds(){
  var body = h('div');
  var s = openSheet({title: '帳號密碼', icon: 'key', body: body, tall: true});
  function draw(){
    body.textContent = '';
    if(!isApp){ body.appendChild(h('div', {class: 'note', html: '網頁版無法登入其他網站，也無法替其他網站填入密碼。請使用 APK 版：登入時會詢問是否儲存，下次可一鍵填入。'})); return; }
    var d = NAT.json('credList') || {list: [], never: []};
    var box = h('div', {class: 'card glass'});
    if(!d.list.length) box.appendChild(h('div', {class: 'empty', html: '<div class="big">🔑</div>還沒有儲存任何帳號<br><span class="sub">在網站登入時，下方會跳出「要儲存密碼嗎？」</span>'}));
    d.list.forEach(function(c){
      var pw = h('span', {class: 'sub', text: '••••••••'});
      box.appendChild(h('div', {class: 'credRow'},
        h('div', {class: 'fav sm', text: (c.host.replace(/^www\./, '')[0] || '?').toUpperCase()}),
        h('div', {class: 't'}, h('b', {text: c.user || '（未填帳號）'}), h('div', {class: 'sub ell', text: c.host}), pw),
        h('button', {class: 'ib', html: icon('eye'), onclick: function(){ pw.textContent = pw.textContent.indexOf('•') === 0 ? NAT.call('credReveal', c.host, c.user) : '••••••••'; }}),
        h('button', {class: 'ib', html: icon('copy'), onclick: function(){ copyText(NAT.call('credReveal', c.host, c.user)); }}),
        h('button', {class: 'ib', html: icon('trash'), style: {color: 'var(--danger)'}, onclick: async function(){ if(await confirmDlg('刪除這組帳號？', esc(c.user) + '<br>' + esc(c.host), '刪除', true)){ NAT.call('credDel', c.host, c.user); draw(); } }})));
    });
    body.appendChild(box);
    /* 手動新增 */
    var hIn = h('input', {type: 'text', placeholder: '網站，例如 www.example.com', value: BR.host || ''});
    var uIn = h('input', {type: 'text', placeholder: '帳號／Email', autocomplete: 'off'});
    var pIn = h('input', {type: 'password', placeholder: '密碼', autocomplete: 'new-password'});
    body.appendChild(h('div', {class: 'card glass'}, h('h3', {html: icon('plus') + '手動新增'}),
      h('div', {class: 'field'}, hIn), h('div', {class: 'two'}, uIn, pIn),
      h('div', {class: 'btn-row'}, h('button', {class: 'btn pri', text: '儲存', onclick: function(){
        var host = hIn.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if(!host || !pIn.value){ toast('請填網站與密碼', true); return; }
        NAT.call('credSave', host, uIn.value.trim(), pIn.value); toast('已儲存'); draw();
      }}))));
    if(d.never && d.never.length){
      var nv = h('div', {class: 'card glass'}, h('h3', {html: icon('shield') + '永不儲存的網站'}));
      d.never.forEach(function(host){ nv.appendChild(h('div', {class: 'credRow'}, h('div', {class: 't'}, h('b', {text: host})), h('button', {class: 'btn sm', text: '移除', onclick: function(){ NAT.call('credNever', host, false); draw(); }}))); });
      body.appendChild(nv);
    }
    paintIcons(body);
  }
  draw();
}
on('credAsk', function(d){
  /* 用面板顯示（面板永遠在網頁上面），不會再被網頁蓋住；也不會改變網頁大小 */
  var s = openSheet({title: (d.update ? '更新' : '儲存') + '密碼？', icon: 'key', modal: false,
    body: h('div', null, h('div', {class: 'card glass', style: {padding: '14px'}}, h('b', {text: d.user || '這組帳號'}), h('div', {class: 'sub', text: d.host})),
      h('div', {class: 'sub', style: {margin: '10px 2px'}, text: '密碼以手機的 Keystore 金鑰加密，只存在這支手機。下次登入這個網站時會自動幫你填入。'})),
    foot: h('div', {style: {display: 'contents'}},
      h('button', {class: 'btn ghost', text: '永不', onclick: function(){ NAT.call('credNever', d.host, true); s.close(); }}),
      h('button', {class: 'btn ghost', text: '不要', onclick: function(){ s.close(); }}),
      h('button', {class: 'btn pri', text: d.update ? '更新' : '儲存', onclick: function(){ var ok = NAT.call('credSavePending', d.host); s.close(); toast(ok ? '已儲存密碼' : '儲存失敗', !ok); }}))});
});
on('credAvail', function(d){
  var users = d.users || [];
  if(!users.length) return;
  Dock.set('credAvail', h('div', {class: 'dockCard glass'}, h('span', {html: icon('key'), style: {color: 'var(--accent)'}}),
    h('div', {class: 't'}, h('b', {text: '填入已儲存的帳號'}), h('div', {class: 'sub', text: users.length === 1 ? (users[0] || '（未填帳號）') : users.length + ' 組帳號'})),
    h('button', {class: 'btn sm ghost', html: icon('x', 'sm'), onclick: function(){ Dock.remove('credAvail'); }}),
    h('button', {class: 'btn sm pri', text: '填入', onclick: function(){
      if(users.length === 1){ NAT.call('brFill', users[0]); Dock.remove('credAvail'); return; }
      menu('選擇帳號', users.map(function(u){ return ['key', u || '（未填帳號）', function(){ NAT.call('brFill', u); Dock.remove('credAvail'); }]; }));
    }})), 'browse');
});

/* ---------- 手動移除元素 ---------- */
$('bZap').addEventListener('click', function(){
  BR.zap = !BR.zap;
  if(isApp) NAT.call('brZap', BR.zap); else WEB.zap(BR.zap);
  if(BR.zap) zapCard(0); else Dock.remove('zap');
  renderBr();
});
function zapCard(n){
  Dock.set('zap', h('div', {class: 'dockCard glass'}, h('span', {html: icon('scissors'), style: {color: 'var(--accent)'}}),
    h('div', {class: 't'}, h('b', {text: '手動清理模式'}), h('div', {class: 'sub', text: n ? '已移除 ' + n + ' 個區塊，擷取時不會包含' : '點網頁上的區塊選取，再按「移除」'})),
    h('button', {class: 'btn sm pri', text: '完成', onclick: function(){ BR.zap = false; if(isApp) NAT.call('brZap', false); else WEB.zap(false); Dock.remove('zap'); renderBr(); }})), 'browse');
}
on('zap', function(d){ if(d.on){ BR.zap = true; zapCard(d.n); } else { BR.zap = false; Dock.remove('zap'); if(d.n) toast('已移除 ' + d.n + ' 個區塊'); } renderBr(); });

/* ============================================================
   網頁版：透過代理讀取網頁
   ============================================================ */
var WEB = {hist: [], idx: -1, doc: null, url: '', ctrl: null, zapStack: [], zapping: false};
function proxyList(){ return String(CFG.proxies || '').split(/\n+/).map(function(s){ return s.trim(); }).filter(Boolean); }
async function proxyFetch(url, type){
  /* type: 'text' | 'blob'；先直接抓（有開放 CORS 的資源），不行再依序試代理 */
  var errs = [];
  var tries = [{u: url, direct: true}].concat(proxyList().map(function(p){ return {u: p.replace('{url}', encodeURIComponent(url))}; }));
  for(var i = 0; i < tries.length; i++){
    try{
      var ctl = new AbortController(); var t = setTimeout(function(){ ctl.abort(); }, tries[i].direct ? 8000 : 20000);
      var r = await fetch(tries[i].u, {signal: ctl.signal, credentials: 'omit', redirect: 'follow'});
      clearTimeout(t);
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var mime = (r.headers.get('content-type') || '').split(';')[0].trim();
      if(type === 'blob') return {blob: await r.blob(), mime: mime, url: url};
      return {text: await r.text(), mime: mime, url: url};
    }catch(e){ errs.push((tries[i].direct ? '直接' : '代理' + i) + '：' + (e.name === 'AbortError' ? '逾時' : e.message)); }
  }
  throw new Error('無法讀取（' + errs.slice(-2).join('；') + '）');
}
WEB.load = async function(url, push){
  var fr = $('webFrame');
  $('webBusy').classList.add('on'); $('webBusyT').textContent = '透過代理讀取 ' + hostOf(url) + '…';
  BR.url = url; BR.host = hostOf(url); BR.progress = 30; BR.secure = /^https:/.test(url); BR.loaded = true; BR.home = false;
  $('startPage').classList.add('hide'); renderBr();
  var my = WEB.seq = (WEB.seq || 0) + 1;
  try{
    var r = await proxyFetch(url, 'text');
    if(my !== WEB.seq) return;
    var doc = new DOMParser().parseFromString(r.text, 'text/html');
    var base = doc.createElement('base'); base.href = url; doc.head.insertBefore(base, doc.head.firstChild);
    doc.querySelectorAll('script,iframe[src*="ads"],noscript').forEach(function(s){
      if(s.tagName === 'NOSCRIPT'){ var d = doc.createElement('div'); d.innerHTML = s.textContent; s.replaceWith(d); } else s.remove();
    });
    /* 懶載入圖片：直接換成真正的網址 */
    doc.querySelectorAll('img').forEach(function(img){ var lz = WSCapture.lazySrc(img, url); if(lz && (WSCapture.isPlaceholder(img.getAttribute('src')) || !img.getAttribute('src'))) img.setAttribute('src', lz); img.removeAttribute('loading'); });
    if(CFG.ads){ var st = doc.createElement('style'); st.textContent = WS_AD.css + '{display:none!important}'; doc.head.appendChild(st); }
    WEB.doc = doc; WEB.url = url;
    BR.title = (doc.title || '').trim() || hostOf(url);
    if(CFG.mode === 'reader'){
      var art = WSReader.extract(doc);
      if(art){ fr.srcdoc = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="' + esc(url) + '"><style>' + WSReader.css + '</style>' + art.html; }
      else { toast('沒有偵測到文章內容，顯示原始頁面'); fr.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML; }
    } else fr.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
    fr.classList.add('on');
    if(push !== false){ WEB.hist = WEB.hist.slice(0, WEB.idx + 1); WEB.hist.push(url); WEB.idx = WEB.hist.length - 1; }
    BR.progress = 100; BR.back = WEB.idx > 0; BR.fwd = WEB.idx < WEB.hist.length - 1;
    BR.mediaN = WSMedia.scan(doc, {minPx: CFG.media.minPx, live: false}).length;
    renderBr();
  }catch(e){
    if(my !== WEB.seq) return;
    BR.progress = 100; renderBr();
    fr.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font:15px/1.6 sans-serif;padding:30px;text-align:center;color:#5d4d3a;background:#f4ecdc"><div style="font-size:44px">🌐</div><h3 style="color:#a2613a">無法讀取這個網頁</h3><p style="word-break:break-all">' + esc(url) + '</p><p style="font-size:13px">' + esc(e.message) + '</p><p style="font-size:13px">網頁版需透過代理伺服器讀取，部分網站會拒絕。安裝 APK 版即可直接瀏覽。</p></body>';
    fr.classList.add('on');
  }finally{ if(my === WEB.seq) $('webBusy').classList.remove('on'); }
};
WEB.stop = function(){ WEB.seq++; $('webBusy').classList.remove('on'); BR.progress = 100; renderBr(); };
WEB.back = function(){ if(WEB.idx > 0){ WEB.idx--; WEB.load(WEB.hist[WEB.idx], false); } };
WEB.fwd = function(){ if(WEB.idx < WEB.hist.length - 1){ WEB.idx++; WEB.load(WEB.hist[WEB.idx], false); } };
WEB.zap = function(on){
  WEB.zapping = on;
  var d = $('webFrame').contentDocument; if(!d) return;
  if(on && !d.__wsZap){
    d.__wsZap = true;
    d.addEventListener('click', function(e){
      if(!WEB.zapping) return;
      e.preventDefault(); e.stopPropagation();
      var el = e.target; if(!el || el === d.body || el === d.documentElement) return;
      el.style.setProperty('display', 'none', 'important');
      var orig = WEB.doc && findTwin(el); if(orig) orig.setAttribute('data-ws-zap', '1');
      WEB.zapStack.push(el); zapCard(WEB.zapStack.length);
    }, true);
  }
};
function findTwin(el){
  /* 在解析好的原始文件裡找到對應的元素（用路徑比對） */
  var path = [];
  for(var n = el; n && n.parentElement; n = n.parentElement){ var i = Array.prototype.indexOf.call(n.parentElement.children, n); path.unshift(i); }
  var cur = WEB.doc.documentElement;
  for(var k = 1; k < path.length && cur; k++) cur = cur.children[path[k]];
  return cur;
}
$('webFrame').addEventListener('load', function(){
  var d; try{ d = this.contentDocument; }catch(e){ return; }
  if(!d) return;
  d.addEventListener('click', function(e){
    if(WEB.zapping) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if(!a) return;
    var href = a.getAttribute('href');
    if(!href || href[0] === '#') return;
    e.preventDefault();
    var u; try{ u = new URL(href, WEB.url).href; }catch(x){ return; }
    if(/^https?:/.test(u)) navigate(u);
  });
  d.addEventListener('submit', function(e){
    var f = e.target; e.preventDefault();
    if((f.method || 'get').toLowerCase() !== 'get'){ toast('網頁版無法送出這個表單（需 APK 版）', true); return; }
    var u = new URL(f.getAttribute('action') || WEB.url, WEB.url);
    new FormData(f).forEach(function(v, k){ u.searchParams.set(k, v); });
    navigate(u.href);
  });
});

/* ---------- 功能選單（精簡工具列：原本第二排的按鈕都在這裡） ---------- */
function openToolsMenu(){
  var page = !BR.home && BR.loaded;
  var bm = page && BM.items.some(function(x){ return x.url === BR.url; });
  var grid = h('div', {class: 'qGrid'});
  function b(ic, label, fn, opts){
    opts = opts || {};
    var el = h('button', {class: opts.on ? 'on' : '', disabled: !!opts.dis, html: icon(ic) + '<span>' + esc(label) + '</span>' + (opts.n ? '<span class="n">' + opts.n + '</span>' : ''), onclick: function(){ s.close(); setTimeout(fn, 80); }});
    grid.appendChild(el);
  }
  b('star', bm ? '已收藏' : '收藏此頁', function(){ $('bStar').click(); }, {dis: !page, on: bm});
  b('books', '收藏清單', function(){ $('bBm').click(); });
  b('history', '瀏覽記錄', function(){ openHistory(); });
  b('scissors', '手動清理', function(){ $('bZap').click(); }, {dis: !page, on: BR.zap});
  b(CFG.mode === 'desktop' ? 'monitor' : CFG.mode === 'reader' ? 'book' : 'phone', CFG.mode === 'desktop' ? '電腦版' : CFG.mode === 'reader' ? '閱讀模式' : '手機版', function(){ $('bMode').click(); }, {on: CFG.mode !== 'mobile'});
  b('sliders', '瀏覽設定', function(){ $('bQuick').click(); });
  b('film', '下載影片', function(){ openMedia(); }, {dis: !page, n: BR.mediaN ? (BR.mediaN > 99 ? '99+' : BR.mediaN) : ''});
  b('download', '擷取網頁', function(){ openCapture(); }, {dis: !page});
  b('copy', '複製網址', function(){ copyText(BR.url); }, {dis: !page});
  b('share', '分享', function(){ if(isApp) NAT.call('share', BR.title || '', BR.url); else copyText(BR.url); }, {dis: !page});
  var s = openSheet({title: '功能', icon: 'grid', body: grid});
}
$('bMore').addEventListener('click', openToolsMenu);
