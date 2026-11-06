/* ============================================================
   檔案庫：儲存（APK＝手機私有空間；網頁版＝瀏覽器 IndexedDB）、分類排序、空間統計、匯出
   ============================================================ */
function catOf(mime, name){
  var e = (String(name).match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase(); mime = mime || '';
  if(/text\/html/.test(mime) || /^(html?|mhtml)$/.test(e)) return 'html';
  if(mime === 'application/pdf' || e === 'pdf') return 'pdf';
  if(/^image\//.test(mime)) return 'image';
  if(/^video\//.test(mime) || e === 'ts') return 'video';
  if(/^audio\//.test(mime)) return 'audio';
  if(/zip/.test(mime) || e === 'zip') return 'zip';
  return 'other';
}
var IDB = {
  db: null,
  open: function(){
    if(this.db) return Promise.resolve(this.db);
    var self = this;
    return new Promise(function(res, rej){
      var q = indexedDB.open('websaver', 1);
      q.onupgradeneeded = function(){ q.result.createObjectStore('meta', {keyPath: 'id'}); q.result.createObjectStore('blob'); };
      q.onsuccess = function(){ self.db = q.result; res(self.db); };
      q.onerror = function(){ rej(q.error); };
    });
  },
  tx: function(stores, mode, fn){
    return this.open().then(function(db){
      return new Promise(function(res, rej){
        var t = db.transaction(stores, mode), out; out = fn(t);
        t.oncomplete = function(){ res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function(){ rej(t.error); }; t.onabort = function(){ rej(t.error || new Error('儲存空間不足')); };
      });
    });
  }
};
var Lib = {
  items: [], urls: {},
  refresh: async function(){
    try{
      if(isApp) this.items = NAT.json('libList') || [];
      else this.items = await IDB.tx(['meta'], 'readonly', function(t){ return t.objectStore('meta').getAll(); }) || [];
    }catch(e){ this.items = []; }
    fire('libChanged');
  },
  byId: function(id){ return this.items.filter(function(x){ return x.id === id; })[0]; },
  thumb: function(it){ return isApp ? (it.thumb ? 'file://' + it.thumb : '') : (it.thumbData || ''); },
  src: async function(it){
    if(isApp) return 'file://' + it.path;
    if(this.urls[it.id]) return this.urls[it.id];
    var b = await this.blob(it);
    return (this.urls[it.id] = URL.createObjectURL(b));
  },
  blob: async function(it){
    if(isApp) return await new Promise(function(res, rej){
      var x = new XMLHttpRequest(); x.open('GET', 'file://' + it.path); x.responseType = 'blob';
      x.onload = function(){ res(x.response && x.response.size ? new Blob([x.response], {type: it.mime || x.response.type}) : x.response); };
      x.onerror = function(){ rej(new Error('無法讀取檔案')); }; x.send();
    });
    var b = await IDB.tx(['blob'], 'readonly', function(t){ return t.objectStore('blob').get(it.id); });
    if(!b) throw new Error('找不到檔案內容');
    return b;
  },
  addBlob: async function(blob, name, meta){
    meta = meta || {};
    if(isApp){
      var r = NAT.json('libSave', name, blob.type || 'application/octet-stream', await blobToB64(blob), meta.src || '', meta.title || '');
      if(!r || !r.ok) throw new Error(r && r.err || '儲存失敗');
      await this.refresh(); return r.item;
    }
    var it = {id: uid(), name: String(name).replace(/[\\\/:*?"<>|]/g, '_'), mime: blob.type || 'application/octet-stream', size: blob.size, time: Date.now(), src: meta.src || '', title: meta.title || ''};
    it.cat = catOf(it.mime, it.name);
    try{ var th = meta.thumbBlob ? await makeThumb(meta.thumbBlob, {cat: 'image', mime: meta.thumbBlob.type}) : await makeThumb(blob, it); if(th && meta.thumbBlob){ delete th.w; delete th.h; } if(th){ it.thumbData = th.data; if(th.w){ it.w = th.w; it.h = th.h; } if(th.dur) it.dur = th.dur; if(th.pages) it.pages = th.pages; } }catch(e){}
    await IDB.tx(['meta', 'blob'], 'readwrite', function(t){ t.objectStore('blob').put(blob, it.id); t.objectStore('meta').put(it); });
    await this.refresh(); return it;
  },
  del: async function(ids){
    if(isApp) NAT.call('libDelete', JSON.stringify(ids));
    else { await IDB.tx(['meta', 'blob'], 'readwrite', function(t){ ids.forEach(function(id){ t.objectStore('meta').delete(id); t.objectStore('blob').delete(id); }); }); ids.forEach(function(id){ if(Lib.urls[id]){ URL.revokeObjectURL(Lib.urls[id]); delete Lib.urls[id]; } }); }
    await this.refresh();
  },
  rename: async function(it, name){
    if(isApp) NAT.call('libRename', it.id, name);
    else {
      var ext = (it.name.match(/\.[a-z0-9]+$/i) || [''])[0];
      it.name = name.replace(/[\\\/:*?"<>|]/g, '_'); if(ext && it.name.toLowerCase().slice(-ext.length) !== ext.toLowerCase()) it.name += ext;
      await IDB.tx(['meta'], 'readwrite', function(t){ t.objectStore('meta').put(it); });
    }
    await this.refresh();
  },
  stats: async function(){
    if(isApp) return NAT.json('libStats') || {};
    var s = {count: this.items.length, bytes: 0, by: {}};
    this.items.forEach(function(it){ s.bytes += it.size || 0; var b = s.by[it.cat] = s.by[it.cat] || {n: 0, bytes: 0}; b.n++; b.bytes += it.size || 0; });
    try{ var e = await navigator.storage.estimate(); s.quota = e.quota; s.usage = e.usage; }catch(x){}
    return s;
  }
};
on('lib', function(){ Lib.refresh(); });
async function makeThumb(blob, it){
  function canvasOf(src, w, h){ var s = Math.min(1, 360 / Math.max(1, Math.min(w, h * 1.5))); var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s)); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c; }
  if(it.cat === 'image' && !/svg/.test(it.mime)){
    var bmp = await createImageBitmap(blob);
    return {data: canvasOf(bmp, bmp.width, bmp.height).toDataURL('image/jpeg', .75), w: bmp.width, h: bmp.height};
  }
  if(it.cat === 'video'){
    return await new Promise(function(res){
      var v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(blob);
      var done = function(r){ URL.revokeObjectURL(v.src); res(r); };
      v.onloadedmetadata = function(){ v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = function(){ try{ done({data: canvasOf(v, v.videoWidth, v.videoHeight).toDataURL('image/jpeg', .72), w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration)}); }catch(e){ done(null); } };
      v.onerror = function(){ done(null); }; setTimeout(function(){ done(null); }, 6000);
    });
  }
  if(it.cat === 'pdf' && window.pdfjsLib){
    var doc = await pdfjsLib.getDocument({data: new Uint8Array(await blob.arrayBuffer())}).promise;
    var p = await doc.getPage(1), vp = p.getViewport({scale: 1}), sc = 360 / vp.width, v2 = p.getViewport({scale: sc});
    var c = document.createElement('canvas'); c.width = v2.width; c.height = v2.height;
    await p.render({canvasContext: c.getContext('2d'), viewport: v2}).promise;
    return {data: c.toDataURL('image/jpeg', .75), pages: doc.numPages};
  }
  return null;
}

/* ---------- 檔案庫畫面 ---------- */
var LV = {sel: new Set(), selMode: false, q: '', folder: lsGet('ws.lvFolder', {})};
function libVisible(){
  var c = CFG.lib, q = LV.q.toLowerCase();
  var L = Lib.items.filter(function(it){ return (c.cat === 'all' || it.cat === c.cat) && (!q || (it.name + ' ' + (it.title || '') + ' ' + (it.src || '')).toLowerCase().indexOf(q) >= 0); });
  var k = c.sort, d = c.dir === 'asc' ? 1 : -1;
  L.sort(function(a, b){
    if(k === 'name') return d * String(a.name).localeCompare(String(b.name), 'zh-Hant', {numeric: true});
    if(k === 'size') return d * ((a.size || 0) - (b.size || 0));
    return d * ((a.time || 0) - (b.time || 0));
  });
  return L;
}
async function renderStor(){
  var s = await Lib.stats(), card = $('storCard'); card.textContent = '';
  var total = s.bytes || 0, R = 38, C = 2 * Math.PI * R, off = 0;
  var segs = '';
  Object.keys(CAT).forEach(function(k){
    var b = s.by && s.by[k]; if(!b || !b.bytes || !total) return;
    var len = C * b.bytes / total;
    segs += '<circle cx="46" cy="46" r="' + R + '" fill="none" stroke="' + CAT[k].c + '" stroke-width="11" stroke-dasharray="' + Math.max(0.01, len - 1.2) + ' ' + C + '" stroke-dashoffset="' + (-off) + '"/>';
    off += len;
  });
  var donut = h('div', {class: 'donut', html: '<svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="' + R + '" fill="none" stroke="var(--surface-2)" stroke-width="11"/>' + segs + '</svg>' +
    '<b><span>' + (s.count || 0) + '</span>個檔案</b>'});
  var leg = h('div', {class: 'legend'});
  Object.keys(CAT).forEach(function(k){ var b = s.by && s.by[k]; if(b && b.n) leg.appendChild(h('div', {html: '<i style="background:' + CAT[k].c + '"></i>' + CAT[k].name + ' ' + b.n + '・' + fmtSize(b.bytes)})); });
  if(!leg.children.length) leg.appendChild(h('div', {class: 'sub', text: '還沒有檔案'}));
  card.appendChild(h('div', {class: 'row', style: {justifyContent: 'space-between', marginBottom: '8px'}}, h('h3', {html: icon('storage') + '儲存空間', style: {margin: 0}}), h('span', {class: 'badge', text: '本 App 佔用 ' + fmtSize(total + (s.thumbs || 0))})));
  card.appendChild(h('div', {class: 'stor'}, donut, leg));
  var used, all, label;
  if(isApp && s.total){ used = s.total - s.free; all = s.total; label = '手機剩餘 <b>' + fmtSize(s.free) + '</b>・共 ' + fmtSize(s.total); }
  else if(s.quota){ used = s.usage; all = s.quota; label = '瀏覽器可用空間 <b>' + fmtSize(Math.max(0, s.quota - s.usage)) + '</b>・已用 ' + fmtSize(s.usage); }
  if(all){
    var appPct = Math.max(0.5, 100 * (total / all));
    card.appendChild(h('div', {class: 'devbar'},
      h('div', {class: 'prog', html: '<i style="width:' + (100 * used / all).toFixed(1) + '%"></i>'}),
      h('div', {class: 'row'}, h('span', {html: label}), h('span', {text: '本 App ' + (total / all * 100 < 0.1 ? '<0.1' : (total / all * 100).toFixed(1)) + '%'}))));
  }
  var mus = musicItems();
  card.appendChild(h('div', {class: 'setRow', style: {borderTop: '1px solid var(--border-soft)', marginTop: '10px'}, onclick: function(){ setCfg('lib.cat', 'audio'); LV.folder.audio = ''; renderLib(); }},
    h('span', {class: 'ic', html: icon('audio'), style: {background: 'color-mix(in srgb,var(--c-audio) 18%,var(--surface-3))', color: 'var(--c-audio)'}}),
    h('div', {class: 'grow'}, h('b', {text: '音樂庫'}), h('div', {class: 'sub', text: mus.length ? mus.length + ' 首・點這裡瀏覽與播放' : '從 YouTube 或網頁下載的音樂會放在這裡'})),
    mus.length ? h('button', {class: 'btn pri sm', html: '<svg class="i sm fill" viewBox="0 0 24 24">' + IC.play + '</svg>全部播放', onclick: function(e){ e.stopPropagation(); Music.playList(mus, 0); Music.openPlayer(); }}) : h('span', {class: 'chev', text: '›'})));
  if(isApp && s.cache > 20 * 1048576) card.appendChild(h('div', {class: 'note', html: '瀏覽器快取 ' + fmtSize(s.cache) + '・<a href="#" id="clrCache">清除</a>'}));
  var cc = $('clrCache'); if(cc) cc.onclick = function(e){ e.preventDefault(); NAT.call('clearData', 'cache'); setTimeout(renderStor, 600); };
  paintIcons(card);
}
function renderCats(){
  var bar = $('catBar'); bar.textContent = '';
  var cnt = {all: Lib.items.length};
  Lib.items.forEach(function(it){ cnt[it.cat] = (cnt[it.cat] || 0) + 1; });
  [['all', '全部', 'layers']].concat(Object.keys(CAT).map(function(k){ return [k, CAT[k].name, CAT[k].ic]; })).forEach(function(c){
    if(c[0] !== 'all' && !cnt[c[0]]) return;
    bar.appendChild(h('button', {class: 'fchip' + (CFG.lib.cat === c[0] ? ' on' : ''), html: icon(c[2], 'sm') + (c[0] === 'audio' ? '音樂庫' : c[1]) + ' <span class="c">' + (cnt[c[0]] || 0) + '</span>', onclick: function(){ setCfg('lib.cat', c[0]); renderLibList(); renderCats(); }}));
  });
  if(CFG.lib.cat !== 'all' && !cnt[CFG.lib.cat]){ CFG.lib.cat = 'all'; saveCfg(); }
}
function thumbEl(it, cls){
  var c = CAT[it.cat] || CAT.other, t = Lib.thumb(it);
  var el = h('div', {class: cls || 'th'});
  if(t){ el.style.backgroundImage = 'url("' + t + '")'; }
  else { el.style.background = 'linear-gradient(140deg,color-mix(in srgb,' + c.c + ' 22%,var(--surface-2)),var(--surface-2))'; el.style.color = c.c; el.innerHTML = '<span class="big">' + icon(c.ic, 'lg') + '</span>'; }
  return el;
}
function renderLibList(){
  var box = $('libList'); box.textContent = '';
  var cat = CFG.lib.cat, inFolders = cat !== 'all' && !LV.q;
  var cur = inFolders ? (LV.folder[cat] || '') : '';
  if(cur && !LF.get(cur)){ cur = ''; LV.folder[cat] = ''; }
  lsSet('ws.lvFolder', LV.folder);
  var L = libVisible();
  if(cat === 'audio') renderMusicHead(box, inFolders ? L.filter(function(it){ return LF.descendants(cur || '__none').indexOf(LF.folderOf(it.id)) >= 0 || (!cur); }) : L);
  if(inFolders) L = L.filter(function(it){ return LF.folderOf(it.id) === cur; });
  $('libScroll').classList.toggle('selMode', LV.selMode);
  if(inFolders){
    var redraw = function(){ renderLibList(); };
    var crumbs = h('div', {class: 'crumbs'});
    crumbs.appendChild(h('button', {class: 'crumb' + (cur ? '' : ' on'), html: icon((CAT[cat] || CAT.other).ic, 'sm') + (cat === 'audio' ? '音樂庫' : (CAT[cat] || CAT.other).name), onclick: function(){ LV.folder[cat] = ''; redraw(); }}));
    LF.path(cur).forEach(function(f, i, arr){
      crumbs.appendChild(h('span', {class: 'sep', text: '›'}));
      crumbs.appendChild(h('button', {class: 'crumb' + (i === arr.length - 1 ? ' on' : ''), text: f.icon + ' ' + f.name, onclick: function(){ LV.folder[cat] = f.id; redraw(); }}));
    });
    var bar = h('div', {class: 'folderHead'}, crumbs,
      h('button', {class: 'ib', title: '資料夾排序', html: icon('sort'), onclick: function(){
        menu('資料夾排序', [['sort', '依名稱' + ((CFG.lib.fsort || 'manual') === 'name' ? '　✓' : ''), function(){ setCfg('lib.fsort', 'name'); redraw(); }],
          ['edit', '自訂順序' + ((CFG.lib.fsort || 'manual') === 'manual' ? '　✓' : ''), function(){ setCfg('lib.fsort', 'manual'); redraw(); }, false, '在資料夾的 ⋯ 選「往前排／往後排」']]);
      }}),
      h('button', {class: 'btn sm', html: icon('plus', 'sm') + '資料夾', onclick: async function(){ var n = await promptDlg('新增資料夾', '', '例如：工作、旅遊、2026'); if(n){ LF.add(cat, cur, n); redraw(); } }}));
    box.appendChild(bar);
    var subs = LF.children(cat, cur);
    if(subs.length){
      var fg = h('div', {class: 'fgrid'});
      subs.forEach(function(f){
        var n = LF.count(f.id), press = 0;
        var el = h('div', {class: 'ftile'}, h('span', {class: 'fi', text: f.icon || '📁'}), h('div', {class: 't'}, h('b', {text: f.name}), h('div', {class: 'sub', text: n + ' 個檔案' + (LF.children(cat, f.id).length ? '・' + LF.children(cat, f.id).length + ' 個資料夾' : '')})),
          h('button', {class: 'ib', html: icon('more'), onclick: function(e){ e.stopPropagation(); folderMenu(f, redraw); }}));
        el.addEventListener('pointerdown', function(){ press = setTimeout(function(){ press = -1; folderMenu(f, redraw); }, 500); });
        el.addEventListener('pointerup', function(){ if(press === -1){ press = 0; return; } clearTimeout(press); press = 0; });
        el.addEventListener('pointercancel', function(){ clearTimeout(press); press = 0; });
        el.addEventListener('click', function(){ if(LV.selMode && LV.sel.size){ var ids = Array.from(LV.sel); LF.setItems(ids, f.id); LV.sel.clear(); LV.selMode = false; toast('已移到「' + f.name + '」'); renderLib(); return; } LV.folder[cat] = f.id; redraw(); });
        fg.appendChild(el);
      });
      box.appendChild(fg);
    }
    if(!L.length){
      box.appendChild(h('div', {class: 'empty', html: Lib.items.length ? (subs.length ? '' : '<div class="big">📂</div>這裡還沒有檔案<br><span class="sub">在檔案上長按→選取→按「移到資料夾」，就能整理到這裡</span>') : '<div class="big">📂</div>檔案庫還是空的'}));
      paintIcons(box);
      return;
    }
  } else if(!L.length){
    box.appendChild(h('div', {class: 'empty', html: Lib.items.length ? '<div class="big">🔍</div>沒有符合的檔案' :
      '<div class="big">📂</div>檔案庫還是空的<br><span class="sub">到「瀏覽」開啟網頁，按「擷取」存成離線 HTML／PDF，<br>或按「媒體」下載圖片與影片</span>'}));
    return;
  }
  var grid = CFG.lib.view === 'grid' && cat !== 'audio';
  var wrap = h('div', {class: grid ? 'grid' : 'list'});
  var frag = document.createDocumentFragment();
  L.forEach(function(it){
    var c = CAT[it.cat] || CAT.other;
    var on = LV.sel.has(it.id);
    var el;
    var sub = fmtSize(it.size) + '・' + fmtDate(it.time);
    if(grid){
      var th = thumbEl(it);
      th.insertAdjacentHTML('beforeend', '<span class="tag" style="background:' + c.c + '">' + (it.cat === 'other' || it.cat === 'zip' ? (it.name.split('.').pop() || c.name).toUpperCase() : c.name) + '</span>' +
        (it.dur ? '<span class="dur">' + fmtDur(it.dur) + '</span>' : '') + (it.cat === 'video' ? '<span class="play">' + icon('play', 'sm fill') + '</span>' : '') + (it.pages ? '<span class="dur">' + it.pages + ' 頁</span>' : ''));
      el = h('div', {class: 'fcard' + (on ? ' on' : '')}, th, h('div', {class: 'inf'}, h('b', {text: it.title && it.cat === 'html' ? it.title : it.name}), h('div', {class: 'sub', html: '<span>' + fmtSize(it.size) + '</span><span>' + fmtDate(it.time) + '</span>'})),
        h('span', {class: 'ck', html: icon('check')}));
    } else {
      el = h('div', {class: 'lrow' + (on ? ' on' : '') + (Music.cur() && Music.cur().id === it.id ? ' playing' : '')}, thumbEl(it), h('div', {class: 't'}, h('b', {text: it.cat === 'audio' ? songTitle(it) : it.name}),
          h('div', {class: 'sub', text: it.cat === 'audio' ? [it.artist, (it.name.split('.').pop() || '').toUpperCase(), it.dur ? fmtDur(it.dur) : '', fmtSize(it.size)].filter(Boolean).join('・') : c.name + '・' + sub + (it.src ? '・' + hostOf(it.src) : '')})),
        h('span', {class: 'ck', html: icon('check')}));
    }
    var press = 0, moved = false, sx = 0, sy = 0;
    el.addEventListener('pointerdown', function(e){ moved = false; sx = e.clientX; sy = e.clientY; press = setTimeout(function(){ press = -1; if(!LV.selMode){ LV.selMode = true; } LV.sel.add(it.id); if(navigator.vibrate) navigator.vibrate(12); renderLib(); }, 480); });
    el.addEventListener('pointermove', function(e){ if(Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10){ moved = true; clearTimeout(press); } });
    el.addEventListener('pointerup', function(){
      if(press === -1 || moved){ press = 0; return; }
      clearTimeout(press); press = 0;
      if(LV.selMode){ if(LV.sel.has(it.id)) LV.sel.delete(it.id); else LV.sel.add(it.id); el.classList.toggle('on'); renderSelBar(); }
      else if(it.cat === 'audio') Music.playItem(it);
      else Viewer.open(it, L);
    });
    el.addEventListener('pointercancel', function(){ clearTimeout(press); press = 0; });
    el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    frag.appendChild(el);
  });
  wrap.appendChild(frag);
  box.appendChild(wrap);
}
function renderSelBar(){
  var bar = $('selBar');
  $('libTools').classList.toggle('hide', LV.selMode);
  bar.classList.toggle('hide', !LV.selMode);
  if(!LV.selMode) return;
  bar.textContent = '';
  var n = LV.sel.size, picked = Lib.items.filter(function(it){ return LV.sel.has(it.id); });
  var allHtml = picked.length && picked.every(function(it){ return it.cat === 'html'; });
  bar.appendChild(h('button', {class: 'ib', html: icon('x'), onclick: function(){ LV.selMode = false; LV.sel.clear(); renderLib(); }}));
  bar.appendChild(h('b', {text: n ? '已選 ' + n + ' 個' : '點選檔案'}));
  bar.appendChild(h('button', {class: 'ib', html: icon('checks'), title: '全選', onclick: function(){ var L = libVisible(); var all = L.every(function(it){ return LV.sel.has(it.id); }); L.forEach(function(it){ if(all) LV.sel.delete(it.id); else LV.sel.add(it.id); }); renderLib(); }}));
  if(allHtml && isApp) bar.appendChild(h('button', {class: 'ib', html: icon('pdf'), title: '轉成 PDF', onclick: function(){ picked.forEach(function(it){ toPdf(it); }); }}));
  var cats = {}; picked.forEach(function(it){ cats[it.cat] = 1; });
  var oneCat = Object.keys(cats).length === 1 ? Object.keys(cats)[0] : '';
  bar.appendChild(h('button', {class: 'ib', html: icon('folder'), title: '移到資料夾', disabled: !n, onclick: function(){
    if(!oneCat){ toast('資料夾是依種類分開的，請只選同一種類的檔案', true); return; }
    folderPicker(oneCat, '移到資料夾', function(fid){ LF.setItems(picked.map(function(x){ return x.id; }), fid); LV.sel.clear(); LV.selMode = false; toast('已移動'); renderLib(); }, {cur: LV.folder[oneCat] || ''});
  }}));
  bar.appendChild(h('button', {class: 'ib', html: icon('edit'), title: '重新命名', disabled: !n, onclick: function(){ renameItems(picked); }}));
  bar.appendChild(h('button', {class: 'ib', html: icon('share'), title: '匯出', disabled: !n, onclick: function(){ exportSheet(picked); }}));
  bar.appendChild(h('button', {class: 'ib', html: icon('trash'), title: '刪除', disabled: !n, style: {color: 'var(--danger)'}, onclick: async function(){
    if(!(await confirmDlg('刪除 ' + n + ' 個檔案？', '共 ' + fmtSize(picked.reduce(function(s, x){ return s + (x.size || 0); }, 0)) + '，刪除後無法復原。', '刪除', true))) return;
    await Lib.del(Array.from(LV.sel)); LV.sel.clear(); LV.selMode = false; toast('已刪除');
  }}));
}
function renderLib(){ renderCats(); renderSelBar(); renderLibList(); paintIcons($('v-lib')); }
on('libChanged', function(){ if(curView === 'lib'){ renderLib(); renderStor(); } if(BR.home) renderStart(); });
on('view', function(e){ if(e.v === 'lib'){ Lib.refresh(); } });
$('libQ').addEventListener('input', function(){ LV.q = this.value.trim(); renderLibList(); });
$('bView').addEventListener('click', function(){ setCfg('lib.view', CFG.lib.view === 'grid' ? 'list' : 'grid'); this.innerHTML = icon(CFG.lib.view === 'grid' ? 'list' : 'grid'); renderLibList(); });
$('bSel').addEventListener('click', function(){ LV.selMode = true; renderLib(); });
$('bSort').addEventListener('click', function(){
  var c = CFG.lib;
  var mk = function(k, label){ return ['sort', label + (c.sort === k ? '　✓' : ''), function(){ setCfg('lib.sort', k); renderLibList(); }]; };
  menu('排序方式', [mk('time', '依下載時間'), mk('name', '依檔名'), mk('size', '依檔案大小'),
    ['undo', c.dir === 'desc' ? '目前：由新到舊／大到小／Z→A（點此反轉）' : '目前：由舊到新／小到大／A→Z（點此反轉）', function(){ setCfg('lib.dir', c.dir === 'desc' ? 'asc' : 'desc'); renderLibList(); }]]);
});

/* ---------- 匯出 ---------- */
function exportSheet(items){
  if(!items || !items.length) return;
  var ids = JSON.stringify(items.map(function(x){ return x.id; }));
  var total = items.reduce(function(s, x){ return s + (x.size || 0); }, 0);
  var list = h('div', {class: 'opts'});
  var sh = openSheet({title: '匯出 ' + items.length + ' 個檔案（' + fmtSize(total) + '）', icon: 'share', body: h('div', null, h('div', {class: 'sub', style: {marginBottom: '10px'}, text: '以原本的格式與檔案大小輸出，不會重新壓縮。'}), list)});
  function opt(ic, t, sub, fn){ list.appendChild(h('div', {class: 'opt', onclick: function(){ sh.close(); setTimeout(fn, 80); }}, h('span', {class: 'oi', html: icon(ic)}), h('div', {class: 'grow'}, h('b', {text: t}), h('div', {class: 'sub', html: sub})), h('span', {class: 'chev', text: '›', style: {color: 'var(--text-muted)', fontSize: '22px'}}))); }
  if(isApp){
    opt('inbox', '存到手機「下載」資料夾', '位置：下載/網頁擷取。用 USB 連接電腦時，在「內部儲存空間/Download/網頁擷取」就找得到', function(){ NAT.call('libExport', ids, 'downloads'); });
    var tn = NAT.call('treeName');
    opt('folder', '存到指定資料夾…', tn ? '目前：' + esc(tn) + '（可存到 SD 卡、USB 隨身碟、雲端硬碟資料夾）' : '自己選位置：SD 卡、USB 隨身碟、雲端硬碟…', function(){ NAT.call('libExport', ids, 'tree'); });
    if(tn) opt('edit', '換一個資料夾再存', '重新選擇要存放的位置', function(){ NAT.call('libExport', ids, 'pickTree'); });
    opt('share', '分享／傳送', 'LINE、Gmail、Google 雲端硬碟、Quick Share（傳到電腦或其他手機）…', function(){ NAT.call('libExport', ids, 'share'); });
    opt('wifi', 'Wi-Fi 傳到電腦', '電腦連同一個 Wi-Fi，用瀏覽器打開網址就能下載', openWifi);
    if(items.length === 1) opt('open', '用其他 App 開啟', '例如用 Chrome 開 HTML、用相簿開圖片', function(){ NAT.call('libExport', ids, 'open'); });
    if(items.length > 1) opt('zip', '打包成 ZIP（存回檔案庫）', '合併成一個壓縮檔，再用上面的方式匯出', function(){ zipItems(items); });
  } else {
    opt('download', items.length > 1 ? '下載到這台裝置（逐一下載）' : '下載到這台裝置', '存到瀏覽器的下載資料夾', async function(){ for(var i = 0; i < items.length; i++){ downloadBlob(await Lib.blob(items[i]), items[i].name); await sleep(350); } });
    if(items.length > 1) opt('zip', '打包成 ZIP 下載', '一次下載全部', async function(){ toast('打包中…'); var z = new JSZip(); for(var i = 0; i < items.length; i++) z.file(items[i].name, await Lib.blob(items[i])); downloadBlob(await z.generateAsync({type: 'blob'}), '網頁擷取_' + items.length + '個檔案.zip'); });
    if(navigator.canShare) opt('share', '分享', '透過系統分享傳送檔案', async function(){
      try{ var fs = []; for(var i = 0; i < items.length; i++){ var b = await Lib.blob(items[i]); fs.push(new File([b], items[i].name, {type: b.type})); } await navigator.share({files: fs}); }catch(e){ if(e.name !== 'AbortError') toast('這個瀏覽器無法分享檔案', true); }
    });
  }
}
on('export', function(d){
  if(d.ok && !d.fail) toast('✓ 已存 ' + d.ok + ' 個檔案到「' + d.where + '」');
  else if(d.ok) toast('已存 ' + d.ok + ' 個，' + d.fail + ' 個失敗：' + d.err, true);
  else toast('匯出失敗：' + (d.err || '未知錯誤'), true);
});
async function zipItems(items){
  if(isApp && NAT.has('libZip')){ NAT.call('libZip', JSON.stringify(items.map(function(x){ return x.id; })), '網頁擷取_' + items.length + '個檔案'); toast('打包中…'); return; }
  toast('打包中…');
  var z = new JSZip(); for(var i = 0; i < items.length; i++) z.file(items[i].name, await Lib.blob(items[i]));
  await Lib.addBlob(await z.generateAsync({type: 'blob', compression: 'STORE'}), '網頁擷取_' + items.length + '個檔案.zip', {});
  toast('✓ 已打包成 ZIP');
}
function openWifi(){
  var body = h('div');
  var s = openSheet({title: 'Wi-Fi 傳到電腦', icon: 'wifi', body: body});
  function draw(){
    body.textContent = '';
    var on = NAT.call('wifiOn');
    var r = NAT.json('wifiStart');
    if(!r || r.ok === false){ body.appendChild(h('div', {class: 'note err', text: '無法啟動：' + (r && r.err || '請確認手機已連上 Wi-Fi')})); return; }
    body.appendChild(h('div', {class: 'sub', html: '① 電腦和手機連到<b>同一個 Wi-Fi</b><br>② 在電腦的瀏覽器網址列輸入：'}));
    body.appendChild(h('div', {class: 'wifiUrl', text: r.url}));
    body.appendChild(h('div', {class: 'btn-row'}, h('button', {class: 'btn', html: icon('copy', 'sm') + '複製網址', onclick: function(){ copyText(r.url); }}),
      h('button', {class: 'btn dang', html: icon('x', 'sm') + '停止分享', onclick: function(){ NAT.call('wifiStop'); s.close(); toast('已停止 Wi-Fi 傳輸'); }})));
    body.appendChild(h('div', {class: 'note', html: '③ 網頁會列出檔案庫裡的所有檔案，按「下載」取得原始檔案，或「全部打包下載」。<br>網址裡的通行碼 <b>' + esc(r.key) + '</b> 可防止同網路的其他人讀取。離開 App 或按「停止分享」就會關閉。'}));
    paintIcons(body);
  }
  draw();
}

/* 重新命名：一個檔案直接改名；多個檔案用「名稱＋流水號」批次改名（依目前排序） */
async function renameItems(picked){
  if(!picked.length) return;
  if(picked.length === 1){
    var it = picked[0];
    var n = await promptDlg('重新命名', it.name.replace(/\.[a-z0-9]+$/i, ''));
    if(n){ await Lib.rename(it, n); LV.sel.clear(); LV.selMode = false; renderLib(); toast('已重新命名'); }
    return;
  }
  var order = libVisible().filter(function(x){ return picked.indexOf(x) >= 0; });
  var base = h('input', {type: 'text', value: (order[0].title || order[0].name).replace(/\.[a-z0-9]+$/i, '').replace(/[_\s-]*\d+$/, '').slice(0, 60)});
  var start = h('input', {type: 'number', value: 1, min: 0, style: {width: '90px'}});
  var pad = h('select', null, h('option', {value: '2'}, '01'), h('option', {value: '3', selected: true}, '001'), h('option', {value: '4'}, '0001'), h('option', {value: '0'}, '1'));
  var sep = h('select', null, h('option', {value: '_', selected: true}, '名稱_001'), h('option', {value: ' '}, '名稱 001'), h('option', {value: '-'}, '名稱-001'), h('option', {value: ''}, '名稱001'));
  var prev = h('div', {class: 'sub', style: {margin: '8px 2px', lineHeight: '1.7'}});
  function nameOf(i){ var k = String((+start.value || 0) + i), w = +pad.value; while(k.length < w) k = '0' + k; return (base.value.trim() || '檔案') + sep.value + k; }
  function upd(){ prev.innerHTML = order.slice(0, 3).map(function(it, i){ return esc(it.name) + ' → <b>' + esc(nameOf(i)) + (it.name.match(/\.[a-z0-9]+$/i) || [''])[0] + '</b>'; }).join('<br>') + (order.length > 3 ? '<br>…共 ' + order.length + ' 個' : ''); }
  [base, start, pad, sep].forEach(function(x){ x.oninput = x.onchange = upd; });
  var body = h('div', null, h('div', {class: 'field'}, h('div', {class: 'lbl'}, '新名稱'), base),
    h('div', {class: 'two'}, h('div', {class: 'field'}, h('div', {class: 'lbl'}, '起始號碼'), start), h('div', {class: 'field'}, h('div', {class: 'lbl'}, '位數'), pad)),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '格式'), sep), prev);
  var go = h('button', {class: 'btn pri', html: icon('edit', 'sm') + '全部重新命名'});
  var s = openSheet({title: '批次重新命名（' + order.length + ' 個）', icon: 'edit', body: body, foot: go});
  go.onclick = async function(){
    go.disabled = true;
    for(var i = 0; i < order.length; i++){ if(isApp) NAT.call('libRename', order[i].id, nameOf(i)); else await Lib.rename(order[i], nameOf(i)); }
    await Lib.refresh(); LV.sel.clear(); LV.selMode = false; s.close(); renderLib(); toast('已重新命名 ' + order.length + ' 個檔案');
  };
  upd();
}
