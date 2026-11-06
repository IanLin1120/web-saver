/* APK 瀏覽器頁面內的輔助程式（由 App 注入）：廣告元素隱藏、密碼偵測、擷取、媒體偵測、手動移除元素 */
(function () {
  'use strict';
  var cfg = window.__wsCfg || {};
  var B = window.WSPage;
  if (!B) return;

  function adCss() {
    if (!cfg.ads) { var o = document.getElementById('__ws_adcss'); if (o) o.remove(); return; }
    if (document.getElementById('__ws_adcss') || !document.documentElement) return;
    var st = document.createElement('style');
    st.id = '__ws_adcss';
    st.textContent = (cfg.css || '') + '{display:none!important;visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(st);
  }

  if (window.__wsPage) { window.__wsPage.refresh(); return; }

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
  async function autoScroll(token) {
    var se = document.scrollingElement || document.documentElement, start = se.scrollTop, h = 0, step = Math.max(400, innerHeight * 0.9);
    for (var y = 0, i = 0; i < 80; i++) {
      h = se.scrollHeight; y += step; se.scrollTop = y;
      try { B.progress(token, 1, '捲動載入圖片… ' + Math.min(99, Math.round(100 * y / h)) + '%'); } catch (e) {}
      await sleep(120);
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
  window.__wsPage = {refresh: refresh, capture: capture, media: media, fill: fill, zap: zap,
    reader: function (on) { return window.WSReader ? window.WSReader.toggleLive(on) : 'none'; }};
  refresh();
  try { mo.observe(document.documentElement, {childList: true, subtree: true}); setTimeout(function () { mo.disconnect(); }, 20000); } catch (e) {}
})();
