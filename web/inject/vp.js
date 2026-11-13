/* 網頁影片改用 App 內建播放器（跟檔案庫的離線播放器一樣，會依直式／橫式自動轉向）。
   App 會注入到網頁的每一個框架（包含嵌在網頁裡的別的網站播放器），所以嵌入式影片也能接手。
   什麼時候接手：
   1. 你點了播放、或點了正在播的影片（例如 IG）→ 先停住網頁裡的影片，改用內建播放器
   2. 網頁裡的影片有聲音地開始播、而且是正片（不是廣告）→ 自動從頭用內建播放器播
   廣告（短片＋有「跳過」按鈕、或廣告網站的框架）不接手，等正片開始才接手。 */
(function () {
  'use strict';
  if (window.__wsVpHook) return;
  var B = window.WSPage;
  if (!B || !B.webVideo) return;
  var host = location.hostname || '';
  if (/(^|\.)(youtube(-nocookie)?\.com|youtu\.be)$/.test(host)) return;
  /* 廣告網站的框架完全不管 */
  if (/(doubleclick|googlesyndication|googleads|imasdk\.googleapis|adservice|adnxs|springserve|spotx|teads|innovid|serving-sys|moatads|ads\.|adsystem)/i.test(host)) return;
  window.__wsVpHook = 1;

  var vpOn = function () { try { return B.vpOn ? !!B.vpOn() : !!(window.__wsCfg || {}).vp; } catch (x) { return false; } };
  var held = function () { try { return B.vpHeld ? !!B.vpHeld() : !!window.__wsVpHold; } catch (x) { return false; } };
  var ref = function () { return location.href; };

  /* 交給內建播放器後，網頁裡的影片先停住（避免兩邊同時有聲音），關掉內建播放器才放開 */
  document.addEventListener('play', function (e) {
    var v = e.target;
    if (v && (v.tagName === 'VIDEO' || v.tagName === 'AUDIO') && held()) { try { v.pause(); } catch (x) {} }
  }, true);

  var big = function (v) { var r = v.getBoundingClientRect(); return r.width >= 140 && r.height >= 80; };
  var durOf = function (v) { return isFinite(v.duration) ? v.duration : 0; };
  var vis = function (el) { if (!el || !el.getBoundingClientRect) return false; var r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; var cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
  /* 看起來是廣告：短片，而且畫面上有「跳過／略過／Skip」或廣告標示 */
  var adLike = function (v) {
    var d = durOf(v);
    if (d && d > 75) return false;
    var els = document.querySelectorAll('button,a,div,span');
    for (var i = 0, n = 0; i < els.length && n < 4000; i++, n++) {
      var el = els[i];
      if (el.children.length > 3) continue;
      var t = (el.textContent || '').trim();
      if (t.length > 24 || !t) { var c = (el.className && el.className.baseVal == null ? String(el.className) : '') + ' ' + (el.id || ''); if (!/(^|[\s_-])(skip|ad-?skip|ad-?countdown|ad-?label|ad-?badge|ima-ad)/i.test(c)) continue; if (vis(el)) return true; continue; }
      if (/^(跳過|略過|跳过|スキップ|건너뛰기)|skip\s*(ad|ads|this)?\b|廣告|广告|^ad\s*[\d:·•]|^sponsored|贊助|広告|광고/i.test(t) && vis(el)) return true;
    }
    return false;
  };

  var handTo = function (v, src, kind, t0) {
    try { B.vpHold && B.vpHold(true); } catch (x) {}
    window.__wsVpHold = 1;
    try { v.pause(); } catch (x) {}
    B.webVideo(JSON.stringify({src: src, kind: kind || '', t: t0, title: (document.title || (window.top !== window ? '' : '')).slice(0, 120), poster: v.poster || '',
      w: v.videoWidth || 0, h: v.videoHeight || 0, dur: durOf(v), ref: ref()}));
  };
  /* 串流（blob:）：App 在背景比對影片長度找出這一部的來源；找不到就讓網頁繼續播 */
  var handBlob = function (v, t0) {
    if (!B.webVideoBlob) return false;
    try { B.vpHold && B.vpHold(true); } catch (x) {}
    window.__wsVpHold = 1;
    try { v.pause(); } catch (x) {}
    var tok = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
    B.webVideoBlob(JSON.stringify({tok: tok, t: t0, title: (document.title || '').slice(0, 120), poster: v.poster || '',
      w: v.videoWidth || 0, h: v.videoHeight || 0, dur: durOf(v), ref: ref()}));
    var n = 0;
    var poll = setInterval(function () {
      var r = '';
      try { r = B.vpResult ? B.vpResult(tok) : ''; } catch (x) {}
      if (r === 'ok') { clearInterval(poll); return; }
      if (r === 'fail' || ++n > 60) {
        clearInterval(poll);
        try { B.vpHold && B.vpHold(false); } catch (x) {}
        window.__wsVpHold = 0;
        v.__wsVpOff = 1;
        try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (x) {}
      }
    }, 300);
    return true;
  };
  var takeOver = function (v, fromStart) {
    if (!vpOn() || v.__wsVpOff) return false;
    v.__wsTook = v.currentSrc || v.src || '1';
    var t0 = fromStart ? 0 : (v.currentTime || 0);
    var src = v.currentSrc || v.src || '';
    if (/^https?:/i.test(src)) { handTo(v, src, /\.m3u8(\?|#|$)/i.test(src) ? 'hls' : 'video', t0); return true; }
    return handBlob(v, t0);
  };
  window.__wsVpBack = function (t) {
    window.__wsVpOff = 1; window.__wsVpHold = 0;
    var vs = document.querySelectorAll('video'), v = null;
    for (var i = 0; i < vs.length; i++) if (vs[i].__wsTook) v = vs[i];
    if (!v) return;
    v.__wsVpOff = 1;
    try { if (t > 1) v.currentTime = t; var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (x) {}
  };

  /* 1. 你按了播放：接手（廣告不接手） */
  var lastTap = 0, lastClick = 0;
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (t) { document.addEventListener(t, function () { lastTap = Date.now(); if (t === 'click') lastClick = lastTap; }, true); });
  document.addEventListener('play', function (e) {
    var v = e.target;
    if (!v || v.tagName !== 'VIDEO' || held() || !vpOn() || v.__wsVpOff) return;
    if (Date.now() - lastTap > 4000 || (v.muted && Date.now() - lastClick > 1500)) return;
    if (!big(v)) return;
    setTimeout(function () { if (!v.paused && !adLike(v)) takeOver(v, false); }, 250);
  }, true);

  /* 2. 有聲音的正片開始播（例如廣告結束後）：自動從頭用內建播放器播 */
  document.addEventListener('playing', function (e) {
    var v = e.target;
    if (!v || v.tagName !== 'VIDEO' || held() || !vpOn() || v.__wsVpOff) return;
    var src = v.currentSrc || v.src || '';
    if (v.muted || !big(v) || v.__wsAuto === src) return;
    setTimeout(function () {
      if (v.paused || v.muted || held() || v.__wsAuto === src) return;
      var d = durOf(v);
      /* 太短的多半是廣告或預覽；長度還不知道的等一下再看 */
      if (d && d < 40) return;
      if (adLike(v)) return;
      v.__wsAuto = src;
      takeOver(v, true);
    }, 600);
  }, true);

  /* 3. 點了正在播的影片（IG 這種點了只是開關聲音的）：接手 */
  var down = null;
  document.addEventListener('pointerdown', function (e) { down = {x: e.clientX, y: e.clientY, t: Date.now()}; }, true);
  document.addEventListener('pointerup', function (e) {
    var d0 = down; down = null;
    if (!d0 || Date.now() - d0.t > 600 || Math.abs(e.clientX - d0.x) > 12 || Math.abs(e.clientY - d0.y) > 12) return;
    if (pill && pill.contains(e.target)) return;
    if (!vpOn() || held()) return;
    var vs = document.querySelectorAll('video');
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v.paused || v.__wsVpOff || !big(v)) continue;
      var r = v.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        if (adLike(v)) return;
        /* 先讓網頁處理這次點擊（例如 IG 取消靜音），再接手 */
        setTimeout(function () { if (!held()) takeOver(v, false); }, 120);
        return;
      }
    }
  }, true);

  /* 角落的「內建播放器」按鈕：正在播的影片都可以一鍵改用內建播放器 */
  var pill = null, pillV = null, pillT = 0;
  var pillHide = function () { if (pill) pill.style.display = 'none'; pillV = null; };
  var pillPlace = function () {
    if (!pill || !pillV) return;
    var r = pillV.getBoundingClientRect();
    if (!pillV.isConnected || pillV.paused || held() || r.width < 140 || r.height < 100 || r.bottom < 40 || r.top > innerHeight - 40 || Date.now() - pillT > 5000) { pillHide(); return; }
    pill.style.display = 'flex';
    pill.style.left = Math.max(6, Math.min(innerWidth - pill.offsetWidth - 6, r.right - pill.offsetWidth - 8)) + 'px';
    pill.style.top = Math.max(6, Math.min(innerHeight - 40, r.top + 8)) + 'px';
  };
  var pillShow = function (v) {
    if (!vpOn() || v.__wsVpOff || !document.documentElement) return;
    if (!pill) {
      pill = document.createElement('div');
      pill.setAttribute('style', 'position:fixed;z-index:2147483647;display:none;align-items:center;gap:5px;padding:6px 11px 6px 9px;border-radius:16px;' +
        'background:rgba(36,29,23,.78);color:#fff;font:600 12.5px/1.2 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);pointer-events:auto;');
      pill.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>內建播放器';
      var go = function (e) { e.preventDefault(); e.stopPropagation(); var v2 = pillV; pillHide(); if (v2) takeOver(v2, false); };
      pill.addEventListener('click', go, true);
      pill.addEventListener('touchend', go, true);
      document.documentElement.appendChild(pill);
      setInterval(pillPlace, 300);
    }
    pillV = v; pillT = Date.now(); pillPlace();
  };
  document.addEventListener('playing', function (e) {
    var v = e.target;
    if (v && v.tagName === 'VIDEO' && big(v)) setTimeout(function () { if (!held()) pillShow(v); }, 700);
  }, true);
})();
