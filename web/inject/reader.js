/* 閱讀模式：抽出文章主體（輕量版 Readability），供「閱讀模式瀏覽」與「只擷取主要內容」使用 */
(function (G) {
  'use strict';
  if (G.WSReader) return;
  var NEG = /comment|meta|footer|footnote|foot|nav|menu|sidebar|side-bar|aside|related|recommend|share|social|sponsor|promo|advert|ad-|ads|banner|popup|modal|cookie|subscribe|newsletter|breadcrumb|pagination|tags|toolbar|login|signup|outbrain|taboola|widget|rank|hot-|hotnews|more-news|also-read|read-more|copyright/i;
  var POS = /article|body|content|entry|main|page|post|story|text|blog|news|detail|paragraph/i;
  var UNLIKELY = 'script,style,noscript,iframe,form,button,input,select,textarea,nav,aside,footer,header nav,[role="navigation"],[role="banner"] nav,[aria-hidden="true"],svg:not([width]),.share,.social,.comments,#comments,.related,.recommend,.advert,.ad,.ads,ins.adsbygoogle,[data-ws-rm]';

  function textLen(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim().length; }
  function linkDensity(el) {
    var t = textLen(el) || 1, l = 0;
    el.querySelectorAll('a').forEach(function (a) { l += textLen(a); });
    return l / t;
  }
  function classWeight(el) {
    var w = 0, s = (el.className && typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '');
    if (NEG.test(s)) w -= 25;
    if (POS.test(s)) w += 25;
    return w;
  }

  function extract(doc) {
    var body = doc.body; if (!body) return null;
    var base = doc.baseURI;
    /* 先試語意標籤 */
    var direct = null;
    var cands0 = doc.querySelectorAll('article,[itemprop="articleBody"],[role="main"] article,main article,.article-content,.article-body,.post-content,.entry-content,.story-body,#article-body,.article__body,.content-body');
    cands0.forEach(function (c) { var n = textLen(c); if (n > 400 && (!direct || n > textLen(direct) * 1.2)) direct = c; });

    var scores = new Map();
    function add(el, v) { if (!el || el === doc.documentElement) return; scores.set(el, (scores.get(el) || classWeight(el)) + v); }
    body.querySelectorAll('p,pre,td,blockquote,div > br,li').forEach(function (p) {
      if (p.tagName === 'BR') p = p.parentElement;
      var t = (p.textContent || '').trim(); if (t.length < 25) return;
      var v = 1 + (t.split(/[,，、。;；]/).length) + Math.min(Math.floor(t.length / 100), 3);
      add(p.parentElement, v);
      if (p.parentElement) add(p.parentElement.parentElement, v / 2);
    });
    var top = null, best = -1e9;
    scores.forEach(function (s, el) { var adj = s * (1 - linkDensity(el)); if (adj > best) { best = adj; top = el; } });
    var pick = direct || top;
    if (!pick) return null;
    if (direct && top && direct.contains(top) === false && top.contains(direct) === false && textLen(top) > textLen(direct) * 2) pick = top;

    var clone = pick.cloneNode(true);
    clone.querySelectorAll(UNLIKELY).forEach(function (e) { e.remove(); });
    /* 移除連結密度太高或負面 class 的區塊 */
    clone.querySelectorAll('div,section,ul,ol,table,figure').forEach(function (e) {
      if (!e.isConnected) return;
      var n = textLen(e), imgs = e.querySelectorAll('img,video,picture').length;
      var cls = (typeof e.className === 'string' ? e.className : '') + ' ' + (e.id || '');
      if (NEG.test(cls) && !POS.test(cls) && n < 600) { e.remove(); return; }
      if (n < 120 && imgs === 0 && e.tagName !== 'TABLE') { if (linkDensity(e) > 0.5 || n === 0) e.remove(); return; }
      if (linkDensity(e) > 0.6 && n < 1500) e.remove();
    });
    /* 去掉 class／style，讓閱讀版面統一 */
    clone.querySelectorAll('*').forEach(function (e) {
      ['class', 'style', 'id', 'width', 'height', 'align', 'bgcolor', 'color', 'face', 'size'].forEach(function (k) { if (k === 'width' || k === 'height') { if (e.tagName !== 'IMG' && e.tagName !== 'VIDEO') e.removeAttribute(k); } else e.removeAttribute(k); });
      if (e.tagName === 'IMG') {
        var src = e.getAttribute('data-ws-src') || (G.WSCapture ? (G.WSCapture.lazySrc(e, base) && G.WSCapture.isPlaceholder(e.getAttribute('src')) ? G.WSCapture.lazySrc(e, base) : '') : '') || e.currentSrc || e.getAttribute('src');
        if (src) e.setAttribute('src', new URL(src, base).href);
        e.removeAttribute('srcset'); e.removeAttribute('loading');
      }
      if (e.tagName === 'A' && e.getAttribute('href')) { try { e.setAttribute('href', new URL(e.getAttribute('href'), base).href); } catch (x) {} }
    });

    var title = '';
    var og = doc.querySelector('meta[property="og:title"]');
    var h1 = doc.querySelector('h1');
    var inH1 = pick.querySelector('h1');
    title = (inH1 && textLen(inH1) > 4 ? inH1.textContent : (og && og.content) || doc.title || (h1 ? h1.textContent : '')).replace(/\s+/g, ' ').trim();
    var site = (doc.querySelector('meta[property="og:site_name"]') || {}).content || location.hostname || '';
    var by = (doc.querySelector('meta[name="author"]') || {}).content || '';
    var time = (doc.querySelector('time[datetime]') || {}).textContent || (doc.querySelector('meta[property="article:published_time"]') || {}).content || '';
    var lead = '';
    var ogImg = (doc.querySelector('meta[property="og:image"]') || {}).content;
    if (ogImg && !clone.querySelector('img')) lead = '<figure><img src="' + new URL(ogImg, base).href + '" alt=""></figure>';
    var firstH1 = clone.querySelector('h1'); if (firstH1 && firstH1.textContent.trim() === title) firstH1.remove();
    function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
    var meta = [site, by, time.trim().slice(0, 30)].filter(Boolean).map(esc).join(' · ');
    var html = '<article class="ws-reader"><header><div class="ws-site">' + meta + '</div><h1>' + esc(title) + '</h1></header>' + lead + clone.innerHTML + '</article>';
    return {title: title, html: html, length: textLen(clone)};
  }

  var css = [
    ':root{color-scheme:light dark;--fg:#2f261c;--bg:#f7f1e6;--mut:#7d6c57;--ac:#a2613a;--line:#e3d6bf}',
    '@media (prefers-color-scheme:dark){:root{--fg:#eadcc4;--bg:#1d1812;--mut:#a8977e;--ac:#e0a066;--line:#3b2f21}}',
    'html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.85 -apple-system,"PingFang TC","Noto Serif TC","Noto Sans TC",Georgia,serif;-webkit-text-size-adjust:100%}',
    '.ws-reader{max-width:720px;margin:0 auto;padding:22px 20px 80px;word-wrap:break-word}',
    '.ws-reader header{border-bottom:1px solid var(--line);margin-bottom:22px;padding-bottom:14px}',
    '.ws-site{font:13px/1.5 -apple-system,"Noto Sans TC",sans-serif;color:var(--mut);letter-spacing:.3px}',
    '.ws-reader h1{font-size:1.55em;line-height:1.35;margin:.3em 0 0}',
    '.ws-reader h2{font-size:1.25em;margin:1.6em 0 .6em}.ws-reader h3{font-size:1.1em;margin:1.4em 0 .5em}',
    '.ws-reader p{margin:0 0 1.1em}.ws-reader a{color:var(--ac)}',
    '.ws-reader img,.ws-reader video{max-width:100%;height:auto;border-radius:10px;display:block;margin:1em auto}',
    '.ws-reader figure{margin:1.2em 0}.ws-reader figcaption{font-size:.8em;color:var(--mut);text-align:center}',
    '.ws-reader blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid var(--ac);color:var(--mut)}',
    '.ws-reader pre{overflow:auto;background:rgba(127,127,127,.12);padding:12px;border-radius:10px;font-size:.8em}',
    '.ws-reader table{border-collapse:collapse;max-width:100%;display:block;overflow:auto;font-size:.85em}.ws-reader td,.ws-reader th{border:1px solid var(--line);padding:6px 8px}',
    '.ws-reader ul,.ws-reader ol{padding-left:1.4em}'
  ].join('\n');

  /* 在瀏覽器裡切換閱讀模式（APK 用） */
  function toggleLive(on) {
    var id = '__ws_reader_view';
    var ex = document.getElementById(id);
    if (!on) { if (ex) { ex.remove(); document.documentElement.style.overflow = ''; } return 'off'; }
    if (ex) return 'on';
    var art = extract(document);
    if (!art || art.length < 200) return 'none';
    var host = document.createElement('div');
    host.id = id;
    host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483646;overflow:auto;-webkit-overflow-scrolling:touch');
    var sh = host.attachShadow ? host.attachShadow({mode: 'open'}) : host;
    sh.innerHTML = '<style>' + css.replace(/:root/g, ':host').replace(/html\{[^}]*\}body\{/, '.wrap{') + ':host{display:block;background:var(--bg)}</style><div class="wrap">' + art.html + '</div>';
    document.documentElement.appendChild(host);
    document.documentElement.style.overflow = 'hidden';
    return 'on';
  }

  G.WSReader = {extract: extract, css: css, toggleLive: toggleLive};
})(typeof window !== 'undefined' ? window : this);
