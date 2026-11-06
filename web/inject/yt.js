/* YouTube 去廣告（概念同 Morphe／ReVanced 的「隱藏廣告」：把播放資料裡的廣告欄位拿掉，畫面上的廣告元素隱藏，漏網的影片廣告自動跳過）
   由 App 插在 YouTube 網頁 <head> 最前面，比 YouTube 自己的程式更早執行。 */
(function () {
  'use strict';
  if (window.__wsYT) return;
  window.__wsYT = 1;
  var KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adBreakParams'];
  function prune(o, depth) {
    if (!o || typeof o !== 'object' || (depth || 0) > 6) return o;
    for (var i = 0; i < KEYS.length; i++) if (KEYS[i] in o) { try { delete o[KEYS[i]]; } catch (e) {} }
    if (o.playerResponse) prune(o.playerResponse, (depth || 0) + 1);
    if (o.response && o.response.playerResponse) prune(o.response.playerResponse, (depth || 0) + 1);
    if (Array.isArray(o)) for (var j = 0; j < o.length && j < 20; j++) prune(o[j], (depth || 0) + 1);
    /* 首頁／搜尋結果裡的贊助內容 */
    if (o.contents && o.contents.sectionListRenderer) cleanList(o.contents.sectionListRenderer.contents);
    return o;
  }
  function cleanList(arr) {
    if (!Array.isArray(arr)) return;
    for (var i = arr.length - 1; i >= 0; i--) {
      var it = arr[i], s = it ? JSON.stringify(Object.keys(it)) : '';
      if (/adSlotRenderer|promotedSparklesWebRenderer|promotedVideoRenderer|compactPromotedVideoRenderer|displayAdRenderer|statementBannerRenderer|inFeedAdLayoutRenderer/.test(s)) arr.splice(i, 1);
    }
  }
  var JP = JSON.parse;
  JSON.parse = function (t, r) {
    var o = JP.call(this, t, r);
    try { if (o && typeof o === 'object' && (o.adPlacements || o.playerAds || o.adSlots || o.playerResponse || o.contents)) prune(o); } catch (e) {}
    return o;
  };
  try {
    var RJ = Response.prototype.json;
    Response.prototype.json = function () { return RJ.call(this).then(function (o) { try { prune(o); } catch (e) {} return o; }); };
  } catch (e) {}
  ['ytInitialPlayerResponse', 'ytInitialData'].forEach(function (name) {
    var v = window[name];
    try {
      Object.defineProperty(window, name, {configurable: true, get: function () { return v; }, set: function (x) { v = prune(x); }});
      if (v) prune(v);
    } catch (e) {}
  });

  /* 畫面上的廣告元素 */
  var CSS = [
    'ytd-ad-slot-renderer', 'ytm-promoted-sparkles-web-renderer', 'ytd-promoted-sparkles-web-renderer', 'ytm-companion-ad-renderer', 'ytd-companion-slot-renderer',
    'ad-slot-renderer', 'ytm-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', 'ytd-banner-promo-renderer', 'ytm-promoted-video-renderer', 'ytd-promoted-video-renderer',
    'ytd-display-ad-renderer', 'ytm-display-ad-renderer', 'ytd-statement-banner-renderer', 'ytm-statement-banner-renderer', 'ytd-video-masthead-ad-v3-renderer',
    'ytd-primetime-promo-renderer', 'ytd-player-legacy-desktop-watch-ads-renderer', '#player-ads', '#masthead-ad', '.ytp-ad-module', '.video-ads', '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay', 'ytm-item-section-renderer:has(> lazy-list > ad-slot-renderer)', 'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)', 'ytd-merch-shelf-renderer',
    'ytm-merch-shelf-renderer', 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]', 'tp-yt-paper-dialog:has(ytd-mealbar-promo-renderer)', 'ytm-mealbar-promo-renderer'
  ].join(',') + '{display:none!important}';
  function addCss() {
    if (document.getElementById('__ws_ytcss')) return;
    var st = document.createElement('style'); st.id = '__ws_ytcss'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  if (document.documentElement) addCss(); else document.addEventListener('readystatechange', addCss);
  document.addEventListener('DOMContentLoaded', addCss);

  /* 漏網的影片廣告：靜音、快轉到結尾、按「略過」 */
  var skipped = 0;
  function skipNow() {
    addCss();
    var p = document.querySelector('.ad-showing, .ad-interrupting');
    if (!p) {
      if (window.__wsYTmuted) { var mv = document.querySelector('video'); if (mv) { mv.muted = false; mv.playbackRate = 1; } window.__wsYTmuted = 0; }
      return;
    }
    var v = p.querySelector('video') || document.querySelector('video');
    if (v && isFinite(v.duration) && v.duration > 0) { if (!v.muted) window.__wsYTmuted = 1; v.muted = true; try { v.currentTime = Math.max(0, v.duration - 0.05); } catch (e) {} v.playbackRate = 16; }
    var b = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytm-skip-ad-button, button[class*="skip-ad"], .ytp-ad-skip-button-container button');
    if (b) b.click();
    skipped++;
  }
  setInterval(skipNow, 120);
  var moAd = new MutationObserver(function () { if (document.querySelector('.ad-showing, .ad-interrupting')) skipNow(); });
  function watchPlayer() { var pl = document.querySelector('.html5-video-player, #movie_player'); if (pl && !pl.__wsObs) { pl.__wsObs = 1; moAd.observe(pl, {attributes: true, attributeFilter: ['class']}); } }
  setInterval(watchPlayer, 500);
  window.__wsYTskipped = function () { return skipped; };

  /* ============================================================
     播放器強化（Morphe 風格）：背景播放、子母畫面、播放速度、循環、
     SponsorBlock 自動跳過贊助片段、預設最高畫質、手勢調亮度／音量、一鍵下載
     ============================================================ */
  var O = Object.assign({bg: true, pip: true, sb: true, q: 'max', gest: true, bar: true, speed: true}, (window.__wsCfg && window.__wsCfg.yt) || {});
  var B = window.WSPage;
  /* 背景播放：讓 YouTube 以為畫面一直在前景，不會自動暫停 */
  if (O.bg) {
    try {
      Object.defineProperty(document, 'hidden', {configurable: true, get: function () { return false; }});
      Object.defineProperty(document, 'visibilityState', {configurable: true, get: function () { return 'visible'; }});
      Object.defineProperty(document, 'webkitHidden', {configurable: true, get: function () { return false; }});
      ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'blur'].forEach(function (ev) {
        var stop = function (e) { if (e.target === window || e.target === document) e.stopImmediatePropagation(); };
        window.addEventListener(ev, stop, true); document.addEventListener(ev, stop, true);
      });
    } catch (e) {}
  }
  function vid() { return document.querySelector('.html5-video-player video, video'); }
  function videoId() { try { var u = new URL(location.href); return u.searchParams.get('v') || ((u.pathname.match(/\/(shorts|live)\/([\w-]{11})/) || [])[2]) || ''; } catch (e) { return ''; } }
  function toastIn(msg) {
    var pl = document.querySelector('.html5-video-player, #player-container-id') || document.body;
    var t = document.createElement('div');
    t.textContent = msg;
    t.setAttribute('style', 'position:absolute;left:50%;top:14%;transform:translateX(-50%);z-index:2147483646;background:rgba(0,0,0,.72);color:#fff;font:600 13px/1.4 -apple-system,"Noto Sans TC",sans-serif;padding:6px 14px;border-radius:99px;pointer-events:none;transition:opacity .4s');
    pl.appendChild(t); setTimeout(function () { t.style.opacity = 0; }, 1400); setTimeout(function () { t.remove(); }, 1900);
  }
  /* 播放狀態回報給 App（子母畫面、背景播放用） */
  var lastV = null;
  function hook() {
    var v = vid(); if (!v || v === lastV) return;
    lastV = v;
    ['play', 'playing', 'pause', 'ended', 'loadedmetadata'].forEach(function (ev) {
      v.addEventListener(ev, function () {
        try { if (B && B.video) B.video(!v.paused && !v.ended && !document.querySelector('.ad-showing'), v.videoWidth || 0, v.videoHeight || 0); } catch (e) {}
        if (ev === 'loadedmetadata') { applySpeed(); setQuality(); loadSB(); }
      });
    });
    v.addEventListener('timeupdate', sbCheck);
    applySpeed(); setQuality(); loadSB();
  }
  setInterval(function () { hook(); bar(); }, 700);
  /* 播放速度（記住上次的設定） */
  function getSpeed() { try { return +localStorage.getItem('__wsSpeed') || 1; } catch (e) { return 1; } }
  function applySpeed() { var v = vid(); if (v && !document.querySelector('.ad-showing') && O.speed) { var sp = getSpeed(); if (v.playbackRate !== sp) v.playbackRate = sp; } }
  /* 預設畫質 */
  var QMAP = {max: 'highres', 2160: 'hd2160', 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720', 480: 'large', 360: 'medium'};
  function setQuality() {
    if (!O.q || O.q === 'auto') return;
    var p = document.getElementById('movie_player');
    try { if (p && p.setPlaybackQualityRange) { var q = QMAP[O.q] || 'highres'; p.setPlaybackQualityRange(q, q); if (p.setPlaybackQuality) p.setPlaybackQuality(q); } } catch (e) {}
  }
  /* SponsorBlock：自動跳過業配、開場、結尾、提醒訂閱等片段 */
  var SB = {id: '', segs: []};
  function loadSB() {
    if (!O.sb) return;
    var id = videoId(); if (!id || SB.id === id) return;
    SB.id = id; SB.segs = [];
    fetch('https://sponsor.ajay.app/api/skipSegments?videoID=' + id + '&categories=' + encodeURIComponent('["sponsor","selfpromo","interaction","intro","outro","preview","music_offtopic"]'))
      .then(function (r) { return r.ok ? r.json() : []; }).then(function (a) { if (SB.id === id) SB.segs = (a || []).map(function (x) { return {s: x.segment[0], e: x.segment[1], c: x.category, done: false}; }); }).catch(function () {});
  }
  var SBNAME = {sponsor: '業配', selfpromo: '自我推廣', interaction: '訂閱提醒', intro: '開場', outro: '片尾', preview: '預告', music_offtopic: '非音樂片段'};
  function sbCheck() {
    var v = this; if (!SB.segs.length || document.querySelector('.ad-showing')) return;
    var t = v.currentTime;
    for (var i = 0; i < SB.segs.length; i++) {
      var g = SB.segs[i];
      if (t >= g.s && t < g.e - 0.3) { v.currentTime = g.e; if (!g.done) { g.done = true; toastIn('已跳過' + (SBNAME[g.c] || '片段')); } break; }
    }
  }
  /* 子母畫面時，只顯示影片 */
  var pipCss = null;
  window.__wsYTpip = function (on) {
    if (on) {
      if (!pipCss) { pipCss = document.createElement('style'); pipCss.textContent = 'html.__wspip video{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;object-fit:contain!important;background:#000!important;transform:none!important}html.__wspip,html.__wspip body{overflow:hidden!important;background:#000!important}html.__wspip #__ws_ytbar{display:none!important}'; document.documentElement.appendChild(pipCss); }
      document.documentElement.classList.add('__wspip');
    } else document.documentElement.classList.remove('__wspip');
  };
  /* 播放器上的快捷列 */
  var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
  function bar() {
    if (!O.bar) return;
    var pl = document.querySelector('#player-container-id, .html5-video-player');
    if (!pl || !videoId()) { var ex = document.getElementById('__ws_ytbar'); if (ex && !videoId()) ex.remove(); return; }
    if (document.getElementById('__ws_ytbar')) return;
    if (getComputedStyle(pl).position === 'static') pl.style.position = 'relative';
    var host = document.createElement('div'); host.id = '__ws_ytbar';
    host.setAttribute('style', 'position:absolute;right:8px;bottom:44px;z-index:2147483640;transition:opacity .3s');
    var sh = host.attachShadow({mode: 'open'});
    sh.innerHTML = '<style>.b{display:flex;gap:6px}button{border:0;border-radius:99px;background:rgba(20,16,12,.62);color:#fff;font:700 12px/1 -apple-system,"Noto Sans TC",sans-serif;padding:7px 10px;backdrop-filter:blur(6px);display:flex;align-items:center;gap:4px}button.on{background:rgba(224,160,102,.9);color:#2a1a0a}svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}</style>' +
      '<div class="b"><button id="sp"></button><button id="lp" title="循環播放"><svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg></button>' +
      '<button id="pp" title="子母畫面"><svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="16" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/></svg></button>' +
      '<button id="dl"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>下載</button></div>';
    var sp = sh.getElementById('sp');
    function spTxt() { sp.textContent = getSpeed() + '×'; sp.classList.toggle('on', getSpeed() !== 1); }
    spTxt();
    sp.onclick = function (e) { e.stopPropagation(); var i = SPEEDS.indexOf(getSpeed()); var n = SPEEDS[(i + 1) % SPEEDS.length]; try { localStorage.setItem('__wsSpeed', n); } catch (x) {} applySpeed(); spTxt(); toastIn('播放速度 ' + n + '×'); };
    var lp = sh.getElementById('lp');
    lp.onclick = function (e) { e.stopPropagation(); var v = vid(); if (!v) return; v.loop = !v.loop; lp.classList.toggle('on', v.loop); toastIn(v.loop ? '循環播放：開' : '循環播放：關'); };
    sh.getElementById('pp').onclick = function (e) { e.stopPropagation(); try { B.pip(); } catch (x) {} };
    sh.getElementById('dl').onclick = function (e) { e.stopPropagation(); try { B.ytDl(videoId()); } catch (x) {} };
    pl.appendChild(host);
    var hideT = 0;
    function show() { host.style.opacity = 1; clearTimeout(hideT); hideT = setTimeout(function () { var v = vid(); if (v && !v.paused) host.style.opacity = 0.0; }, 3500); }
    pl.addEventListener('touchstart', show, {passive: true}); pl.addEventListener('mousemove', show);
    show();
  }
  /* 手勢：在影片右半邊上下滑調音量、左半邊調亮度 */
  if (O.gest) {
    var G = null, bright = 0.5;
    document.addEventListener('touchstart', function (e) {
      var pl = e.target && e.target.closest && e.target.closest('.html5-video-player, #player-container-id');
      if (!pl || e.touches.length !== 1 || document.documentElement.classList.contains('__wspip')) { G = null; return; }
      var r = pl.getBoundingClientRect(), t = e.touches[0];
      G = {x: t.clientX, y: t.clientY, right: t.clientX > r.left + r.width / 2, h: r.height, v0: (vid() || {}).volume || 1, b0: bright, on: false};
    }, {passive: true, capture: true});
    document.addEventListener('touchmove', function (e) {
      if (!G) return;
      var t = e.touches[0], dy = G.y - t.clientY, dx = Math.abs(t.clientX - G.x);
      if (!G.on) { if (Math.abs(dy) > 24 && Math.abs(dy) > dx * 1.6) G.on = true; else return; }
      e.preventDefault(); e.stopPropagation();
      var d = dy / Math.max(120, G.h);
      if (G.right) { var v = vid(); if (v) { v.volume = Math.max(0, Math.min(1, G.v0 + d)); v.muted = false; toastIn('🔊 音量 ' + Math.round(v.volume * 100) + '%'); } }
      else { bright = Math.max(0.02, Math.min(1, G.b0 + d)); try { B.brightness(bright); } catch (x) {} toastIn('☀ 亮度 ' + Math.round(bright * 100) + '%'); }
    }, {passive: false, capture: true});
    document.addEventListener('touchend', function (e) { if (G && G.on) { e.preventDefault(); e.stopPropagation(); } G = null; }, {capture: true});
  }
})();
