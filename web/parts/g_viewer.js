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
  var c = CAT[it.cat] || CAT.other;
  var dark = it.cat === 'image' || it.cat === 'video';
  V.classList.toggle('dark', dark);
  V.classList.add('on');
  this.kind = it.cat;
  $('vwTitle').textContent = it.title && it.cat === 'html' ? it.title : it.name;
  $('vwSub').textContent = c.name + '・' + fmtSize(it.size) + '・' + fmtDate(it.time, true) + (it.w ? '・' + it.w + '×' + it.h : '') + (it.src ? '・' + hostOf(it.src) : '');
  updateBrVisible();
  try{
    if(it.cat === 'html') await viewHtml(it, body);
    else if(it.cat === 'image') viewImages(it, body);
    else if(it.cat === 'video') await viewVideo(it, body);
    else if(it.cat === 'audio') await viewAudio(it, body);
    else if(it.cat === 'pdf') await viewPdf(it, body);
    else if(it.cat === 'zip') await viewZip(it, body);
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
$('vwShare').addEventListener('click', function(){ if(Viewer.cur) exportSheet([Viewer.cur]); });
$('vwMore').addEventListener('click', function(){
  var it = Viewer.cur; if(!it) return;
  menu(it.name, [
    it.cat === 'html' ? ['pdf', isApp ? '轉成 PDF（存入檔案庫）' : '列印／另存為 PDF', function(){ toPdf(it); }] : null,
    it.cat === 'html' && isApp ? ['image', '轉成無縫圖片 PDF（長條漫畫）', function(){ CAPTURING = true; capCard(1, '整理網頁裡的圖片…'); NAT.call('libComic', it.id, '{}'); }, false, '只留內容圖片，上下無縫接起來，去掉按鈕與選單'] : null,
    it.cat === 'html' && isApp ? ['printer', '系統列印（可存成文字可選取的 PDF）', function(){ NAT.call('libPrint', it.id); }] : null,
    it.cat === 'pdf' ? ['layers', (pdfSeamless(it) ? '✓ ' : '') + '頁面無縫顯示（漫畫）', function(){ lsSet('ws.seam:' + it.id, !pdfSeamless(it)); Viewer.open(it, Viewer.list); }] : null,
    it.src ? ['globe', '開啟原網頁', function(){ Viewer.close(); navigate(it.src); }] : null,
    ['edit', '重新命名', async function(){ var n = await promptDlg('重新命名', it.name.replace(/\.[a-z0-9]+$/i, '')); if(n){ await Lib.rename(it, n); var nw = Lib.byId(it.id); if(nw){ Viewer.cur = nw; $('vwTitle').textContent = nw.name; } toast('已重新命名'); } }],
    ['info', '檔案資訊', function(){ fileInfo(it); }],
    ['trash', '刪除', async function(){ if(await confirmDlg('刪除這個檔案？', esc(it.name), '刪除', true)){ await Lib.del([it.id]); Viewer.close(); toast('已刪除'); } }, true]
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
  Dock.set('pdf_' + it.id, h('div', {class: 'dockCard glass'}, h('div', {class: 'spin'}), h('div', {class: 't'}, h('b', {text: '轉成 PDF 中…'}), h('div', {class: 'sub', text: it.name}))));
  NAT.call('libToPdf', it.id, JSON.stringify({paper: CFG.cap.paper, landscape: !!CFG.cap.landscape, margin: +CFG.cap.margin || 0}));
  on('pdf', function once(d){
    Dock.remove('pdf_' + it.id);
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
async function viewVideo(it, body){
  var v = h('video', {controls: true, autoplay: true, playsinline: true, preload: 'auto'});
  v.src = await Lib.src(it);
  body.appendChild(h('div', {class: 'vwVideo'}, v));
  var pos = lsGet('ws.vpos', {});
  v.addEventListener('loadedmetadata', function(){ if(pos[it.id] && pos[it.id] < v.duration - 5) v.currentTime = pos[it.id]; });
  Viewer.cleanup = function(){ try{ pos = lsGet('ws.vpos', {}); pos[it.id] = v.currentTime; lsSet('ws.vpos', pos); v.pause(); v.removeAttribute('src'); v.load(); }catch(e){} };
}
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
