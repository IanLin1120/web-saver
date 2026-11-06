/* YouTube 去廣告（概念同 Morphe／ReVanced 的「隱藏廣告」：把播放資料裡的廣告欄位拿掉，畫面上的廣告元素隱藏，漏網的影片廣告自動跳過）
   由 App 插在 YouTube 網頁 <head> 最前面，比 YouTube 自己的程式更早執行。 */
(function () {
  'use strict';
  if (window.__wsYT) return;
  window.__wsYT = 1;
  var KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adBreakParams'];
  var PR = window.__wsPR = window.__wsPR || {};
  function prune(o, depth) {
    if (!o || typeof o !== 'object' || (depth || 0) > 6) return o;
    try { if (o.streamingData && o.videoDetails && o.videoDetails.videoId) PR[o.videoDetails.videoId] = o; } catch (e) {}
    /* 有傳統串流網址時，關掉 SABR 新串流，讓播放器改用一般網址（App 才攔截得到可下載的完整網址） */
    try {
      var sd0 = o.streamingData;
      if (sd0 && sd0.serverAbrStreamingUrl && !(window.__wsCfg && window.__wsCfg.yt && window.__wsCfg.yt.sabr)) {
        var af0 = sd0.adaptiveFormats || [];
        if (af0.length && af0.every(function (f) { return f.url || f.signatureCipher || f.cipher; })) delete sd0.serverAbrStreamingUrl;
      }
    } catch (e) {}
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
    try { if (o && typeof o === 'object' && (o.adPlacements || o.playerAds || o.adSlots || o.playerResponse || o.contents || o.streamingData)) prune(o); } catch (e) {}
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
    var v = this; if (!O.sb || !SB.segs.length || document.querySelector('.ad-showing')) return;
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
     影片編碼偏好：不用 AV1（手機上很多無法合併存檔）；「相容模式」只用 H.264＋AAC（下載成 MP4）
     ============================================================ */
  try {
    var GC = window.__wsCfg && window.__wsCfg.grab;
    var CODEC = GC ? (GC.codec === 'mp4' ? 'mp4' : 'webm') : (O.codec || 'vp9');
    [window.MediaSource, window.ManagedMediaSource].forEach(function (MS) {
      if (!MS || !MS.isTypeSupported || MS.__wsPatched) return;
      var its = MS.isTypeSupported.bind(MS);
      MS.isTypeSupported = function (t) {
        t = String(t || '');
        /* mp4：H.264／AV1＋AAC（4K 用 AV1 才能放進 MP4）；webm：VP9＋Opus；h264：只用 H.264（最高 1080p） */
        if (CODEC === 'mp4') { if (/webm|vp0?9|vp8|opus/i.test(t)) return false; return its(t); }
        if (/av01/i.test(t)) return false;
        if (CODEC === 'h264' && /webm|vp0?9|vp8|opus/i.test(t)) return false;
        if (CODEC === 'webm' && /mp4|avc1|mp4a/i.test(t)) return false;
        return its(t);
      };
      MS.__wsPatched = 1;
    });
  } catch (e) {}

  /* ============================================================
     串流嗅探備援：YouTube 播放器實際抓的影像／聲音網址，交給 App 下載用
     ============================================================ */
  var seenS = {};
  function noteStream(u) {
    try {
      u = String(u && u.url || u || '');
      if (u.indexOf('googlevideo.com/videoplayback') < 0) return;
      var m = u.match(/[?&]itag=(\d+)/), k = (m ? m[1] : '') + '|' + videoId();
      if (seenS[k] && Date.now() - seenS[k] < 20000) return;
      seenS[k] = Date.now();
      if (B && B.ytStream) B.ytStream(u);
    } catch (e) {}
  }
  try {
    var XO = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) { noteStream(u); return XO.apply(this, arguments); };
    var F0 = window.fetch;
    if (F0) window.fetch = function (r) { noteStream(r); return F0.apply(this, arguments); };
  } catch (e) {}

  /* 影片資訊（各畫質、大小、編碼）回報給 App 的下載面板 */
  window.__wsYTinfo = function () {
    var id = videoId(); if (!id) return;
    var r = null;
    try { var p = ytp(); if (p && p.getPlayerResponse) r = p.getPlayerResponse(); } catch (e) {}
    if (!r || !r.videoDetails || r.videoDetails.videoId !== id) r = PR[id] || null;
    if (!r) { try { var ip = window.ytInitialPlayerResponse; if (ip && ip.videoDetails && ip.videoDetails.videoId === id) r = ip; } catch (e) {} }
    var v = vid(), out = {id: id, details: {}, formats: [], hls: '', live: false, levels: []};
    if (r) {
      var vd = r.videoDetails || {}, sd = r.streamingData || {};
      out.details = {title: vd.title || '', author: vd.author || '', lengthSeconds: +vd.lengthSeconds || 0};
      out.formats = (sd.adaptiveFormats || []).concat(sd.formats || []).map(function (f) {
        return {itag: f.itag, mimeType: f.mimeType || '', height: f.height || 0, width: f.width || 0, fps: f.fps || 0, bitrate: f.bitrate || 0, contentLength: +f.contentLength || 0,
          approxDurationMs: +f.approxDurationMs || 0, qualityLabel: f.qualityLabel || '', audioQuality: f.audioQuality || '', direct: !!f.url};
      });
      out.hls = sd.hlsManifestUrl || '';
      out.live = !!vd.isLive;
      out.sabr = !!sd.serverAbrStreamingUrl;
      try {
        out.captions = (((r.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || []).map(function (t) {
          return {lang: t.languageCode, kind: t.kind || '', url: t.baseUrl, name: t.name && (t.name.simpleText || (t.name.runs || []).map(function (x) { return x.text; }).join(''))};
        });
      } catch (e) {}
    }
    if (!out.details.title) { var tt = document.querySelector('.slim-video-information-title, h1.title, h2.slim-video-metadata-title-modern'); out.details.title = tt ? tt.textContent.trim() : (document.title || '').replace(/ - YouTube$/, ''); }
    if (!out.details.lengthSeconds && v && isFinite(v.duration)) out.details.lengthSeconds = Math.round(v.duration);
    try { out.levels = ytp().getAvailableQualityLevels() || []; } catch (e) {}
    try { if (B && B.ytInfo) B.ytInfo(id, JSON.stringify(out)); } catch (e) {}
    return out;
  };

  /* 下載前準備：請播放器切到指定畫質、靜音播放幾秒，讓 App 攔截到該畫質的串流網址，之後恢復原狀 */
  var prepT = 0, prepSt = null;
  window.__wsYTprep = function (q) {
    if (q === '__done') { window.__wsYTprepDone(); return 'done'; }
    var p = ytp(), v = vid(); if (!v) return 'noplayer';
    if (!prepSt) prepSt = {muted: v.muted, paused: v.paused, t: v.currentTime, q: ''};
    try { prepSt.q = prepSt.q || (p.getPlaybackQuality ? p.getPlaybackQuality() : ''); } catch (e) {}
    v.muted = true;
    try { if (q && p && p.setPlaybackQualityRange) { p.setPlaybackQualityRange(q, q); if (p.setPlaybackQuality) p.setPlaybackQuality(q); } } catch (e) {}
    var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    setTimeout(function () {
      try {
        var b = v.buffered, end = b.length ? b.end(b.length - 1) : v.currentTime, d = v.duration || 0;
        var to = end - v.currentTime > 20 ? v.currentTime + 45 : end + 2;
        if (d && to < d - 3) v.currentTime = to;
      } catch (e) {}
    }, 500);
    clearTimeout(prepT);
    prepT = setTimeout(window.__wsYTprepDone, 12000);
    return 'ok';
  };
  window.__wsYTprepDone = function () {
    clearTimeout(prepT);
    var v = vid(), st = prepSt; prepSt = null;
    if (!v || !st) return;
    try { v.currentTime = st.t; } catch (e) {}
    v.muted = st.muted;
    if (st.paused) v.pause();
    setQuality();
  };

  /* Return YouTube Dislike：顯示按讚／倒讚數 */
  var RYD = {id: '', txt: ''};
  function loadRyd() {
    if (O.ryd === false) return;
    var id = videoId(); if (!id || RYD.id === id) return;
    RYD.id = id; RYD.txt = '';
    fetch('https://returnyoutubedislikeapi.com/votes?videoId=' + id).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && RYD.id === id) RYD.txt = '👍 ' + num(j.likes) + '　👎 ' + num(j.dislikes);
    }).catch(function () {});
  }
  function num(n) { n = +n || 0; return n >= 1e8 ? (n / 1e8).toFixed(1) + '億' : n >= 1e4 ? (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + '萬' : String(n); }

  /* 隱藏 Shorts（可在設定關閉） */
  if (O.noShorts) {
    var shc = document.createElement('style');
    shc.textContent = 'ytm-reel-shelf-renderer,ytm-shorts-lockup-view-model,ytd-reel-shelf-renderer,ytm-pivot-bar-item-renderer:has(.pivot-shorts),ytd-rich-shelf-renderer[is-shorts],grid-shelf-view-model:has(ytm-shorts-lockup-view-model){display:none!important}';
    (document.head || document.documentElement).appendChild(shc);
  }

  /* ============================================================
     播放器（Morphe 風格）：控制層獨立放在整個網頁最上層，不會被 YouTube 自己的觸控攔截。
     點一下顯示／隱藏控制列、兩側雙擊快退／快轉（可連點累加）、長按 2 倍速、左右滑拖曳進度、
     左半邊上下滑調亮度、右半邊上下滑調音量、中間往上滑全螢幕／往下滑離開全螢幕、
     速度、畫質、循環、子母畫面、下載、SponsorBlock 片段標示、全螢幕（App 原生橫向）
     ============================================================ */
  /* YouTube 啟用 Trusted Types，直接設 innerHTML 會被擋（這是之前控制列完全沒出現的原因）：
     先試建立允許的政策，不行就用自己的小型解析器逐一建立元素 */
  var TTP = null;
  try { if (window.trustedTypes && trustedTypes.createPolicy) TTP = trustedTypes.createPolicy('wsskin' + Math.random().toString(36).slice(2, 7), {createHTML: function (x) { return x; }}); } catch (e) { TTP = null; }
  function buildInto(root, html) {
    var re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g, m, stack = [root], NS = 'http://www.w3.org/2000/svg';
    while ((m = re.exec(html))) {
      var top = stack[stack.length - 1];
      if (m[5] != null) { top.appendChild(document.createTextNode(m[5].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))); continue; }
      if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
      var tag = m[2], svg = tag === 'svg' || top.namespaceURI === NS;
      var el = svg ? document.createElementNS(NS, tag) : document.createElement(tag), ar = /([\w:-]+)(?:="([^"]*)")?/g, a;
      while ((a = ar.exec(m[3]))) el.setAttribute(a[1], a[2] == null ? '' : a[2]);
      top.appendChild(el);
      if (!m[4] && !/^(br|img|input|hr)$/i.test(tag)) stack.push(el);
    }
  }
  function setH(el, html) {
    if (TTP) { try { el.innerHTML = TTP.createHTML(html); return; } catch (e) {} }
    try { el.innerHTML = html; return; } catch (e) {}
    while (el.firstChild) el.removeChild(el.firstChild);
    buildInto(el, html);
  }
  window.__wsSetH = setH;
  /* 不讓 YouTube 的 Service Worker 接管頁面（否則 App 沒辦法在頁面載入時插入去廣告與播放器程式） */
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () { return Promise.reject(new Error('disabled')); };
      navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
    }
  } catch (e) {}

  var W = {flash: function (m) { var f = W.sh && W.sh.getElementById('flash'); if (!f) return; f.textContent = m; f.classList.add('on'); clearTimeout(W.ft); W.ft = setTimeout(function () { f.classList.remove('on'); }, 1300); }};
  var ICON = {
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    rew: '<path d="M12.5 8L8.5 12l4 4"/><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
    fwd: '<path d="M11.5 8l4 4-4 4"/><path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5"/><path d="M20 4v4.5h-4.5"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
    loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    pip: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor"/>',
    dl: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>', next: '<path d="M6 5l9 7-9 7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
    prev: '<path d="M18 5L9 12l9 7z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
    fill: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10V8.5h2M17 10V8.5h-2M7 14v1.5h2M17 14v1.5h-2"/>',
    cc: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    down: '<path d="M6 9l6 6 6-6"/>', more: '<circle cx="12" cy="5.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24">' + ICON[n] + '</svg>'; }
  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); var hh = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), ss = t % 60; return (hh ? hh + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
  var skinCss = null, FS = {on: false, saved: []};
  function playerEl() { return ytp() || (vid() && vid().parentElement); }

  /* 全螢幕：把 YouTube 的播放器固定成整個畫面，App 端同時把這個瀏覽器放大到全螢幕並轉橫向 */
  function setFs(on, fromNative) {
    if (FS.on === on) return;
    FS.on = on;
    var p = playerEl();
    if (on) {
      FS.saved = [];
      window.scrollTo(0, 0);
      for (var el = p; el && el !== document.documentElement && el !== document.body; el = el.parentElement) {
        FS.saved.push([el, el.getAttribute('style')]);
        el.style.setProperty('transform', 'none', 'important');
        el.style.setProperty('filter', 'none', 'important');
        el.style.setProperty('contain', 'none', 'important');
        el.style.setProperty('will-change', 'auto', 'important');
        el.style.setProperty('z-index', '2147483000', 'important');
      }
      if (p) ['position:fixed', 'left:0', 'top:0', 'right:0', 'bottom:0', 'width:100vw', 'height:100vh', 'max-width:none', 'max-height:none', 'margin:0', 'background:#000'].forEach(function (d) { var kv = d.split(':'); p.style.setProperty(kv[0], kv[1], 'important'); });
      document.documentElement.classList.add('__wsfs');
    } else {
      FS.saved.forEach(function (x) { if (x[1] == null) x[0].removeAttribute('style'); else x[0].setAttribute('style', x[1]); });
      FS.saved = [];
      document.documentElement.classList.remove('__wsfs');
    }
    var v = vid();
    try { if (!fromNative && B && B.fullscreen) B.fullscreen(on, !v || !v.videoHeight || v.videoWidth >= v.videoHeight); } catch (e) {}
    setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 250);
    if (W.syncFs) W.syncFs();
  }
  window.__wsYTfs = function (on) { setFs(!!on, true); };

  function skin() {
    var host = document.getElementById('__ws_skin');
    var p = playerEl();
    if (O.skin === false || !videoId() || !p) {
      if (host) host.style.display = 'none';
      document.documentElement.classList.remove('__wsskin');
      if (FS.on && !videoId()) setFs(false);
      return;
    }
    if (!skinCss) {
      skinCss = document.createElement('style');
      skinCss.textContent = 'html.__wsskin .player-controls-background,html.__wsskin .player-controls-content,html.__wsskin .player-controls-top,html.__wsskin .player-controls-bottom,html.__wsskin .player-controls-middle,' +
        'html.__wsskin .ytp-chrome-bottom,html.__wsskin .ytp-chrome-top,html.__wsskin .ytp-gradient-top,html.__wsskin .ytp-gradient-bottom,html.__wsskin .ytp-large-play-button,html.__wsskin .ytm-autonav-bar,' +
        'html.__wsskin .player-middle-controls,html.__wsskin .ytwPlayerMiddleControlsHost,html.__wsskin ytm-player-controls-overlay,html.__wsskin .ytp-paid-content-overlay,html.__wsskin .ytp-ce-element,html.__wsskin .ytp-pause-overlay,' +
        'html.__wsskin .ytp-spinner,html.__wsskin .ytm-player-error-overlay-renderer-host:empty{display:none!important}' +
        'html.__wsskin.__wsad video{opacity:0!important}' +
        'html.__wsfs,html.__wsfs body{overflow:hidden!important;background:#000!important}' +
        'html.__wsfs .html5-video-container{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}' +
        'html.__wsfs .html5-video-player video{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;object-fit:contain!important;transform:none!important}' +
        'html.__wsfs.__wsfill .html5-video-player video{object-fit:cover!important}';
      (document.head || document.documentElement).appendChild(skinCss);
    }
    document.documentElement.classList.add('__wsskin');
    if (host) { if (host.parentNode !== document.documentElement) document.documentElement.appendChild(host); return; }
    host = document.createElement('div'); host.id = '__ws_skin';
    host.setAttribute('style', 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483646;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;display:none');
    /* 觸控事件只給我們的播放器，不讓 YouTube 收到（避免被它攔截） */
    ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'].forEach(function (ev) {
      host.addEventListener(ev, function (e) { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); });
    });
    var sh = host.attachShadow({mode: 'open'}); W.sh = sh;
    setH(sh, '<style>' +
      ':host{all:initial}*{box-sizing:border-box;font-family:-apple-system,"Noto Sans TC",Roboto,sans-serif}' +
      '.root{position:absolute;inset:0;color:#fff;overflow:hidden;touch-action:none}' +
      '.ui{position:absolute;inset:0;opacity:0;transition:opacity .2s;pointer-events:none;background:rgba(0,0,0,.42)}' +
      '.root.show .ui{opacity:1;pointer-events:auto}' +
      'button{border:0;background:none;color:#fff;padding:0;display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      'svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.top{position:absolute;left:6px;right:6px;top:4px;display:flex;align-items:center;gap:2px}' +
      '.top .t{flex:1;min-width:0;padding-left:6px}.top .t b{display:block;font:600 13.5px/1.3 sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px #000}' +
      '.top .t small{display:block;font:500 11px/1.3 sans-serif;opacity:.85;white-space:nowrap}' +
      '.top button{width:38px;height:38px;border-radius:50%}.top button:active,.row button:active{background:rgba(255,255,255,.2)}' +
      '.chip{font:800 12px/1 sans-serif;padding:7px 9px!important;width:auto!important;height:auto!important;border-radius:99px!important;background:rgba(255,255,255,.16)!important}.chip.on{background:#fff!important;color:#111}' +
      '.mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:clamp(18px,9vw,56px)}' +
      '.mid button{width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,.28)}.mid button svg{width:26px;height:26px}.mid .pp{width:68px;height:68px;background:rgba(0,0,0,.4)}.mid .pp svg{width:36px;height:36px}' +
      '.mid .sk{position:relative}.mid .sk i{position:absolute;font:800 9px/1 sans-serif;font-style:normal;top:50%;left:50%;transform:translate(-50%,-38%)}' +
      '.bot{position:absolute;left:0;right:0;bottom:0;padding:0 12px 4px}' +
      '.row{display:flex;align-items:center;gap:6px;font:600 12px/1 sans-serif;text-shadow:0 1px 2px #000}.row .g{flex:1}.row button{width:38px;height:38px;border-radius:50%}' +
      '.bar{position:relative;height:24px;display:flex;align-items:center;cursor:pointer}' +
      '.tr{position:absolute;left:0;right:0;height:3px;border-radius:3px;background:rgba(255,255,255,.3);overflow:hidden;transition:height .15s}.bar.drag .tr{height:6px}' +
      '.bf{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.45)}.pl{position:absolute;left:0;top:0;bottom:0;background:#f03}' +
      '.sg{position:absolute;top:0;bottom:0;opacity:.9}' +
      '.kn{position:absolute;width:13px;height:13px;border-radius:50%;background:#f03;margin-left:-6.5px;transition:transform .15s}.bar.drag .kn{transform:scale(1.4)}' +
      '.root:not(.show) .mini{opacity:1}.mini{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.2);opacity:0;pointer-events:none}.mini i{position:absolute;left:0;top:0;bottom:0;background:#f03}' +
      '.ripple{position:absolute;top:0;bottom:0;width:40%;display:flex;align-items:center;justify-content:center;font:800 13px/1.3 sans-serif;background:rgba(255,255,255,.14);opacity:0;transition:opacity .3s;pointer-events:none;flex-direction:column;gap:6px;text-align:center}' +
      '.ripple.l{left:0;border-radius:0 50% 50% 0/0 50% 50% 0}.ripple.r{right:0;border-radius:50% 0 0 50%/50% 0 0 50%}.ripple.on{opacity:1}.ripple svg{width:30px;height:30px}' +
      '.lvl{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.6);border-radius:14px;padding:10px 16px;display:none;align-items:center;gap:10px;font:700 13px/1 sans-serif;pointer-events:none}.lvl.on{display:flex}' +
      '.lvl .tk{width:110px;height:4px;border-radius:4px;background:rgba(255,255,255,.3);overflow:hidden}.lvl .tk i{display:block;height:100%;background:#fff}' +
      '.flash{position:absolute;left:50%;top:16%;transform:translateX(-50%);background:rgba(0,0,0,.72);padding:7px 14px;border-radius:99px;font:700 13px/1.3 sans-serif;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}.flash.on{opacity:1}' +
      '.spin{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px;border-radius:50%;border:4px solid rgba(255,255,255,.25);border-top-color:#fff;animation:sp .8s linear infinite;display:none;pointer-events:none}.spin.on{display:block}@keyframes sp{to{transform:rotate(360deg)}}' +
      '.adc{position:absolute;inset:0;z-index:5;background:#000;display:none;align-items:center;justify-content:center;font:700 14px/1.5 sans-serif;color:#ddd;flex-direction:column;gap:10px}.adc.on{display:flex}' +
      '.sheet{position:absolute;left:0;right:0;bottom:0;max-height:78%;overflow:auto;background:rgba(24,24,24,.97);border-radius:16px 16px 0 0;padding:6px 6px 10px;transform:translateY(105%);transition:transform .22s;z-index:6}.sheet.on{transform:none}' +
      '.sheet h4{margin:6px 12px 8px;font:800 14px/1.3 sans-serif}.sheet button{width:100%;justify-content:flex-start;display:flex;gap:12px;font:600 14px/1 sans-serif;padding:12px 14px;border-radius:10px;text-align:left}.sheet button.on{color:#ff6b6b}.sheet button:active{background:rgba(255,255,255,.1)}' +
      '.sheet .sub{margin-left:auto;opacity:.6;font-weight:500}' +
      '.scrim{position:absolute;inset:0;z-index:5;display:none}.scrim.on{display:block}' +
      '.prev{position:absolute;bottom:52px;left:50%;transform:translateX(-50%);font:800 22px/1 sans-serif;text-shadow:0 2px 6px #000;opacity:0;pointer-events:none;background:rgba(0,0,0,.5);padding:8px 14px;border-radius:12px}.prev.on{opacity:1}' +
      '.lockb{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,.4);display:none}.root.locked .lockb{display:grid}.root.locked .ui{display:none}' +
      '.fsOnly{display:none!important}:host(.fs) .fsOnly{display:grid!important}' +
      '</style><div class="root" id="root">' +
      '<div class="ripple l" id="rl"></div><div class="ripple r" id="rr"></div>' +
      '<div class="lvl" id="lvl"><span id="lvlI"></span><div class="tk"><i id="lvlB"></i></div><span id="lvlT"></span></div><div class="spin" id="spin"></div>' +
      '<div class="adc" id="adc"><div class="spin on" style="position:static;margin:0"></div>正在略過廣告…</div>' +
      '<div class="ui" id="ui"><div class="top"><button id="mn" class="fsOnly" title="離開全螢幕">' + ic('down') + '</button><div class="t"><b id="tt"></b><small id="tl"></small></div>' +
      '<button class="chip" id="sp">1×</button><button id="lp" title="循環">' + ic('loop') + '</button>' +
      '<button id="pp2" title="子母畫面">' + ic('pip') + '</button><button id="dl" title="下載">' + ic('dl') + '</button><button id="mo" title="更多">' + ic('more') + '</button></div>' +
      '<div class="mid"><button id="pv2" title="上一部">' + ic('prev') + '</button><button class="sk" id="rw">' + ic('rew') + '<i>10</i></button><button class="pp" id="pp">' + ic('play') + '</button><button class="sk" id="fw">' + ic('fwd') + '<i>10</i></button><button id="nx" title="下一部">' + ic('next') + '</button></div>' +
      '<div class="bot"><div class="bar" id="bar"><div class="tr"><div class="bf" id="bf"></div><div id="segs"></div><div class="pl" id="pl"></div></div><div class="kn" id="kn"></div></div>' +
      '<div class="row"><span id="tm">0:00 / 0:00</span><span class="g"></span><span id="sb"></span><button id="fill" class="fsOnly" title="填滿螢幕">' + ic('fill') + '</button><button id="lk" class="fsOnly" title="鎖定畫面">' + ic('lock') + '</button><button id="cc" title="字幕">' + ic('cc') + '</button><button id="q" title="畫質">' + ic('gear') + '</button><button id="fs" title="全螢幕">' + ic('full') + '</button></div></div></div>' +
      '<div class="mini" id="mini"><i id="miniB"></i></div><button class="lockb" id="ulk">' + ic('unlock') + '</button>' +
      '<div class="scrim" id="scrim"></div><div class="sheet" id="sheet"></div><div class="prev" id="pvw"></div><div class="flash" id="flash"></div></div>');
    document.documentElement.appendChild(host);
    var $ = function (id) { return sh.getElementById(id); };
    var root = $('root'), hideT = 0;
    function show(keep) { root.classList.add('show'); clearTimeout(hideT); if (!keep) hideT = setTimeout(function () { var v = vid(); if (v && !v.paused && !$('sheet').classList.contains('on')) root.classList.remove('show'); }, 3000); }
    function hide() { root.classList.remove('show'); closeSheet(); }
    W.show = show;
    function toggle() { var v = vid(); if (!v) return; if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } else v.pause(); }
    function seekBy(d) { var v = vid(); if (v) v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.5, v.currentTime + d)); }
    function clickYt(sel) { var b = document.querySelector(sel); if (b) { b.click(); return true; } return false; }
    $('pp').onclick = function (e) { e.stopPropagation(); toggle(); show(); };
    $('rw').onclick = function (e) { e.stopPropagation(); seekBy(-10); W.flash('-10 秒'); show(); };
    $('fw').onclick = function (e) { e.stopPropagation(); seekBy(10); W.flash('+10 秒'); show(); };
    $('nx').onclick = function (e) { e.stopPropagation(); var p = ytp(); try { if (p && p.nextVideo) p.nextVideo(); else clickYt('.player-controls-middle-core-buttons button:last-child, .ytp-next-button'); } catch (x) {} };
    $('pv2').onclick = function (e) { e.stopPropagation(); var v = vid(); if (v && v.currentTime > 5) { v.currentTime = 0; return; } try { history.back(); } catch (x) {} };
    function spTxt() { var s = getSpeed(); $('sp').textContent = s + '×'; $('sp').classList.toggle('on', s !== 1); }
    spTxt();
    function closeSheet() { $('sheet').classList.remove('on'); $('scrim').classList.remove('on'); }
    $('scrim').onclick = function (e) { e.stopPropagation(); closeSheet(); };
    function sheet(title, items) {
      var m = $('sheet'); while (m.firstChild) m.removeChild(m.firstChild); m.appendChild(document.createElement('h4')); m.firstChild.textContent = title;
      items.forEach(function (it) {
        var b = document.createElement('button'); b.textContent = it[0]; if (it[2]) b.className = 'on';
        if (it[3]) { var s2 = document.createElement('span'); s2.className = 'sub'; s2.textContent = it[3]; b.appendChild(s2); }
        b.onclick = function (e) { e.stopPropagation(); closeSheet(); it[1](); show(); }; m.appendChild(b);
      });
      m.classList.add('on'); $('scrim').classList.add('on'); show(true);
    }
    $('sp').onclick = function (e) { e.stopPropagation(); var cur = getSpeed(); sheet('播放速度', [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4].map(function (n) { return [n + '×' + (n === 1 ? '（正常）' : ''), function () { setSpeed(n); spTxt(); W.flash('播放速度 ' + n + '×'); }, n === cur]; })); };
    $('q').onclick = function (e) {
      e.stopPropagation(); var p = ytp(), L = [], cur = '';
      try { L = p.getAvailableQualityLevels() || []; cur = p.getPlaybackQuality(); } catch (x) {}
      if (!L.length) { W.flash('這部影片無法選擇畫質'); return; }
      sheet('畫質', L.map(function (q) { return [QNAME[q] || q, function () { setQuality(q); W.flash('畫質：' + (QNAME[q] || q)); }, q === cur]; }));
    };
    $('cc').onclick = function (e) {
      e.stopPropagation(); var p = ytp(), list = [], cur = null;
      try { p.loadModule('captions'); list = p.getOption('captions', 'tracklist') || []; cur = p.getOption('captions', 'track'); } catch (x) {}
      if (!list.length) {
        try {
          var r = PR[videoId()] || (p.getPlayerResponse && p.getPlayerResponse());
          list = ((r.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
          list = list.map(function (t) { return {languageCode: t.languageCode, displayName: t.name && (t.name.simpleText || (t.name.runs || []).map(function (x) { return x.text; }).join('')), kind: t.kind, vss_id: t.vssId}; });
        } catch (x) {}
      }
      if (!list.length) {
        var yb = document.querySelector('.ytp-subtitles-button, button.ytm-closed-captioning-button, button[aria-label*="字幕"], button[aria-label*="aption"]');
        if (yb) { yb.click(); W.flash('已切換字幕'); } else W.flash('這部影片沒有字幕');
        return;
      }
      var on = cur && cur.languageCode;
      function setT(t, tr) {
        try {
          p.loadModule('captions');
          var o = {languageCode: t.languageCode}; if (t.kind) o.kind = t.kind; if (t.vss_id) o.vss_id = t.vss_id; if (tr) o.translationLanguage = {languageCode: tr, languageName: '中文（繁體）'};
          p.setOption('captions', 'track', o); localStorage.setItem('__wsCC', t.languageCode);
          W.flash('字幕：' + (t.displayName || t.languageName || t.languageCode) + (tr ? ' → 中文（繁體）' : ''));
        } catch (x) { W.flash('無法切換字幕'); }
      }
      var items = [['關閉字幕', function () { try { p.setOption('captions', 'track', {}); p.unloadModule('captions'); } catch (x) {} localStorage.removeItem('__wsCC'); W.flash('字幕：關'); }, !on]];
      list.forEach(function (t) { items.push([t.displayName || t.languageName || t.languageCode, function () { setT(t); }, on === t.languageCode, t.kind === 'asr' ? '自動產生' : '']); });
      var zh = list.some(function (t) { return /^zh/.test(t.languageCode); });
      if (!zh) items.push(['自動翻譯成中文（繁體）', function () { setT(list[0], 'zh-Hant'); }, false, '由 ' + (list[0].displayName || list[0].languageCode)]);
      sheet('字幕', items);
    };
    $('lp').onclick = function (e) { e.stopPropagation(); var v = vid(); if (!v) return; v.loop = !v.loop; $('lp').style.color = v.loop ? '#ff6b6b' : '#fff'; W.flash(v.loop ? '循環播放：開' : '循環播放：關'); show(); };
    $('pp2').onclick = function (e) { e.stopPropagation(); try { B.pip(); } catch (x) { W.flash('需要 App 才能使用子母畫面'); } };
    $('dl').onclick = function (e) { e.stopPropagation(); if (FS.on) setFs(false); try { B.ytDl(videoId()); } catch (x) {} };
    $('mo').onclick = function (e) {
      e.stopPropagation(); var v = vid();
      sheet('更多', [
        ['⬇  下載影片／音樂', function () { if (FS.on) setFs(false); try { B.ytDl(videoId()); } catch (x) {} }],
        ['🔗  複製目前時間點的連結', function () { var u = 'https://youtu.be/' + videoId() + (v ? '?t=' + Math.floor(v.currentTime) : ''); try { navigator.clipboard.writeText(u); W.flash('已複製連結'); } catch (x) { W.flash(u); } }],
        ['⏩  跳過 SponsorBlock 片段：' + (O.sb ? '開' : '關'), function () { O.sb = !O.sb; W.flash('SponsorBlock：' + (O.sb ? '開' : '關')); }],
        ['🔁  循環播放：' + (v && v.loop ? '開' : '關'), function () { $('lp').onclick(e); }],
        ['🌙  睡眠計時：30 分鐘後暫停', function () { clearTimeout(W.sleepT); W.sleepT = setTimeout(function () { var vv = vid(); if (vv) vv.pause(); }, 30 * 60e3); W.flash('30 分鐘後自動暫停'); }]
      ]);
    };
    function isFs() { return FS.on; }
    W.syncFs = function () { setH($('fs'), ic(isFs() ? 'exit' : 'full')); if (isFs()) host.classList.add('fs'); else { host.classList.remove('fs'); root.classList.remove('locked'); } };
    $('fs').onclick = function (e) { e.stopPropagation(); setFs(!isFs()); show(); };
    $('mn').onclick = function (e) { e.stopPropagation(); setFs(false); };
    $('fill').onclick = function (e) {
      e.stopPropagation(); var on = !document.documentElement.classList.contains('__wsfill');
      document.documentElement.classList.toggle('__wsfill', on); try { localStorage.setItem('__wsFill', on ? '1' : ''); } catch (x) {}
      W.flash(on ? '填滿螢幕（裁掉上下或左右）' : '完整畫面（保留黑邊）'); show();
    };
    try { if (localStorage.getItem('__wsFill')) document.documentElement.classList.add('__wsfill'); } catch (x) {}
    $('lk').onclick = function (e) { e.stopPropagation(); root.classList.add('locked'); hide(); W.flash('已鎖定畫面，點左邊的鎖頭解除'); };
    $('ulk').onclick = function (e) { e.stopPropagation(); root.classList.remove('locked'); show(); };
    /* 進度條 */
    var bar = $('bar'), dragging = false;
    function barPos(x) { var r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); }
    bar.addEventListener('pointerdown', function (e) { e.stopPropagation(); dragging = true; bar.classList.add('drag'); try { bar.setPointerCapture(e.pointerId); } catch (x) {} scrub(e); show(true); });
    bar.addEventListener('pointermove', function (e) { if (dragging) { e.stopPropagation(); scrub(e); } });
    function scrub(e) { var v = vid(); if (!v || !v.duration) return; var f = barPos(e.clientX); $('pl').style.width = f * 100 + '%'; $('kn').style.left = f * 100 + '%'; $('pvw').textContent = fmt(f * v.duration); $('pvw').classList.add('on'); W.scrubTo = f * v.duration; }
    function endScrub(e) { if (!dragging) return; e.stopPropagation(); dragging = false; bar.classList.remove('drag'); $('pvw').classList.remove('on'); var v = vid(); if (v && W.scrubTo != null) v.currentTime = W.scrubTo; W.scrubTo = null; show(); }
    bar.addEventListener('pointerup', endScrub); bar.addEventListener('pointercancel', endScrub);
    W.drawSegs = function () {
      var v = vid(), box = $('segs'); if (!box) return; while (box.firstChild) box.removeChild(box.firstChild);
      if (!v || !v.duration) return;
      SB.segs.forEach(function (g) { var d = document.createElement('div'); d.className = 'sg'; d.style.left = (100 * g.s / v.duration) + '%'; d.style.width = Math.max(0.4, 100 * (g.e - g.s) / v.duration) + '%'; d.style.background = SBCOL[g.c] || '#0f0'; box.appendChild(d); });
      $('sb').textContent = SB.segs.length ? 'SponsorBlock ' + SB.segs.length + ' 段' : '';
    };
    /* 手勢 */
    var G = null, lastTap = {t: 0, side: ''}, tapT = 0, combo = {n: 0, side: '', t: 0}, bright = 0.5;
    function lvl(kind, f) { $('lvl').classList.add('on'); $('lvlI').textContent = kind === 'vol' ? '🔊' : '☀'; $('lvlB').style.width = Math.round(f * 100) + '%'; $('lvlT').textContent = Math.round(f * 100) + '%'; }
    root.addEventListener('pointerdown', function (e) {
      if (e.target.closest && (e.target.closest('button') || e.target.closest('.bar') || e.target.closest('.sheet') || e.target.closest('.scrim'))) return;
      if (root.classList.contains('locked')) { $('ulk').style.display = 'grid'; setTimeout(function () { $('ulk').style.display = ''; }, 2500); return; }
      var r = root.getBoundingClientRect(), v = vid(), fx = (e.clientX - r.left) / r.width;
      G = {x: e.clientX, y: e.clientY, t: Date.now(), w: r.width, h: r.height, zone: fx < 0.33 ? 'l' : fx > 0.67 ? 'r' : 'c', mode: '', v0: v ? (v.muted ? 0 : v.volume) : 1, b0: bright, c0: v ? v.currentTime : 0};
      try { root.setPointerCapture(e.pointerId); } catch (x) {}
      G.lp = setTimeout(function () { if (G && !G.mode) { G.mode = 'hold'; W.hold = true; var vv = vid(); if (vv) vv.playbackRate = 2; W.flash('▶▶ 2 倍速播放中（放開恢復）'); } }, 450);
    });
    root.addEventListener('pointermove', function (e) {
      if (!G) return;
      var dx = e.clientX - G.x, dy = G.y - e.clientY;
      if (!G.mode) {
        if (Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx) * 1.4) G.mode = 'fsSwipe'; /* 上下滑：只用來進入／離開全螢幕（不調音量、亮度） */
        else if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4) G.mode = 'seek';
        if (G.mode) { clearTimeout(G.lp); if (G.mode !== 'fsSwipe') hide(); }
      }
      var v = vid();
      if (G.mode === 'vol' && v) { v.muted = false; v.volume = Math.max(0, Math.min(1, G.v0 + dy / (G.h * 0.75))); lvl('vol', v.volume); }
      if (G.mode === 'bright') { bright = Math.max(0.02, Math.min(1, G.b0 + dy / (G.h * 0.75))); try { B.brightness(bright); } catch (x) {} lvl('bright', bright); }
      if (G.mode === 'seek' && v && v.duration) { var t = Math.max(0, Math.min(v.duration, G.c0 + dx / G.w * Math.min(180, v.duration))); W.scrubTo = t; $('pvw').textContent = fmt(t) + '　' + (t >= G.c0 ? '+' : '-') + fmt(Math.abs(t - G.c0)); $('pvw').classList.add('on'); }
    });
    function endG(e) {
      if (!G) return;
      clearTimeout(G.lp);
      var g = G; G = null;
      $('lvl').classList.remove('on'); $('pvw').classList.remove('on');
      if (g.mode === 'hold') { W.hold = false; var vv = vid(); if (vv) vv.playbackRate = getSpeed(); return; }
      if (g.mode === 'seek') { var v = vid(); if (v && W.scrubTo != null) v.currentTime = W.scrubTo; W.scrubTo = null; return; }
      if (g.mode === 'fsSwipe') { var dyy = g.y - e.clientY; if (dyy > 50 && !isFs()) setFs(true); else if (dyy < -50 && isFs()) setFs(false); return; }
      if (g.mode) return;
      if (Date.now() - g.t > 450) return;
      var now = Date.now(), side = g.zone === 'c' ? '' : g.zone;
      /* 連點：第二下起每一下都快轉／快退 10 秒 */
      var inCombo = side && combo.side === side && now - combo.t < 650;
      if (side && (inCombo || (lastTap.side === side && now - lastTap.t < 320))) {
        clearTimeout(tapT);
        combo.n = inCombo ? combo.n + 1 : 1; combo.side = side; combo.t = now;
        seekBy(side === 'l' ? -10 : 10);
        var rp = $(side === 'l' ? 'rl' : 'rr'); setH(rp, ic(side === 'l' ? 'rew' : 'fwd') + '<span>' + (combo.n * 10) + ' 秒</span>'); rp.classList.add('on');
        clearTimeout(rp._t); rp._t = setTimeout(function () { rp.classList.remove('on'); }, 700);
        lastTap = {t: 0, side: ''}; hide(); return;
      }
      lastTap = {t: now, side: side};
      clearTimeout(tapT);
      tapT = setTimeout(function () { if (root.classList.contains('show')) hide(); else show(); }, side ? 300 : 0);
    }
    root.addEventListener('pointerup', endG);
    root.addEventListener('pointercancel', function () { if (G) { clearTimeout(G.lp); if (G.mode === 'hold') { W.hold = false; var vv = vid(); if (vv) vv.playbackRate = getSpeed(); } } G = null; $('lvl').classList.remove('on'); $('pvw').classList.remove('on'); });
    /* 畫面更新：控制層的位置跟著 YouTube 播放器，全螢幕時鋪滿 */
    var lastInfoId = '';
    function upd() {
      var pe = playerEl(), id = videoId();
      if (!pe || !id || O.skin === false) { host.style.display = 'none'; requestAnimationFrame(upd); return; }
      var r = isFs() ? {left: 0, top: 0, width: innerWidth, height: innerHeight, bottom: innerHeight} : pe.getBoundingClientRect();
      var ok = r.width > 80 && r.height > 60 && r.bottom > 30 && r.top < innerHeight - 30 && !document.documentElement.classList.contains('__wspip');
      host.style.display = ok ? 'block' : 'none';
      if (ok) { host.style.left = r.left + 'px'; host.style.top = r.top + 'px'; host.style.width = r.width + 'px'; host.style.height = r.height + 'px'; }
      var v = vid();
      if (v && ok) {
        var d = v.duration || 0, t = v.currentTime || 0, f = d ? t / d : 0;
        if (W.scrubTo == null) { $('pl').style.width = f * 100 + '%'; $('kn').style.left = f * 100 + '%'; }
        $('miniB').style.width = f * 100 + '%';
        try { var b = v.buffered; if (b.length) $('bf').style.width = (d ? 100 * b.end(b.length - 1) / d : 0) + '%'; } catch (x) {}
        $('tm').textContent = fmt(t) + ' / ' + fmt(d);
        var pp = v.paused ? 'play' : 'pause'; if ($('pp').dataset.s !== pp) { $('pp').dataset.s = pp; setH($('pp'), ic(pp)); }
        $('spin').classList.toggle('on', !v.paused && v.readyState < 3 && !prepSt);
        if (v.paused && !root.classList.contains('show') && !root.classList.contains('locked') && !prepSt) show(true);
        if ($('segs').childNodes.length !== SB.segs.length && d) W.drawSegs();
      }
      var ad = !!document.querySelector('.ad-showing, .ad-interrupting');
      $('adc').classList.toggle('on', ad);
      document.documentElement.classList.toggle('__wsad', ad);
      var tt = document.querySelector('.slim-video-information-title, h1.title, .ytd-watch-metadata h1, h2.slim-video-metadata-title-modern');
      var title = tt ? tt.textContent.trim() : (document.title || '').replace(/ - YouTube$/, '');
      if ($('tt').textContent !== title) $('tt').textContent = title;
      if ($('tl').textContent !== RYD.txt) $('tl').textContent = RYD.txt;
      if (id !== lastInfoId && v && v.readyState >= 1) { lastInfoId = id; loadRyd(); setTimeout(function () { window.__wsYTinfo(); }, 800); }
      requestAnimationFrame(upd);
    }
    requestAnimationFrame(upd);
    show();
  }
  /* ============================================================
     錄製式下載（只在 App 的背景播放器裡啟用）：
     記錄播放器交給 MediaSource 的影像／聲音資料，依時間順序送回 App 存檔。
     ============================================================ */
  var GR = window.__wsCfg && window.__wsCfg.grab;
  if (GR) (function () {
    var KIND = new WeakMap(), MSOF = new WeakMap();
    var T = {v: {sig: '', bytes: null, last: -1, n: 0, h: 0, other: 0}, a: {sig: '', bytes: null, last: -1, n: 0, other: 0}};
    var phase = 'wait', t0 = Date.now(), lastData = Date.now(), finished = false, reloads = +(sessionStorage.getItem('__wsGrabR') || 0);
    var HQ = {tiny: 144, small: 240, medium: 360, large: 480, hd720: 720, hd1080: 1080, hd1440: 1440, hd2160: 2160};
    /* 讓播放器一開始就用指定畫質 */
    try {
      var now = Date.now(), qh = GR.audio ? 144 : (GR.h || 720);
      localStorage.setItem('yt-player-quality', JSON.stringify({data: JSON.stringify({quality: qh, previousQuality: qh}), expiration: now + 30 * 864e5, creation: now}));
    } catch (e) {}
    function b64(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
    function send(k, u8, reset) {
      var SL = 384 * 1024;
      for (var i = 0; i < u8.length; i += SL) B.grabData(k, b64(u8.subarray(i, Math.min(u8.length, i + SL))), !!reset && i === 0);
      lastData = Date.now();
    }
    function sig(u8) { var h = 2166136261, n = Math.min(u8.length, 8192); for (var i = 0; i < n; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); } return u8.length + ':' + (h >>> 0); }
    function isInit(u8) {
      if (u8.length < 8) return false;
      if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) return true;
      var t = String.fromCharCode(u8[4], u8[5], u8[6], u8[7]);
      return t === 'ftyp' || t === 'moov';
    }
    function u32(u8, i) { return ((u8[i] << 24) >>> 0) + (u8[i + 1] << 16) + (u8[i + 2] << 8) + u8[i + 3]; }
    function boxes(u8, s, e, name) {
      for (var i = s; i + 8 <= e;) {
        var sz = u32(u8, i), ty = String.fromCharCode(u8[i + 4], u8[i + 5], u8[i + 6], u8[i + 7]), hd = 8;
        if (sz === 1) { sz = u32(u8, i + 8) * 4294967296 + u32(u8, i + 12); hd = 16; } else if (sz === 0) sz = e - i;
        if (sz < 8) return null;
        if (ty === name) return [i + hd, Math.min(e, i + sz)];
        i += sz;
      }
      return null;
    }
    function vint(u8, i) {
      var b = u8[i], len = 1, m = 0x80;
      while (len <= 8 && !(b & m)) { len++; m >>= 1; }
      var v = b & (m - 1);
      for (var k = 1; k < len; k++) v = v * 256 + u8[i + k];
      return [v, len];
    }
    /* 這一段資料的時間（用來去除重複的片段） */
    function segTs(u8) {
      var mf = boxes(u8, 0, u8.length, 'moof');
      if (mf) {
        var tf = boxes(u8, mf[0], mf[1], 'traf'); if (!tf) return null;
        var dt = boxes(u8, tf[0], tf[1], 'tfdt'); if (!dt) return null;
        return u8[dt[0]] === 1 ? u32(u8, dt[0] + 4) * 4294967296 + u32(u8, dt[0] + 8) : u32(u8, dt[0] + 4);
      }
      for (var i = 0; i + 8 < u8.length && i < 4096; i++) {
        if (u8[i] === 0x1F && u8[i + 1] === 0x43 && u8[i + 2] === 0xB6 && u8[i + 3] === 0x75) {
          var j = i + 4, sz = vint(u8, j); j += sz[1];
          if (u8[j] !== 0xE7) return null;
          var l = vint(u8, j + 1); j += 1 + l[1];
          var v = 0; for (var k = 0; k < l[0]; k++) v = v * 256 + u8[j + k];
          return v;
        }
      }
      return null;
    }
    /* 影像初始化片段裡的畫面高度 */
    function initHeight(u8) {
      var ebml = u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3;
      /* WebM：只在 Video 區塊（0xE0）之後找 PixelHeight，避免把 MP4 的資料誤判成高度 */
      var vs = -1;
      if (ebml) for (var q = 0; q + 1 < u8.length; q++) { if (u8[q] === 0xE0 && (u8[q + 1] & 0x80)) { vs = q; break; } }
      for (var i = vs < 0 ? u8.length : vs; i + 3 < u8.length && i < vs + 64; i++) {
        if (u8[i] === 0xBA && (u8[i + 1] & 0x80) && i > 0) {
          var l = u8[i + 1] & 0x7F; if (l < 1 || l > 2) continue;
          var v = l === 1 ? u8[i + 2] : u8[i + 2] * 256 + u8[i + 3];
          if (v >= 90 && v <= 4400 && u8[i - 1] !== 0xBA) { for (var j = Math.max(0, i - 24); j < i; j++) if (u8[j] === 0xB0) return v; }
        }
      }
      if (ebml) return 0;
      var mv = boxes(u8, 0, u8.length, 'moov'); if (!mv) return 0;
      for (var p = mv[0]; p < mv[1];) {
        var tk = boxes(u8, p, mv[1], 'trak'); if (!tk) break;
        var th = boxes(u8, tk[0], tk[1], 'tkhd');
        if (th) { var hh = u32(u8, th[1] - 4) >>> 16; if (hh) return hh; }
        p = tk[1];
      }
      return 0;
    }
    function take(sb, data) {
      if (finished) return;
      var k = KIND.get(sb); if (!k) return;
      var ms = MSOF.get(sb);
      if (GR.len && ms && isFinite(ms.duration) && ms.duration > 0 && Math.abs(ms.duration - GR.len) > 3) return; /* 廣告 */
      var u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      var t = T[k];
      if (isInit(u8)) {
        var sg = sig(u8);
        if (sg === t.sig) return;
        if (k === 'v') t.h = initHeight(u8);
        if (phase === 'run' && t.sig) { t.other++; return; } /* 執行中換了格式：不要混進來 */
        t.sig = sg; t.bytes = new Uint8Array(u8); t.last = -1; t.n = 0; t.first = null;
        send(k, u8, true);
        var ts0 = segTs(u8); if (ts0 != null) t.last = ts0;
        return;
      }
      if (!t.sig) return;
      if (phase === 'run' && t.other) { /* 正在收別的格式：檢查是不是回到原本格式 */ }
      var ts = segTs(u8);
      if (ts != null) { if (ts <= t.last) return; t.last = ts; if (t.first == null) t.first = ts; }
      send(k, u8, false); t.n++;
    }
    function hookMS(MS) {
      if (!MS || !MS.prototype || MS.prototype.__wsGrab) return;
      var add = MS.prototype.addSourceBuffer;
      MS.prototype.addSourceBuffer = function (mime) {
        var sb = add.apply(this, arguments), k = /audio/i.test(mime) ? 'a' : 'v';
        KIND.set(sb, k); MSOF.set(sb, this);
        try { B.grabMime(k, String(mime)); } catch (e) {}
        return sb;
      };
      MS.prototype.__wsGrab = 1;
    }
    hookMS(window.MediaSource); hookMS(window.ManagedMediaSource);
    if (window.SourceBuffer) {
      var app = SourceBuffer.prototype.appendBuffer;
      SourceBuffer.prototype.appendBuffer = function (d) { try { take(this, d); } catch (e) {} return app.apply(this, arguments); };
    }
    function done(err) {
      if (finished) return; finished = true;
      sessionStorage.removeItem('__wsGrabR');
      var v = vid(); if (v) v.pause();
      try { B.grabDone(err || ''); } catch (e) {}
    }
    function bufEnd(v) {
      var b = v.buffered, t = v.currentTime;
      for (var i = 0; i < b.length; i++) if (b.start(i) <= t + 0.3 && b.end(i) >= t) return b.end(i);
      return t;
    }
    var stuck = 0, lastBe = -1, qSet = 0, ending = false, maxPct = 0;
    setInterval(function () {
      if (finished || ending) return;
      var v = vid(), p = ytp(), now = Date.now();
      if (now - lastData > 60000) { done(T.v.n + T.a.n ? '背景播放器 60 秒沒有收到新資料' : '背景播放器沒有開始播放（可能需要登入或影片有年齡、地區限制）'); return; }
      if (!v) return;
      v.muted = true;
      if (v.paused && !(v.ended)) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      if (!document.querySelector('.ad-showing') && p && p.setPlaybackQualityRange && now - qSet > 4000) { qSet = now; try { var q = GR.audio ? 'tiny' : GR.q; p.setPlaybackQualityRange(q, q); } catch (e) {} }
      var d = v.duration;
      if (!d || !isFinite(d) || document.querySelector('.ad-showing')) { B.grabProg(0, '等待播放器'); return; }
      if (phase === 'wait') {
        var vOk = GR.audio || (T.v.sig && T.v.n > 0), aOk = T.a.sig && T.a.n > 0;
        if (!vOk || !aOk) { B.grabProg(0, '等待播放器'); return; }
        if (!GR.audio && T.v.h && GR.h && T.v.h < GR.h * 0.9) {
          /* 播放器一開始不是要的畫質：重新載入（最多兩次），讓它直接用指定畫質開始 */
          var lv = []; try { lv = p.getAvailableQualityLevels(); } catch (e) {}
          var can = lv.some(function (q) { return (HQ[q] || 0) >= GR.h; });
          if (can && reloads < 1) { B.grabProg(0, '重新載入以取得 ' + GR.h + 'p'); sessionStorage.setItem('__wsGrabR', reloads + 1); finished = true; location.reload(); return; }
        }
        /* 必須從開頭收：播放器如果不是從 0 秒開始（例如接續上次觀看位置），清掉重收並跳回開頭 */
        ['v', 'a'].forEach(function (k) {
          var t = T[k];
          if (t.sig && t.first != null && t.first > 50) { send(k, t.bytes, true); t.last = -1; t.first = null; t.n = 0; }
        });
        phase = 'run'; try { v.currentTime = 0; } catch (e) {}
      }
      var be = bufEnd(v);
      maxPct = Math.max(maxPct, Math.min(0.99, be / d));
      B.grabProg(maxPct, (GR.audio ? '錄製音軌 ' : '錄製 ' + (T.v.h ? T.v.h + 'p ' : '')) + fmt(be) + ' / ' + fmt(d));
      /* 結束：緩衝到尾端、影片播完，或已到最後幾秒且 3 秒沒有新資料（避免卡在 99%） */
      if (be >= d - 0.6 || v.ended || (d - be < 4 && now - lastData > 3000)) { if (!ending) { ending = true; setTimeout(function () { done(''); }, 1200); } return; }
      /* 加速：2 倍速靜音播放，並跳到緩衝的最前端，讓播放器不停地抓下一段
         （太快會讓播放器判定掉格而自動降畫質、重新載入，反而變慢） */
      try { if (v.playbackRate !== 2) v.playbackRate = 2; } catch (e) {}
      if (be - v.currentTime > 2.5) { try { v.currentTime = Math.max(v.currentTime, be - 0.8); } catch (e) {} }
      if (Math.abs(be - lastBe) < 0.01) stuck++; else stuck = 0;
      lastBe = be;
      if (stuck > 24) { stuck = 0; try { v.currentTime = Math.min(d - 0.2, be + 0.05); } catch (e) {} }
    }, 300);
  })();
})();
