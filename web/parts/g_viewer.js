/* ============================================================
   檢視器：離線網頁、PDF、圖片（雙指縮放／滑動切換）、影片、音訊、ZIP、文字
   全部讀取本機檔案，不需網路
   ============================================================ */
var Viewer = {cur: null, list: [], kind: '', cleanup: null,
  isOpen: function(){ return $('viewer').classList.contains('on'); }};
Viewer.open = async function(it, list){
  if(!it) return;
  if(it.cat === 'audio'){ Music.playItem(it); return; }
  var V = $('viewer'), body = $('vwBody');
  if(this.cleanup){ try{ this.cleanup(); }catch(e){} this.cleanup = null; }
  if(isApp && this.kind === 'html') NAT.call('vwClose');
  this.cur = it; this.list = list || [it];
  body.textContent = '';
  body.appendChild(h('img', {id: 'vwSnap', alt: ''}));
  var c = CAT[typeof areaOf === 'function' ? areaOf(it) : it.cat] || CAT[it.cat] || CAT.other;
  var dark = it.cat === 'image' || it.cat === 'video';
  V.classList.toggle('dark', dark);
  V.classList.add('on');
  this.kind = it.cat;
  $('vwTitle').textContent = it.title && it.cat === 'html' ? it.title : it.name;
  if(it.web) $('vwSub').textContent = '網頁影片・' + hostOf(it.src || it.url) + (it.w ? '・' + it.w + '×' + it.h : '');
  else $('vwSub').textContent = c.name + '・' + fmtSize(it.size) + '・' + fmtDate(it.time, true) + (it.w ? '・' + it.w + '×' + it.h : '') + (it.src ? '・' + hostOf(it.src) : '');
  updateBrVisible();
  try{
    if(it.cat === 'html') await viewHtml(it, body);
    else if(it.cat === 'image') viewImages(it, body);
    else if(it.cat === 'video') await viewVideo(it, body);
    else if(it.cat === 'audio') await viewAudio(it, body);
    else if(it.cat === 'pdf') await viewPdf(it, body);
    else if(it.cat === 'zip') await viewZip(it, body);
    else if(typeof officeKind === 'function' && officeKind(it) && officeKind(it) !== 'old'){ this.cleanup = offCleanup; await Office.open(it, body); }
    else await viewOther(it, body);
  }catch(e){ body.appendChild(h('div', {class: 'empty', html: '<div class="big">⚠️</div>無法開啟這個檔案<br><span class="sub">' + esc(e.message) + '</span>'})); }
};
Viewer.close = function(){
  if(!this.isOpen()) return;
  if(this.cleanup){ try{ this.cleanup(); }catch(e){} this.cleanup = null; }
  if(isApp && this.kind === 'html') NAT.call('vwClose');
  $('viewer').classList.remove('on');
  $('vwBody').textContent = '';
  this.cur = null; this.kind = '';
  updateBrVisible();
};
$('vwClose').addEventListener('click', function(){ Viewer.close(); });
$('vwShare').addEventListener('click', function(){ var it = Viewer.cur; if(!it) return; if(it.web){ if(isApp) NAT.call('share', it.name || '', it.src || it.url); else copyText(it.src || it.url); return; } exportSheet([it]); });
$('vwMore').addEventListener('click', function(){
  var it = Viewer.cur; if(!it) return;
  if(it.web){ webVideoMenu(it); return; }
  menu(it.name, [
    it.cat === 'html' ? ['pdf', isApp ? '轉成 PDF（存入檔案庫）' : '列印／另存為 PDF', function(){ toPdf(it); }] : null,
    it.cat === 'html' && isApp ? ['image', '轉成無縫圖片 PDF（長條漫畫）', function(){ CAPTURING = true; capCard(1, '整理網頁裡的圖片…'); NAT.call('libComic', it.id, '{}'); }, false, '只留內容圖片，上下無縫接起來，去掉按鈕與選單'] : null,
    it.cat === 'html' && isApp ? ['printer', '系統列印（可存成文字可選取的 PDF）', function(){ NAT.call('libPrint', it.id); }] : null,
    it.cat === 'pdf' ? ['layers', (pdfSeamless(it) ? '✓ ' : '') + '頁面無縫顯示（漫畫）', function(){ lsSet('ws.seam:' + it.id, !pdfSeamless(it)); Viewer.open(it, Viewer.list); }] : null,
    it.src ? ['globe', '開啟原網頁', function(){ Viewer.close(); navigate(it.src); }] : null,
    ['edit', '重新命名', async function(){ var n = await promptDlg('重新命名', it.name.replace(/\.[a-z0-9]+$/i, '')); if(n){ await Lib.rename(it, n); var nw = Lib.byId(it.id); if(nw){ Viewer.cur = nw; $('vwTitle').textContent = nw.name; } toast('已重新命名'); } }],
    ['info', '檔案資訊', function(){ fileInfo(it); }],
    ['trash', '刪除（移到垃圾桶）', async function(){ if(!(await Lib.trash([it.id]))) return; Viewer.close(); toast('已移到垃圾桶', false, ['復原', function(){ Lib.restore([it.id]); }]); }, true]
  ]);
});
on('vwLink', function(d){ Viewer.close(); navigate(d.url); });
function fileInfo(it){
  var rows = [['檔名', it.name], ['類型', (CAT[it.cat] || CAT.other).name + '（' + (it.mime || '') + '）'], ['大小', fmtSize(it.size) + '（' + (it.size || 0).toLocaleString() + ' bytes）'], ['儲存時間', fmtDate(it.time, true)]];
  if(it.w) rows.push(['解析度', it.w + ' × ' + it.h]);
  if(it.dur) rows.push(['長度', fmtDur(it.dur)]);
  if(it.pages) rows.push(['頁數', it.pages]);
  if(it.src) rows.push(['來源網址', it.src]);
  dialog('檔案資訊', '<div class="kv">' + rows.map(function(r){ return '<span>' + esc(r[0]) + '</span><span class="sel-text">' + esc(r[1]) + '</span>'; }).join('') + '</div>',
    it.src ? [['複製來源網址', function(){ copyText(it.src); }], ['關閉', null, '']] : [['關閉', null]]);
}
function toPdf(it){
  if(!isApp){ Lib.blob(it).then(function(b){ return b.text(); }).then(function(html){ printHtml(html, CFG.cap); }); return; }
  Tasks.set('pdf_' + it.id, {title: '轉成 PDF 中…', sub: it.name, pct: -1, kind: 'pdf'});
  NAT.call('libToPdf', it.id, JSON.stringify({paper: CFG.cap.paper, landscape: !!CFG.cap.landscape, margin: +CFG.cap.margin || 0}));
  on('pdf', function once(d){
    Tasks.del('pdf_' + it.id);
    BUS.pdf = (BUS.pdf || []).filter(function(f){ return f !== once; });
    if(d.ok) toast('✓ 已轉成 PDF', false, ['開啟', function(){ Viewer.open(Lib.byId(d.item.id) || d.item); }]);
    else toast('PDF 轉換失敗：' + d.err, true);
  });
}

/* ---------- 離線網頁 ---------- */
async function viewHtml(it, body){
  if(isApp){
    body.style.background = '#fff';
    requestAnimationFrame(function(){
      var r = body.getBoundingClientRect();
      NAT.call('vwOpen', it.id, r.top, Math.max(0, innerHeight - r.bottom));
    });
    var onRes = function(){ var r = body.getBoundingClientRect(); NAT.call('vwRect', r.top, Math.max(0, innerHeight - r.bottom)); };
    window.addEventListener('resize', onRes);
    Viewer.cleanup = function(){ window.removeEventListener('resize', onRes); body.style.background = ''; };
    return;
  }
  var url = await Lib.src(it);
  var fr = h('iframe', {id: 'htmlFrame', sandbox: 'allow-popups allow-popups-to-escape-sandbox allow-same-origin', src: url});
  body.appendChild(fr);
  var z = 1;
  var zb = h('div', {style: {position: 'absolute', right: '12px', bottom: '16px', display: 'flex', gap: '6px', zIndex: 2}},
    h('button', {class: 'ib', html: '－', style: {fontSize: '20px', fontWeight: 800, background: 'var(--surface-3)', border: '1px solid var(--border-soft)', boxShadow: '0 4px 12px var(--sh)'}, onclick: function(){ z = Math.max(.5, z - .15); zoom(); }}),
    h('button', {class: 'ib', html: '＋', style: {fontSize: '20px', fontWeight: 800, background: 'var(--surface-3)', border: '1px solid var(--border-soft)', boxShadow: '0 4px 12px var(--sh)'}, onclick: function(){ z = Math.min(3, z + .15); zoom(); }}));
  function zoom(){ try{ fr.contentDocument.documentElement.style.zoom = z; }catch(e){} }
  body.appendChild(zb);
}

