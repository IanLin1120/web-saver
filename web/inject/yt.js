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
  /* 播放狀態回報給 App（子母畫面、背景播放用）＋速度、畫質、SponsorBlock */
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
  function getSpeed() { try { return +localStorage.getItem('__wsSpeed') || 1; } catch (e) { return 1; } }
  function setSpeed(n) { try { localStorage.setItem('__wsSpeed', n); } catch (e) {} applySpeed(); }
  function applySpeed() { var v = vid(); if (v && !document.querySelector('.ad-showing') && !W.hold) { var sp = getSpeed(); if (v.playbackRate !== sp) v.playbackRate = sp; } }
  var QMAP = {max: 'highres', 2160: 'hd2160', 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720', 480: 'large', 360: 'medium'};
  var QNAME = {highres: '最高', hd2160: '2160p 4K', hd1440: '1440p', hd1080: '1080p', hd720: '720p', large: '480p', medium: '360p', small: '240p', tiny: '144p', auto: '自動'};
  function ytp() { return document.getElementById('movie_player') || document.querySelector('.html5-video-player'); }
  function setQuality(q) {
    q = q || (O.q && O.q !== 'auto' ? QMAP[O.q] || 'highres' : '');
    if (!q) return;
    var p = ytp();
    try {
      if (q === 'highres' && p && p.getAvailableQualityLevels) { var L = p.getAvailableQualityLevels(); if (L && L.length) q = L[0]; }
      if (p && p.setPlaybackQualityRange) p.setPlaybackQualityRange(q, q);
      if (p && p.setPlaybackQuality) p.setPlaybackQuality(q);
    } catch (e) {}
  }
  var SB = {id: '', segs: []};
  function loadSB() {
    if (!O.sb) return;
    var id = videoId(); if (!id || SB.id === id) return;
    SB.id = id; SB.segs = [];
    fetch('https://sponsor.ajay.app/api/skipSegments?videoID=' + id + '&categories=' + encodeURIComponent('["sponsor","selfpromo","interaction","intro","outro","preview","music_offtopic"]'))
      .then(function (r) { return r.ok ? r.json() : []; }).then(function (a) { if (SB.id === id) { SB.segs = (a || []).map(function (x) { return {s: x.segment[0], e: x.segment[1], c: x.category, done: false}; }); W.drawSegs && W.drawSegs(); } }).catch(function () {});
  }
  var SBNAME = {sponsor: '業配', selfpromo: '自我推廣', interaction: '訂閱提醒', intro: '開場', outro: '片尾', preview: '預告', music_offtopic: '非音樂片段'};
  var SBCOL = {sponsor: '#00d400', selfpromo: '#ffff00', interaction: '#cc00ff', intro: '#00ffff', outro: '#0202ed', preview: '#008fd6', music_offtopic: '#ff9900'};
  function sbCheck() {
    var v = this; if (!SB.segs.length || document.querySelector('.ad-showing')) return;
    var t = v.currentTime;
    for (var i = 0; i < SB.segs.length; i++) {
      var g = SB.segs[i];
      if (t >= g.s && t < g.e - 0.3) { v.currentTime = g.e; if (!g.done) { g.done = true; W.flash('已跳過' + (SBNAME[g.c] || '片段')); } break; }
    }
  }
  setInterval(function () { hook(); skin(); }, 600);

  /* 子母畫面時，只顯示影片 */
  var pipCss = null;
  window.__wsYTpip = function (on) {
    if (on) {
      if (!pipCss) { pipCss = document.createElement('style'); pipCss.textContent = 'html.__wspip video{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;object-fit:contain!important;background:#000!important;transform:none!important}html.__wspip,html.__wspip body{overflow:hidden!important;background:#000!important}html.__wspip #__ws_skin{display:none!important}'; document.documentElement.appendChild(pipCss); }
      document.documentElement.classList.add('__wspip');
    } else document.documentElement.classList.remove('__wspip');
  };

  /* ============================================================
     自訂播放器外觀（Morphe 風格）：大按鈕、進度條上的 SponsorBlock 色塊、
     雙擊快轉、長按 2 倍速、上下滑調亮度／音量、左右滑拖曳進度、畫質／速度選單、全螢幕
     ============================================================ */
  var W = {flash: function (m) { var f = W.sh && W.sh.getElementById('flash'); if (!f) return; f.textContent = m; f.classList.add('on'); clearTimeout(W.ft); W.ft = setTimeout(function () { f.classList.remove('on'); }, 1300); }};
  var ICON = {
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    rew: '<path d="M11 6L5 12l6 6M18 6l-6 6 6 6"/>', fwd: '<path d="M13 6l6 6-6 6M6 6l6 6-6 6"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    pip: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor"/>',
    dl: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>', next: '<path d="M6 5l9 7-9 7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24">' + ICON[n] + '</svg>'; }
  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); var hh = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), ss = t % 60; return (hh ? hh + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
  var skinCss = null;
  function skin() {
    var host = document.getElementById('__ws_skin');
    var cont = document.querySelector('#player-container-id') || (ytp() && ytp().parentElement);
    if (O.skin === false || !videoId() || !cont) { if (host) host.remove(); document.documentElement.classList.remove('__wsskin'); return; }
    if (!skinCss) {
      skinCss = document.createElement('style');
      skinCss.textContent = 'html.__wsskin .player-controls-background,html.__wsskin .player-controls-content,html.__wsskin .player-controls-top,html.__wsskin .player-controls-bottom,html.__wsskin .player-controls-middle,' +
        'html.__wsskin .ytp-chrome-bottom,html.__wsskin .ytp-chrome-top,html.__wsskin .ytp-gradient-top,html.__wsskin .ytp-gradient-bottom,html.__wsskin .ytp-large-play-button,html.__wsskin .ytm-autonav-bar,' +
        'html.__wsskin .player-middle-controls,html.__wsskin .ytwPlayerMiddleControlsHost,html.__wsskin ytm-player-controls-overlay,html.__wsskin .ytp-paid-content-overlay,html.__wsskin .ytp-ce-element,html.__wsskin .ytp-pause-overlay{display:none!important}' +
        'html.__wsskin.__wsad video{opacity:0!important}';
      document.documentElement.appendChild(skinCss);
    }
    document.documentElement.classList.add('__wsskin');
    if (host && cont.contains(host)) { host.style.display = ''; return; }
    if (host) host.remove();
    if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative';
    host = document.createElement('div'); host.id = '__ws_skin';
    host.setAttribute('style', 'position:absolute;inset:0;z-index:2147483600;touch-action:none;-webkit-user-select:none;user-select:none');
    var sh = host.attachShadow({mode: 'open'}); W.sh = sh;
    sh.innerHTML = '<style>' +
      ':host{all:initial}*{box-sizing:border-box;font-family:-apple-system,"Noto Sans TC",Roboto,sans-serif}' +
      '.root{position:absolute;inset:0;color:#fff;overflow:hidden}' +
      '.ui{position:absolute;inset:0;opacity:0;transition:opacity .22s;pointer-events:none;background:linear-gradient(rgba(0,0,0,.55),transparent 28%,transparent 62%,rgba(0,0,0,.7))}' +
      '.root.show .ui{opacity:1;pointer-events:auto}' +
      'button{border:0;background:none;color:#fff;padding:0;display:grid;place-items:center;cursor:pointer}' +
      'svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.top{position:absolute;left:8px;right:8px;top:6px;display:flex;align-items:center;gap:4px}' +
      '.top .t{flex:1;min-width:0;font:600 13px/1.3 sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px #000;padding-left:4px}' +
      '.top button{width:36px;height:36px;border-radius:50%}.top button:active{background:rgba(255,255,255,.2)}' +
      '.chip{font:800 12px/1 sans-serif;padding:7px 9px!important;width:auto!important;border-radius:99px!important;background:rgba(0,0,0,.35)!important}.chip.on{background:#e0a066!important;color:#2a1a0a}' +
      '.mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:34px}' +
      '.mid button{width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,.35)}.mid .pp{width:66px;height:66px}.mid .pp svg{width:34px;height:34px}' +
      '.bot{position:absolute;left:0;right:0;bottom:0;padding:0 10px 6px}' +
      '.row{display:flex;align-items:center;gap:8px;font:600 12px/1 sans-serif;text-shadow:0 1px 2px #000}.row .g{flex:1}.row button{width:34px;height:34px}' +
      '.bar{position:relative;height:22px;display:flex;align-items:center;cursor:pointer}' +
      '.tr{position:absolute;left:0;right:0;height:3px;border-radius:3px;background:rgba(255,255,255,.3);overflow:hidden;transition:height .15s}.bar.drag .tr{height:5px}' +
      '.bf{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.45)}.pl{position:absolute;left:0;top:0;bottom:0;background:#e0a066}' +
      '.sg{position:absolute;top:0;bottom:0;opacity:.85}' +
      '.kn{position:absolute;width:13px;height:13px;border-radius:50%;background:#e0a066;margin-left:-6.5px;box-shadow:0 0 0 3px rgba(224,160,102,.3);transition:transform .15s}.bar.drag .kn{transform:scale(1.35)}' +
      '.ripple{position:absolute;top:0;bottom:0;width:38%;display:flex;align-items:center;justify-content:center;font:800 14px/1.3 sans-serif;background:rgba(255,255,255,.12);opacity:0;transition:opacity .3s;pointer-events:none;flex-direction:column;gap:4px}' +
      '.ripple.l{left:0;border-radius:0 50% 50% 0}.ripple.r{right:0;border-radius:50% 0 0 50%}.ripple.on{opacity:1}' +
      '.side{position:absolute;top:22%;bottom:22%;width:6px;border-radius:6px;background:rgba(255,255,255,.25);opacity:0;transition:opacity .25s;pointer-events:none}.side i{position:absolute;left:0;right:0;bottom:0;border-radius:6px;background:#fff}.side.on{opacity:1}' +
      '.side.l{left:18px}.side.r{right:18px}' +
      '.flash{position:absolute;left:50%;top:18%;transform:translateX(-50%);background:rgba(0,0,0,.72);padding:7px 14px;border-radius:99px;font:700 13px/1.3 sans-serif;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}.flash.on{opacity:1}' +
      '.spin{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px;border-radius:50%;border:4px solid rgba(255,255,255,.25);border-top-color:#fff;animation:sp .8s linear infinite;display:none;pointer-events:none}.spin.on{display:block}@keyframes sp{to{transform:rotate(360deg)}}' +
      '.adc{position:absolute;inset:0;z-index:5;background:#000;display:none;align-items:center;justify-content:center;font:700 14px/1.5 sans-serif;color:#ddd;flex-direction:column;gap:10px}.adc.on{display:flex}' +
      '.menu{position:absolute;right:8px;top:44px;max-height:calc(100% - 54px);overflow:auto;background:rgba(28,22,16,.94);border-radius:14px;padding:6px;display:none;min-width:130px}.menu.on{display:block}' +
      '.menu button{width:100%;justify-content:flex-start;display:flex;font:600 13.5px/1 sans-serif;padding:10px 12px;border-radius:9px}.menu button.on{color:#e0a066}.menu button:active{background:rgba(255,255,255,.1)}' +
      '.prev{position:absolute;bottom:46px;left:50%;transform:translateX(-50%);font:800 22px/1 sans-serif;text-shadow:0 2px 6px #000;opacity:0;pointer-events:none}.prev.on{opacity:1}' +
      '</style><div class="root" id="root">' +
      '<div class="ripple l" id="rl"></div><div class="ripple r" id="rr"></div>' +
      '<div class="side l" id="sl"><i></i></div><div class="side r" id="sr"><i></i></div><div class="spin" id="spin"></div>' +
      '<div class="adc" id="adc"><div class="spin on" style="position:static;margin:0"></div>正在略過廣告…</div>' +
      '<div class="ui" id="ui"><div class="top"><div class="t" id="tt"></div>' +
      '<button class="chip" id="sp">1×</button><button id="lp" title="循環">' + ic('loop') + '</button><button id="q" title="畫質">' + ic('gear') + '</button>' +
      '<button id="pp2" title="子母畫面">' + ic('pip') + '</button><button id="dl" title="下載">' + ic('dl') + '</button></div>' +
      '<div class="mid"><button id="rw">' + ic('rew') + '</button><button class="pp" id="pp">' + ic('play') + '</button><button id="fw">' + ic('fwd') + '</button></div>' +
      '<div class="bot"><div class="bar" id="bar"><div class="tr"><div class="bf" id="bf"></div><div id="segs"></div><div class="pl" id="pl"></div></div><div class="kn" id="kn"></div></div>' +
      '<div class="row"><span id="tm">0:00 / 0:00</span><span class="g"></span><span id="sb"></span><button id="nx" title="下一部">' + ic('next') + '</button><button id="fs">' + ic('full') + '</button></div></div>' +
      '<div class="menu" id="menu"></div></div><div class="prev" id="pv"></div><div class="flash" id="flash"></div></div>';
    cont.appendChild(host);
    var $ = function (id) { return sh.getElementById(id); };
    var root = $('root'), hideT = 0;
    function show(keep) { root.classList.add('show'); clearTimeout(hideT); if (!keep) hideT = setTimeout(function () { var v = vid(); if (v && !v.paused && !$('menu').classList.contains('on')) root.classList.remove('show'); }, 3200); }
    function hide() { root.classList.remove('show'); $('menu').classList.remove('on'); }
    W.show = show;
    function toggle() { var v = vid(); if (!v) return; if (v.paused) v.play(); else v.pause(); }
    function seekBy(d) { var v = vid(); if (v) v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.5, v.currentTime + d)); }
    $('pp').onclick = function (e) { e.stopPropagation(); toggle(); show(); };
    $('rw').onclick = function (e) { e.stopPropagation(); seekBy(-10); W.flash('-10 秒'); show(); };
    $('fw').onclick = function (e) { e.stopPropagation(); seekBy(10); W.flash('+10 秒'); show(); };
    $('nx').onclick = function (e) { e.stopPropagation(); var p = ytp(); try { if (p && p.nextVideo) p.nextVideo(); else { var b = document.querySelector('.player-controls-middle-core-buttons button:last-child, .ytp-next-button'); if (b) b.click(); } } catch (x) {} };
    function spTxt() { var s = getSpeed(); $('sp').textContent = s + '×'; $('sp').classList.toggle('on', s !== 1); }
    spTxt();
    function menu(items) {
      var m = $('menu'); m.innerHTML = '';
      items.forEach(function (it) { var b = document.createElement('button'); b.textContent = it[0]; if (it[2]) b.className = 'on'; b.onclick = function (e) { e.stopPropagation(); m.classList.remove('on'); it[1](); show(); }; m.appendChild(b); });
      m.classList.add('on'); show(true);
    }
    $('sp').onclick = function (e) { e.stopPropagation(); var cur = getSpeed(); menu([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4].map(function (n) { return [n + '×' + (n === 1 ? '（正常）' : ''), function () { setSpeed(n); spTxt(); W.flash('播放速度 ' + n + '×'); }, n === cur]; })); };
    $('q').onclick = function (e) {
      e.stopPropagation(); var p = ytp(), L = [], cur = '';
      try { L = p.getAvailableQualityLevels() || []; cur = p.getPlaybackQuality(); } catch (x) {}
      if (!L.length) { W.flash('這部影片無法選擇畫質'); return; }
      menu(L.map(function (q) { return [QNAME[q] || q, function () { setQuality(q); W.flash('畫質：' + (QNAME[q] || q)); }, q === cur]; }));
    };
    $('lp').onclick = function (e) { e.stopPropagation(); var v = vid(); if (!v) return; v.loop = !v.loop; $('lp').style.color = v.loop ? '#e0a066' : '#fff'; W.flash(v.loop ? '循環播放：開' : '循環播放：關'); show(); };
    $('pp2').onclick = function (e) { e.stopPropagation(); try { B.pip(); } catch (x) {} };
    $('dl').onclick = function (e) { e.stopPropagation(); try { B.ytDl(videoId()); } catch (x) {} };
    function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    $('fs').onclick = function (e) {
      e.stopPropagation();
      if (isFs()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      var el = cont, pr = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (pr && pr.catch) pr.catch(function () {});
      setTimeout(function () { try { var v = vid(); if (screen.orientation && v && v.videoWidth > v.videoHeight) screen.orientation.lock('landscape').catch(function () {}); } catch (x) {} }, 300);
    };
    document.addEventListener('fullscreenchange', function () { $('fs').innerHTML = ic(isFs() ? 'exit' : 'full'); });
    /* 進度條 */
    var bar = $('bar'), dragging = false;
    function barPos(x) { var r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); }
    bar.addEventListener('pointerdown', function (e) { e.stopPropagation(); dragging = true; bar.classList.add('drag'); bar.setPointerCapture(e.pointerId); scrub(e); show(true); });
    bar.addEventListener('pointermove', function (e) { if (dragging) scrub(e); });
    function scrub(e) { var v = vid(); if (!v || !v.duration) return; var f = barPos(e.clientX); $('pl').style.width = f * 100 + '%'; $('kn').style.left = f * 100 + '%'; $('pv').textContent = fmt(f * v.duration); $('pv').classList.add('on'); W.scrubTo = f * v.duration; }
    bar.addEventListener('pointerup', function () { dragging = false; bar.classList.remove('drag'); $('pv').classList.remove('on'); var v = vid(); if (v && W.scrubTo != null) v.currentTime = W.scrubTo; W.scrubTo = null; show(); });
    W.drawSegs = function () {
      var v = vid(), box = $('segs'); if (!box) return; box.innerHTML = '';
      if (!v || !v.duration) return;
      SB.segs.forEach(function (g) { var d = document.createElement('div'); d.className = 'sg'; d.style.left = (100 * g.s / v.duration) + '%'; d.style.width = Math.max(0.4, 100 * (g.e - g.s) / v.duration) + '%'; d.style.background = SBCOL[g.c] || '#0f0'; box.appendChild(d); });
      $('sb').textContent = SB.segs.length ? 'SponsorBlock ' + SB.segs.length + ' 段' : '';
    };
    /* 手勢層 */
    var G = null, lastTap = 0, tapT = 0, dbl = {n: 0, side: '', t: 0}, bright = 0.5;
    root.addEventListener('pointerdown', function (e) {
      if (e.target.closest && (e.target.closest('button') || e.target.closest('.bar') || e.target.closest('.menu'))) return;
      var r = root.getBoundingClientRect(), v = vid();
      G = {x: e.clientX, y: e.clientY, t: Date.now(), w: r.width, h: r.height, left: e.clientX < r.left + r.width / 2, mode: '', v0: v ? v.volume : 1, b0: bright, c0: v ? v.currentTime : 0, lp: 0};
      G.lp = setTimeout(function () { if (G && !G.mode) { G.mode = 'hold'; W.hold = true; var vv = vid(); if (vv) { G.oldRate = vv.playbackRate; vv.playbackRate = 2; } W.flash('▶▶ 2 倍速播放中'); } }, 480);
    });
    root.addEventListener('pointermove', function (e) {
      if (!G) return;
      var dx = e.clientX - G.x, dy = G.y - e.clientY;
      if (!G.mode) {
        if (Math.abs(dy) > 22 && Math.abs(dy) > Math.abs(dx) * 1.5) G.mode = G.left ? 'bright' : 'vol';
        else if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy) * 1.5) G.mode = 'seek';
        if (G.mode) clearTimeout(G.lp);
      }
      var v = vid();
      if (G.mode === 'vol' && v) { v.muted = false; v.volume = Math.max(0, Math.min(1, G.v0 + dy / (G.h * 0.8))); $('sr').classList.add('on'); $('sr').firstChild.style.height = v.volume * 100 + '%'; W.flash('🔊 音量 ' + Math.round(v.volume * 100) + '%'); }
      if (G.mode === 'bright') { bright = Math.max(0.02, Math.min(1, G.b0 + dy / (G.h * 0.8))); try { B.brightness(bright); } catch (x) {} $('sl').classList.add('on'); $('sl').firstChild.style.height = bright * 100 + '%'; W.flash('☀ 亮度 ' + Math.round(bright * 100) + '%'); }
      if (G.mode === 'seek' && v && v.duration) { var t = Math.max(0, Math.min(v.duration, G.c0 + dx / G.w * Math.min(240, v.duration))); W.scrubTo = t; $('pv').textContent = fmt(t) + '（' + (t >= G.c0 ? '+' : '-') + fmt(Math.abs(t - G.c0)) + '）'; $('pv').classList.add('on'); }
    });
    function endG(e) {
      if (!G) return;
      clearTimeout(G.lp);
      var g = G; G = null;
      $('sl').classList.remove('on'); $('sr').classList.remove('on'); $('pv').classList.remove('on');
      if (g.mode === 'hold') { W.hold = false; var vv = vid(); if (vv) vv.playbackRate = getSpeed(); return; }
      if (g.mode === 'seek') { var v = vid(); if (v && W.scrubTo != null) v.currentTime = W.scrubTo; W.scrubTo = null; return; }
      if (g.mode) return;
      if (Date.now() - g.t > 400) return;
      var now = Date.now(), r = root.getBoundingClientRect(), x = e.clientX - r.left, side = x < r.width * 0.35 ? 'l' : x > r.width * 0.65 ? 'r' : '';
      if (side && (now - lastTap < 300 || (dbl.side === side && now - dbl.t < 700))) {
        clearTimeout(tapT);
        dbl.n = dbl.side === side && now - dbl.t < 700 ? dbl.n + 1 : 1; dbl.side = side; dbl.t = now;
        seekBy(side === 'l' ? -10 : 10);
        var rp = $(side === 'l' ? 'rl' : 'rr'); rp.innerHTML = (side === 'l' ? '◀◀<br>' : '▶▶<br>') + (dbl.n * 10) + ' 秒'; rp.classList.add('on');
        clearTimeout(rp._t); rp._t = setTimeout(function () { rp.classList.remove('on'); }, 650);
        lastTap = 0; return;
      }
      lastTap = now;
      tapT = setTimeout(function () { if (root.classList.contains('show')) hide(); else show(); }, side ? 280 : 0);
    }
    root.addEventListener('pointerup', endG); root.addEventListener('pointercancel', function () { if (G) clearTimeout(G.lp); if (G && G.mode === 'hold') { W.hold = false; var vv = vid(); if (vv) vv.playbackRate = getSpeed(); } G = null; });
    /* 畫面更新 */
    function upd() {
      if (!host.isConnected) return;
      var v = vid();
      if (v) {
        var d = v.duration || 0, t = v.currentTime || 0;
        if (W.scrubTo == null) { $('pl').style.width = (d ? 100 * t / d : 0) + '%'; $('kn').style.left = (d ? 100 * t / d : 0) + '%'; }
        try { var b = v.buffered; if (b.length) $('bf').style.width = (d ? 100 * b.end(b.length - 1) / d : 0) + '%'; } catch (x) {}
        $('tm').textContent = fmt(t) + ' / ' + fmt(d);
        $('pp').innerHTML = ic(v.paused ? 'play' : 'pause');
        $('spin').classList.toggle('on', !v.paused && v.readyState < 3);
        if (v.paused && !root.classList.contains('show')) show(true);
        if ($('segs').childNodes.length !== SB.segs.length && d) W.drawSegs();
      }
      var ad = !!document.querySelector('.ad-showing, .ad-interrupting');
      $('adc').classList.toggle('on', ad);
      document.documentElement.classList.toggle('__wsad', ad);
      var tt = document.querySelector('.slim-video-information-title, h1.title, .ytd-watch-metadata h1, h2.slim-video-metadata-title-modern');
      $('tt').textContent = tt ? tt.textContent.trim() : (document.title || '').replace(/ - YouTube$/, '');
      requestAnimationFrame(upd);
    }
    requestAnimationFrame(upd);
    show();
  }
})();
