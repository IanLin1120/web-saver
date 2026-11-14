/* APK 瀏覽器頁面內的輔助程式（由 App 注入）：廣告元素隱藏、密碼偵測、擷取、媒體偵測、手動移除元素 */
(function () {
  'use strict';
  var cfg = window.__wsCfg || {};
  var B = window.WSPage;
  if (!B) return;

  /* 一般網頁的影片：告訴 App 有沒有在播（子母畫面用），以及子母畫面時只顯示影片。YouTube 由 yt.js 處理 */
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname) && !window.__wsVidHook) {
    window.__wsVidHook = 1;
    var curV = null;
    var rep = function (e) {
      var v = e.target;
      if (!v || v.tagName !== 'VIDEO') return;
      var on = e.type === 'playing' || e.type === 'play';
      if (on && (v.muted || v.videoWidth < 200)) { if (e.type === 'play') return; if (v.muted) return; }
      if (on) curV = v; else if (curV !== v) return;
      try { B.video(on && !v.paused, v.videoWidth || 0, v.videoHeight || 0); } catch (x) {}
    };
    ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function (t) { document.addEventListener(t, rep, true); });
    /* 網頁裡按「分享」或「複製連結」：社群貼文（IG、FB、Threads、TikTok、X…）交給 App，問你要用內建下載還是交給其他 App 下載 */
    if (!window.__wsShareHook && B.sharedLink) {
      window.__wsShareHook = 1;
      var SOC = /^https?:\/\/([a-z0-9-]+\.)*(instagram\.com\/([^/?#]+\/)?(p|reel|reels|tv|stories)\/|facebook\.com\/|fb\.watch\/|fb\.com\/|threads\.(net|com)\/|tiktok\.com\/|x\.com\/[^/]+\/status|twitter\.com\/[^/]+\/status|xiaohongshu\.com\/|xhslink\.com\/|douyin\.com\/|bilibili\.com\/video|b23\.tv\/|pinterest\.[a-z.]+\/pin\/|pin\.it\/|weibo\.(com|cn)\/|reddit\.com\/r\/[^/]+\/comments|v\.redd\.it\/|vimeo\.com\/\d|dailymotion\.com\/video|kuaishou\.com\/|snapchat\.com\/(spotlight|t)\/|tumblr\.com\/|dcard\.tw\/f\/[^/]+\/p\/|lemon8-app\.com\/)/i;
      var lastShare = '', lastShareT = 0;
      var share = function (t, title, via) {
        var m = String(t || '').match(/https?:\/\/[^\s"'<>]+/);
        if (!m) return false;
        var u = m[0];
        if (!via && !SOC.test(u)) return false;
        if (u === lastShare && Date.now() - lastShareT < 2000) return true;
        lastShare = u; lastShareT = Date.now();
        try { B.sharedLink(JSON.stringify({url: u, title: title || document.title || '', via: via ? 'share' : 'copy'})); } catch (x) {}
        return true;
      };
      try {
        var cb = navigator.clipboard;
        if (cb && cb.writeText) { var ow = cb.writeText.bind(cb); cb.writeText = function (t) { share(t); return ow(t); }; }
      } catch (x) {}
      try {
        var oe = document.execCommand;
        document.execCommand = function (c) {
          if (String(c).toLowerCase() === 'copy') { try { var s = String(window.getSelection() || ''); var ae = document.activeElement; if (!s && ae && ae.value) s = ae.value; share(s); } catch (x) {} }
          return oe.apply(document, arguments);
        };
      } catch (x) {}
      /* WebView 沒有系統分享（navigator.share）：補上，網站的「分享」鈕就會交給 App */
      if (!navigator.share) {
        try {
          navigator.share = function (d) { d = d || {}; share(d.url || d.text || location.href, d.title, true); return Promise.resolve(); };
          navigator.canShare = function () { return true; };
        } catch (x) {}
      }
    }
    /* 網頁影片改用內建播放器的部分在 vp.js（所有框架都會注入，嵌在別的網站框框裡的影片也能接手） */
    window.addEventListener('pagehide', function () { try { B.video(false, 0, 0); } catch (x) {} });
    var pst = null, anc = [];
    window.__wsYTpip = function (on) {
      var de = document.documentElement;
      if (on) {
        var v = curV && curV.isConnected ? curV : document.querySelector('video');
        if (!v) return;
        if (!pst) {
          pst = document.createElement('style');
          pst.textContent = 'html.__wspip,html.__wspip body{overflow:hidden!important;background:#000!important}' +
            'html.__wspip video[data-wspip]{position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;z-index:2147483647!important;background:#000!important;object-fit:contain!important;transform:none!important}' +
            'html.__wspip .__wspipA{transform:none!important;filter:none!important;perspective:none!important;contain:none!important;will-change:auto!important;backdrop-filter:none!important}';
          de.appendChild(pst);
        }
        v.setAttribute('data-wspip', '');
        anc = []; for (var p = v.parentElement; p && p !== de; p = p.parentElement) { p.classList.add('__wspipA'); anc.push(p); }
        de.classList.add('__wspip');
      } else {
        de.classList.remove('__wspip');
        anc.forEach(function (p) { p.classList.remove('__wspipA'); }); anc = [];
        var q = document.querySelectorAll('video[data-wspip]'); for (var i = 0; i < q.length; i++) q[i].removeAttribute('data-wspip');
      }
    };
  }

  function adCss() {
    if (!cfg.ads) { var o = document.getElementById('__ws_adcss'); if (o) o.remove(); return; }
    if (document.getElementById('__ws_adcss') || !document.documentElement) return;
    var st = document.createElement('style');
    st.id = '__ws_adcss';
    st.textContent = (cfg.css || '') + '{display:none!important;visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 正在播放的影片：記下它的長度、畫面與縮圖，讓下載面板知道哪個才是你要的 ---------- */
  if (!window.__wsPlayHook && B.played) {
    window.__wsPlayHook = 1;
    var lastRep = 0;
    var report = function (v, why) {
      try {
        if (!v || v.tagName !== 'VIDEO') return;
        var d = v.duration;
        if (!(d > 0)) return;
        var now = Date.now();
        if (why === 'time' && now - lastRep < 15000) return;
        lastRep = now;
        var thumb = '';
        try {
          if (v.videoWidth) {
            var c = document.createElement('canvas'), w = 320, h = Math.round(320 * v.videoHeight / v.videoWidth);
            c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
            thumb = c.toDataURL('image/jpeg', 0.7);
          }
        } catch (e) { thumb = ''; }
        var src = v.currentSrc || v.src || '';
        var h1 = document.querySelector('h1, .title, [class*="title"]');
        B.played(JSON.stringify({src: src, dur: isFinite(d) ? d : -1, w: v.videoWidth, h: v.videoHeight, poster: v.poster || '', thumb: thumb,
          title: document.title || '', heading: h1 ? (h1.textContent || '').trim().slice(0, 80) : '', t: v.currentTime}));
      } catch (e) {}
    };
    document.addEventListener('playing', function (e) { var v = e.target; setTimeout(function () { report(v, 'play'); }, 2500); }, true);
    document.addEventListener('timeupdate', function (e) { report(e.target, 'time'); }, true);
  }

  if (window.__wsPage && window.__wsPage.v >= 3) { window.__wsPage.refresh(); return; }

  /* ---------- 密碼：偵測欄位與送出 ---------- */
  var pwNotified = false, lastOffer = 0;
  function findUser(pw) {
    var form = pw.form || pw.closest('form') || document;
    var ins = Array.prototype.slice.call(form.querySelectorAll('input'));
    var idx = ins.indexOf(pw), u = null;
    for (var i = idx - 1; i >= 0; i--) {
      var t = (ins[i].type || 'text').toLowerCase();
      if ((t === 'text' || t === 'email' || t === 'tel' || t === 'number') && ins[i].offsetParent !== null) { u = ins[i]; break; }
    }
    if (!u) u = form.querySelector('input[autocomplete="username"],input[type="email"],input[name*="user" i],input[name*="mail" i],input[name*="account" i],input[id*="user" i]');
    return u;
  }
  function pwFields() { return Array.prototype.filter.call(document.querySelectorAll('input[type="password"]'), function (p) { return p.offsetParent !== null || p.getClientRects().length; }); }
  function checkPw() {
    if (!cfg.pw || pwNotified) return;
    if (pwFields().length) { pwNotified = true; try { B.pwField(location.hostname); } catch (e) {} }
  }
  function offer() {
    if (!cfg.pw) return;
    var now = Date.now(); if (now - lastOffer < 1500) return;
    var ps = pwFields().filter(function (p) { return p.value; });
    if (!ps.length) return;
    var p = ps[0], u = findUser(p);
    lastOffer = now;
    try { B.pwOffer(location.hostname, u ? u.value : '', p.value); } catch (e) {}
  }
  document.addEventListener('submit', offer, true);
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button,input[type="submit"],input[type="button"],[role="button"]');
    if (b && pwFields().some(function (p) { return p.value; })) setTimeout(offer, 30);
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') setTimeout(offer, 30); }, true);

  function setVal(el, v) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (desc && desc.set) desc.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  function fill(user, pass) {
    var ps = pwFields(); if (!ps.length) return false;
    var u = findUser(ps[0]);
    if (u && user) setVal(u, user);
    setVal(ps[0], pass);
    return true;
  }

  /* ---------- 原生資料傳輸 ---------- */
  var waits = {}, seq = 0;
  window.__wsIO = function (id, json) {
    var w = waits[id]; if (!w) return; delete waits[id];
    var r = null; try { r = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) {}
    w(r && (r.b64 != null || r.text != null) ? r : null);
  };
  function nfetch(token, url, kind) {
    return new Promise(function (res) {
      if (!/^https?:/i.test(url)) { res(null); return; }
      var id = 'f' + (++seq);
      waits[id] = res;
      try { B.fetch(token, id, url, kind || 'bin'); } catch (e) { delete waits[id]; res(null); }
      setTimeout(function () { if (waits[id]) { delete waits[id]; res(null); } }, 45000);
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function autoScroll(token, slow) {
    var se = document.scrollingElement || document.documentElement, start = se.scrollTop, h = 0, step = Math.max(400, innerHeight * (slow ? 0.8 : 0.9));
    for (var y = 0, i = 0; i < (slow ? 600 : 80); i++) {
      h = se.scrollHeight; y += step; se.scrollTop = y; window.scrollTo(0, y);
      try { B.progress(token, Math.min(9, 1 + Math.round(8 * y / h)), '捲動載入所有圖片… ' + Math.min(99, Math.round(100 * y / h)) + '%'); } catch (e) {}
      await sleep(slow ? 260 : 120);
      if (y >= se.scrollHeight) break;
    }
    se.scrollTop = start; await sleep(250);
  }

  async function capture(token, optsJson) {
    var opts = {}; try { opts = JSON.parse(optsJson); } catch (e) {}
    try {
      if (opts.autoScroll && !opts.reader) await autoScroll(token);
      var r = await window.WSCapture.run(document, opts, {
        fetch: function (u, k) { return nfetch(token, u, k); },
        progress: function (p, m) { try { B.progress(token, p, m); } catch (e) {} }
      });
      var html = r.html, CH = 1 << 20, n = Math.ceil(html.length / CH) || 1;
      for (var i = 0; i < n; i++) B.result(token, i, n, html.slice(i * CH, (i + 1) * CH), r.title || document.title || '');
    } catch (e) {
      try { B.fail(token, String(e && e.message || e)); } catch (x) {}
    }
  }

  /* 長條漫畫：只取內容圖片（寬度接近頁面上最寬的圖），依頁面順序 */
  async function comic(token, optsJson) {
    var opts = {}; try { opts = JSON.parse(optsJson); } catch (e) {}
    try {
      if (opts.autoScroll !== false) await autoScroll(token, true);
      var imgs = Array.prototype.slice.call(document.images), t0 = Date.now();
      while (Date.now() - t0 < 6000 && imgs.some(function (i) { return !i.complete; })) await sleep(300);
      var adEls = [];
      if (window.WS_AD && WS_AD.css) WS_AD.css.split(',').forEach(function (sel) { try { document.querySelectorAll(sel).forEach(function (e) { adEls.push(e); }); } catch (e) {} });
      var base = document.baseURI, C = window.WSCapture;
      var rows = imgs.map(function (img) {
        var r = img.getBoundingClientRect(), cur = img.currentSrc || img.src, lz = C ? C.lazySrc(img, base) : '';
        var u = lz && (!cur || (C && C.isPlaceholder(cur))) ? lz : cur;
        return {el: img, w: r.width, h: r.height, nw: img.naturalWidth, nh: img.naturalHeight, url: u};
      }).filter(function (x) {
        if (!x.url || /^data:image\/(gif|svg)/.test(x.url) || x.w < 50) return false;
        for (var i = 0; i < adEls.length; i++) if (adEls[i].contains(x.el)) return false;
        return true;
      });
      var maxW = Math.max.apply(null, rows.map(function (x) { return x.w; }).concat([1]));
      var ratio = opts.minRatio || 0.6, seen = {};
      rows = rows.filter(function (x) { if (x.w < maxW * ratio || Math.max(x.nh, x.h) < 80 || seen[x.url]) return false; seen[x.url] = 1; return true; });
      try { B.progress(token, 10, '找到 ' + rows.length + ' 張內容圖片'); } catch (e) {}
      B.comicList(token, JSON.stringify(rows.map(function (x) { var u = x.url; try { u = new URL(u, base).href; } catch (e) {} return {url: u, w: x.nw, h: x.nh}; })));
    } catch (e) { try { B.fail(token, String(e && e.message || e)); } catch (x) {} }
  }

  function media(token, minPx) {
    try { B.media(token, JSON.stringify(window.WSMedia.scan(document, {minPx: minPx}))); }
    catch (e) { try { B.media(token, '[]'); } catch (x) {} }
  }

  /* ---------- 手動移除元素（點選要清掉的區塊） ---------- */
  var Z = {on: false, sel: null, stack: [], ui: null};
  function zapUi() {
    if (Z.ui) return Z.ui;
    var host = document.createElement('div'); host.id = '__ws_zap_ui'; host.className = '__ws_ui';
    host.setAttribute('style', 'all:initial;position:fixed;left:0;right:0;bottom:0;z-index:2147483647');
    var sh = host.attachShadow({mode: 'open'});
    sh.innerHTML = '<style>.bar{margin:10px;padding:10px;border-radius:18px;background:rgba(43,35,26,.92);color:#f4ecdc;font:600 14px/1.3 -apple-system,"Noto Sans TC",sans-serif;display:flex;gap:6px;align-items:center;flex-wrap:wrap;box-shadow:0 8px 24px rgba(0,0,0,.35)}' +
      '.t{flex:1 1 100%;font-weight:500;font-size:12.5px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}button{font:inherit;border:0;border-radius:99px;padding:8px 14px;background:rgba(255,255,255,.14);color:inherit}' +
      'button.p{background:#e0a066;color:#2a1a0a}button.d{background:#d9603f;color:#fff}</style>' +
      '<div class="bar"><div class="t" id="t">點選頁面上要移除的區塊（廣告、橫幅、推薦文章…）</div><button id="up">⬆ 擴大</button><button class="d" id="rm">移除</button><button id="un">↩ 復原</button><button class="p" id="ok">完成</button></div>';
    sh.getElementById('up').onclick = function (e) { e.stopPropagation(); if (Z.sel && Z.sel.parentElement && Z.sel.parentElement !== document.body) select(Z.sel.parentElement); };
    sh.getElementById('rm').onclick = function (e) { e.stopPropagation(); if (!Z.sel) return; var el = Z.sel; select(null); el.setAttribute('data-ws-zap', '1'); Z.stack.push([el, el.style.getPropertyValue('display'), el.style.getPropertyPriority('display')]); el.style.setProperty('display', 'none', 'important'); count(); };
    sh.getElementById('un').onclick = function (e) { e.stopPropagation(); var x = Z.stack.pop(); if (!x) return; x[0].removeAttribute('data-ws-zap'); if (x[1]) x[0].style.setProperty('display', x[1], x[2]); else x[0].style.removeProperty('display'); count(); };
    sh.getElementById('ok').onclick = function (e) { e.stopPropagation(); zap(false); };
    Z.ui = host; Z.t = sh.getElementById('t');
    return host;
  }
  function count() { try { B.zapCount(Z.stack.length); } catch (e) {} if (Z.t) Z.t.textContent = Z.stack.length ? '已移除 ' + Z.stack.length + ' 個區塊・可繼續點選' : '點選頁面上要移除的區塊'; }
  function select(el) {
    if (Z.sel) { Z.sel.style.outline = Z.sel.__wsO || ''; Z.sel.style.outlineOffset = ''; Z.sel.removeAttribute('data-ws-hl'); }
    Z.sel = el;
    if (el) {
      el.__wsO = el.style.outline; el.style.outline = '3px solid #e0a066'; el.style.outlineOffset = '-3px'; el.setAttribute('data-ws-hl', '1');
      var r = el.getBoundingClientRect();
      if (Z.t) Z.t.textContent = '已選：<' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + '>  ' + Math.round(r.width) + '×' + Math.round(r.height);
    }
  }
  function onZapClick(e) {
    if (!Z.on) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(Z.ui) >= 0) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var el = e.target;
    if (el === document.body || el === document.documentElement) return;
    select(el);
  }
  function zap(on) {
    Z.on = !!on;
    if (on) { document.documentElement.appendChild(zapUi()); document.addEventListener('click', onZapClick, true); count(); }
    else { select(null); if (Z.ui) Z.ui.remove(); document.removeEventListener('click', onZapClick, true); try { B.zapDone(Z.stack.length); } catch (e) {} }
    return Z.stack.length;
  }

  var moT = 0;
  var mo = new MutationObserver(function () { if (moT) return; moT = setTimeout(function () { moT = 0; adCss(); checkPw(); }, 400); });
  function refresh() {
    cfg = window.__wsCfg || cfg; adCss(); checkPw();
  }
  window.__wsPage = {v: 3, refresh: refresh, capture: capture, media: media, comic: comic, fill: fill, zap: zap,
    reader: function (on) { return window.WSReader ? window.WSReader.toggleLive(on) : 'none'; }};
  refresh();
  try { mo.observe(document.documentElement, {childList: true, subtree: true}); setTimeout(function () { mo.disconnect(); }, 20000); } catch (e) {}
})();

/* ---------- 錄製下載：把網頁上正在播放的影片「原畫面＋原聲音」直接錄下來（由 App 在看不到的分頁裡執行） ----------
   用影片本身的畫面（不是螢幕截圖），解析度就是影片當下的解析度，不會有網頁的其他東西；
   聲音改走 Web Audio 送進錄影，不會從喇叭播出來。受保護（DRM）或跨網域的影片瀏覽器不允許錄製。 */
(function () {
  if (window.__wsRec) return;
  var B = window.WSPage;
  if (!B || !B.grabData) return;
  var st = null;
  function vids() {
    var out = [].slice.call(document.querySelectorAll('video'));
    [].slice.call(document.querySelectorAll('iframe')).forEach(function (f) { try { out = out.concat([].slice.call(f.contentDocument.querySelectorAll('video'))); } catch (e) {} });
    return out;
  }
  function pick(src) {
    var vs = vids(), best = null;
    if (src) vs.forEach(function (v) { if (!best && (v.currentSrc === src || v.src === src)) best = v; });
    if (!best) best = vs.sort(function (a, b) { return (b.videoWidth * b.videoHeight || b.clientWidth * b.clientHeight) - (a.videoWidth * a.videoHeight || a.clientWidth * a.clientHeight); })[0] || null;
    return best;
  }
  function b64(buf) {
    var u = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }
  function mimeOf() {
    var c = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
    return '';
  }
  function start(o) {
    o = o || {};
    if (st) return 'busy';
    var v = pick(o.src);
    if (!v) return 'novideo';
    if (!(v.readyState >= 1)) { try { v.muted = true; var p0 = v.play(); if (p0 && p0.catch) p0.catch(function () {}); } catch (e) {} return 'wait'; }
    var cap = v.captureStream || v.mozCaptureStream;
    if (!cap) return 'nocap:這個瀏覽器不支援錄製影片';
    var vs;
    try { vs = cap.call(v); } catch (e) { return 'nocap:' + (e && e.message || e); }
    var tracks = vs.getVideoTracks();
    if (!tracks.length) return 'wait';
    /* 聲音：接到 Web Audio，只送進錄影、不從喇叭播放 */
    var ac = null, dst = null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      var srcN = v.__wsSrcNode || (v.__wsSrcNode = ac.createMediaElementSource(v));
      dst = ac.createMediaStreamDestination();
      srcN.connect(dst);
      if (ac.resume) ac.resume();
      v.muted = false; v.volume = 1;
    } catch (e) { ac = null; dst = null; }
    var stream = new MediaStream(tracks.concat(dst ? dst.stream.getAudioTracks() : vs.getAudioTracks()));
    var mime = mimeOf();
    var w = v.videoWidth || 1280, h = v.videoHeight || 720;
    var bps = Math.min(24e6, Math.max(2.5e6, Math.round(w * h * 30 * 0.14)));
    var rec;
    try { rec = new MediaRecorder(stream, mime ? {mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 192000} : {videoBitsPerSecond: bps}); }
    catch (e) { return 'nocap:' + (e && e.message || e); }
    B.grabMime('v', rec.mimeType || mime || 'video/webm');
    st = {v: v, rec: rec, ac: ac, q: Promise.resolve(), last: -1, dur: 0, t0: Date.now(), w: w, h: h};
    rec.ondataavailable = function (e) {
      if (!e.data || !e.data.size) return;
      var d = e.data;
      st.q = st.q.then(function () { return d.arrayBuffer(); }).then(function (buf) {
        for (var i = 0; i < buf.byteLength; i += 4 << 20) B.grabData('v', b64(buf.slice(i, Math.min(buf.byteLength, i + (4 << 20)))), false);
      }).catch(function (err) { B.grabDone('寫入錄影資料失敗：' + err); });
    };
    rec.onstop = function () {
      var s = st;
      s.q.then(function () { try { if (s.ac) s.ac.close(); } catch (e) {} B.grabDone(''); });
    };
    /* 從頭開始、以原速播放到結束 */
    try { v.loop = false; v.playbackRate = 1; if (!o.keepPos && isFinite(v.duration) && v.duration > 0) v.currentTime = 0; } catch (e) {}
    try { v.style.setProperty('position', 'fixed', 'important'); v.style.setProperty('inset', '0', 'important'); v.style.setProperty('width', '100vw', 'important'); v.style.setProperty('height', '100vh', 'important'); v.style.setProperty('z-index', '2147483647', 'important'); v.style.setProperty('object-fit', 'contain', 'important'); v.style.setProperty('background', '#000', 'important'); } catch (e) {}
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    rec.start(2000);
    var stall = 0, lastT = -1, acc = 0, maxT = 0, src0 = v.currentSrc, t0 = Date.now();
    st.tm = setInterval(function () {
      var d = isFinite(v.duration) ? v.duration : 0, t = v.currentTime || 0, dt = t - lastT;
      if (lastT >= 0 && dt > 0 && dt < 4) acc += dt;
      if (Math.abs(dt) < 0.05) stall++; else stall = 0;
      maxT = Math.max(maxT, t);
      var nearEnd = d > 0 && (maxT >= d - 1.5 || acc >= d - 1);
      /* 結束的判斷：播完、播放器自己從頭重播（循環）、停在最後、換成下一部影片、錄的時間已經超過影片長度 */
      var looped = d > 0 && maxT >= d * 0.8 && t < maxT - 2 && lastT >= 0;
      var swapped = src0 && v.currentSrc && v.currentSrc !== src0;
      var overtime = d > 0 && (Date.now() - t0) / 1000 > d * 1.6 + 40;
      lastT = t;
      if (!nearEnd && v.paused && !v.ended) { var pp = v.play(); if (pp && pp.catch) pp.catch(function () {}); }
      B.grabProg(d > 0 ? Math.min(0.99, Math.max(acc, t) / d) : 0, (v.videoWidth || w) + '×' + (v.videoHeight || h) + ' 錄製中 ' + fmt(Math.max(acc, t)) + (d > 0 ? ' / ' + fmt(d) : ''));
      if (v.ended || looped || swapped || overtime || (nearEnd && (stall >= 2 || v.paused)) || (d > 0 && t >= d - 0.3) || stall > 60 || !v.isConnected) stop();
    }, 1000);
    v.addEventListener('ended', stop);
    v.addEventListener('emptied', stop);
    return 'ok';
  }
  function fmt(t) { t = Math.floor(t || 0); var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function stop() {
    if (!st || st.stopping) return;
    st.stopping = true;
    clearInterval(st.tm);
    try { st.v.pause(); } catch (e) {}
    var s = st, fin = false, finish = function () { if (fin) return; fin = true; s.q.then(function () { try { if (s.ac) s.ac.close(); } catch (e) {} B.grabDone(''); }); };
    s.rec.onstop = finish;
    try { if (s.rec.state === 'inactive') finish(); else s.rec.stop(); } catch (e) { finish(); }
    /* 保險：錄影器沒有回應時，8 秒後照樣結束 */
    setTimeout(finish, 8000);
  }
  /* 手機內建螢幕錄影用：把影片放大到整個畫面（蓋住網頁其他東西），從頭播放到結束後通知 App 停止錄影 */
  var scr = null;
  var FULL = [['position', 'fixed'], ['inset', '0'], ['left', '0'], ['top', '0'], ['width', '100vw'], ['height', '100vh'], ['max-width', 'none'], ['max-height', 'none'],
       ['z-index', '2147483647'], ['object-fit', 'contain'], ['background', '#000'], ['margin', '0'], ['transform', 'none']];
  function screen(on) {
    if (on) {
      var v = (scr && scr.v) || shownPlaying(null) || pick('');
      if (!v) return JSON.stringify({err: 'novideo'});
      if (!scr) scr = {v: v, style: v.getAttribute('style'), controls: v.controls, rect: v.getBoundingClientRect()};
      v.controls = false;
      /* 跟原本「在目前分頁錄製」一樣：只改影片本身的樣式（不加遮罩，之前加黑色遮罩會在某些網站蓋住影片變成全黑） */
      FULL.forEach(function (p) { v.style.setProperty(p[0], p[1], 'important'); });
      ensureSound(v);
      var pp = v.play(); if (pp && pp.catch) pp.catch(function () {});
      /* 跟著換影片：限時動態播完自動跳下一則、或網站重新畫面時，影片元素會換成新的一個 → 把滿版套到新的那一個 */
      clearInterval(scr.fw);
      scr.fw = setInterval(follow, 500);
      return JSON.stringify({w: v.videoWidth || 16, h: v.videoHeight || 9, dur: isFinite(v.duration) ? v.duration : 0});
    }
    if (scr) {
      clearInterval(scr.tm); clearInterval(scr.fw);
      vids().forEach(function (o) { if (o.__wsMutedByUs) { try { o.muted = false; } catch (e) {} delete o.__wsMutedByUs; } });
      if (scr.style == null) scr.v.removeAttribute('style'); else scr.v.setAttribute('style', scr.style);
      scr.v.controls = scr.controls;
      scr = null;
    }
    window.__wsRecPaused = 0;
    return '{}';
  }
  /* 畫面上看得到（有實際大小）而且正在播的影片中最大的一部 */
  function shownPlaying(except) {
    var best = null, bs = 0;
    vids().forEach(function (o) {
      if (o === except || !o.isConnected || o.paused || o.readyState < 2 || !o.getClientRects().length) return;
      var a = visArea(o);
      if (a > bs) { bs = a; best = o; }
    });
    return best;
  }
  /* 在螢幕範圍內實際看得到的面積（畫面外、預先載入的影片是 0） */
  function visArea(o) {
    if (!o.getClientRects().length) return 0;
    var r = o.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  }
  /* 只在「錄影中」：其他影片全部靜音（只錄滿版這一部的聲音），看不到的（藏起來、畫面外）再順便暫停。
     滿版預覽時完全不碰其他影片，網站自己換下一則限時動態不受影響。離開滿版後恢復。 */
  function quietHidden(v) {
    vids().forEach(function (o) {
      if (o === v) return;
      try {
        if (!o.muted) { o.__wsMutedByUs = true; o.muted = true; }
        if (!o.paused && visArea(o) === 0) o.pause();
      } catch (e) {}
    });
  }
  function follow() {
    if (!scr || scr.rec) return;
    var cur = scr.v;
    /* 目前這個還在而且在播：不用換 */
    var shown = cur.isConnected && visArea(cur) > 0;
    if (shown && !cur.paused && !cur.ended) return;
    /* 換成畫面上看得到、正在播的那一部（畫面外預先載入的不算） */
    var best = shownPlaying(cur);
    if (!best) return;
    if (cur.isConnected && !shown) { try { cur.pause(); } catch (e) {} }
    if (cur.isConnected) { if (scr.style == null) cur.removeAttribute('style'); else cur.setAttribute('style', scr.style); cur.controls = scr.controls; }
    scr.v = best; scr.style = best.getAttribute('style'); scr.controls = best.controls;
    best.controls = false;
    FULL.forEach(function (p) { best.style.setProperty(p[0], p[1], 'important'); });
    ensureSound(best);
  }
  /* 確保影片有聲音（不調整音量）：
     1. 找網頁上標示「目前是靜音」的聲音按鈕（例如 IG 右上角的喇叭），找到就按它，讓網站自己把聲音打開
        —— 只按標示為「靜音中」的，標示為「關閉聲音」的一律不按，所以不會把聲音反而關掉
     2. 影片元素本身如果還是靜音，直接取消靜音 */
  var MUTED_RE = /(unmute|turn on (the )?(sound|audio)|play (with )?sound|sound (is )?(off|muted)|audio (is )?(muted|off)|video (is )?muted|is muted|取消靜音|開啟聲音|開啟音訊|打開聲音|開啟音效|音訊已關閉|音訊已靜音|聲音已關閉|已靜音|靜音中|已關閉聲音)/i;
  var UNMUTED_RE = /(audio is (playing|on)|sound (is )?on|turn off (the )?(sound|audio)|^mute( audio| sound| video)?$|關閉聲音|關閉音訊|^靜音$|音訊播放中|聲音已開啟)/i;
  function labelOf(el) {
    var t = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('data-tooltip-content') || '') + ' ' + (el.getAttribute('alt') || '');
    if (el.tagName && el.tagName.toLowerCase() === 'svg') { var ti = el.querySelector('title'); if (ti) t += ' ' + ti.textContent; }
    return t.trim();
  }
  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; }
  function soundBtn(v) {
    var docs = [document];
    [].slice.call(document.querySelectorAll('iframe')).forEach(function (f) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {} });
    var vr = (scr && scr.rect) || v.getBoundingClientRect(), cx = vr.left + vr.width / 2, cy = vr.top + vr.height / 2, best = null, bd = 1e9;
    docs.forEach(function (d) {
      [].slice.call(d.querySelectorAll('[aria-label], [title], svg, [data-tooltip-content]')).forEach(function (el) {
        if (el === v) return;
        var lab = labelOf(el);
        if (!lab || !MUTED_RE.test(lab) || UNMUTED_RE.test(lab)) return;
        var target = el.closest('button, [role=button], a') || el;
        if (target === v || !visible(target)) return;
        var r = target.getBoundingClientRect(), dd = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
        if (dd < bd) { bd = dd; best = target; }
      });
    });
    return best;
  }
  function press(el) {
    var r = el.getBoundingClientRect(), o = {bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0};
    try {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (t) { el.dispatchEvent(t.indexOf('pointer') === 0 ? new PointerEvent(t, Object.assign({pointerId: 1, isPrimary: true, pointerType: 'touch'}, o)) : new MouseEvent(t, o)); });
      el.dispatchEvent(new MouseEvent('click', o));
    } catch (e) { try { el.click(); } catch (x) {} }
  }
  var lastPress = 0;
  function ensureSound(v) {
    try {
      var b = soundBtn(v);
      if (b && Date.now() - lastPress > 1500) { lastPress = Date.now(); press(b); }
      setTimeout(function () { if (v.muted) v.muted = false; }, b ? 400 : 0);
    } catch (e) {}
  }
  function screenToggle() { if (!scr) return 'none'; var v = scr.v; if (v.paused) { ensureSound(v); var p = v.play(); if (p && p.catch) p.catch(function () {}); return 'play'; } v.pause(); return 'pause'; }
  function screenRewind() { if (!scr) return 'none'; try { scr.v.pause(); if (isFinite(scr.v.duration) && scr.v.duration > 0) scr.v.currentTime = 0; } catch (e) {} return 'ok'; }
  function screenPlay() {
    if (!scr) return 'none';
    scr.rec = true;
    var v = scr.v, maxT = 0, lastT = -1, stall = 0, t0 = Date.now(), done = false;
    delete v.__wsMutedByUs;
    quietHidden(v);
    clearInterval(scr.tm);
    try { v.loop = false; v.playbackRate = 1; } catch (e) {}
    ensureSound(v);
    /* 一定從頭開始：先跳到 0 秒再播放，1.5 秒後再檢查一次（有些網站的播放器會把位置改回去） */
    var toStart = function () { try { if (isFinite(v.duration) && v.duration > 0 && v.currentTime > 0.5) v.currentTime = 0; } catch (e) {} };
    toStart();
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    setTimeout(function () { if (v.currentTime > 4 && Date.now() - t0 < 3000) { toStart(); } ensureSound(v); }, 1500);
    function end() { if (done) return; done = true; clearInterval(scr && scr.tm); try { B.srecEnd(); } catch (e) {} }
    v.addEventListener('ended', end);
    scr.tm = setInterval(function () {
      if (window.__wsRecPaused) { stall = 0; return; }
      quietHidden(v);
      if (v.muted || soundBtn(v)) ensureSound(v);
      var d = isFinite(v.duration) ? v.duration : 0, t = v.currentTime || 0;
      if (Math.abs(t - lastT) < 0.05) stall++; else stall = 0;
      var looped = d > 0 && maxT >= d * 0.8 && t < maxT - 2;
      maxT = Math.max(maxT, t); lastT = t;
      var near = d > 0 && maxT >= d - 1.5;
      if (!near && v.paused && !v.ended) { var pp = v.play(); if (pp && pp.catch) pp.catch(function () {}); }
      if (v.ended || looped || (near && (stall >= 2 || v.paused)) || stall > 60 || (d > 0 && (Date.now() - t0) / 1000 > d * 1.6 + 40)) end();
    }, 1000);
    return 'ok';
  }
  window.__wsRec = {start: start, stop: stop, screen: screen, screenPlay: screenPlay, screenInfo: function () { if (!scr) return '{}'; follow(); var v = scr.v; return JSON.stringify({w: v.videoWidth || 0, h: v.videoHeight || 0}); }, screenToggle: screenToggle, screenRewind: screenRewind, can: function (src) {
    var v = pick(src);
    if (!v) return 'novideo';
    try { var s = (v.captureStream || v.mozCaptureStream).call(v); s.getTracks().forEach(function (t) { t.stop(); }); return 'ok'; } catch (e) { return 'nocap'; }
  }};
})();