/* ---------- 圖片：雙指縮放、拖曳、雙擊放大、左右滑動切換 ---------- */
function viewImages(it, body){
  var imgs = Viewer.list.filter(function(x){ return x.cat === 'image'; });
  if(!imgs.length) imgs = [it];
  var idx = Math.max(0, imgs.findIndex(function(x){ return x.id === it.id; }));
  var zm = h('div', {class: 'zoomer'}), track = h('div', {class: 'track'});
  zm.appendChild(track); body.appendChild(zm);
  var W = body.clientWidth;
  var slides = [];
  imgs.forEach(function(x, i){ var s = h('div', {class: 'slide', style: {flex: '0 0 ' + W + 'px'}}); slides.push(s); track.appendChild(s); });
  var st = {s: 1, tx: 0, ty: 0};
  function img(){ return slides[idx].querySelector('img'); }
  async function load(i){
    if(i < 0 || i >= imgs.length || slides[i].firstChild) return;
    var im = h('img', {alt: '', draggable: 'false', decoding: 'async'});
    im.src = await Lib.src(imgs[i]);
    slides[i].appendChild(im);
  }
  function apply(anim){
    var im = img(); if(!im) return;
    im.style.transition = anim ? 'transform .25s var(--ease)' : 'none';
    im.style.transform = 'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.s + ')';
  }
  function go(i, anim){
    var old = img(); if(old){ old.style.transform = ''; }
    idx = Math.max(0, Math.min(imgs.length - 1, i));
    st = {s: 1, tx: 0, ty: 0};
    track.style.transition = anim === false ? 'none' : '';
    track.style.transform = 'translateX(' + (-idx * W) + 'px)';
    load(idx); load(idx + 1); load(idx - 1);
    var cur = imgs[idx];
    Viewer.cur = cur;
    $('vwTitle').textContent = cur.name;
    $('vwSub').textContent = (imgs.length > 1 ? (idx + 1) + ' / ' + imgs.length + '・' : '') + fmtSize(cur.size) + (cur.w ? '・' + cur.w + '×' + cur.h : '') + '・' + fmtDate(cur.time);
  }
  function clamp(){
    var im = img(); if(!im) return;
    var bw = im.offsetWidth * st.s, bh = im.offsetHeight * st.s, ox = im.offsetLeft, oy = im.offsetTop;
    var vw = slides[idx].clientWidth, vh = slides[idx].clientHeight;
    if(st.s <= 1){ st.s = 1; st.tx = 0; st.ty = 0; return; }
    var minX = Math.min(0, vw - bw - ox) , maxX = Math.max(0, -ox);
    if(bw <= vw){ st.tx = (vw - bw) / 2 - ox; } else st.tx = Math.max(vw - bw - ox, Math.min(-ox, st.tx));
    if(bh <= vh){ st.ty = (vh - bh) / 2 - oy; } else st.ty = Math.max(vh - bh - oy, Math.min(-oy, st.ty));
  }
  function zoomAt(px, py, ns){
    var im = img(); if(!im) return;
    var r = slides[idx].getBoundingClientRect();
    var x = px - r.left - im.offsetLeft, y = py - r.top - im.offsetTop;
    st.tx = x - (x - st.tx) * ns / st.s; st.ty = y - (y - st.ty) * ns / st.s; st.s = ns;
  }
  var P = new Map(), start = null, lastTap = 0, swipeDx = 0, mode = '';
  zm.addEventListener('pointerdown', function(e){
    zm.setPointerCapture(e.pointerId);
    P.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if(P.size === 1){ start = {x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty, t: Date.now()}; mode = st.s > 1 ? 'pan' : 'swipe'; swipeDx = 0; }
    if(P.size === 2){ var a = Array.from(P.values()); start = {d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s: st.s, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, tx: st.tx, ty: st.ty}; mode = 'pinch'; track.style.transform = 'translateX(' + (-idx * W) + 'px)'; }
  });
  zm.addEventListener('pointermove', function(e){
    if(!P.has(e.pointerId)) return;
    P.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if(mode === 'pinch' && P.size >= 2){
      var a = Array.from(P.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      var ns = Math.max(1, Math.min(8, start.s * d / start.d));
      st.s = start.s; st.tx = start.tx; st.ty = start.ty;
      zoomAt(start.mx, start.my, ns);
      st.tx += (a[0].x + a[1].x) / 2 - start.mx; st.ty += (a[0].y + a[1].y) / 2 - start.my;
      apply(false);
    } else if(mode === 'pan'){
      st.tx = start.tx + e.clientX - start.x; st.ty = start.ty + e.clientY - start.y; apply(false);
    } else if(mode === 'swipe'){
      swipeDx = e.clientX - start.x;
      track.style.transition = 'none';
      var edge = (idx === 0 && swipeDx > 0) || (idx === imgs.length - 1 && swipeDx < 0) ? .35 : 1;
      track.style.transform = 'translateX(' + (-idx * W + swipeDx * edge) + 'px)';
    }
  });
  function up(e){
    if(!P.has(e.pointerId)) return;
    P.delete(e.pointerId);
    if(mode === 'pinch' && P.size === 1){ var a = Array.from(P.values())[0]; start = {x: a.x, y: a.y, tx: st.tx, ty: st.ty, t: Date.now()}; mode = 'pan'; clamp(); apply(true); return; }
    if(P.size) return;
    if(mode === 'swipe'){
      track.style.transition = '';
      var moved = Math.abs(swipeDx);
      if(swipeDx < -60 && idx < imgs.length - 1) go(idx + 1);
      else if(swipeDx > 60 && idx > 0) go(idx - 1);
      else track.style.transform = 'translateX(' + (-idx * W) + 'px)';
      if(moved < 8 && Date.now() - start.t < 300){
        var now = Date.now();
        if(now - lastTap < 300){ zoomAt(e.clientX, e.clientY, 2.5); clamp(); apply(true); lastTap = 0; }
        else { lastTap = now; setTimeout(function(){ if(lastTap === now) $('vwTop').classList.toggle('hide'); }, 310); }
      }
    } else {
      if(mode === 'pan' && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 8 && Date.now() - start.t < 300){
        var n2 = Date.now();
        if(n2 - lastTap < 300){ st = {s: 1, tx: 0, ty: 0}; apply(true); lastTap = 0; return; }
        lastTap = n2;
      }
      clamp(); apply(true);
    }
    mode = '';
  }
  zm.addEventListener('pointerup', up); zm.addEventListener('pointercancel', up);
  zm.addEventListener('wheel', function(e){ e.preventDefault(); var ns = Math.max(1, Math.min(8, st.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); zoomAt(e.clientX, e.clientY, ns); clamp(); apply(false); }, {passive: false});
  function key(e){ if(e.key === 'ArrowRight') go(idx + 1); if(e.key === 'ArrowLeft') go(idx - 1); if(e.key === 'Escape') Viewer.close(); }
  document.addEventListener('keydown', key);
  var onRes = function(){ W = body.clientWidth; slides.forEach(function(s){ s.style.flex = '0 0 ' + W + 'px'; }); go(idx, false); };
  window.addEventListener('resize', onRes);
  Viewer.cleanup = function(){ document.removeEventListener('keydown', key); window.removeEventListener('resize', onRes); $('vwTop').classList.remove('hide'); };
  go(idx, false);
}

/* ---------- 影片／音訊 ---------- */
/* 找出影片對應的字幕：下載時附上的、同檔名的、或檔名很像的（去掉畫質、空白、符號後相同） */
function vpNorm(n){ return String(n || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[_\-. ]*(\(\d+\)|\d{3,4}p\d*|4k|2k|hd|fhd|uhd|錄製(\(部分\))?|螢幕錄影|x26[45]|h\.?26[45]|webm|mp4)\b/g, '').replace(/[\s_\-.,，。、·・()（）\[\]【】「」'"!！?？]+/g, ''); }
function vpSubs(it){
  var out = [], seen = {};
  var add = function(item, lang, label){
    if(!item || seen[item.id]) return; seen[item.id] = 1; var l = lang || '';
    var sh = /^zh-(Hant|TW|HK)/i.test(l) ? '繁中' : /^zh-(Hans|CN)/i.test(l) ? '簡中' : /^zh/i.test(l) ? '中文' : /^en/i.test(l) ? '英文' : /^ja/i.test(l) ? '日文' : /^ko/i.test(l) ? '韓文' : '';
    out.push({item: item, lang: l, label: label && label !== l ? label : sh ? sh + '（' + l + '）' : (l || item.name), short: sh || l || '開'});
  };
  /* 只算還在檔案庫裡的字幕（原檔被刪掉、丟進垃圾桶就不再顯示）；被「移除連結」的不顯示 */
  var alive = function(id){ return Lib.items.filter(function(y){ return y.id === id; })[0]; };
  var hide = it.subsHide || [];
  (it.subs || []).forEach(function(x){ if(hide.indexOf(x.id) < 0) add(alive(x.id), x.lang, x.label); });
  var stem = String(it.name || '').replace(/\.[^.]+$/, '').toLowerCase(), nv = vpNorm(it.name), nt = vpNorm(it.title);
  Lib.items.forEach(function(x){
    var n = String(x.name || '').toLowerCase();
    if(!/\.(srt|vtt|ass|ssa)$/.test(n) || hide.indexOf(x.id) >= 0) return;
    var b = n.replace(/\.(srt|vtt|ass|ssa)$/, '');
    if(stem && (b === stem || b.indexOf(stem + '.') === 0)){ add(x, b === stem ? '' : b.slice(stem.length + 1)); return; }
    var lm = b.match(/\.([a-z]{2,3}(-[a-z0-9]{2,4})?)$/i), lang = lm ? lm[1] : '', nb = vpNorm(lm ? b.slice(0, -lm[0].length) : b);
    if(nb && (nb === nv || (nt && nb === nt) || (nb.length > 6 && (nv.indexOf(nb) === 0 || nb.indexOf(nv) === 0)))) add(x, lang);
  });
  return out;
}
/* 字幕解析：SRT／VTT／ASS → [{s, e, t}] */
function parseSubs(txt){
  txt = String(txt || '').replace(/\r/g, '').replace(/^﻿/, '');
  var cues = [];
  if(/^\[Script Info\]/m.test(txt)){
    var fmt = null;
    txt.split('\n').forEach(function(l){
      if(/^Format:/i.test(l) && !fmt) fmt = l.slice(7).split(',').map(function(x){ return x.trim().toLowerCase(); });
      var m = l.match(/^Dialogue:\s*(.*)$/i);
      if(m && fmt){
        var parts = m[1].split(','), o = {};
        fmt.forEach(function(k, i){ o[k] = i === fmt.length - 1 ? parts.slice(i).join(',') : parts[i]; });
        var ts = function(x){ var p = String(x || '').trim().split(':'); return (+p[0]) * 3600 + (+p[1]) * 60 + parseFloat(p[2]); };
        cues.push({s: ts(o.start), e: ts(o.end), t: String(o.text || '').replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').trim()});
      }
    });
  } else {
    var tsv = function(x){ var p = x.trim().replace(',', '.').split(':'); return p.length === 3 ? (+p[0]) * 3600 + (+p[1]) * 60 + parseFloat(p[2]) : (+p[0]) * 60 + parseFloat(p[1]); };
    txt.split(/\n\n+/).forEach(function(b){
      var ls = b.split('\n'), i = ls.findIndex(function(x){ return x.indexOf('-->') >= 0; });
      if(i < 0) return;
      var m = ls[i].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/); if(!m) return;
      var t = ls.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
      if(t) cues.push({s: tsv(m[1]), e: tsv(m[2]), t: t});
    });
  }
  return cues.sort(function(a, b){ return a.s - b.s; });
}
var SUBSTY_DEF = {size: 22, color: '#ffffff', bg: 'shadow', pos: 8, delay: 0, bold: true};
function subStyle(){ return Object.assign({}, SUBSTY_DEF, lsGet('ws.subSty', {})); }
async function viewVideo(it, body){
  /* 自己的播放器：跟 YouTube 分頁一樣的操作（點一下顯示控制、兩側連點快轉、長按 2 倍速、拖曳進度、全螢幕＋自動轉向） */
  var v = h('video', {autoplay: true, playsinline: true, preload: 'auto'});
  if(it.web) webVideoSrc(v, it); else v.src = await Lib.src(it);
  var box = h('div', {class: 'vwVideo vp'}, v);
  var ui = h('div', {class: 'vpUi'});
  var pv = h('button', {class: 'vpB', html: icon('play')});
  var rw = h('button', {class: 'vpB sk', html: '<svg viewBox="0 0 24 24"><path d="M12 5.4A7.6 7.6 0 1 1 5.4 9.2" stroke-width="1.9"/><path d="M8.7 5.4 12.7 2.9v5z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/><text x="12" y="15.7" text-anchor="middle" font-size="7.2" font-weight="800" font-family="system-ui,-apple-system,Roboto,sans-serif" fill="currentColor" stroke="none" letter-spacing="-.3">10</text></svg>'});
  var fw = h('button', {class: 'vpB sk', html: '<svg viewBox="0 0 24 24"><path d="M12 5.4A7.6 7.6 0 1 0 18.6 9.2" stroke-width="1.9"/><path d="M15.3 5.4 11.3 2.9v5z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/><text x="12" y="15.7" text-anchor="middle" font-size="7.2" font-weight="800" font-family="system-ui,-apple-system,Roboto,sans-serif" fill="currentColor" stroke="none" letter-spacing="-.3">10</text></svg>'});
  var mid = h('div', {class: 'vpMid'}, rw, pv, fw);
  var tm = h('span', {class: 'vpT', text: '0:00 / 0:00'});
  var sp = h('button', {class: 'vpC', text: '1×'});
  var fsB = h('button', {class: 'vpI', html: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'});
  var bar = h('div', {class: 'vpBar'}, h('div', {class: 'tr'}, h('div', {class: 'bf'}), h('div', {class: 'pl'})), h('div', {class: 'kn'}));
  /* 畫面大小：符合螢幕（完整顯示）／填滿螢幕（裁切邊緣）／拉伸填滿 */
  var FITS = [['contain', '符合螢幕'], ['cover', '填滿螢幕'], ['fill', '拉伸填滿']];
  var fitI = Math.max(0, FITS.map(function(x){ return x[0]; }).indexOf(lsGet('ws.vpFit', 'contain')));
  var fitB = h('button', {class: 'vpC', text: FITS[fitI][1]});
  function applyFit(){ v.style.objectFit = FITS[fitI][0]; fitB.textContent = FITS[fitI][1]; }
  fitB.onclick = function(e){ e.stopPropagation(); fitI = (fitI + 1) % FITS.length; lsSet('ws.vpFit', FITS[fitI][0]); applyFit(); fl('畫面：' + FITS[fitI][1]); show(); };
  applyFit();
  /* 字幕（自己畫，才能調大小、顏色、背景、位置、時間同步）：自動找對應的字幕檔 */
  var subs = it.web ? [] : vpSubs(it), subI = -1, cues = [], ST = subStyle();
  var subBox = h('div', {class: 'vpSub'}), subTxt = h('span');
  subBox.appendChild(subTxt);
  var ccB = h('button', {class: 'vpC', text: '字幕'});
  function paintSubStyle(){
    var bg = ST.bg;
    subTxt.style.fontSize = 'calc(' + ST.size + 'px * var(--vpSubK, 1))';
    subTxt.style.color = ST.color;
    subTxt.style.fontWeight = ST.bold ? '700' : '500';
    subTxt.style.background = bg === 'box' ? 'rgba(0,0,0,.78)' : bg === 'semi' ? 'rgba(0,0,0,.45)' : 'transparent';
    subTxt.style.textShadow = bg === 'shadow' ? '0 0 3px #000,0 0 3px #000,1px 1px 2px #000,-1px -1px 2px #000' : bg === 'none' ? 'none' : '0 1px 2px rgba(0,0,0,.6)';
    subBox.style.bottom = ST.pos + '%';
    subBox.style.top = 'auto';
    if(ST.pos >= 80){ subBox.style.top = (100 - ST.pos) + '%'; subBox.style.bottom = 'auto'; }
  }
  paintSubStyle();
  var lastCue = '';
  function subTick(){
    if(subI < 0 || !cues.length){ if(lastCue){ lastCue = ''; subTxt.textContent = ''; subBox.classList.remove('on'); } return; }
    var t = v.currentTime - (ST.delay || 0), cur = [];
    for(var i = 0; i < cues.length; i++){ var c = cues[i]; if(c.s > t) break; if(c.e > t) cur.push(c.t); }
    var txt = cur.join('\n');
    if(txt !== lastCue){ lastCue = txt; subTxt.textContent = txt; subBox.classList.toggle('on', !!txt); }
  }
  async function setSub(i){
    subI = i; cues = []; lastCue = '\u0000';
    if(i >= 0){
      try{ cues = parseSubs(await (await Lib.blob(subs[i].item)).text()); if(!cues.length) throw new Error('沒有字幕內容'); }
      catch(e){ fl('字幕讀取失敗'); subI = -1; }
    }
    ccB.textContent = subI >= 0 ? '字幕：' + (subs[subI].short || '開') : (subs.length ? '字幕：關' : '字幕');
    ccB.classList.toggle('on', subI >= 0);
    if(subs.length) lsSet('ws.vpSub', subI >= 0 ? (subs[subI].lang || 'on') : 'off');
    subTick();
  }
  function subMenu(){
    /* 字幕原檔在檔案庫被刪掉了：這裡跟著拿掉 */
    var cur = subI >= 0 ? subs[subI] : null;
    subs = subs.filter(function(x){ return Lib.items.some(function(y){ return y.id === x.item.id; }); });
    subI = cur ? subs.indexOf(cur) : -1;
    if(cur && subI < 0) setSub(-1);
    var items = [];
    subs.forEach(function(x, i){ items.push(['film', x.label + (i === subI ? '　✓' : ''), function(){ setSub(i); fl('字幕：' + x.label); }, false, x.item.name, function(){ unlinkSub(x, i); }]); });
    if(subs.length) items.push(null);
    if(subs.length) items.push(['x', '關閉字幕' + (subI < 0 ? '　✓' : ''), function(){ setSub(-1); fl('字幕：關'); }]);
    items.push(['sliders', '字幕樣式與同步…', function(){ subSettings(); }, false, '大小、顏色、背景、位置、提早／延後']);
    items.push(['folder', '從檔案庫選字幕檔…', function(){ pickSubFile(); }, false, 'SRT、VTT、ASS']);
    menu('字幕', items);
  }
  /* 長按字幕：只移除和這部影片的連結，不刪字幕原檔 */
  function unlinkSub(x, i){
    menu(x.label, [
      ['x', '從這部影片移除這個字幕', function(){
        var ls = (it.subs || []).filter(function(y){ return y.id !== x.item.id; });
        var hd = (it.subsHide || []).filter(function(y){ return y !== x.item.id; }).concat([x.item.id]);
        it.subs = ls; it.subsHide = hd;
        if(isApp) NAT.call('libMeta', it.id, JSON.stringify({subs: ls, subsHide: hd}));
        if(subI === i) setSub(-1); else if(subI > i) subI--;
        subs.splice(i, 1);
        if(subI >= subs.length) subI = -1;
        ccB.textContent = subI >= 0 ? '字幕：' + (subs[subI].short || '開') : (subs.length ? '字幕：關' : '字幕');
        toast('已移除連結（字幕原檔還在檔案庫）');
      }, true, '不會刪除字幕檔本身；之後可以用「從檔案庫選字幕檔」再加回來'],
      ['film', '取消', function(){}]
    ]);
  }
  function pickSubFile(){
    var L = Lib.items.filter(function(x){ return /\.(srt|vtt|ass|ssa)$/i.test(x.name || ''); });
    if(!L.length){ toast('檔案庫裡沒有字幕檔（.srt／.vtt／.ass）', true); return; }
    menu('選擇字幕檔', L.slice(0, 60).map(function(x){ return ['film', x.name, function(){
      var k = subs.findIndex(function(y){ return y.item.id === x.id; });
      if(k < 0){ subs.push({item: x, lang: '', label: x.name, short: '開'}); k = subs.length - 1; }
      var ls = (it.subs || []).filter(function(y){ return y.id !== x.id; }).concat([{id: x.id, lang: '', label: x.name}]);
      var hd2 = (it.subsHide || []).filter(function(y){ return y !== x.id; });
      it.subs = ls; it.subsHide = hd2; if(isApp) NAT.call('libMeta', it.id, JSON.stringify({subs: ls, subsHide: hd2}));
      setSub(k); fl('已套用字幕');
    }]; }));
  }
  function subSettings(){
    var body2 = h('div');
    function save(){ lsSet('ws.subSty', ST); paintSubStyle(); lastCue = '\u0000'; subTick(); }
    function seg(label, opts, key){
      var sg = h('div', {class: 'seg', style: {marginBottom: '12px'}});
      opts.forEach(function(o){ sg.appendChild(h('button', {class: ST[key] === o[0] ? 'on' : '', html: o[1], onclick: function(){ ST[key] = o[0]; save(); qsa('button', sg).forEach(function(b){ b.classList.remove('on'); }); this.classList.add('on'); }})); });
      return h('div', null, h('div', {class: 'lbl', style: {margin: '4px 2px 6px', fontWeight: 700}, text: label}), sg);
    }
    function range(label, key, min, max, step, fmt){
      var val = h('b', {text: fmt(ST[key])});
      var r = holdRange(h('input', {type: 'range', min: min, max: max, step: step, value: ST[key], style: {width: '100%'}, oninput: function(){ ST[key] = +this.value; val.textContent = fmt(ST[key]); save(); }}));
      return h('div', {style: {marginBottom: '12px'}}, h('div', {style: {display: 'flex', justifyContent: 'space-between', margin: '4px 2px'}}, h('span', {style: {fontWeight: 700}, text: label}), val), r);
    }
    var dl = h('b', {text: (ST.delay > 0 ? '+' : '') + ST.delay.toFixed(1) + ' 秒'});
    function dly(d){ ST.delay = Math.round((ST.delay + d) * 10) / 10; dl.textContent = (ST.delay > 0 ? '+' : '') + ST.delay.toFixed(1) + ' 秒'; save(); }
    body2.appendChild(range('字體大小', 'size', 12, 48, 1, function(x){ return x + ' px'; }));
    body2.appendChild(seg('字幕顏色', [['#ffffff', '白'], ['#ffeb3b', '黃'], ['#7cf27c', '綠'], ['#6fe3ff', '青'], ['#ffb3d1', '粉']], 'color'));
    body2.appendChild(seg('背景', [['shadow', '描邊'], ['semi', '半透明'], ['box', '黑底'], ['none', '無']], 'bg'));
    body2.appendChild(seg('粗細', [[true, '粗體'], [false, '一般']], 'bold'));
    body2.appendChild(range('位置（離底部）', 'pos', 0, 90, 1, function(x){ return x >= 80 ? '畫面上方' : x + '%'; }));
    body2.appendChild(h('div', {style: {marginBottom: '6px', fontWeight: 700}, text: '字幕同步（字幕比聲音早就按「延後」）'}));
    body2.appendChild(h('div', {class: 'btn-row', style: {alignItems: 'center'}},
      h('button', {class: 'btn sm', text: '提早 0.5', onclick: function(){ dly(-0.5); }}), h('button', {class: 'btn sm', text: '−0.1', onclick: function(){ dly(-0.1); }}),
      dl, h('button', {class: 'btn sm', text: '+0.1', onclick: function(){ dly(0.1); }}), h('button', {class: 'btn sm', text: '延後 0.5', onclick: function(){ dly(0.5); }})));
    body2.appendChild(h('div', {class: 'btn-row', style: {marginTop: '10px'}}, h('button', {class: 'btn ghost', text: '恢復預設', onclick: function(){ ST = Object.assign({}, SUBSTY_DEF); save(); sh.close(); subSettings(); }})));
    var sh = openSheet({title: '字幕樣式與同步', icon: 'sliders', body: body2});
  }
  ccB.onclick = function(e){ e.stopPropagation(); show(); subMenu(); };
  if(subs.length){
    var pref = lsGet('ws.vpSub', 'on');
    if(pref === 'off') setSub(-1);
    else { var pi = subs.findIndex(function(x){ return x.lang === pref; }); setSub(pi >= 0 ? pi : 0); }
  }
  /* 其他功能（像 MX Player／VLC）：鎖定畫面、循環、旋轉、上一部／下一部、播完自動下一部、雙指縮放 */
  var moreB = h('button', {class: 'vpI', html: icon('more')});
  var vids = it.web ? [] : (Viewer.list && Viewer.list.length > 1 ? Viewer.list : Lib.items).filter(function(x){ return x.cat === 'video' && !SEC.hidden(x); });
  var vi = vids.findIndex(function(x){ return x.id === it.id; });
  function goVid(d){ var n = vids[vi + d]; if(n){ Viewer.open(n, Viewer.list); } else fl(d > 0 ? '已經是最後一部' : '已經是第一部'); }
  var LOOP = lsGet('ws.vpLoop', false), AUTONEXT = lsGet('ws.vpNext', false);
  v.loop = LOOP;
  var lockOv = h('div', {class: 'vpLock'}, h('button', {class: 'vpLockB', html: icon('key') + '<span>點兩下解鎖</span>'}));
  var LOCK = false, lockTap = 0;
  lockOv.addEventListener('click', function(e){
    e.stopPropagation();
    var now = Date.now();
    lockOv.classList.add('show'); clearTimeout(lockOv.t); lockOv.t = setTimeout(function(){ lockOv.classList.remove('show'); }, 2500);
    if(now - lockTap < 400){ LOCK = false; box.classList.remove('locked'); fl('已解鎖'); show(); }
    lockTap = now;
  });
  var rotI = 0;
  moreB.onclick = function(e){
    e.stopPropagation(); show();
    menu('播放器', [
      ['key', '鎖定畫面', function(){ LOCK = true; box.classList.add('locked'); box.classList.remove('show'); fl('已鎖定：點兩下解鎖'); }, false, '避免誤觸'],
      ['reload', (LOOP ? '✓ ' : '') + '循環播放', function(){ LOOP = !LOOP; v.loop = LOOP; lsSet('ws.vpLoop', LOOP); fl(LOOP ? '循環播放：開' : '循環播放：關'); }],
      ['fwd', (AUTONEXT ? '✓ ' : '') + '播完自動播下一部', function(){ AUTONEXT = !AUTONEXT; lsSet('ws.vpNext', AUTONEXT); fl(AUTONEXT ? '自動下一部：開' : '自動下一部：關'); }],
      it.web ? null : ['back', '上一部', function(){ goVid(-1); }, false, vi > 0 ? vids[vi - 1].name : '沒有上一部'],
      it.web ? null : ['fwd', '下一部', function(){ goVid(1); }, false, vi < vids.length - 1 ? vids[vi + 1].name : '沒有下一部'],
      ['phone', '旋轉畫面', function(){ rotI = (rotI + 1) % 2; if(!FS) setFs(true); if(isApp) NAT.call('uiFull', true, rotI === 1); fl(rotI === 1 ? '橫向' : '直向'); }],
      ['search', '縮放還原', function(){ zoom = 1; zx = 0; zy = 0; applyZoom(); fl('縮放：100%'); }, false, '雙指可以放大縮小畫面'],
      ['sliders', '字幕樣式與同步…', function(){ subSettings(); }],
      it.web ? null : ['scissors', '剪輯影片（裁掉頭尾）', function(){ trimSheet(); }, false, isApp ? '例如裁掉錄影開頭的讀取畫面' : '需 APK 版'],
      it.web ? ['download', '下載這部影片', function(){ webVideoDl(it); }] : null,
      it.web ? ['globe', '改回網頁裡播放', function(){ webVideoBack(it, v.currentTime); }, false, '這個網頁接下來都用網頁自己的播放器'] : null
    ]);
  };
  /* 剪輯：拖動或按「設為開頭／結尾」選範圍，預覽後存檔（不重新編碼，畫質不變） */
  function trimSheet(){
    if(!isApp || !NAT.has('vidTrim')){ toast('剪輯需要 APK 版', true); return; }
    var d = v.duration || 0; if(!d){ toast('影片還沒載入完成', true); return; }
    var A = 0, Bt = d;
    var la = h('b'), lb = h('b'), ln = h('span', {class: 'sub'});
    function lab(){ la.textContent = fmtT(A); lb.textContent = fmtT(Bt); ln.textContent = '剪完長度 ' + fmtT(Math.max(0, Bt - A)); ra.value = A; rb.value = Bt; }
    var ra = h('input', {type: 'range', min: 0, max: d, step: 0.1, value: 0, style: {width: '100%'}, oninput: function(){ A = Math.min(+this.value, Bt - 0.5); v.currentTime = A; lab(); }});
    var rb = h('input', {type: 'range', min: 0, max: d, step: 0.1, value: d, style: {width: '100%'}, oninput: function(){ Bt = Math.max(+this.value, A + 0.5); v.currentTime = Bt; lab(); }});
    var body2 = h('div', null,
      h('div', {class: 'sub', style: {lineHeight: '1.6', marginBottom: '10px'}, text: '上面的影片可以邊播邊看；拖動滑桿或按「用目前位置」選開頭和結尾。剪輯不會重新壓縮，畫質不變；開頭會對齊到最近的關鍵畫面（誤差約 1～2 秒內）。'}),
      h('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}, h('span', null, '開頭 ', la), h('button', {class: 'btn sm', text: '用目前位置', onclick: function(){ A = Math.min(v.currentTime, Bt - 0.5); lab(); }})), ra,
      h('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px'}}, h('span', null, '結尾 ', lb), h('button', {class: 'btn sm', text: '用目前位置', onclick: function(){ Bt = Math.max(v.currentTime, A + 0.5); lab(); }})), rb,
      h('div', {style: {margin: '8px 2px'}}, ln),
      h('div', {class: 'btn-row'}, h('button', {class: 'btn sm ghost', html: icon('play', 'sm') + '預覽開頭', onclick: function(){ v.currentTime = A; v.play().catch(function(){}); }})));
    function run(replace){
      if(Bt - A < 0.5){ toast('範圍太短', true); return; }
      sh.close(); v.pause();
      Tasks.set('trim', {title: '剪輯影片中…', sub: it.name, pct: -1, kind: 'trim'});
      var off = function(r){
        BUS.trim = (BUS.trim || []).filter(function(f){ return f !== off; });
        Tasks.del('trim');
        if(!r || !r.ok){ dialog('剪輯失敗', esc(r && r.err || ''), [['好', null]]); return; }
        Lib.refresh().then(function(){ toast('✓ ' + (r.replaced ? '已剪輯並覆蓋原檔' : '已另存剪輯後的影片'), false, ['播放', function(){ Viewer.open(Lib.byId(r.item.id) || r.item); }]); if(r.replaced) Viewer.open(Lib.byId(r.item.id) || r.item); });
      };
      on('trim', off);
      NAT.call('vidTrim', it.id, A, Bt >= d - 0.05 ? 0 : Bt, !!replace);
    }
    var sh = openSheet({title: '剪輯影片', icon: 'scissors', body: body2, foot: h('div', {style: {display: 'contents'}},
      h('button', {class: 'btn ghost', text: '覆蓋原檔', onclick: async function(){ if(await confirmDlg('覆蓋原檔？', '原本的影片會被剪輯後的版本取代，無法復原。', '覆蓋', true)) run(true); }}),
      h('button', {class: 'btn pri', text: '另存新檔', onclick: function(){ run(false); }}))});
    lab();
  }
  v.addEventListener('ended', function(){ if(!LOOP && AUTONEXT && vi < vids.length - 1) goVid(1); });
  /* 雙指縮放、平移 */
  var zoom = 1, zx = 0, zy = 0, pts = {}, pz = null;
  function applyZoom(){ v.style.transform = zoom === 1 ? '' : 'translate(' + zx + 'px,' + zy + 'px) scale(' + zoom + ')'; }
  box.addEventListener('pointerdown', function(e){ pts[e.pointerId] = {x: e.clientX, y: e.clientY}; var k = Object.keys(pts); if(k.length === 2){ var a = pts[k[0]], b2 = pts[k[1]]; pz = {d: Math.hypot(a.x - b2.x, a.y - b2.y), z: zoom, cx: (a.x + b2.x) / 2, cy: (a.y + b2.y) / 2, zx: zx, zy: zy}; if(G){ clearTimeout(G.lp); G = null; } } }, true);
  box.addEventListener('pointermove', function(e){
    if(!pts[e.pointerId]) return; pts[e.pointerId] = {x: e.clientX, y: e.clientY};
    var k = Object.keys(pts); if(k.length !== 2 || !pz || LOCK) return;
    var a = pts[k[0]], b2 = pts[k[1]], d = Math.hypot(a.x - b2.x, a.y - b2.y);
    zoom = Math.max(1, Math.min(4, pz.z * d / pz.d)); zx = pz.zx + ((a.x + b2.x) / 2 - pz.cx); zy = pz.zy + ((a.y + b2.y) / 2 - pz.cy);
    if(zoom === 1){ zx = 0; zy = 0; }
    applyZoom(); fl('縮放：' + Math.round(zoom * 100) + '%'); e.stopPropagation();
  }, true);
  function ptUp(e){ delete pts[e.pointerId]; if(Object.keys(pts).length < 2) pz = null; }
  box.addEventListener('pointerup', ptUp, true); box.addEventListener('pointercancel', ptUp, true);
  var row = h('div', {class: 'vpRow'}, tm, h('span', {style: {flex: 1}}), ccB, fitB, sp, moreB, fsB);
  var bot = h('div', {class: 'vpBot'}, bar, row);
  var flash = h('div', {class: 'vpFlash'});
  ui.appendChild(mid); ui.appendChild(bot);
  box.appendChild(subBox); box.appendChild(ui); box.appendChild(flash); box.appendChild(lockOv);
  body.appendChild(box);
  paintIcons(box);
  var hideT = 0;
  function show(keep){ box.classList.add('show'); clearTimeout(hideT); if(!keep) hideT = setTimeout(function(){ if(!v.paused) box.classList.remove('show'); }, 3000); }
  function fl(t){ flash.textContent = t; flash.classList.add('on'); clearTimeout(fl.t); fl.t = setTimeout(function(){ flash.classList.remove('on'); }, 900); }
  function fmtT(t){ t = Math.max(0, Math.floor(t || 0)); var hh = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), ss = t % 60; return (hh ? hh + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
  function seek(d){ v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.3, v.currentTime + d)); }
  function tog(){ buzz(10); if(v.paused) v.play().catch(function(){}); else v.pause(); }
  pv.onclick = function(e){ e.stopPropagation(); tog(); show(); };
  rw.onclick = function(e){ e.stopPropagation(); buzz(10); seek(-10); fl('-10 秒'); show(); };
  fw.onclick = function(e){ e.stopPropagation(); buzz(10); seek(10); fl('+10 秒'); show(); };
  var SP = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  sp.onclick = function(e){ e.stopPropagation(); var i = SP.indexOf(v.playbackRate); v.playbackRate = SP[(i + 1) % SP.length]; sp.textContent = v.playbackRate + '×'; fl('速度 ' + v.playbackRate + '×'); show(); };
  /* 全螢幕：整個 App 隱藏狀態列、橫向影片自動轉橫向 */
  var FS = false, autoFs = false;
  function setFs(on, auto){
    FS = on; autoFs = !!(on && auto);
    box.classList.toggle('vpFs', on); document.body.classList.toggle('vpFsOn', on);
    fsB.innerHTML = on ? '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    if(isApp) NAT.call('uiFull', on, !auto && (v.videoWidth >= v.videoHeight));
  }
  fsB.onclick = function(e){ e.stopPropagation(); setFs(!FS); show(); };
  function onRot(){
    var land = innerWidth > innerHeight * 1.1;
    if(land && !FS && v.videoWidth >= v.videoHeight) setFs(true, true);
    else if(!land && FS && autoFs) setFs(false);
  }
  window.addEventListener('resize', onRot);
  /* 進度條 */
  var drag = false;
  function pos(x){ var r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); }
  /* 進度條：按下震一下、拖動時每移動一小段輕震（像轉盤的段落感）；放開後短時間內擋掉下方按鈕，避免誤觸 */
  var tick = -1, guard = 0;
  bar.addEventListener('pointerdown', function(e){ e.stopPropagation(); drag = true; bar.setPointerCapture(e.pointerId); bar.classList.add('drag'); tick = -1; buzz(14); mv(e); show(true); });
  bar.addEventListener('pointermove', function(e){ if(drag) mv(e); });
  function mv(e){
    var f = pos(e.clientX); bar.querySelector('.pl').style.width = f * 100 + '%'; bar.querySelector('.kn').style.left = f * 100 + '%'; fl(fmtT(f * (v.duration || 0))); bar.__f = f;
    var k = Math.round(f * 40); if(tick >= 0 && k !== tick) buzz(5); tick = k;
  }
  function upB(){ if(!drag) return; drag = false; guard = Date.now(); bar.classList.remove('drag'); if(bar.__f != null && v.duration) v.currentTime = bar.__f * v.duration; buzz(10); show(); }
  row.addEventListener('click', function(e){
    if(Date.now() - guard < 500){ e.stopPropagation(); e.preventDefault(); return; }
    if(e.target.closest('button')) buzz(10);
  }, true);
  bar.addEventListener('pointerup', upB); bar.addEventListener('pointercancel', upB);
  /* 手勢：點一下顯示控制、兩側連點快轉／快退、長按 2 倍速、左右滑拖曳 */
  var G = null, last = {t: 0, side: ''}, combo = {n: 0, side: '', t: 0}, tapT = 0;
  box.addEventListener('pointerdown', function(e){
    if(LOCK || e.target.closest('button') || e.target.closest('.vpBar') || e.target.closest('.vpLock')) return;
    var r = box.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
    G = {x: e.clientX, y: e.clientY, t: Date.now(), w: r.width, side: fx < .35 ? 'l' : fx > .65 ? 'r' : '', mode: '', c0: v.currentTime};
    G.lp = setTimeout(function(){ if(G && !G.mode){ G.mode = 'hold'; v.playbackRate = 2; fl('▶▶ 2 倍速'); } }, 450);
  });
  box.addEventListener('pointermove', function(e){
    if(!G) return; var dx = e.clientX - G.x, dy = e.clientY - G.y;
    if(!G.mode && Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4){ G.mode = 'seek'; clearTimeout(G.lp); }
    if(!G.mode && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.4){ G.mode = 'swipe'; clearTimeout(G.lp); }
    if(G.mode === 'seek' && v.duration){ G.to = Math.max(0, Math.min(v.duration, G.c0 + dx / G.w * Math.min(180, v.duration))); fl(fmtT(G.to) + '　' + (G.to >= G.c0 ? '+' : '-') + fmtT(Math.abs(G.to - G.c0))); }
  });
  box.addEventListener('pointerup', function(e){
    if(!G) return; clearTimeout(G.lp); var g = G; G = null;
    if(g.mode === 'hold'){ v.playbackRate = SP[SP.indexOf(+sp.textContent.replace('×', ''))] || 1; return; }
    if(g.mode === 'seek'){ if(g.to != null) v.currentTime = g.to; return; }
    if(g.mode === 'swipe'){ var dy = e.clientY - g.y; if(dy < 0 && !FS) setFs(true); else if(dy > 0 && FS) setFs(false); return; }
    if(Date.now() - g.t > 450) return;
    var now = Date.now(), side = g.side, inC = side && combo.side === side && now - combo.t < 650;
    if(side && (inC || (last.side === side && now - last.t < 320))){
      clearTimeout(tapT); combo.n = inC ? combo.n + 1 : 1; combo.side = side; combo.t = now;
      seek(side === 'l' ? -10 : 10); fl((side === 'l' ? '⏪ ' : '⏩ ') + combo.n * 10 + ' 秒'); last = {t: 0, side: ''}; return;
    }
    last = {t: now, side: side}; clearTimeout(tapT);
    tapT = setTimeout(function(){ if(box.classList.contains('show')) box.classList.remove('show'); else show(); }, side ? 300 : 0);
  });
  /* 畫面更新 */
  function upd(){
    var d = v.duration || 0, t = v.currentTime || 0;
    tm.textContent = fmtT(t) + ' / ' + fmtT(d);
    if(!drag){ bar.querySelector('.pl').style.width = (d ? t / d * 100 : 0) + '%'; bar.querySelector('.kn').style.left = (d ? t / d * 100 : 0) + '%'; }
    try{ var b = v.buffered; if(b.length) bar.querySelector('.bf').style.width = (d ? b.end(b.length - 1) / d * 100 : 0) + '%'; }catch(e){}
    pv.innerHTML = icon(v.paused ? 'play' : 'pause');
  }
  ['timeupdate', 'play', 'pause', 'loadedmetadata', 'progress'].forEach(function(ev){ v.addEventListener(ev, upd); });
  var subRaf = 0; (function loop(){ subTick(); subRaf = requestAnimationFrame(loop); })();
  v.addEventListener('seeked', function(){ lastCue = '\u0000'; subTick(); });
  v.addEventListener('pause', function(){ show(true); });
  v.addEventListener('play', function(){ show(); });
  var posM = lsGet('ws.vpos', {});
  v.addEventListener('loadedmetadata', function(){
    if(it.web){ if(it.t > 1 && (!v.duration || it.t < v.duration - 2)) v.currentTime = it.t; }
    else if(posM[it.id] && posM[it.id] < v.duration - 5) v.currentTime = posM[it.id];
    onRot();
  });
  show();
  Viewer.cleanup = function(){
    try{ if(!it.web){ posM = lsGet('ws.vpos', {}); posM[it.id] = v.currentTime; lsSet('ws.vpos', posM); } v.pause(); if(v.__hls) v.__hls.destroy(); v.removeAttribute('src'); v.load(); }catch(e){}
    window.removeEventListener('resize', onRot);
    cancelAnimationFrame(subRaf);
    if(FS) setFs(false);
  };
}
/* ---------- 網頁影片用內建播放器播放 ---------- */
function webVideoSrc(v, it){
  var fail = function(){
    if(v.__failed) return; v.__failed = true;
    var d = dialog('這部影片無法用內建播放器播放', '網站可能有保護或用了特殊格式。要改回網頁裡播放嗎？', [['回網頁播放', function(){ webVideoBack(it, it.t); }], ['關閉', null, '']]);
  };
  if(it.kind === 'hls' && window.Hls && Hls.isSupported()){
    var hl = new Hls({maxBufferLength: 40, enableWorker: true});
    v.__hls = hl;
    hl.on(Hls.Events.ERROR, function(e, d){
      if(!d.fatal) return;
      if(d.type === Hls.ErrorTypes.NETWORK_ERROR && !hl.__retry){ hl.__retry = 1; hl.startLoad(); return; }
      if(d.type === Hls.ErrorTypes.MEDIA_ERROR && !hl.__rec){ hl.__rec = 1; hl.recoverMediaError(); return; }
      hl.destroy(); v.__hls = null;
      /* 換系統內建的 HLS 播放試試 */
      if(!v.__native){ v.__native = 1; v.src = it.play; return; }
      fail();
    });
    hl.loadSource(it.play); hl.attachMedia(v);
  } else v.src = it.play;
  v.addEventListener('error', function(){ if(!v.__hls) fail(); });
}
function webVideoBack(it, t){
  Viewer.close();
  if(isApp) NAT.call('brRun', 'window.__wsVpBack&&window.__wsVpBack(' + (+t || 0) + ')', 'vpBack');
}
function webVideoDl(it){
  var mo = CFG.media || {};
  var name = (it.name || '影片').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80);
  var req = {page: it.src, title: it.name, items: [{url: it.url, kind: it.kind || 'video', name: name, variant: '', referer: it.src, seq: 1}],
    opts: {imgFmt: mo.imgFmt, imgMax: +mo.imgMax || 0, imgQ: +mo.imgQ || 90, vidOut: mo.vidOut, vidQ: mo.vidQ, zip: false}};
  req.job = dlJobId(name);
  dlCard(0, 1, '準備下載…', 0);
  NAT.call('dlStart', JSON.stringify(req));
  toast('開始下載，完成後會放進檔案庫');
}
function webVideoMenu(it){
  menu(it.name || '網頁影片', [
    ['download', '下載這部影片', function(){ webVideoDl(it); }],
    ['globe', '改回網頁裡播放', function(){ webVideoBack(it, it.t); }, false, '這個網頁接下來都用網頁自己的播放器'],
    ['copy', '複製影片網址', function(){ copyText(it.url); }],
    ['link', '複製網頁網址', function(){ copyText(it.src); }]
  ]);
}
on('webVideo', function(d){
  if(!d || !d.play) return;
  if(typeof showView === 'function' && curView !== 'browse') return;
  Viewer.open({id: 'web_' + Date.now(), web: true, cat: 'video', name: d.title || hostOf(d.ref) || '網頁影片', src: d.ref, url: d.src, play: d.play, kind: d.kind || 'video', t: +d.t || 0, w: d.w || 0, h: d.h || 0});
});
async function viewAudio(it, body){
  var t = Lib.thumb(it);
  var a = h('audio', {controls: true, autoplay: true, preload: 'auto'});
  a.src = await Lib.src(it);
  body.appendChild(h('div', {class: 'vwAudio'}, h('div', {class: 'art', style: t ? {backgroundImage: 'url("' + t + '")'} : null, html: t ? '' : icon('audio', 'lg')}), h('b', {text: it.name, style: {textAlign: 'center'}}), a));
  Viewer.cleanup = function(){ try{ a.pause(); a.removeAttribute('src'); a.load(); }catch(e){} };
}

/* ---------- PDF（pdf.js，依捲動位置即時繪製，雙指縮放） ---------- */
function pdfSeamless(it){ var v = lsGet('ws.seam:' + it.id, null); return v == null ? !!it.seamless : v; }
async function viewPdf(it, body){
  if(!window.pdfjsLib) throw new Error('PDF 元件沒有載入');
  pdfjsLib.GlobalWorkerOptions.workerSrc = window.PDF_WORKER_URL;
  var wrap = h('div', {class: 'pdfWrap'}), pages = h('div', {class: 'pdfPages' + (pdfSeamless(it) ? ' seamless' : '')}), badge = h('div', {class: 'pdfBadge', text: '載入中…'});
  wrap.appendChild(pages); body.appendChild(wrap); body.appendChild(badge);
  var data = new Uint8Array(await (await Lib.blob(it)).arrayBuffer());
  var task = pdfjsLib.getDocument({data: data});
  var doc = await task.promise;
  var n = doc.numPages, Z = 1, base = pdfSeamless(it) ? Math.min(wrap.clientWidth, 1100) : Math.min(wrap.clientWidth - 16, 980);
  var p1 = await doc.getPage(1), vp1 = p1.getViewport({scale: 1}), ratio = vp1.height / vp1.width;
  var info = [];
  for(var i = 1; i <= n; i++){
    var d = h('div', {class: 'pdfPage'}); d.dataset.p = i;
    d.appendChild(h('span', {class: 'pn', text: i}));
    pages.appendChild(d); info.push({el: d, ratio: ratio, rendered: 0, task: null});
  }
  function layout(){
    info.forEach(function(p){ p.el.style.width = (base * Z) + 'px'; p.el.style.height = (base * Z * p.ratio) + 'px'; });
  }
  layout();
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  /* 分塊繪製：長頁（無縫 PDF 一頁可能接了十幾張圖）切成多塊各自用完整解析度畫，不會因為畫布上限而變模糊 */
  var TILE = 1100;
  function mkTiles(p){
    var Hc = base * Z * p.ratio, nT = Math.max(1, Math.ceil(Hc / TILE));
    if(p.tiles && p.tz === Z && p.tiles.length === nT) return;
    (p.tiles || []).forEach(function(t){ tio.unobserve(t.el); t.el.remove(); });
    p.tz = Z; p.tiles = [];
    for(var k = 0; k < nT; k++){
      var el = h('div', {class: 'pdfTile'});
      el.style.top = (k * TILE) + 'px'; el.style.height = Math.min(TILE, Hc - k * TILE) + 'px';
      el.__p = p; el.__k = k;
      p.el.appendChild(el);
      var t = {el: el, k: k, rendered: 0, busy: false}; el.__t = t;
      p.tiles.push(t); tio.observe(el);
    }
  }
  async function renderTile(p, t){
    var want = base * Z * dpr;
    if(t.busy || (t.rendered && Math.abs(t.rendered - want) < 4)) return;
    t.busy = true;
    try{
      var pg = await doc.getPage(+p.el.dataset.p);
      var vp0 = pg.getViewport({scale: 1});
      if(Math.abs(vp0.height / vp0.width - p.ratio) > .01){ p.ratio = vp0.height / vp0.width; p.el.style.height = (base * Z * p.ratio) + 'px'; t.busy = false; p.tiles = null; mkTiles(p); return; }
      var vp = pg.getViewport({scale: want / vp0.width});
      var cssH = parseFloat(t.el.style.height), c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.max(1, Math.ceil(cssH * dpr));
      var task = pg.render({canvasContext: c.getContext('2d'), viewport: vp, transform: [1, 0, 0, 1, 0, -t.k * TILE * dpr]});
      await task.promise;
      t.rendered = want;
      var old = t.el.querySelector('canvas'); if(old) old.remove();
      t.el.appendChild(c);
    }catch(e){}
    t.busy = false;
  }
  function render(p){ mkTiles(p); }
  var tio = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting && e.target.__t) renderTile(e.target.__p, e.target.__t); }); }, {root: wrap, rootMargin: '900px 0px'});
  var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting) render(info[+e.target.dataset.p - 1]); }); }, {root: wrap, rootMargin: '600px 0px'});
  info.forEach(function(p){ io.observe(p.el); });
  function visibleRerender(){
    var r = wrap.getBoundingClientRect();
    info.forEach(function(p){
      var b = p.el.getBoundingClientRect();
      if(b.bottom > r.top - 900 && b.top < r.bottom + 900){
        mkTiles(p);
        p.tiles.forEach(function(t){ var tb = t.el.getBoundingClientRect(); if(tb.bottom > r.top - 900 && tb.top < r.bottom + 900) renderTile(p, t); else if(t.rendered){ var cv = t.el.querySelector('canvas'); if(cv) cv.remove(); t.rendered = 0; } });
      } else if(p.tiles){ p.tiles.forEach(function(t){ if(t.rendered){ var cv = t.el.querySelector('canvas'); if(cv) cv.remove(); t.rendered = 0; } }); }
    });
  }
  wrap.addEventListener('scroll', function(){ clearTimeout(visibleRerender.t); visibleRerender.t = setTimeout(visibleRerender, 250); }, {passive: true});
  function curPage(){ var r = wrap.getBoundingClientRect(), mid = r.top + r.height / 3; for(var i = 0; i < info.length; i++){ var b = info[i].el.getBoundingClientRect(); if(b.bottom > mid) return i + 1; } return n; }
  var bt = 0;
  wrap.addEventListener('scroll', function(){ badge.textContent = curPage() + ' / ' + n + (Z !== 1 ? '・' + Math.round(Z * 100) + '%' : ''); badge.style.opacity = 1; clearTimeout(bt); bt = setTimeout(function(){ badge.style.opacity = .55; }, 1200); }, {passive: true});
  badge.textContent = '1 / ' + n;
  $('vwSub').textContent = n + ' 頁・' + fmtSize(it.size) + '・' + fmtDate(it.time, true);
  /* 縮放：雙指（觸控）／ctrl+滾輪（電腦）／雙擊 */
  function setZoom(nz, cx, cy){
    nz = Math.max(.5, Math.min(5, nz));
    var r = wrap.getBoundingClientRect();
    var fx = (wrap.scrollLeft + (cx - r.left)) / Z, fy = (wrap.scrollTop + (cy - r.top)) / Z;
    Z = nz; layout();
    pages.style.width = Math.max(wrap.clientWidth, base * Z + 16) + 'px';
    wrap.scrollLeft = fx * Z - (cx - r.left); wrap.scrollTop = fy * Z - (cy - r.top);
    visibleRerender();
    badge.textContent = curPage() + ' / ' + n + '・' + Math.round(Z * 100) + '%';
  }
  var T = null;
  wrap.addEventListener('touchstart', function(e){
    if(e.touches.length === 2){ var a = e.touches[0], b = e.touches[1]; T = {d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: Z, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, f: 1}; e.preventDefault(); }
  }, {passive: false});
  wrap.addEventListener('touchmove', function(e){
    if(T && e.touches.length === 2){
      e.preventDefault();
      var a = e.touches[0], b = e.touches[1];
      T.f = Math.max(.5 / T.z, Math.min(5 / T.z, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / T.d));
      var r = wrap.getBoundingClientRect();
      pages.style.transformOrigin = (wrap.scrollLeft + T.cx - r.left) + 'px ' + (wrap.scrollTop + T.cy - r.top) + 'px';
      pages.style.transform = 'scale(' + T.f + ')';
    }
  }, {passive: false});
  wrap.addEventListener('touchend', function(e){
    if(T && e.touches.length < 2){ pages.style.transform = ''; var t = T; T = null; setZoom(t.z * t.f, t.cx, t.cy); }
  });
  var lastTap = 0;
  wrap.addEventListener('click', function(e){ var now = Date.now(); if(now - lastTap < 300){ setZoom(Z > 1.2 ? 1 : 2, e.clientX, e.clientY); lastTap = 0; } else lastTap = now; });
  wrap.addEventListener('wheel', function(e){ if(e.ctrlKey){ e.preventDefault(); setZoom(Z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY); } }, {passive: false});
  Viewer.cleanup = function(){ io.disconnect(); try{ doc.destroy(); }catch(e){} };
}

