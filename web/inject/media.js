/* 偵測頁面上可下載的圖片／影片／音訊 */
(function (G) {
  'use strict';
  if (G.WSMedia) return;
  var IMG_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|jfif)(\?|#|$)/i;
  var VID_EXT = /\.(mp4|m4v|webm|mov|mkv|ogv|3gp|flv|ts)(\?|#|$)/i;
  var AUD_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(\?|#|$)/i;
  var HLS_EXT = /\.m3u8(\?|#|$)/i, DASH_EXT = /\.mpd(\?|#|$)/i;

  function abs(u, base) { try { return new URL(u, base).href; } catch (e) { return ''; } }
  function kindOf(u, hint) {
    if (HLS_EXT.test(u)) return 'hls';
    if (DASH_EXT.test(u)) return 'dash';
    if (VID_EXT.test(u)) return 'video';
    if (AUD_EXT.test(u)) return 'audio';
    if (IMG_EXT.test(u)) return 'image';
    return hint || '';
  }
  function nameOf(u) {
    try { var p = new URL(u).pathname.split('/').filter(Boolean).pop() || ''; return decodeURIComponent(p).slice(0, 80); } catch (e) { return ''; }
  }

  function scan(doc, opts) {
    opts = opts || {};
    var minPx = opts.minPx == null ? 80 : +opts.minPx;
    var base = doc.baseURI, out = [], seen = {};
    var bestSS = G.WSbestFromSrcset || function (s) { return (s || '').split(',').pop().trim().split(/\s+/)[0]; };
    var lazy = G.WSCapture ? G.WSCapture.lazySrc : function () { return ''; };
    var ph = G.WSCapture ? G.WSCapture.isPlaceholder : function () { return false; };
    /* 廣告區塊裡的圖片不列出 */
    var adEls = [];
    if (G.WS_AD && G.WS_AD.css && opts.skipAds !== false) {
      G.WS_AD.css.split(',').forEach(function (sel) { try { doc.querySelectorAll(sel).forEach(function (e) { adEls.push(e); }); } catch (e) {} });
    }
    function inAd(el) { for (var i = 0; i < adEls.length; i++) if (adEls[i].contains(el)) return true; return false; }
    function adHost(u) { return G.WSCapture && G.WS_AD && G.WSCapture.isAdHost((function () { try { return new URL(u).hostname; } catch (e) { return ''; } })()); }
    function push(o) {
      if (o.el && inAd(o.el)) return;
      delete o.el;
      if (adHost(o.url)) return;
      if (!o.url || /^(javascript|about):/i.test(o.url)) return;
      if (/^data:/.test(o.url) && o.url.length < 3000) return;
      var key = o.url.replace(/#.*$/, '');
      if (seen[key]) { var x = seen[key]; if (!x.w && o.w) { x.w = o.w; x.h = o.h; } if (!x.alt && o.alt) x.alt = o.alt; return; }
      o.name = o.name || nameOf(o.url);
      seen[key] = o; out.push(o);
    }
    doc.querySelectorAll('img').forEach(function (img) {
      var w = img.naturalWidth || +img.getAttribute('width') || 0, h = img.naturalHeight || +img.getAttribute('height') || 0;
      var cands = [];
      var ss = img.getAttribute('srcset') || img.getAttribute('data-srcset');
      if (ss) cands.push(bestSS(ss, base));
      var lz = lazy(img, base); if (lz) cands.push(lz);
      if (img.currentSrc && !ph(img.currentSrc)) cands.push(img.currentSrc);
      var s = img.getAttribute('src'); if (s && !ph(s)) cands.push(abs(s, base));
      /* 包在 <a> 裡、指向原圖的大圖連結 */
      var a = img.closest('a[href]'); if (a && IMG_EXT.test(a.getAttribute('href'))) cands.unshift(abs(a.getAttribute('href'), base));
      var u = cands.filter(Boolean)[0];
      if (!u) return;
      if (w && h && w < minPx && h < minPx && !ss) return;
      push({url: u, kind: 'image', w: w, h: h, alt: (img.alt || img.title || '').trim().slice(0, 100), el: img});
    });
    doc.querySelectorAll('picture source[srcset]').forEach(function (s) { var u = bestSS(s.getAttribute('srcset'), base); if (u) push({url: u, kind: 'image'}); });
    doc.querySelectorAll('video').forEach(function (v) {
      var srcs = [];
      if (v.currentSrc) srcs.push(v.currentSrc);
      if (v.getAttribute('src')) srcs.push(abs(v.getAttribute('src'), base));
      v.querySelectorAll('source[src]').forEach(function (s) { srcs.push(abs(s.getAttribute('src'), base)); });
      var poster = v.getAttribute('poster') ? abs(v.getAttribute('poster'), base) : '';
      var any = false;
      srcs.forEach(function (u) {
        if (/^blob:/.test(u)) { push({url: u, kind: 'stream', w: v.videoWidth, h: v.videoHeight, poster: poster, note: '串流影片（MSE），請看下方偵測到的 m3u8／mp4'}); any = true; return; }
        push({url: u, kind: kindOf(u, 'video'), w: v.videoWidth || 0, h: v.videoHeight || 0, poster: poster, dur: isFinite(v.duration) ? Math.round(v.duration) : 0}); any = true;
      });
      if (poster) push({url: poster, kind: 'image', alt: '影片封面'});
    });
    doc.querySelectorAll('audio').forEach(function (a) {
      var u = a.currentSrc || (a.getAttribute('src') ? abs(a.getAttribute('src'), base) : '');
      if (u) push({url: u, kind: kindOf(u, 'audio'), dur: isFinite(a.duration) ? Math.round(a.duration) : 0});
      a.querySelectorAll('source[src]').forEach(function (s) { push({url: abs(s.getAttribute('src'), base), kind: 'audio'}); });
    });
    [['meta[property="og:image"],meta[property="og:image:url"],meta[name="twitter:image"],link[rel="image_src"]', 'image'],
     ['meta[property="og:video"],meta[property="og:video:url"],meta[property="og:video:secure_url"]', 'video'],
     ['meta[property="og:audio"]', 'audio']].forEach(function (p) {
      doc.querySelectorAll(p[0]).forEach(function (m) { var u = m.getAttribute('content') || m.getAttribute('href'); if (u) push({url: abs(u, base), kind: kindOf(abs(u, base), p[1]), alt: 'og'}); });
    });
    doc.querySelectorAll('a[href]').forEach(function (a) {
      var u = abs(a.getAttribute('href'), base), k = kindOf(u, '');
      if (k) push({url: u, kind: k, alt: (a.textContent || '').trim().slice(0, 60)});
    });
    /* CSS 背景圖（只看夠大的元素） */
    if (opts.live !== false && doc.body && G.getComputedStyle) {
      var els = doc.body.getElementsByTagName('*'), n = 0;
      for (var i = 0; i < els.length && n < 6000; i++, n++) {
        var el = els[i]; var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (!r || r.width < minPx * 1.5 || r.height < minPx) continue;
        var bg = G.getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none') continue;
        var m, re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
        while ((m = re.exec(bg))) { var u2 = abs(m[1], base); if (!/^data:/.test(u2) || u2.length > 3000) push({url: u2, kind: 'image', w: Math.round(r.width), h: Math.round(r.height), alt: '背景圖'}); }
      }
    }
    /* 腳本或 JSON 裡出現的 m3u8／mp4 網址（很多播放器把來源寫在設定物件裡） */
    var txt = '';
    doc.querySelectorAll('script:not([src])').forEach(function (s) { if (txt.length < 2e6) txt += s.textContent + '\n'; });
    var mm, urlRe = /https?:\\?\/\\?\/[^"'\s<>()]+?\.(?:m3u8|mp4|webm|mp3|m4a)(?:\?[^"'\s<>()]*)?/gi;
    while ((mm = urlRe.exec(txt))) { var uu = mm[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&'); push({url: uu, kind: kindOf(uu, 'video'), alt: '頁面設定'}); }
    return out;
  }

  G.WSMedia = {scan: scan, kindOf: kindOf, nameOf: nameOf};
})(typeof window !== 'undefined' ? window : this);
