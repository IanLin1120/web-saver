/* ============================================================
   軟體使用說明書（第 2 版）：每一段都有「會動的示意畫面」——用 App 自己的介面元件與樣式畫出來，
   長得跟真的一樣；手指會示範要按哪裡、按了會發生什麼。文字只留重點。
   示意畫面裡的歌名、網站、新聞都是虛構的範例。
   設定頁最上面可以隨時打開；第一次使用 App 時自動顯示，滑到最下面按確認才開始使用。
   ============================================================ */
var GUIDE_VER = 1;
var GUIDE = [];            /* 舊版說明書的整段翻譯介面（u_i18n）：新版不用 */

/* ---------- 翻譯：說明書有內建的英、日、韓、簡中語言包；其他語言用介面翻譯字典 ---------- */
function T(s){
  if(typeof I18N === 'undefined' || !I18N.on()) return s;
  var G = window.I18N_GPACK && I18N_GPACK[I18N.lang];
  if(G && !Array.isArray(G) && G[s] != null) return G[s];
  return (I18N.dict && I18N.dict[s]) || s;
}

/* ---------- 把 App 樣式表裡「#id」的規則複製一份給示意畫面用（示意畫面用 data-gid，不會跟真的元件搶 id） ---------- */
function gMirrorCss(){
  if(gMirrorCss.done) return; gMirrorCss.done = true;
  var out = [];
  function split(sel){ var r = [], d = 0, cur = ''; for(var i = 0; i < sel.length; i++){ var c = sel[i]; if(c === '(') d++; else if(c === ')') d--; if(c === ',' && !d){ r.push(cur); cur = ''; } else cur += c; } r.push(cur); return r; }
  function conv(rules){
    var txt = '';
    for(var i = 0; i < rules.length; i++){
      var r = rules[i];
      if(r.selectorText != null){
        if(r.selectorText.indexOf('#') < 0) continue;
        var parts = split(r.selectorText).filter(function(p){ return p.indexOf('#') >= 0; }).map(function(p){ return p.replace(/#([A-Za-z_][\w-]*)/g, '[data-gid="$1"]'); });
        if(parts.length) txt += parts.join(',') + '{' + r.style.cssText + '}\n';
      } else if(r.cssRules && r.media){
        var inner = conv(r.cssRules); if(inner) txt += '@media ' + r.media.mediaText + '{' + inner + '}\n';
      }
    }
    return txt;
  }
  for(var s = 0; s < document.styleSheets.length; s++){ try{ out.push(conv(document.styleSheets[s].cssRules)); }catch(e){} }
  var st = document.createElement('style'); st.id = 'gMirror'; st.textContent = out.join(''); document.head.appendChild(st);
}

/* ---------- 示意畫面的小零件（用 App 真正的 class，所以外觀一模一樣） ---------- */
function gIc(n, sm){ return '<span data-ic="' + n + '"' + (sm ? ' data-sm="1"' : '') + '></span>'; }
function gE(s){ return esc(T(s)); }
function gNavH(on){
  var T5 = [['browse', 'globe', '瀏覽'], ['yt', 'ytplay', 'YouTube'], ['ai', 'sparkle', 'AI 摘要'], ['lib', 'folder', '檔案庫'], ['set', 'gear', '設定']];
  return '<div data-gid="dock"><div data-gid="dockCards" style="display:contents"></div><nav data-gid="nav" class="glass">' + T5.map(function(t){ return '<button data-v="' + t[0] + '"' + (t[0] === on ? ' class="on"' : '') + '>' + gIc(t[1]) + '<i>' + gE(t[2]) + '</i></button>'; }).join('') + '</nav></div>';
}
function gLayer(){ return '<div data-gid="sheets"></div><div class="toast" data-gid="toast"><span data-gid="toastT"></span></div>'; }
function gBrTop(o){
  o = o || {};
  return '<div data-gid="brTop" class="glass"><div class="urlrow">' +
    '<button class="ib" data-gid="bBack" data-g="back" disabled>' + gIc('back') + '</button><button class="ib" data-gid="bFwd" disabled>' + gIc('fwd') + '</button>' +
    '<button class="ib' + (o.home ? ' on' : '') + '" data-gid="bHome" data-g="home">' + gIc('home') + '</button><button class="ib" data-gid="bTabs" data-g="tabs"><span data-gid="tabN">' + (o.tabs || 1) + '</span></button>' +
    '<button class="ib" data-gid="bSearch" data-g="search">' + gIc('search') + '</button><button class="ib tgl on" data-g="fabT">' + gIc('download') + '</button>' +
    '<button class="ib tgl on" data-g="vpT">' + gIc('play') + '</button><button class="ib" data-g="more">' + gIc('grid') + '</button></div>' +
    (o.url ? '<div data-gid="urlPop"><div class="upRow"><span class="lock" data-gid="urlLock">' + gIc('lock', 1) + '</span><div data-gid="urlShow" class="grow">' + esc(o.url) + '</div><button class="chip" data-gid="urlCopy">' + gIc('copy', 1) + gE('複製') + '</button><button class="ib" data-gid="urlAct">' + gIc('reload', 1) + '</button></div></div>' : '') +
    '<div data-gid="brBar"><i></i></div></div>';
}
function gTile(ic, t, sub, g, extra){ return '<div class="tile' + (extra || '') + '"' + (g ? ' data-g="' + g + '"' : '') + '><div class="fav">' + gIc(ic) + '</div><span>' + gE(t) + '</span><small class="sub">' + gE(sub) + '</small></div>'; }
function gStart(o){
  o = o || {};
  return '<div data-gid="startPage">' + (o.noHero ? '' :
    '<div class="hero"><div class="mark markImg">' + (document.querySelector('.hero .mark') ? document.querySelector('.hero .mark').innerHTML.replace(/id="ti/g, 'id="gti').replace(/url\(#ti/g, 'url(#gti') : '') + '</div><h1>' + gE('Terra 瀏覽器') + '</h1><p>Terra Browser</p></div>') +
    '<div class="searchBig glass"><span class="sbIc">' + gIc('search', 1) + '</span><input type="search" readonly tabindex="-1" data-g="in" placeholder="' + gE('貼上網址或輸入關鍵字') + '"><button class="btn pri sm" data-g="go">' + gIc('search', 1) + gE('搜尋') + '</button></div>' +
    '<div class="sects"><div class="sect-h"><span>⭐ ' + gE('收藏') + '</span><button>' + gE('管理收藏夾') + '</button></div><div class="tiles">' +
    gTile('books', '我的收藏', '12 個') + gTile('history', '瀏覽記錄', '86 筆') + gTile('qr', '掃 QR Code', '網址／收檔') +
    '<div class="tile" style="grid-column-start:1" data-g="listen"><div class="fav">' + gIc('listen') + '</div><span>' + gE('聽歌辨識') + '</span><small class="sub">' + gE('找出歌名') + '</small></div>' +
    gTile('clock', '辨識紀錄', '8 首', 'lhist') + gTile('incog', '無痕模式', '不保留記錄', 'incog') + gTile('x', '關閉分頁', '全部 3 個', 'closeAll') +
    '<div class="tile" style="grid-column-start:1" data-g="news"><div class="fav">' + gIc('news') + '</div><span>' + gE('新聞') + '</span><small class="sub">' + gE('今日焦點') + '</small></div>' +
    '</div></div></div>';
}
function gView(id, inner, cls){ return '<section class="view on' + (cls ? ' ' + cls : '') + '" data-gid="' + id + '">' + inner + '</section>'; }
function gSheetH(title, ic, body, o){
  o = o || {};
  return '<div class="sheetWrap"><div class="sheetBg"></div><div class="sheet' + (o.tall ? ' tall' : '') + '"><div class="grab"><i></i></div><div class="sh-head"><h3>' + (ic ? gIc(ic) : '') + '<span class="ell">' + gE(title) + '</span></h3><button class="ib">' + gIc('x') + '</button></div><div class="sh-body">' + body + '</div>' + (o.foot ? '<div class="sh-foot">' + o.foot + '</div>' : '') + '</div></div>';
}
function gDlgH(title, inner, acts){
  return '<div class="sheetWrap"><div class="sheetBg"></div><div class="dlg"><h3>' + gE(title) + '</h3>' + (inner || '') + '<div class="acts">' + acts.map(function(a){ return '<button class="btn ' + (a[1] || '') + '" data-g="' + (a[2] || '') + '">' + gE(a[0]) + '</button>'; }).join('') + '</div></div></div>';
}
function gMiniH(title, sub, art){
  return '<div class="dockCard glass" data-g="mini" style="padding:6px 8px;position:relative;overflow:hidden"><div class="lrow" style="padding:0;border:0;background:none;flex:1;min-width:0">' +
    '<div class="th" style="width:40px;height:40px;border-radius:10px;background:' + (art || 'var(--c-audio)') + ';color:#fff">' + gIc('audio') + '</div><div class="t"><b>' + gE(title) + '</b><div class="sub ell" data-g="lyr">' + gE(sub) + '</div></div></div>' +
    '<button class="ib"><svg class="i fill" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button><button class="ib">' + gIc('fwd') + '</button><button class="ib" data-g="stop">' + gIc('x', 1) + '</button>' +
    '<div data-g="bar" style="position:absolute;left:0;bottom:0;height:3px;background:var(--accent);width:22%;transition:width 3s linear"></div></div>';
}
function gSetCard(h3ic, h3, rows){
  return '<div class="card glass"><h3>' + gIc(h3ic) + gE(h3) + '</h3>' + rows.map(function(r){ return '<div class="setRow" data-g="' + (r[3] || '') + '"><span class="ic">' + gIc(r[0]) + '</span><div class="grow"><b>' + gE(r[1]) + '</b><div class="sub">' + gE(r[2]) + '</div></div><span class="chev">›</span></div>'; }).join('') + '</div>';
}
function gLrow(title, sub, color, g, ic){
  return '<div class="lrow" data-g="' + (g || '') + '"><div class="th" style="background:linear-gradient(140deg,color-mix(in srgb,' + color + ' 30%,var(--surface-2)),var(--surface-2));color:' + color + '"><span class="big">' + gIc(ic || 'audio') + '</span></div><div class="t"><b>' + gE(title) + '</b><div class="sub">' + gE(sub) + '</div></div><span class="ck">' + gIc('check') + '</span></div>';
}
function gFtile(emo, name, sub, g){ return '<div class="ftile" data-g="' + (g || '') + '"><span class="fi">' + emo + '</span><div class="t"><b>' + gE(name) + '</b><div class="sub">' + gE(sub) + '</div></div><button class="ib">' + gIc('more') + '</button></div>'; }

/* ---------- 動畫引擎：手指移過去 → 按下（漣漪）→ 畫面跟著變；做完一輪停一下再重播 ---------- */
var GS = {list: [], io: null};
function gSleep(sc, ms){
  return new Promise(function(res){
    var left = ms;
    (function tick(){
      if(!sc.win.isConnected){ res(false); return; }
      if(sc.vis){ left -= 100; if(left <= 0){ res(true); return; } }
      setTimeout(tick, 100);
    })();
  });
}
function gQ(sc, sel){ return typeof sel === 'function' ? sel(sc.scr) : sc.scr.querySelector(sel); }
function gPos(sc, el){
  var r = el.getBoundingClientRect(), b = sc.scr.getBoundingClientRect(), s = sc.s || 1;
  return {x: (r.left - b.left + r.width / 2) / s, y: (r.top - b.top + r.height / 2) / s};
}
async function gMove(sc, el){
  var p = gPos(sc, el), f = sc.fing;
  f.classList.add('show');
  f.style.transform = 'translate(' + (p.x - 22) + 'px,' + (p.y - 22) + 'px)';
  return gSleep(sc, 620);
}
function gRipple(sc, el, long){
  var p = gPos(sc, el), r = document.createElement('i');
  r.className = 'gRip' + (long ? ' long' : ''); r.style.left = p.x + 'px'; r.style.top = p.y + 'px';
  sc.scr.appendChild(r); setTimeout(function(){ r.remove(); }, 900);
}
function gOpen(sc, html){
  var host = sc.scr.querySelector('[data-gid="sheets"]');
  var t = document.createElement('div'); t.innerHTML = html; var w = t.firstChild;
  host.appendChild(w); paintIcons(w); void w.offsetWidth; w.classList.add('on');
  return w;
}
function gClose(sc){ var w = sc.scr.querySelectorAll('[data-gid="sheets"] .sheetWrap'); w.forEach(function(x){ x.classList.remove('on'); setTimeout(function(){ x.remove(); }, 320); }); }
function gToast(sc, msg){
  var t = sc.scr.querySelector('[data-gid="toast"]'); if(!t) return;
  t.querySelector('span').textContent = T(msg); t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(function(){ t.classList.remove('show'); }, 2000);
}
async function gStep(sc, st){
  var k = st[0];
  if(k === 'wait') return gSleep(sc, st[1]);
  if(k === 'do'){ st[1](sc.scr, sc); return gSleep(sc, st[2] || 300); }
  var el = gQ(sc, st[1]); if(!el) return gSleep(sc, 200);
  if(k === 'spot'){ el.classList.add('gSpot'); await gSleep(sc, st[2] || 1100); el.classList.remove('gSpot'); return; }
  if(!(await gMove(sc, el))) return;
  if(k === 'tap' || k === 'type'){
    el.classList.add('gSpot'); await gSleep(sc, 260);
    sc.fing.classList.add('down'); el.classList.add('gPress'); gRipple(sc, el);
    await gSleep(sc, 160);
    sc.fing.classList.remove('down'); el.classList.remove('gPress'); el.classList.remove('gSpot');
    if(k === 'type'){
      var inp = el.tagName === 'INPUT' ? el : el.querySelector('input'), txt = T(st[2]);
      if(st[3]) inp.value = '';
      for(var i = 0; i < txt.length; i++){ inp.value += txt[i]; if(!(await gSleep(sc, 75))) return; }
      if(st[4]) st[4](sc.scr, el);
      return gSleep(sc, 450);
    }
    if(st[2]) st[2](sc.scr, el, sc);
    return gSleep(sc, st[3] || 700);
  }
  if(k === 'hold'){
    el.classList.add('gSpot'); sc.fing.classList.add('down'); el.classList.add('gPress'); gRipple(sc, el, true);
    await gSleep(sc, 750);
    sc.fing.classList.remove('down'); el.classList.remove('gPress'); el.classList.remove('gSpot');
    if(st[2]) st[2](sc.scr, el, sc);
    return gSleep(sc, st[3] || 700);
  }
}
function gBuild(sc){
  sc.scr.innerHTML = sc.spec.html() + gLayer();
  sc.scr.appendChild(sc.fing); sc.fing.className = 'gFinger';
  sc.fing.style.transform = 'translate(' + (sc.W * .78) + 'px,' + (sc.top + sc.cropH + 40) + 'px)';
  paintIcons(sc.scr);
  if(sc.spec.init) sc.spec.init(sc.scr, sc);
}
async function gRun(sc){
  if(sc.running) return; sc.running = true;
  if(sc.spec.init) try{ sc.spec.init(sc.scr, sc); }catch(e){}
  var once = typeof CFG !== 'undefined' && CFG.motion === false;
  while(sc.win.isConnected){
    if(!(await gSleep(sc, 700))) break;
    var steps = sc.spec.steps || [];
    for(var i = 0; i < steps.length; i++){ if(!sc.win.isConnected) break; await gStep(sc, steps[i]); }
    sc.fing.classList.remove('show');
    if(!(await gSleep(sc, 2200))) break;
    if(once) break;
    sc.scr.classList.add('fade'); await gSleep(sc, 260);
    gBuild(sc); sc.scr.classList.remove('fade');
  }
  sc.running = false;
}
function gFit(sc){
  var w = sc.win.clientWidth || 300, s = w / sc.W; sc.s = s;
  sc.win.style.height = Math.round(sc.cropH * s) + 'px';
  sc.scr.style.transform = 'translateY(' + (-sc.top * s) + 'px) scale(' + s + ')';
}
/* spec: {h: 顯示的高度（真實畫面 px）, top: 從畫面哪裡開始（數字或 'bottom'）, html(), init(scr), steps[], cap} */
function gScene(spec){
  gMirrorCss();
  var W = Math.max(320, Math.min(480, window.innerWidth || 360)), H = Math.max(560, window.innerHeight || 760);
  var cropH = Math.min(spec.h || 420, H), top = spec.top === 'bottom' ? H - cropH : (spec.top || 0);
  var win = h('div', {class: 'gWin', 'data-i18n-skip': ''});
  var scr = h('div', {class: 'gScr' + (spec.cls ? ' ' + spec.cls : '')});
  var bs = getComputedStyle(document.body);
  scr.style.width = W + 'px'; scr.style.height = H + 'px';
  scr.style.backgroundColor = bs.backgroundColor; scr.style.backgroundImage = bs.backgroundImage;
  scr.style.fontSize = bs.fontSize; scr.style.color = bs.color; scr.style.lineHeight = bs.lineHeight;
  var fing = h('i', {class: 'gFinger'});
  win.appendChild(scr);
  var sc = {win: win, scr: scr, fing: fing, spec: spec, W: W, H: H, cropH: cropH, top: top, vis: false};
  gBuild(sc);
  var wrap = h('figure', {class: 'gFig2'}, win, spec.cap ? h('figcaption', {text: T(spec.cap), 'data-i18n-skip': ''}) : null);
  win._sc = sc;
  setTimeout(function(){ gFit(sc); }, 0);
  if(window.ResizeObserver) new ResizeObserver(function(){ gFit(sc); }).observe(win);
  if(!GS.io && window.IntersectionObserver) GS.io = new IntersectionObserver(function(es){ es.forEach(function(e){ var s = e.target._sc; if(!s) return; s.vis = e.isIntersecting; if(s.vis){ gFit(s); gRun(s); } }); }, {threshold: .35});
  if(GS.io) GS.io.observe(win); else { sc.vis = true; gRun(sc); }
  return wrap;
}

/* ---------- 各段的示意畫面 ---------- */
var G_SCENES = {
  /* 五個分頁：手指輪流點下方分頁，上面換成那一頁 */
  tabs: function(){
    function head(v){
      if(v === 'browse') return gView('v-browse', gBrTop({home: 1}) + '<div data-gid="brArea">' + gStart({noHero: 1}) + '</div>');
      if(v === 'yt') return gView('v-yt', gYtTop('') + gYtList());
      if(v === 'ai') return gView('v-ai', gAiTop() + gAiStart());
      if(v === 'lib') return gView('v-lib', '<div class="scroll"><div class="page">' + gPt('folder', '檔案庫', '離線網頁、PDF、圖片、影片都在這裡') + gCatBar('audio') + gLibTools() + gMusicCard() + '</div></div>');
      return gView('v-set', '<div class="scroll"><div class="page">' + gPt('gear', '設定', 'Terra 瀏覽器') + gSetCard('book', '軟體使用說明書', [['info', '打開說明書', '所有功能怎麼用'], ['globe', '語言 Language', '介面與說明書的語言']]) + gSetCard('lock', '隱私與安全', [['lock', '密碼鎖與指紋', '設定 6 位數密碼']]) + '</div></div>');
    }
    var order = ['yt', 'ai', 'lib', 'set', 'browse'];
    function go(v){ return function(scr){ var c = scr.querySelector('.gTabHost'); c.innerHTML = head(v); paintIcons(c); scr.querySelectorAll('[data-gid="nav"] button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === v); }); }; }
    return {h: 9999, cap: '下方五個分頁，點一下就切換',
      html: function(){ return '<div class="gTabHost">' + head('browse') + '</div>' + gNavH('browse'); },
      steps: order.map(function(v){ return ['tap', '[data-gid="nav"] button[data-v="' + v + '"]', go(v), 1300]; })};
  },
  /* 權限詢問 */
  perm: function(){
    return {h: 420, top: 160, cap: '用到功能時才會詢問',
      html: function(){ return gView('v-browse', gBrTop({home: 1}) + '<div data-gid="brArea">' + gStart() + '</div>') + gNavH('browse') + '<div class="gSys"><div class="gSysBox"><div class="gSysIc">' + gIc('info') + '</div><b>' + gE('要允許「Terra 瀏覽器」傳送通知嗎？') + '</b><div class="gSysBtn"><span data-g="allow">' + gE('允許') + '</span><span>' + gE('不允許') + '</span></div></div></div>'; },
      steps: [['wait', 500], ['tap', '[data-g="allow"]', function(scr){ scr.querySelector('.gSys').classList.add('off'); }, 900]]};
  },
  /* 首頁搜尋 */
  search: function(){
    return {h: 470, cap: '首頁直接輸入網址或關鍵字',
      html: function(){ return gView('v-browse', gBrTop({home: 1}) + '<div data-gid="brArea">' + gStart() + '</div>') + gNavH('browse'); },
      steps: [['type', '[data-g="in"]', '週末好去處'], ['tap', '[data-g="go"]', function(scr){ var a = scr.querySelector('[data-gid="brArea"]'); a.innerHTML = gWebPage('週末好去處', 'travel'); paintIcons(a); }, 1200],
        ['tap', '[data-g="search"]', function(scr){ var top = scr.querySelector('[data-gid="brTop"]'); top.outerHTML = gBrTop({url: 'travel.example.com/weekend'}); paintIcons(scr); }, 1500]]};
  },
  /* 功能選單 */
  menu: function(){
    var items = [['star', '收藏此頁'], ['books', '收藏清單'], ['history', '瀏覽記錄'], ['incog', '無痕模式'], ['expand', '滿版瀏覽'], ['scissors', '手動清理'], ['phone', '手機版'], ['sliders', '瀏覽設定'], ['sparkle', '翻譯網頁', 'tr'], ['download', '擷取網頁'], ['film', '下載影片'], ['info', '網頁診斷']];
    return {h: 9999, cap: '右上角「功能選單」',
      html: function(){ return gView('v-browse', gBrTop({}) + '<div data-gid="brArea" class="page">' + gWebPage('Journal du Matin', 'fr') + '</div>') + gNavH('browse'); },
      steps: [['tap', '[data-g="more"]', function(scr, el, sc){ gOpen(sc, gSheetH('功能', 'grid', '<div class="qGrid">' + items.map(function(x){ return '<button data-g="' + (x[2] || '') + '">' + gIc(x[0]) + '<span>' + gE(x[1]) + '</span></button>'; }).join('') + '</div>')); }, 1100],
        ['tap', '[data-g="tr"]', function(scr, el, sc){ gClose(sc); var a = scr.querySelector('[data-gid="brArea"]'); setTimeout(function(){ a.innerHTML = gWebPage('晨間日報', 'zh'); paintIcons(a); gToast(sc, '已翻譯成繁體中文'); }, 500); }, 1800]]};
  },
  /* 下載網頁影片／擷取網頁 */
  fab: function(){
    function big(ic, color, t, s, g){ return '<button class="fabBig" data-g="' + (g || '') + '"><span class="oi" style="background:' + color + '">' + gIc(ic) + '</span><div class="grow"><b>' + gE(t) + '</b><div class="sub">' + gE(s) + '</div></div></button>'; }
    return {h: 9999, cap: '右下角的懸浮下載鈕',
      html: function(){ return gView('v-browse', gBrTop({}) + '<div data-gid="brArea" class="page">' + gWebPage('露營新手指南', 'video') + '</div>') + gNavH('browse') + '<div class="gFab" data-g="fab">' + gIc('download') + '</div>'; },
      steps: [['tap', '[data-g="fab"]', function(scr, el, sc){ gOpen(sc, gSheetH('下載', 'download', big('film', 'var(--c-video)', '下載這個網頁的影片', '偵測到 2 個媒體・正在播放的影片會排在最前面', 'v') + big('download', 'var(--accent)', '擷取網頁', '存成離線 HTML／PDF') + big('scissors', 'var(--olive)', '手動清理', '點選要移除的區塊（廣告、浮動視窗）'))); }, 1200],
        ['tap', '[data-g="v"]', function(scr, el, sc){ gClose(sc); setTimeout(function(){ gOpen(sc, gSheetH('下載影片', 'film', gLrow('露營新手指南（1080p）', 'MP4・6:42・86 MB', 'var(--c-video)', 'd1', 'video') + gLrow('營火料理示範（720p）', 'MP4・3:15・31 MB', 'var(--c-video)', '', 'video'))); }, 350); }, 1300],
        ['tap', '[data-g="d1"]', function(scr, el, sc){ gClose(sc); gToast(sc, '開始下載：露營新手指南'); }, 1500]]};
  },
  /* 無痕、關閉分頁 */
  incog: function(){
    return {h: 640, top: 0, cap: '首頁的「無痕模式」與「關閉分頁」',
      html: function(){ return '<div class="gInc">' + gView('v-browse', gBrTop({home: 1, tabs: 3}) + '<div data-gid="brArea">' + gStart() + '</div>') + '</div>' + gNavH('browse'); },
      init: function(scr){ var s = scr.querySelector('[data-gid="startPage"]'); if(s) s.scrollTop = 150; },
      steps: [['tap', '[data-g="incog"]', function(scr, el, sc){ scr.querySelector('.gInc').classList.add('incogOn'); el.classList.add('on'); gToast(sc, '已開啟無痕模式'); }, 1500],
        ['tap', '[data-g="closeAll"]', function(scr, el, sc){ gOpen(sc, gDlgH('關閉全部 3 個分頁？', '', [['關閉', 'dang', 'ok'], ['取消']])); }, 1000],
        ['tap', '[data-g="ok"]', function(scr, el, sc){ gClose(sc); scr.querySelector('.gInc').classList.remove('incogOn'); var n = scr.querySelector('[data-gid="tabN"]'); if(n) n.textContent = '1'; gToast(sc, '已關閉所有分頁'); }, 1500]]};
  },
  /* YouTube／YouTube Music／收藏切換 */
  yt: function(){
    return {h: 520, cap: '右上角切換 YouTube、YouTube Music、收藏',
      html: function(){ return gView('v-yt', gYtTop('') + '<div class="gYtBody">' + gYtList() + '</div>') + gNavH('yt'); },
      steps: [['tap', '.ytMode .m-mu', function(scr){ scr.querySelector('.ytMode').classList.add('music'); var b = scr.querySelector('.gYtBody'); b.innerHTML = gYtmList(); paintIcons(b); }, 1500],
        ['tap', '.ytMode .m-fav', function(scr){ var m = scr.querySelector('.ytMode'); m.classList.remove('music'); m.classList.add('favm'); var b = scr.querySelector('.gYtBody'); b.innerHTML = gFavList(); paintIcons(b); }, 1600],
        ['tap', '.ytMode .m-yt', function(scr){ var m = scr.querySelector('.ytMode'); m.classList.remove('favm'); var b = scr.querySelector('.gYtBody'); b.innerHTML = gYtList(); paintIcons(b); }, 900]]};
  },
  /* 迷你播放列 → 播放畫面（同步歌詞） */
  player: function(){
    var L = ['清晨的風吹過窗台', '咖啡香慢慢醒來', '沿著河岸走一段路', '把昨天輕輕放下', '陽光落在你肩上'];
    return {h: 9999, cap: '迷你播放列：點一下打開播放畫面',
      html: function(){ return gView('v-lib', '<div class="scroll"><div class="page">' + gPt('folder', '檔案庫', '離線網頁、PDF、圖片、影片都在這裡') + gCatBar('audio') + gMusicCard() + '<div class="list">' + gLrow('晨光散步', '海風樂團・MP3・3:10', 'var(--c-audio)') + gLrow('夏夜晚風', '藍莓汽水・MP3・4:02', 'var(--c-audio)') + '</div></div></div>') + gNavH('lib'); },
      init: function(scr){ var dc = scr.querySelector('[data-gid="dockCards"]'); dc.innerHTML = gMiniH('晨光散步', '清晨的風吹過窗台'); paintIcons(dc); setTimeout(function(){ var b = scr.querySelector('[data-g="bar"]'); if(b) b.style.width = '46%'; }, 300); },
      steps: [['spot', '[data-g="mini"]', 900], ['tap', '[data-g="mini"]', function(scr, el, sc){
          var lyr = '<div class="lyrView" style="--lyr-size:19px;--lyr-cur:var(--accent);--lyr-other:var(--text-muted);text-align:center;--lyr-w:800"><div class="lyrPad"></div>' + L.map(function(x, i){ return '<div class="lyrLine' + (i === 0 ? ' on' : '') + '">' + gE(x) + '</div>'; }).join('') + '<div class="lyrPad"></div></div>';
          gOpen(sc, gSheetH('正在播放', 'audio', '<div><div class="mpStage">' + lyr + '</div><div class="row" style="gap:10px;margin-top:10px"><div class="th" style="width:46px;height:46px;border-radius:12px;flex:none;background:var(--c-audio)"></div><div class="grow"><b class="ell" style="font-size:17px;display:block">' + gE('晨光散步') + '</b><div class="sub ell">' + gE('海風樂團・MP3・7.0 MB') + '</div></div></div>' +
            '<div class="mpTools"><button class="chip">' + gIc('image', 1) + gE('封面') + '</button><button class="chip">' + gIc('search', 1) + gE('找歌詞') + '</button><button class="chip">' + gIc('type', 1) + gE('樣式') + '</button></div>' +
            '<div class="row" style="justify-content:center;gap:14px;margin:12px 0 14px"><button class="ib">' + gIc('back') + '</button><button class="btn pri" style="width:64px;height:64px;border-radius:50%;padding:0"><svg class="i fill" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button><button class="ib">' + gIc('fwd') + '</button></div></div>', {tall: true}));
          var i = 0, iv = setInterval(function(){ if(!scr.isConnected){ clearInterval(iv); return; } var ls = scr.querySelectorAll('.lyrLine'); if(!ls.length){ clearInterval(iv); return; } i = Math.min(i + 1, ls.length - 1); ls.forEach(function(x, k){ x.classList.toggle('on', k === i); x.classList.toggle('past', k < i); }); var v = scr.querySelector('.lyrView'); if(v) v.scrollTo({top: ls[i].offsetTop - v.clientHeight / 2 + 20, behavior: 'smooth'}); if(i >= ls.length - 1) clearInterval(iv); }, 1100);
        }, 5200]]};
  },
  /* 聽歌辨識 */
  listen: function(){
    return {h: 9999, cap: '首頁「聽歌辨識」：懸浮按鈕倒數後找出歌名',
      html: function(){ return gView('v-browse', gBrTop({home: 1}) + '<div data-gid="brArea">' + gStart() + '</div>') + gNavH('browse'); },
      init: function(scr){ var s = scr.querySelector('[data-gid="startPage"]'); if(s) s.scrollTop = 150; },
      steps: [['tap', '[data-g="listen"]', function(scr){ var b = document.createElement('div'); b.className = 'gBub'; b.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/></svg><b>5</b>'; scr.appendChild(b); var n = 5, iv = setInterval(function(){ n--; if(!b.isConnected || n < 1){ clearInterval(iv); return; } b.querySelector('b').textContent = n; }, 700); }, 4000],
        ['do', function(scr, sc){ var b = scr.querySelector('.gBub'); if(b) b.remove(); gOpen(sc, gSheetH('辨識結果', 'listen', '<div class="gLsnRes"><div class="gArt2"></div><div><b>' + gE('夏夜晚風') + '</b><div class="sub">' + gE('藍莓汽水・2024') + '</div></div></div><button class="btn pri block" data-g="play">' + gIc('play', 1) + gE('用 YouTube Music 播放') + '</button>')); }, 900],
        ['tap', '[data-g="play"]', function(scr, el, sc){ gClose(sc); gToast(sc, '已加入辨識紀錄'); }, 1500]]};
  },
  /* 新聞 */
  news: function(){
    var C = [['焦點', '#a85a32'], ['台灣', '#5d7e45'], ['國際', '#3c6e91'], ['財經', '#b4862a'], ['科技', '#5a5fa8'], ['娛樂', '#b0487a']];
    var N = {
      '焦點': [['新型電動巴士今日上路，首批行駛市區五條路線', '晨報新聞', '20 分鐘前'], ['連假出遊人潮湧現，各地景點提早實施交通管制', '日日電視', '1 小時前'], ['氣象專家：本週末鋒面南下，北部轉涼有雨', '天氣通', '2 小時前']],
      '科技': [['新款摺疊手機開賣，螢幕摺痕幾乎看不到', '科技週報', '35 分鐘前'], ['研究團隊發表省電晶片，續航力提升三成', '未來數位', '3 小時前'], ['雲端相簿推出 AI 自動整理旅行照片', '數位生活', '5 小時前']]
    };
    function card(n, i, c, on){ return i === 0 ? '<article class="nwCard hero" style="--nc:' + c + '"><div class="nwHeroTag">' + gE(n.cat) + '・' + gE('最新') + '</div><div class="nwBody"><h3 class="nwTitle">' + gE(n[0]) + '</h3><div class="nwMeta"><span class="nwFav">' + esc(T(n[1]).slice(0, 1)) + '</span><span class="nwSrc">' + gE(n[1]) + '</span><span class="nwDot">・</span><span>' + gE(n[2]) + '</span></div></div><button class="nwStar">' + gIc('star') + '</button></article>'
      : '<article class="nwCard" style="--nc:' + c + '"><div class="nwBody"><h3 class="nwTitle">' + gE(n[0]) + '</h3><div class="nwMeta"><span class="nwFav">' + esc(T(n[1]).slice(0, 1)) + '</span><span class="nwSrc">' + gE(n[1]) + '</span><span class="nwDot">・</span><span>' + gE(n[2]) + '</span></div></div><button class="nwStar' + (on ? ' on' : '') + '" data-g="star' + i + '">' + gIc(on ? 'starOn' : 'star') + '</button></article>'; }
    function list(cat){ var c = C.filter(function(x){ return x[0] === cat; })[0][1]; return N[cat].map(function(n, i){ n.cat = cat; return card(n, i, c); }).join(''); }
    function days(){ var d = new Date(), out = ''; for(var i = 0; i < 5; i++){ var x = new Date(d.getTime() - i * 864e5); out += '<button class="nwDay' + (i ? '' : ' on') + '"><small>' + gE(i === 0 ? '今天' : i === 1 ? '昨天' : '週' + '日一二三四五六'[x.getDay()]) + '</small><b>' + (x.getMonth() + 1) + '/' + x.getDate() + '</b></button>'; } return out; }
    return {h: 9999, cap: '首頁「新聞」：分類、日期、收藏',
      html: function(){ return gView('v-browse', '<div data-gid="newsPanel"><div class="nwHead"><button class="ib">' + gIc('back') + '</button><div class="nwTtl"><b>' + gE('新聞') + '</b><span></span></div><button class="ib">' + gIc('reload') + '</button><button class="ib">' + gIc('more') + '</button></div>' +
        '<div class="nwTabs"><button class="nwTab on" data-g="t1">' + gIc('news', 1) + gE('新聞') + '</button><button class="nwTab" data-g="t2">' + gIc('star', 1) + gE('收藏') + '<i data-g="fn">2</i></button><button class="nwTab">' + gIc('history', 1) + gE('記錄') + '</button></div>' +
        '<div class="nwDays">' + days() + '</div><div class="nwCats">' + C.map(function(c, i){ return '<button class="nwCat' + (i ? '' : ' on') + '" data-g="c' + c[0] + '" style="--nc:' + c[1] + '">' + gE(c[0]) + '</button>'; }).join('') + '</div><div class="nwList">' + list('焦點') + '</div></div>') + gNavH('browse'); },
      steps: [['tap', '[data-g="c科技"]', function(scr){ scr.querySelectorAll('.nwCat').forEach(function(b){ b.classList.toggle('on', b.dataset.g === 'c科技'); }); var l = scr.querySelector('.nwList'); l.innerHTML = list('科技'); paintIcons(l); }, 1200],
        ['tap', '[data-g="star1"]', function(scr, el, sc){ el.classList.add('on'); el.innerHTML = icon('starOn'); var f = scr.querySelector('[data-g="fn"]'); if(f) f.textContent = '3'; gToast(sc, '已收藏'); }, 1300],
        ['tap', '[data-g="t2"]', function(scr){ scr.querySelectorAll('.nwTab').forEach(function(b){ b.classList.toggle('on', b.dataset.g === 't2'); }); var l = scr.querySelector('.nwList'), d = new Date();
          var dh = T('今天') + '・' + (d.getMonth() + 1) + ' / ' + d.getDate();
          l.innerHTML = '<div class="nwGroup" style="--nc:#a85a32"><b>' + gE('焦點') + '</b><span>2</span></div><div class="nwDayHead">' + dh + '</div>' + card(N['焦點'][1], 1, '#a85a32', true) + card(N['焦點'][2], 2, '#a85a32', true) +
            '<div class="nwGroup" style="--nc:#5a5fa8"><b>' + gE('科技') + '</b><span>1</span></div><div class="nwDayHead">' + dh + '</div>' + card(N['科技'][1], 1, '#5a5fa8', true);
          var cs = scr.querySelector('.nwCats'), ds = scr.querySelector('.nwDays'); if(ds) ds.style.display = 'none';
          if(cs) cs.innerHTML = '<button class="nwCat on" style="--nc:var(--accent)">' + gE('全部') + ' <i>3</i></button><button class="nwCat" style="--nc:#a85a32">' + gE('焦點') + ' <i>2</i></button><button class="nwCat" style="--nc:#5a5fa8">' + gE('科技') + ' <i>1</i></button>';
          paintIcons(l); }, 1600]]};
  },
  /* AI 摘要 */
  ai: function(){
    return {h: 600, cap: '貼上 YouTube 網址，按「開始」',
      html: function(){ return gView('v-ai', gAiTop() + gAiStart()) + gNavH('ai'); },
      steps: [['tap', '[data-g="paste"]', function(scr){ scr.querySelector('.aiIn input').value = 'youtu.be/coffee-101'; }, 900],
        ['tap', '[data-g="startAi"]', function(scr){ var e = scr.querySelector('.gAiOut'); e.innerHTML = '<div class="card glass"><div class="row" style="gap:12px"><div class="spin"></div><div class="grow"><b>' + gE('十分鐘學會手沖咖啡') + '</b><div class="sub">' + gE('讀取字幕中…') + '</div></div></div></div>';
          setTimeout(function(){ if(!e.isConnected) return; e.innerHTML = '<div class="card glass gAiSum"><b>' + gE('重點摘要') + '</b><ul><li>' + gE('水溫 90～92°C，粉水比 1:15') + '</li><li>' + gE('先悶蒸 30 秒，再分三次注水') + '</li><li>' + gE('總時間控制在 2 分 30 秒內') + '</li></ul><div class="gChips"><span class="chip">' + gIc('list', 1) + gE('章節') + '</span><span class="chip">' + gIc('type', 1) + gE('逐字稿') + '</span><span class="chip">' + gIc('send', 1) + gE('問 AI') + '</span></div></div>'; paintIcons(e); }, 1600); }, 3600]]};
  },
  /* AI 設定（Gemini 金鑰） */
  aikey: function(){
    return {h: 9999, cap: 'AI 摘要右上角 → AI 設定',
      html: function(){ return gView('v-ai', gAiTop() + gAiStart()) + gNavH('ai'); },
      steps: [['tap', '[data-g="aiset"]', function(scr, el, sc){ gOpen(sc, gSheetH('AI 設定', 'sparkle', '<div class="field"><div class="lbl">' + gE('AI 引擎') + '</div><div class="seg"><button>' + gE('Claude 訂閱') + '</button><button class="on">Gemini</button></div></div><div class="field"><div class="lbl">' + gE('Gemini API 金鑰') + '</div><input type="text" readonly tabindex="-1" data-g="key" placeholder="AIza…" style="width:100%"></div>', {foot: '<button class="btn pri block" data-g="save">' + gE('儲存') + '</button>'})); }, 1000],
        ['type', '[data-g="key"]', 'AIzaSyD-example-key-0000'], ['tap', '[data-g="save"]', function(scr, el, sc){ gClose(sc); gToast(sc, '已儲存'); }, 1500]]};
  },
  /* 檔案庫：分類、資料夾、匯入到資料夾 */
  lib: function(){
    return {h: 9999, cap: '進到資料夾按「＋」，檔案直接匯入這個資料夾',
      html: function(){ return gView('v-lib', '<div class="scroll"><div class="page">' + gCatBar('audio') + gLibTools() + '<div class="gLibBody">' + gFolderView('') + '</div></div></div>') + gNavH('lib'); },
      steps: [['tap', '[data-g="f旅行"]', function(scr){ var b = scr.querySelector('.gLibBody'); b.innerHTML = gFolderView('旅行'); paintIcons(b); }, 1100],
        ['tap', '[data-g="add"]', function(scr, el, sc){ gOpen(sc, '<div class="sheetWrap"><div class="sheetBg"></div><div class="gPicker"><b>' + gE('選擇檔案') + '</b>' + ['山間小路.mp3', '海邊日落.mp3'].map(function(n, i){ return '<div class="gPk on">' + gIc('audio', 1) + '<span>' + esc(T(n.replace('.mp3', ''))) + '.mp3</span>' + gIc('check', 1) + '</div>'; }).join('') + '<div class="gPkBtn" data-g="pk">' + gE('選取') + '</div></div></div>'); }, 1100],
        ['tap', '[data-g="pk"]', function(scr, el, sc){ gClose(sc); var l = scr.querySelector('.gLibBody .list'); l.insertAdjacentHTML('afterbegin', gLrow('山間小路', '溪谷樂隊・MP3・3:48', 'var(--c-audio)') + gLrow('海邊日落', '溪谷樂隊・MP3・4:20', 'var(--c-audio)')); paintIcons(l); gToast(sc, '✓ 已匯入 2 個檔案到「旅行」'); }, 1800]]};
  },
  /* 選取、改名 */
  rename: function(){
    return {h: 9999, cap: '長按檔案 → 選取，再按「重新命名」',
      html: function(){ return gView('v-lib', '<div class="scroll"><div class="page">' + gCatBar('audio') + '<div data-gid="selBar" class="selBar glass hide"></div>' + gLibTools() + '<div class="gLibBody">' + gFolderView('') + '</div></div></div>') + gNavH('lib'); },
      steps: [['hold', '[data-g="r1"]', function(scr){ el1(scr).classList.add('on'); scr.querySelector('[data-gid="libTools"]').classList.add('hide'); var sb = scr.querySelector('[data-gid="selBar"]'); sb.classList.remove('hide');
          sb.innerHTML = '<button class="ib">' + gIc('x') + '</button><b>' + gE('已選 1 個') + '</b><button class="ib">' + gIc('checks') + '</button><button class="ib">' + gIc('layers') + '</button><button class="ib">' + gIc('folder') + '</button><button class="ib" data-g="ren">' + gIc('edit') + '</button><button class="ib">' + gIc('share') + '</button><button class="ib" style="color:var(--danger)">' + gIc('trash') + '</button>'; paintIcons(sb); }, 900],
        ['tap', '[data-g="ren"]', function(scr, el, sc){ gOpen(sc, gDlgH('重新命名', '<input type="text" readonly tabindex="-1" data-g="nm" value="' + gE('Track 01') + '" style="width:100%;margin-top:6px">', [['確定', 'pri', 'ok'], ['取消']])); }, 900],
        ['type', '[data-g="nm"]', '晨光散步', true], ['tap', '[data-g="ok"]', function(scr, el, sc){ gClose(sc); var r = el1(scr); r.querySelector('b').textContent = T('晨光散步'); r.classList.remove('on'); scr.querySelector('[data-gid="selBar"]').classList.add('hide'); scr.querySelector('[data-gid="libTools"]').classList.remove('hide'); gToast(sc, '已重新命名'); }, 1600]],
      init: function(scr){ var r = el1(scr); if(r) r.querySelector('b').textContent = 'Track 01'; }};
    function el1(scr){ return scr.querySelector('[data-g="r1"]'); }
  },
  /* 音樂庫：補齊歌手與歌詞 */
  music: function(){
    return {h: 9999, cap: '音樂庫：自動補齊歌手與歌詞',
      html: function(){ return gView('v-lib', '<div class="scroll"><div class="page">' + gCatBar('audio') + gMusicCard() + '<button class="btn ghost sm fixBtn" data-g="fix">' + gIc('pdf', 1) + gE('補齊歌手與歌詞') + '<span class="c">' + gE('缺歌手 2・缺歌詞 2') + '</span></button><div class="list gML">' + gLrow('晨光散步', 'MP3・3:10', 'var(--c-audio)', 'm1') + gLrow('夏夜晚風', 'MP3・4:02', 'var(--c-audio)', 'm2') + '</div></div></div>') + gNavH('lib'); },
      steps: [['tap', '[data-g="fix"]', function(scr){ [['m1', '海風樂團・MP3・3:10・歌詞'], ['m2', '藍莓汽水・MP3・4:02・歌詞']].forEach(function(x, i){ setTimeout(function(){ var r = scr.querySelector('[data-g="' + x[0] + '"]'); if(!r) return; r.querySelector('.sub').textContent = T(x[1]); r.classList.add('gFlash'); }, 600 + i * 700); }); setTimeout(function(){ var c = scr.querySelector('[data-g="fix"] .c'); if(c) c.textContent = T('缺歌手 0・缺歌詞 0'); }, 2100); }, 2600],
        ['tap', '[data-g="playAll"]', function(scr){ var dc = scr.querySelector('[data-gid="dockCards"]'); dc.innerHTML = gMiniH('晨光散步', '海風樂團'); paintIcons(dc); setTimeout(function(){ var b = scr.querySelector('[data-g="bar"]'); if(b) b.style.width = '40%'; }, 200); }, 1800]]};
  },
  /* 密碼鎖 */
  lock: function(){
    function dots(n){ var s = ''; for(var i = 0; i < 6; i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return s; }
    return {h: 9999, cap: '設定 → 隱私與安全 → 密碼鎖與指紋',
      html: function(){ return gView('v-set', '<div class="scroll"><div class="page">' + gPt('gear', '設定', 'Terra 瀏覽器') + gSetCard('shield', '隱私與安全', [['lock', '密碼鎖與指紋', '設定密碼，把帳號密碼、檔案庫的分類或資料夾鎖起來', 'lk']]) + gSetCard('palette', '外觀', [['palette', '主題與配色', '跟隨系統・大地棕']]) + '</div></div>') + gNavH('set'); },
      steps: [['tap', '[data-g="lk"]', function(scr, el, sc){ gOpen(sc, gSheetH('設定解鎖密碼', 'key', '<div class="pinBox"><div class="pinLock">' + gIc('key') + '</div><div class="pinDots">' + dots(0) + '</div><div class="pinMsg">' + gE('至少 6 位數字') + '</div><div class="pinKeys">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(function(k){ return '<button class="pinKey' + (k ? '' : ' ghost') + '" data-g="k' + k + '">' + (k === 'del' ? gIc('back') : k) + '</button>'; }).join('') + '</div></div>')); }, 900]]
        .concat(['2', '5', '8', '0', '1', '4'].map(function(k, i){ return ['tap', '[data-g="k' + k + '"]', function(scr){ var d = scr.querySelector('.pinDots'); if(d) d.innerHTML = dots(i + 1); }, 180]; }))
        .concat([['do', function(scr, sc){ gClose(sc); gToast(sc, '🔒 密碼鎖已開啟'); }, 1500]])};
  },
  /* 其他 App 下載自動搬回 */
  watch: function(){
    return {h: 9999, cap: '其他 App 下載完，自動搬進檔案庫',
      html: function(){ return gView('v-set', '<div class="scroll"><div class="page">' + gPt('gear', '設定', 'Terra 瀏覽器') + gSetCard('film', '圖片與影片下載', [['download', '其他 App 下載自動搬回', 'Snaptube 等 App 下載完自動搬進檔案庫', 'w'], ['folder', '下載資料夾', '已加入 1 個資料夾']]) + '</div></div>') + gNavH('set'); },
      steps: [['tap', '[data-g="w"]', function(scr, el, sc){ gOpen(sc, gSheetH('其他 App 下載自動搬回', 'download', '<label class="lab"><span>' + gE('自動搬回') + '<span class="sub">' + gE('下載完成後自動搬進檔案庫') + '</span></span><span class="sw"><input type="checkbox" data-g="sw"><span></span></span></label>' + gLrow('Download/Snaptube', '影片、音樂', 'var(--c-video)', '', 'folder') + '<button class="btn block" style="margin-top:10px">' + gIc('plus', 1) + gE('加入下載資料夾') + '</button>')); }, 1000],
        ['tap', '.sw', function(scr){ var c = scr.querySelector('[data-g="sw"]'); if(c) c.checked = true; }, 900], ['do', function(scr, sc){ gClose(sc); gToast(sc, '✓ 已搬回 1 個檔案：露營新手指南.mp4'); }, 1600]]};
  },
  /* 傳檔 */
  relay: function(){
    return {cap: '傳檔：手機加密 → 中繼站 → 對方用瀏覽器下載',
      html: function(){ return '<div class="gFlowS" style="bottom:auto;height:250px"><div class="gNode">' + gIc('phone') + '<b>' + gE('你的手機') + '</b><small>' + gE('加密') + '</small></div><div class="gLine"><i class="gPkt">' + gIc('lock', 1) + '</i></div><div class="gNode">' + gIc('cloud') + '<b>' + gE('中繼站') + '</b><small>GitHub／' + gE('公用') + '</small></div><div class="gLine"><i class="gPkt d2">' + gIc('lock', 1) + '</i></div><div class="gNode">' + gIc('pc') + '<b>' + gE('對方的裝置') + '</b><small>' + gE('解密下載') + '</small></div></div>'; },
      h: 250, steps: [['wait', 3200]]};
  },
  /* 更新 */
  upd: function(){
    return {h: 9999, cap: '設定 → 版本與更新',
      html: function(){ return gView('v-set', '<div class="scroll"><div class="page">' + gPt('gear', '設定', 'Terra 瀏覽器') + gSetCard('update', '版本與更新', [['reload', '檢查更新', T('目前版本') + ' v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '2'), 'chk'], ['download', '下載 APK 到手機', '可選最新版或任一舊版本'], ['share', '分享這個 App', '傳下載網址給朋友']]) + '</div></div>') + gNavH('set'); },
      steps: [['tap', '[data-g="chk"]', function(scr, el, sc){ gToast(sc, '已經是最新版本'); }, 1600]]};
  }
};
/* 共用的頁面片段 */
function gPt(ic, t, sub){ return '<h2 class="pt"><span class="logo">' + gIc(ic) + '</span><span>' + gE(t) + '<small>' + gE(sub) + '</small></span></h2>'; }
function gYtTop(mode){
  return '<div data-gid="ytTop" class="glass"><button class="ib" disabled>' + gIc('back') + '</button><button class="ib">' + gIc('home') + '</button><button class="ib">' + gIc('reload') + '</button><button class="ib">' + gIc('grid') + '</button><div class="ytTitle"></div>' +
    '<button class="ytMode' + (mode ? ' ' + mode : '') + '"><span class="m-yt">' + gIc('ytplay') + '</span><span class="m-mu">' + gIc('audio') + '</span><span class="m-fav">' + gIc('star') + '</span></button></div>';
}
function gYtList(){
  var V = [['十分鐘學會手沖咖啡', '慢活咖啡館・12 萬次觀看', '#8a5a3c', '10:24'], ['城市夜景縮時攝影', '光影旅人・8.6 萬次觀看', '#3c5a8a', '4:51']];
  return '<div class="gYt">' + V.map(function(v){ return '<div class="gYtV"><div class="gYtTh" style="background:linear-gradient(135deg,' + v[2] + ',#1d140e)"><span>' + v[3] + '</span></div><div class="gYtM"><i style="background:' + v[2] + '"></i><div><b>' + gE(v[0]) + '</b><small>' + gE(v[1]) + '</small></div></div></div>'; }).join('') + '</div>';
}
function gYtmList(){
  var S = [['夏夜晚風', '藍莓汽水', '#c71585'], ['晨光散步', '海風樂團', '#d4813a'], ['雨後的街', '小鎮青年', '#3c6e91'], ['星空下的約定', '月光合唱團', '#5a5fa8']];
  return '<div class="gYtm"><b class="gYtmH">' + gE('為你推薦') + '</b>' + S.map(function(s){ return '<div class="gYtmR"><i style="background:linear-gradient(135deg,' + s[2] + ',#2a1a22)"></i><div><b>' + gE(s[0]) + '</b><small>' + gE(s[1]) + '</small></div>' + gIc('more', 1) + '</div>'; }).join('') + '</div>';
}
function gFavList(){
  return '<div class="gYtm"><b class="gYtmH">' + gE('總收藏數：5 部／12 首') + '</b>' + [['📁', '咖啡教學', '3 部'], ['📁', '健身', '2 部'], ['🎵', '開車聽', '12 首']].map(function(f){ return '<div class="gYtmR"><span class="gFolderE">' + f[0] + '</span><div><b>' + gE(f[1]) + '</b><small>' + gE(f[2]) + '</small></div>' + gIc('more', 1) + '</div>'; }).join('') + '</div>';
}
function gAiTop(){ return '<div class="aiTop glass"><span class="aiLogo">' + gIc('sparkle') + '</span><div class="aiTitle"><b>' + gE('AI 摘要') + '</b><small>' + gE('貼上 YouTube 網址，產生摘要、章節與問答') + '</small></div><button class="aiEng ok" data-gid="aiEng"><i></i><span>Gemini</span></button><button class="ib" data-g="aiset">' + gIc('sliders') + '</button></div>'; }
function gAiStart(){ return '<div class="scroll aiStart"><div class="page"><div class="card glass aiHero"><div class="aiHeroT">' + gIc('sparkle') + '<b>' + gE('YouTube 影片 AI 洞察') + '</b></div><div class="sub">' + gE('在 YouTube App 按「分享」→「AI 摘要（Terra 瀏覽器）」就會自動分析；也可以在這裡貼上網址。') + '</div><div class="aiIn"><input type="url" readonly tabindex="-1" placeholder="' + gE('貼上 YouTube 影片網址…') + '"><button class="ib" data-g="paste">' + gIc('copy') + '</button><button class="btn pri" data-g="startAi">' + gIc('sparkle', 1) + gE('開始') + '</button></div></div><div class="gAiOut"></div></div></div>'; }
function gCatBar(on){
  var C = [['html', 'html', '網頁', 6], ['pdf', 'pdf', 'PDF', 3], ['video', 'video', '影片', 9], ['audio', 'audio', '音樂庫', 24], ['image', 'image', '圖片', 15]];
  return '<div class="catBar" data-gid="catBar">' + C.map(function(c){ return '<button class="fchip' + (c[0] === on ? ' on' : '') + '">' + gIc(c[1], 1) + gE(c[2]) + ' <span class="c">' + c[3] + '</span></button>'; }).join('') + '</div>';
}
function gLibTools(){ return '<div class="libTools" data-gid="libTools"><div class="srch">' + gIc('search', 1) + '<input type="search" readonly tabindex="-1" placeholder="' + gE('搜尋檔名、網址…') + '"></div><div class="libBtns"><button class="ib">' + gIc('reload') + '</button><button class="ib" data-g="add">' + gIc('plus') + '</button><button class="ib">' + gIc('sort') + '</button><button class="ib">' + gIc('list') + '</button><button class="ib">' + gIc('lock') + '</button><button class="ib">' + gIc('check') + '</button></div></div>'; }
function gMusicCard(){ return '<div class="card glass" style="display:flex;align-items:center;gap:12px"><div class="fav" style="width:58px;height:58px;background:linear-gradient(140deg,var(--c-audio),var(--accent));color:#fff">' + gIc('audio') + '</div><div class="grow"><b style="font-size:17px">' + gE('音樂庫') + '</b><div class="sub">' + gE('24 首・1:28:40') + '</div></div><button class="btn pri sm" data-g="playAll">' + gIc('play', 1) + gE('播放') + '</button><button class="btn sm">' + gE('隨機') + '</button></div>'; }
function gFolderView(cur){
  var crumbs = '<div class="crumbs"><button class="crumb' + (cur ? '' : ' on') + '">' + gIc('audio', 1) + gE('音樂庫') + '</button>' + (cur ? '<button class="crumb on">📁 ' + gE(cur) + '</button>' : '') + '</div>';
  var head = '<div class="folderHead">' + crumbs + '<button class="ib">' + gIc('sort') + '</button><button class="btn sm">' + gIc('plus', 1) + gE('資料夾') + '</button></div>';
  if(cur) return head + '<div class="list">' + gLrow('林間清晨', '溪谷樂隊・MP3・3:36', 'var(--c-audio)') + '</div>';
  return head + '<div class="fgrid">' + gFtile('📁', '華語', '12 個檔案') + gFtile('📁', '英文歌', '6 個檔案') + gFtile('📁', '旅行', '1 個檔案', 'f旅行') + gFtile('📁', '工作', '3 個檔案') + '</div><div class="list">' + gLrow('Track 01', 'MP3・3:10・7.0 MB', 'var(--c-audio)', 'r1') + gLrow('夏夜晚風', '藍莓汽水・MP3・4:02', 'var(--c-audio)') + '</div>';
}
function gWebPage(title, kind){
  var body = {
    travel: ['海邊步道一日遊', '山城老街散策', '湖畔露營地推薦'],
    fr: ['La météo de demain sera ensoleillée.', 'Le nouveau musée ouvre ce week-end.', 'Les marchés de Noël commencent.'],
    zh: ['明天天氣晴朗。', '新博物館本週末開幕。', '聖誕市集即將登場。'],
    video: ['新手必備的五樣裝備', '選擇營地的小技巧', '晚上保暖的方法']
  }[kind] || [];
  return '<div class="gWeb"><div class="gWebHd"><i></i><b>' + esc(kind === 'fr' ? title : T(title)) + '</b></div>' + (kind === 'video' ? '<div class="gWebVid"><span>' + gIc('play') + '</span><u></u></div>' : '<div class="gWebImg ' + kind + '"></div>') + body.map(function(t){ return '<p><b>' + esc(kind === 'fr' ? t : T(t)) + '</b><span></span><span class="s"></span></p>'; }).join('') + '</div>';
}

/* ---------- 說明書內容：每段＝示意畫面＋2～3 行重點 ---------- */
var GUIDE2 = [
  {ic: 'info', t: '五個分頁', scene: 'tabs', open: true, pts: ['瀏覽：上網、存網頁、下載影片', 'YouTube：沒有廣告、背景播放', 'AI 摘要：影片重點一次看', '檔案庫：存下來的東西都在這', '設定：外觀、密碼鎖、更新']},
  {ic: 'shield', t: '第一次使用：允許權限', scene: 'perm', open: true, pts: ['用到某個功能時，手機才會問', '選「允許」；不用的功能可以不允許'],
    perms: [['download', '通知', '下載進度、背景播放'], ['mic', '麥克風', '聽周圍的歌'], ['layers', '顯示在上層', '懸浮聽歌按鈕'], ['qr', '相機', '掃 QR Code'], ['globe', '位置', '網站要用位置時'], ['fingerprint', '指紋', '解鎖']],
    tip: '關螢幕後音樂或下載會停：手機設定 → 應用程式 → Terra 瀏覽器 → 電池 →「不限制」'},
  {ic: 'globe', t: '上網與搜尋', scene: 'search', pts: ['首頁輸入網址或關鍵字', '上方 🔍 顯示網址，可以複製、重新整理', '每次打開 App 都從首頁開始']},
  {ic: 'grid', t: '功能選單：翻譯網頁', scene: 'menu', pts: ['右上角 ⊞ 打開功能選單', '「翻譯網頁」：整頁翻成你的語言', '無痕、滿版、手機版／電腦版也在這裡']},
  {ic: 'download', t: '下載影片、存網頁', scene: 'fab', pts: ['先播放網頁裡的影片', '點右下角懸浮的下載鈕，選要下載的影片', '「擷取網頁」可以存成離線網頁或 PDF']},
  {ic: 'incog', t: '無痕模式、關閉分頁', scene: 'incog', pts: ['無痕模式：不留瀏覽記錄', '關閉分頁：一次關掉全部（新聞分頁也一起）', '上方數字按鈕可以切換分頁']},
  {ic: 'ytplay', t: 'YouTube 與 YouTube Music', scene: 'yt', pts: ['▶ YouTube　♫ YouTube Music　☆ 收藏', '沒有廣告，關掉螢幕也能繼續播', '影片上的 ⬇ 可以下載影片、音樂、字幕']},
  {ic: 'audio', t: '播放畫面與歌詞', scene: 'player', pts: ['播放時下方出現迷你播放列', '點一下打開播放畫面，歌詞會跟著唱', '最右邊 ✕ 停止播放']},
  {ic: 'listen', t: '聽歌辨識', scene: 'listen', pts: ['首頁「聽歌辨識」，或手機快速設定的磚塊', '可以聽手機播的聲音或周圍的聲音', '倒數時點一下取消、長按關閉']},
  {ic: 'news', t: '新聞', scene: 'news', pts: ['首頁「新聞」：依分類、日期看', '☆ 收藏，自動依分類和日期整理', '新聞用獨立分頁打開，閱讀記錄可以單獨清除']},
  {ic: 'sparkle', t: 'AI 摘要', scene: 'ai', pts: ['貼上 YouTube 網址，按「開始」', '或在 YouTube App 分享 →「AI 摘要」', '可以看章節、逐字稿，也能問 AI']},
  {ic: 'key', t: '設定 AI 金鑰（免費）', scene: 'aikey', pts: ['到 aistudio.google.com 用 Google 帳號登入', '按「Get API key」建立金鑰並複製', 'AI 設定 → 引擎選 Gemini → 貼上金鑰']},
  {ic: 'folder', t: '檔案庫與資料夾', scene: 'lib', pts: ['上方分類切換：網頁、PDF、影片、音樂庫…', '在資料夾裡按 ＋，匯入的檔案會放進這個資料夾', '其他種類的檔案放到各自分類']},
  {ic: 'edit', t: '選取、改名、移動', scene: 'rename', pts: ['長按檔案進入選取', '上方工具列：移動、改名、分享、刪除', '改名後歌名、檔名一起更新']},
  {ic: 'audio', t: '音樂庫', scene: 'music', pts: ['全部播放或隨機播放', '「補齊歌手與歌詞」自動從 YouTube Music 找', '每首歌的音量自動調成一樣大聲']},
  {ic: 'lock', t: '密碼鎖與指紋', scene: 'lock', pts: ['設定一組 6 位數密碼，也可以用指紋', '可以鎖：帳號密碼、分類、資料夾、收藏', '檔案庫的 🔒 按鈕可以鎖整個分類']},
  {ic: 'download', t: '其他 App 下載自動搬回', scene: 'watch', pts: ['開啟後選一次那個 App 的下載資料夾', '下載完成會自動搬進檔案庫']},
  {ic: 'send', t: '傳檔到其他裝置', scene: 'relay', pts: ['檔案庫選檔案 → 分享 → 傳檔', '兩邊不用在同一個網路，對方用瀏覽器就能下載']},
  {ic: 'update', t: '版本與更新', scene: 'upd', pts: ['開啟 App 時自動更新介面與功能', '大改版才需要下載新的安裝檔']},
  {ic: 'info', t: '常見問題', faq: [
    ['音樂或下載關螢幕後停了', '手機設定 → Terra 瀏覽器 → 電池 →「不限制」'],
    ['播放到一半停了', '其他 App 出聲會搶走播放；安靜 3 秒後會自動接著播'],
    ['藍牙耳機斷線就暫停', '這是「耳機斷線時暫停」，刻意的'],
    ['YouTube 影片下載失敗', '更新 App 後再試；也可以交給其他下載 App'],
    ['網頁圖片沒出現', '功能選單 →「網頁診斷」，把結果傳給開發者'],
    ['找不到檔案', '檔案庫上方搜尋；也看看上鎖的分類或垃圾桶']]}
];

function gSecBody(g){
  var b = h('div', {class: 'gBody'});
  if(g.scene && G_SCENES[g.scene]){ try{ b.appendChild(gScene(G_SCENES[g.scene]())); }catch(e){ console.warn('guide scene', g.scene, e); } }
  if(g.pts) b.appendChild(h('ol', {class: 'gPts', 'data-i18n-skip': '', html: g.pts.map(function(p){ return '<li>' + gE(p) + '</li>'; }).join('')}));
  if(g.perms) b.appendChild(h('div', {class: 'gPerms', 'data-i18n-skip': '', html: g.perms.map(function(p){ return '<div>' + icon(p[0], 'sm') + '<b>' + gE(p[1]) + '</b><small>' + gE(p[2]) + '</small></div>'; }).join('')}));
  if(g.faq) b.appendChild(h('div', {class: 'gFaq', 'data-i18n-skip': '', html: g.faq.map(function(q){ return '<div><b>' + gE(q[0]) + '</b><span>' + gE(q[1]) + '</span></div>'; }).join('')}));
  if(g.tip) b.appendChild(h('div', {class: 'gNote', 'data-i18n-skip': '', html: icon('info', 'sm') + '<span>' + gE(g.tip) + '</span>'}));
  return b;
}
function openGuide(first){
  var body = h('div', {class: 'guide'});
  body.appendChild(h('p', {class: 'gLead', 'data-i18n-skip': '', text: T(first ? '歡迎使用！每一段都有會動的示範畫面，看一遍就會用。滑到最下面按確認開始使用。' : '點標題展開，示範畫面會自動播放。')}));
  body.appendChild(h('div', {class: 'btn-row', style: {margin: '0 0 10px'}}, h('button', {class: 'btn', 'data-i18n-skip': '', html: icon('globe', 'sm') + '語言 Language：' + (typeof I18N !== 'undefined' ? I18N.label() : '繁體中文'), onclick: function(){ openLang(); }})));
  GUIDE2.forEach(function(g, i){
    var d = h('details', {class: 'gSec'});
    d.appendChild(h('summary', {'data-i18n-skip': '', html: '<span class="gIc">' + icon(g.ic) + '</span><b>' + gE(g.t) + '</b><span class="gChev">' + icon('chevR', 'sm') + '</span>'}));
    var built = false;
    function build(){ if(built) return; built = true; d.appendChild(gSecBody(g)); }
    if(g.open){ d.open = true; build(); }
    d.addEventListener('toggle', function(){ if(d.open){ build(); buzz(6); } });
    body.appendChild(d);
  });
  var ok = false;
  var btn = h('button', {class: 'btn pri gOk', html: icon('check', 'sm') + esc(T(first ? '我知道了，開始使用' : '關閉說明書')), 'data-i18n-skip': '', onclick: function(){ ok = true; lsSet('ws.guideSeen', GUIDE_VER); buzz(12); s.close(); }});
  body.appendChild(h('div', {class: 'gEnd'}, first ? h('div', {class: 'sub', 'data-i18n-skip': '', text: T('之後想再看：設定 → 最上面的「軟體使用說明書」')}) : null, btn));
  var s = openSheet({title: T('軟體使用說明書'), icon: 'books', body: body, tall: true, cls: 'guideSheet'});
  if(first){
    var close0 = s.close;
    s.close = function(){ if(!ok){ toast(T('請滑到最下面，按「我知道了，開始使用」')); btn.scrollIntoView({behavior: 'smooth', block: 'center'}); return; } close0(); };
  }
  paintIcons(body);
  return s;
}
/* 第一次使用（還沒按過確認）：App 開好後自動顯示 */
setTimeout(function(){ if(lsGet('ws.guideSeen', 0) < GUIDE_VER && !Sheets.stack.length) openGuide(true); }, 900);