/* ---------- ZIP ---------- */
async function viewZip(it, body){
  var box = h('div', {style: {position: 'absolute', inset: 0, overflow: 'auto', padding: '12px'}});
  body.appendChild(box);
  box.appendChild(h('div', {class: 'ringBox'}, h('div', {class: 'spin'}), h('div', {class: 'sub', text: '讀取壓縮檔…'})));
  var z = await JSZip.loadAsync(await Lib.blob(it));
  var files = Object.keys(z.files).map(function(k){ return z.files[k]; }).filter(function(f){ return !f.dir; });
  box.textContent = '';
  var head = h('div', {class: 'card glass'}, h('div', {class: 'row'}, h('div', {class: 'grow'}, h('b', {text: files.length + ' 個檔案'}), h('div', {class: 'sub', text: fmtSize(it.size)})),
    h('button', {class: 'btn pri sm', html: icon('download', 'sm') + '全部解壓縮到檔案庫', onclick: async function(){
      this.disabled = true;
      for(var i = 0; i < files.length; i++){
        toast('解壓縮 ' + (i + 1) + '/' + files.length + '…');
        var b = await files[i].async('blob'), nm = files[i].name.split('/').pop();
        await Lib.addBlob(new Blob([b], {type: guessMime(nm)}), nm, {src: it.src, title: it.title});
      }
      toast('✓ 已解壓縮 ' + files.length + ' 個檔案');
    }})));
  box.appendChild(head);
  var list = h('div', {class: 'list zipList'});
  files.forEach(function(f){
    var nm = f.name.split('/').pop(), mime = guessMime(nm), cat = catOf(mime, nm), c = CAT[cat] || CAT.other;
    var th = h('div', {class: 'th', html: icon(c.ic), style: {background: c.c}});
    var row = h('div', {class: 'lrow', style: {cursor: 'pointer'}}, th, h('div', {class: 't'}, h('b', {text: nm}), h('div', {class: 'sub', text: c.name + (f._data && f._data.uncompressedSize ? '・' + fmtSize(f._data.uncompressedSize) : '')})));
    if(cat === 'image') f.async('blob').then(function(b){ th.style.backgroundImage = 'url("' + URL.createObjectURL(new Blob([b], {type: mime})) + '")'; th.innerHTML = ''; th.style.backgroundSize = 'cover'; });
    row.onclick = async function(){
      var b = new Blob([await f.async('blob')], {type: mime});
      if(cat === 'image' || cat === 'video' || cat === 'audio'){
        var u = URL.createObjectURL(b);
        var el = cat === 'image' ? h('img', {src: u, style: {maxWidth: '100%', borderRadius: '12px'}}) : h(cat, {src: u, controls: true, autoplay: true, style: {width: '100%'}});
        var d = dialog(esc(nm), '', [['關閉', null]]); d.el.insertBefore(el, d.el.querySelector('.acts'));
      } else toast('解壓縮到檔案庫後即可開啟');
    };
    list.appendChild(row);
  });
  box.appendChild(list);
  paintIcons(box);
}
function guessMime(n){
  var e = (n.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  return ({jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ts: 'video/mp2t', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', html: 'text/html', htm: 'text/html', pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain', json: 'application/json'})[e] || 'application/octet-stream';
}
async function viewOther(it, body){
  var textLike = /^text\/|json|xml|javascript|csv/.test(it.mime || '') || /\.(txt|md|json|csv|log|xml|css|js)$/i.test(it.name);
  if(textLike && it.size < 3 * 1048576){
    var t = await (await Lib.blob(it)).text();
    body.appendChild(h('div', {class: 'textView sel-text', text: t}));
    return;
  }
  body.appendChild(h('div', {class: 'empty', style: {paddingTop: '20vh'}, html: '<div class="big">' + icon('other', 'lg') + '</div><b>' + esc(it.name) + '</b><br><span class="sub">' + fmtSize(it.size) + '・這種檔案無法在 App 內預覽</span>'},
    h('div', {class: 'btn-row', style: {justifyContent: 'center'}}, isApp ? h('button', {class: 'btn pri', html: icon('open', 'sm') + '用其他 App 開啟', onclick: function(){ NAT.call('libExport', JSON.stringify([it.id]), 'open'); }}) : null,
      h('button', {class: 'btn', html: icon('share', 'sm') + '匯出', onclick: function(){ exportSheet([it]); }}))));
  paintIcons(body);
}
