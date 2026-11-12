/* Terra 瀏覽器核心（類似 SingleFile）：把目前頁面（或解析好的文件）連同樣式、圖片、字型打包成單一 HTML 檔。
   用法：WSCapture.run(doc, opts, io) → Promise<{html, title, url, stats}>
   io.fetch(url, kind) → Promise<{mime, b64}|{mime, text}|null>   kind: 'css' | 'img' | 'font' | 'bin'
   io.progress(pct, msg)
   APK：注入到瀏覽器頁面裡執行（live = true，可讀到真實版面）；網頁版：對解析好的文件執行（live = false）。 */
(function (G) {
  'use strict';
  if (G.WSCapture && G.WSCapture.v >= 3) return;

  var AD_HOSTS = (G.WS_AD && G.WS_AD.hosts) || [];
  var AD_CSS = (G.WS_AD && G.WS_AD.css) || '';

  function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }
  function isAdHost(h, extra) {
    if (!h) return false;
    var L = extra ? AD_HOSTS.concat(extra) : AD_HOSTS;
    for (var i = 0; i < L.length; i++) { var d = L[i]; if (h === d || h.slice(-d.length - 1) === '.' + d) return true; }
    return false;
  }
  function abs(u, base) {
    if (!u) return u;
    u = String(u).trim();
    if (/^(data:|blob:|javascript:|mailto:|tel:|#|about:)/i.test(u)) return u;
    try { return new URL(u, base).href; } catch (e) { return u; }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* srcset：挑最大的候選 */
  function bestFromSrcset(ss, base) {
    if (!ss) return '';
    var best = '', bw = -1;
    ss.split(/,(?=\s*[^\s,]+(?:\s+[\d.]+[wx])?\s*(?:,|$))/).forEach(function (part) {
      var m = part.trim().split(/\s+/); if (!m[0]) return;
      var d = m[1] || '1x', w = parseFloat(d) * (/x$/.test(d) ? 1000 : 1);
      if (w > bw) { bw = w; best = m[0]; }
    });
    return best ? abs(best, base) : '';
  }
  G.WSbestFromSrcset = bestFromSrcset;

  /* 懶載入圖片：常見的 data-* 屬性 */
  var LAZY = ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-url', 'data-hi-res-src', 'data-full-src', 'data-actualsrc', 'data-echo', 'data-img', 'data-image', 'lazy-src', 'data-srcset', 'data-lazy-srcset'];
  function lazySrc(img, base) {
    for (var i = 0; i < LAZY.length; i++) {
      var v = img.getAttribute(LAZY[i]);
      if (v && !/^data:image\/(gif|svg)/.test(v)) return /srcset/.test(LAZY[i]) ? bestFromSrcset(v, base) : abs(v, base);
    }
    return '';
  }
  function isPlaceholder(src) { return !src || /^data:image\/(gif|svg\+xml|png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB)/i.test(src) || /(blank|spacer|placeholder|transparent|pixel|loading)\.(gif|png|svg)/i.test(src); }

  /* ---------- 平行下載佇列 ---------- */
  function Pool(io, onTick) {
    var cache = new Map(), active = 0, q = [], done = 0, total = 0;
    function pump() {
      while (active < 6 && q.length) {
        var job = q.shift(); active++;
        (function (job) {
          Promise.resolve().then(function () { return io.fetch(job.url, job.kind); }).then(function (r) { job.res(r); }, function () { job.res(null); })
            .then(function () { active--; done++; onTick && onTick(done, total); pump(); });
        })(job);
      }
    }
    return {
      get: function (url, kind) {
        var key = kind + '|' + url;
        if (cache.has(key)) return cache.get(key);
        total++;
        var p = new Promise(function (res) { q.push({url: url, kind: kind, res: res}); pump(); });
        cache.set(key, p); return p;
      },
      stats: function () { return {done: done, total: total}; }
    };
  }

  function dataUrl(r) {
    if (!r) return null;
    if (r.b64 != null) return 'data:' + (r.mime || 'application/octet-stream') + ';base64,' + r.b64;
    if (r.text != null) return 'data:' + (r.mime || 'text/plain') + ';charset=utf-8,' + encodeURIComponent(r.text);
    return null;
  }
  function textOf(r) {
    if (!r) return null;
    if (r.text != null) return r.text;
    if (r.b64 != null) { try { var bin = atob(r.b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new TextDecoder('utf-8').decode(u8); } catch (e) { return null; } }
    return null;
  }

  /* 圖片壓縮（只處理點陣圖；GIF／SVG 保留原樣） */
  function shrinkImage(du, opts) {
    var maxPx = +opts.imgMaxPx || 0, q = opts.imgQuality || 0.85;
    if (!maxPx || !du || !/^data:image\/(jpeg|jpg|png|webp|bmp|avif)/i.test(du)) return Promise.resolve(du);
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, maxPx / Math.max(w, h));
        if (s >= 1 && du.length < 400000) { res(du); return; }
        try {
          var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
          var x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
          var png = /^data:image\/png/i.test(du);
          var out = c.toDataURL(png && s >= 1 ? 'image/png' : (png ? 'image/webp' : 'image/jpeg'), q);
          res(out.length < du.length ? out : du);
        } catch (e) { res(du); }
      };
      im.onerror = function () { res(du); };
      im.src = du;
    });
  }

  /* ---------- CSS 處理 ---------- */
  var URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  var IMPORT_RE = /@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?\s*([^;]*);/gi;

  async function expandImports(css, base, pool, depth) {
    if (depth > 4) return css;
    var parts = [], last = 0, m;
    IMPORT_RE.lastIndex = 0;
    var jobs = [];
    while ((m = IMPORT_RE.exec(css))) jobs.push({start: m.index, end: m.index + m[0].length, url: abs(m[2], base), media: (m[3] || '').trim()});
    if (!jobs.length) return css;
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i]; parts.push(css.slice(last, j.start)); last = j.end;
      var r = await pool.get(j.url, 'css'), t = textOf(r);
      if (t == null) continue;
      t = await expandImports(rebase(t, j.url), j.url, pool, depth + 1);
      parts.push(j.media && j.media !== 'all' ? '@media ' + j.media + '{' + t + '}' : t);
    }
    parts.push(css.slice(last));
    return parts.join('\n');
  }
  function rebase(css, base) {
    return css.replace(URL_RE, function (all, qq, u) {
      if (/^(data:|#|about:|blob:)/i.test(u)) return all;
      return 'url("' + abs(u, base).replace(/"/g, '%22') + '")';
    });
  }

  /* 移除沒用到的樣式規則（大幅減少檔案大小） */
  function pruneCss(css, doc, opts) {
    if (!opts.pruneCss || !(G.CSSStyleSheet && CSSStyleSheet.prototype.replaceSync)) return css;
    var sheet;
    try { sheet = new CSSStyleSheet(); sheet.replaceSync(css.replace(/@import[^;]+;/g, '')); } catch (e) { return css; }
    var usedFonts = {}, out = [];
    var memo = {};
    function used(sel) {
      var s = sel.replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, function (m) { return /^:(not|is|where|has)\(/.test(m) ? m : ''; }).trim();
      if (!s || /^[>+~,\s]*$/.test(s)) return true;
      if (s in memo) return memo[s];
      var r; try { r = !!doc.querySelector(s); } catch (e) { r = true; }
      memo[s] = r; return r;
    }
    function walk(rules) {
      var buf = [];
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.type === 1) {
          var sels = r.selectorText.split(/,(?![^(]*\))/), keep = sels.filter(used);
          if (!keep.length) continue;
          var ff = r.style && r.style.getPropertyValue('font-family');
          if (ff) ff.split(',').forEach(function (f) { usedFonts[f.trim().replace(/^['"]|['"]$/g, '').toLowerCase()] = 1; });
          if (r.style && r.style.getPropertyValue('font')) usedFonts.__any = 1;
          buf.push(keep.length === sels.length ? r.cssText : keep.join(',') + r.cssText.slice(r.cssText.indexOf('{')));
        } else if (r.type === 4 || r.type === 12 || (r.cssRules && /^@(media|supports|layer|container)/.test(r.cssText))) {
          var inner = walk(r.cssRules);
          if (inner.length) buf.push(r.cssText.slice(0, r.cssText.indexOf('{') + 1) + inner.join('\n') + '}');
        } else buf.push({fontRule: r.type === 5, text: r.cssText, rule: r});
      }
      return buf;
    }
    var all = walk(sheet.cssRules);
    all.forEach(function (x) {
      if (typeof x === 'string') { out.push(x); return; }
      if (x.fontRule) {
        var fam = (x.rule.style.getPropertyValue('font-family') || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
        if (usedFonts.__any || usedFonts[fam] || !fam) out.push(x.text);
      } else out.push(x.text);
    });
    return out.join('\n');
  }

  async function inlineCssUrls(css, pool, opts) {
    var urls = {}, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(css))) { var u = m[2]; if (/^https?:/i.test(u)) urls[u] = 1; }
    var keys = Object.keys(urls), map = {};
    await Promise.all(keys.map(async function (u) {
      var isFont = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(u);
      if (isFont && !opts.embedFonts) return;
      if (!isFont && !opts.embedImages) return;
      var r = await pool.get(u, isFont ? 'font' : 'img'), du = dataUrl(r);
      if (du && !isFont) du = await shrinkImage(du, opts);
      if (du) map[u] = du;
    }));
    return css.replace(URL_RE, function (all, qq, u) { return map[u] ? 'url("' + map[u] + '")' : all; });
  }

  /* ---------- 標記要移除的元素（在原始頁面上，用 computed style 判斷） ---------- */
  function markRemovals(doc, opts, live) {
    var marks = [];
    function mark(el, why) { if (el && el.setAttribute && !el.hasAttribute('data-ws-rm')) { el.setAttribute('data-ws-rm', why); marks.push(el); } }
    if (opts.removeAds) {
      var sel = AD_CSS + (opts.extraCss ? ',' + opts.extraCss : '');
      sel.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s) {
        try { doc.querySelectorAll(s).forEach(function (el) { if (el !== doc.body && el !== doc.documentElement) mark(el, 'ad'); }); } catch (e) {}
      });
      doc.querySelectorAll('iframe[src],img[src],a[href] > img').forEach(function (el) {
        var u = el.getAttribute('src'); if (u && isAdHost(hostOf(abs(u, doc.baseURI)), opts.extraHosts)) mark(el.tagName === 'IMG' && el.parentElement && el.parentElement.tagName === 'A' ? el.parentElement : el, 'ad');
      });
    }
    doc.querySelectorAll('[data-ws-zap]').forEach(function (el) { mark(el, 'zap'); });
    if (live && opts.removeHidden) {
      var all = doc.body ? doc.body.getElementsByTagName('*') : [];
      for (var i = 0; i < all.length && i < 40000; i++) {
        var el = all[i];
        if (/^(SCRIPT|STYLE|LINK|META|TEMPLATE|SOURCE|TRACK|BR|WBR|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
        if (el.closest && el.closest('svg') && el.tagName !== 'svg' && el.tagName !== 'SVG') continue;
        var cs = G.getComputedStyle(el);
        if (cs.display === 'none') mark(el, 'hidden');
      }
    }
    return marks;
  }

  /* 把頁面目前的狀態寫回屬性（表單值、目前顯示的圖片、canvas） */
  function freezeState(doc, live) {
    var undo = [];
    function setA(el, k, v) { undo.push([el, k, el.getAttribute(k)]); el.setAttribute(k, v); }
    var base = doc.baseURI;
    doc.querySelectorAll('img').forEach(function (img) {
      var cur = live ? img.currentSrc : '';
      var src = img.getAttribute('src');
      var lz = lazySrc(img, base);
      var pick = (cur && !isPlaceholder(cur)) ? cur : (lz && (isPlaceholder(src) || !src)) ? lz : (src ? abs(src, base) : (bestFromSrcset(img.getAttribute('srcset'), base) || lz));
      if (pick) setA(img, 'data-ws-src', pick);
    });
    if (live) {
      doc.querySelectorAll('input,textarea,select').forEach(function (el) {
        if (el.tagName === 'TEXTAREA') { setA(el, 'data-ws-val', el.value); return; }
        if (el.tagName === 'SELECT') { Array.prototype.forEach.call(el.options, function (o) { if (o.selected) setA(o, 'selected', ''); }); return; }
        var t = (el.type || '').toLowerCase();
        if (t === 'password') return;
        if (t === 'checkbox' || t === 'radio') { if (el.checked) setA(el, 'checked', ''); }
        else if (t !== 'file') setA(el, 'value', el.value);
      });
      doc.querySelectorAll('canvas').forEach(function (c) {
        try { if (c.width * c.height > 0 && c.width * c.height < 16e6) setA(c, 'data-ws-canvas', c.toDataURL('image/png')); } catch (e) {}
      });
      doc.querySelectorAll('video').forEach(function (v) { if (v.currentSrc && !/^blob:/.test(v.currentSrc)) setA(v, 'data-ws-src', v.currentSrc); });
    }
    return function () { undo.forEach(function (u) { if (u[2] == null) u[0].removeAttribute(u[1]); else u[0].setAttribute(u[1], u[2]); }); };
  }

  /* ---------- 閱讀模式：抽出主要內容 ---------- */
  function extractArticle(doc) {
    if (G.WSReader && G.WSReader.extract) return G.WSReader.extract(doc);
    return null;
  }

  /* ---------- 主流程 ---------- */
  async function run(doc, opts, io) {
    opts = Object.assign({removeAds: true, removeHidden: true, embedImages: true, embedFonts: true, pruneCss: true, imgMaxPx: 0, imgQuality: 0.85,
      reader: false, iframes: true, live: true, banner: true, url: '', title: ''}, opts || {});
    var live = opts.live !== false;
    var base = opts.url || doc.baseURI || (doc.location && doc.location.href) || '';
    var url = opts.url || (doc.location && doc.location.href) || base;
    var progress = io.progress || function () {};
    var title = opts.title || (doc.title || '').trim() || hostOf(url) || '未命名網頁';
    var pool = Pool(io, function (d, t) { progress(15 + Math.round(70 * d / Math.max(t, 1)), '下載資源 ' + d + '/' + t); });

    progress(3, '分析頁面…');
    var marks = markRemovals(doc, opts, live);
    var unfreeze = freezeState(doc, live);

    /* 同網域 iframe：遞迴擷取 */
    var frameHtml = new Map(), frameByIdx = {};
    if (live && opts.iframes) {
      var frames = doc.querySelectorAll('iframe');
      for (var fi = 0; fi < frames.length && fi < 20; fi++) {
        var fr = frames[fi];
        if (fr.hasAttribute('data-ws-rm')) continue;
        var fd = null; try { fd = fr.contentDocument; } catch (e) {}
        if (fd && fd.documentElement && fd.body && fd.body.innerHTML.trim()) {
          try {
            var sub = await run(fd, Object.assign({}, opts, {iframes: fi < 5, banner: false, reader: false, url: fd.location.href, title: ''}), {fetch: io.fetch, progress: function () {}});
            frameHtml.set(fr, sub.html); frameByIdx[String(fi)] = sub.html;
            fr.setAttribute('data-ws-fr', String(fi));
          } catch (e) {}
        }
      }
    }

    var root;
    if (opts.reader) {
      var art = extractArticle(doc);
      if (!art) throw new Error('找不到主要內容，請改用完整頁面擷取');
      root = document.implementation.createHTMLDocument(title).documentElement;
      root.querySelector('head').innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
      var t = root.ownerDocument.createElement('title'); t.textContent = art.title || title; root.querySelector('head').appendChild(t);
      var st = root.ownerDocument.createElement('style'); st.textContent = (G.WSReader && G.WSReader.css) || ''; root.querySelector('head').appendChild(st);
      root.querySelector('body').innerHTML = art.html;
      title = art.title || title;
    } else {
      root = doc.documentElement.cloneNode(true);
      /* 將 iframe 對應關係帶到副本 */
    }

    /* 復原原始頁面上的暫時標記 */
    marks.forEach(function (el) { el.removeAttribute('data-ws-rm'); });
    unfreeze();
    if (!opts.reader) frameHtml.forEach(function (h, fr) { fr.removeAttribute('data-ws-fr'); });

    var R = root;
    var D = R.ownerDocument;
    function qa(s) { return Array.prototype.slice.call(R.querySelectorAll(s)); }

    progress(8, '清理廣告與腳本…');
    var removed = qa('[data-ws-rm]').length;
    qa('[data-ws-rm]').forEach(function (el) { el.remove(); });
    qa('script').forEach(function (el) { el.remove(); });
    /* 沒有腳本後，<noscript> 的內容要顯示出來 */
    qa('noscript').forEach(function (ns) {
      var inHead = !!ns.closest('head');
      if (inHead) { ns.remove(); return; }
      var tpl = D.createElement('div'); tpl.innerHTML = ns.textContent || ns.innerHTML;
      var frag = D.createDocumentFragment(); while (tpl.firstChild) frag.appendChild(tpl.firstChild);
      ns.replaceWith(frag);
    });
    qa('link[rel~="preload"],link[rel~="prefetch"],link[rel~="modulepreload"],link[rel~="dns-prefetch"],link[rel~="preconnect"],link[rel~="manifest"],link[rel~="serviceworker"],meta[http-equiv="refresh" i],meta[http-equiv="content-security-policy" i],base').forEach(function (el) { el.remove(); });
    qa('[data-ws-zap],[data-ws-hl]').forEach(function (el) { el.removeAttribute('data-ws-zap'); el.removeAttribute('data-ws-hl'); });
    qa('#__ws_zap_ui,#__ws_reader_bar,#__ws_reader_view,#__ws_adcss,.__ws_ui').forEach(function (el) { el.remove(); });
    if (R.style && R.style.overflow === 'hidden') R.style.removeProperty('overflow');
    if (!R.getAttribute('style')) R.removeAttribute('style');
    /* 事件屬性與 javascript: 連結 */
    qa('*').forEach(function (el) {
      var at = el.attributes;
      for (var i = at.length - 1; i >= 0; i--) {
        var n = at[i].name;
        if (/^on/i.test(n)) el.removeAttribute(n);
        else if ((n === 'href' || n === 'src' || n === 'action' || n === 'formaction') && /^\s*javascript:/i.test(at[i].value)) el.setAttribute(n, '#');
      }
    });

    /* 網址改成絕對網址（連結在離線檔裡仍可點開原網站） */
    [['a', 'href'], ['area', 'href'], ['form', 'action'], ['video', 'poster'], ['video', 'src'], ['audio', 'src'], ['source', 'src'], ['track', 'src'], ['embed', 'src'], ['object', 'data'], ['input', 'src'], ['link', 'href'], ['iframe', 'src'], ['blockquote', 'cite'], ['q', 'cite']].forEach(function (p) {
      qa(p[0] + '[' + p[1] + ']').forEach(function (el) { el.setAttribute(p[1], abs(el.getAttribute(p[1]), base)); });
    });
    qa('a[href]').forEach(function (a) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); });

    /* ---------- 樣式表 ---------- */
    progress(12, '下載樣式表…');
    var cssNodes = opts.reader ? [] : qa('link[rel~="stylesheet"][href],style');
    var liveNodes = (!opts.reader && live) ? Array.prototype.slice.call(doc.querySelectorAll('link[rel~="stylesheet"][href],style')) : [];
    var cssJobs = cssNodes.map(async function (node, idx) {
      var text = null, sheetBase = base;
      if (node.tagName === 'STYLE') {
        text = node.textContent;
        /* CSS-in-JS（styled-components 等）用 insertRule 寫入，textContent 是空的 → 讀 CSSOM */
        var ln = liveNodes[idx];
        if (live && ln && ln.sheet && (!text.trim() || ln.sheet.cssRules.length > 0 && text.length < 20)) {
          try { text = Array.prototype.map.call(ln.sheet.cssRules, function (r) { return r.cssText; }).join('\n'); } catch (e) {}
        }
      } else {
        if (node.disabled || /\balternate\b/i.test(node.getAttribute('rel') || '')) { node.remove(); return; }
        var href = node.getAttribute('href'); sheetBase = href;
        var ln2 = liveNodes[idx];
        if (live && ln2 && ln2.sheet) { try { text = Array.prototype.map.call(ln2.sheet.cssRules, function (r) { return r.cssText; }).join('\n'); } catch (e) { text = null; } }
        if (text == null) text = textOf(await pool.get(href, 'css'));
        if (text == null) { node.remove(); return; }
      }
      text = rebase(text, sheetBase);
      text = await expandImports(text, sheetBase, pool, 0);
      text = pruneCss(text, live ? doc : R.ownerDocument, opts);
      text = await inlineCssUrls(text, pool, opts);
      var st2 = D.createElement('style');
      var media = node.getAttribute('media'); if (media && media !== 'all') st2.setAttribute('media', media);
      st2.textContent = text;
      node.replaceWith(st2);
    });
    /* adoptedStyleSheets（Web Components、部分框架） */
    var adopted = '';
    if (live && !opts.reader && doc.adoptedStyleSheets && doc.adoptedStyleSheets.length) {
      try { adopted = doc.adoptedStyleSheets.map(function (s) { return Array.prototype.map.call(s.cssRules, function (r) { return r.cssText; }).join('\n'); }).join('\n'); } catch (e) {}
    }

    /* ---------- 圖片 ---------- */
    var imgJobs = [];
    qa('img').forEach(function (img) {
      var src = img.getAttribute('data-ws-src') || abs(img.getAttribute('src'), base);
      img.removeAttribute('data-ws-src');
      LAZY.forEach(function (k) { img.removeAttribute(k); });
      img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.removeAttribute('loading'); img.removeAttribute('decoding');
      if (img.classList) { img.classList.remove('lazyload'); img.classList.remove('lazy'); }
      if (!src) return;
      img.setAttribute('src', src);
      if (!opts.embedImages || /^data:/.test(src)) return;
      imgJobs.push(pool.get(src, 'img').then(function (r) { return shrinkImage(dataUrl(r), opts); }).then(function (du) { if (du) img.setAttribute('src', du); }));
    });
    qa('picture source').forEach(function (s) { s.remove(); });
    qa('canvas[data-ws-canvas]').forEach(function (c) {
      var im = D.createElement('img'); im.src = c.getAttribute('data-ws-canvas');
      im.setAttribute('style', (c.getAttribute('style') || '') + ';max-width:100%');
      im.width = c.width; im.height = c.height; if (c.className) im.className = c.className;
      c.replaceWith(im);
    });
    qa('textarea[data-ws-val]').forEach(function (t) { t.textContent = t.getAttribute('data-ws-val'); t.removeAttribute('data-ws-val'); });
    /* style 屬性裡的背景圖 */
    qa('[style*="url("]').forEach(function (el) {
      var s = rebase(el.getAttribute('style'), base);
      imgJobs.push(inlineCssUrls(s, pool, opts).then(function (x) { el.setAttribute('style', x); }));
    });
    /* SVG <image> */
    qa('image').forEach(function (im) {
      var k = im.hasAttribute('href') ? 'href' : 'xlink:href', v = im.getAttribute(k);
      if (!v || /^data:/.test(v) || !opts.embedImages) return;
      var u = abs(v, base);
      imgJobs.push(pool.get(u, 'img').then(function (r) { var du = dataUrl(r); if (du) im.setAttribute(k, du); }));
    });
    /* 影片：保留連結與封面（影片本身請用「媒體下載」另存） */
    qa('video').forEach(function (v) {
      var s = v.getAttribute('data-ws-src'); v.removeAttribute('data-ws-src');
      if (s && !v.getAttribute('src')) v.setAttribute('src', s);
      v.setAttribute('controls', ''); v.removeAttribute('autoplay');
      var p = v.getAttribute('poster');
      if (p && opts.embedImages && !/^data:/.test(p)) imgJobs.push(pool.get(abs(p, base), 'img').then(function (r) { return shrinkImage(dataUrl(r), opts); }).then(function (du) { if (du) v.setAttribute('poster', du); }));
    });
    /* favicon */
    qa('link[rel~="icon"][href],link[rel="apple-touch-icon"][href]').forEach(function (l, i) {
      if (i > 1) { l.remove(); return; }
      var h = l.getAttribute('href');
      if (opts.embedImages && !/^data:/.test(h)) imgJobs.push(pool.get(h, 'img').then(function (r) { var du = dataUrl(r); if (du) l.setAttribute('href', du); else l.remove(); }));
    });

    /* ---------- iframe ---------- */
    qa('iframe').forEach(function (fr) {
      var idx = fr.getAttribute('data-ws-fr');
      if (idx != null) {
        fr.removeAttribute('data-ws-fr');
        var h2 = frameByIdx[idx];
        if (h2) { fr.setAttribute('srcdoc', h2); fr.removeAttribute('src'); fr.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox'); return; }
      }
      var src = fr.getAttribute('src') || '';
      if (!/^https?:/i.test(src)) { if (!fr.getAttribute('srcdoc')) fr.remove(); return; }
      var yt = src.match(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([\w-]{6,})/);
      var box = D.createElement('a');
      box.href = yt ? 'https://www.youtube.com/watch?v=' + yt[1] : src; box.target = '_blank'; box.rel = 'noopener';
      var w = fr.getAttribute('width') || '', hh = fr.getAttribute('height') || '';
      box.setAttribute('style', 'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;max-width:100%;' +
        'width:' + (/^\d+$/.test(w) ? w + 'px' : (w || '100%')) + ';min-height:' + (/^\d+$/.test(hh) ? Math.min(+hh, 480) + 'px' : '160px') +
        ';background:#2b2b2b center/cover no-repeat;color:#fff;border-radius:10px;text-decoration:none;font:600 14px/1.4 sans-serif;text-align:center;padding:10px;box-sizing:border-box');
      box.innerHTML = '<span style="font-size:34px">' + (yt ? '▶' : '🔗') + '</span><span style="background:rgba(0,0,0,.55);padding:3px 10px;border-radius:99px">' + (yt ? '在 YouTube 觀看' : '內嵌內容（點擊開啟）') + '</span>';
      if (yt && opts.embedImages) imgJobs.push(pool.get('https://i.ytimg.com/vi/' + yt[1] + '/hqdefault.jpg', 'img').then(function (r) { var du = dataUrl(r); if (du) box.style.backgroundImage = 'url("' + du + '")'; }));
      fr.replaceWith(box);
    });

    await Promise.all(cssJobs);
    await Promise.all(imgJobs);
    if (adopted) { var as = D.createElement('style'); as.textContent = await inlineCssUrls(rebase(adopted, base), pool, opts); (R.querySelector('head') || R).appendChild(as); }

    progress(88, '打包成單一檔案…');
    var head = R.querySelector('head');
    if (!head) { head = D.createElement('head'); R.insertBefore(head, R.firstChild); }
    if (!head.querySelector('meta[charset]')) { var mc = D.createElement('meta'); mc.setAttribute('charset', 'utf-8'); head.insertBefore(mc, head.firstChild); }
    else head.querySelector('meta[charset]').setAttribute('charset', 'utf-8');
    qa('meta[http-equiv="content-type" i]').forEach(function (m) { m.remove(); });
    var csp = D.createElement('meta');
    csp.setAttribute('http-equiv', 'Content-Security-Policy');
    csp.setAttribute('content', "default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline' data:; font-src data: https:; media-src data: blob: https: http:; frame-src data: blob: https:");
    head.insertBefore(csp, head.firstChild.nextSibling);
    var mf = D.createElement('meta'); mf.setAttribute('name', 'ws-saved-from'); mf.setAttribute('content', url); head.appendChild(mf);
    var md = D.createElement('meta'); md.setAttribute('name', 'ws-saved-date'); md.setAttribute('content', new Date().toISOString()); head.appendChild(md);
    if (!head.querySelector('meta[name="viewport"]')) { var mv = D.createElement('meta'); mv.setAttribute('name', 'viewport'); mv.setAttribute('content', 'width=device-width,initial-scale=1'); head.appendChild(mv); }
    if (!head.querySelector('title')) { var tt = D.createElement('title'); tt.textContent = title; head.appendChild(tt); }
    if (opts.banner) {
      var bn = D.createElement('div');
      bn.setAttribute('style', 'all:initial;display:block;font:12px/1.6 -apple-system,"Noto Sans TC",sans-serif;color:#5d4d3a;background:#f4ecdc;border-bottom:1px solid #d8c5a3;padding:6px 12px;word-break:break-all');
      bn.innerHTML = '📄 離線保存於 ' + esc(new Date().toLocaleString('zh-TW', {hour12: false})) + '　原網址：<a style="color:#a2613a" target="_blank" rel="noopener" href="' + esc(url) + '">' + esc(url) + '</a>';
      var body = R.querySelector('body'); if (body) body.insertBefore(bn, body.firstChild);
    }
    var html = '<!DOCTYPE html>\n<!-- 由「Terra 瀏覽器」於 ' + new Date().toISOString() + ' 儲存，原網址 ' + url.replace(/--/g, '%2D%2D') + ' -->\n' + R.outerHTML;
    progress(96, '完成');
    return {html: html, title: title, url: url, stats: {resources: pool.stats().total, removed: removed, bytes: html.length}};
  }

  G.WSCapture = {v: 3, run: run, isAdHost: isAdHost, abs: abs, bestFromSrcset: bestFromSrcset, lazySrc: lazySrc, isPlaceholder: isPlaceholder};
})(typeof window !== 'undefined' ? window : this);
