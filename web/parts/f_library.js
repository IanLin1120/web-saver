/* ============================================================
   檔案庫：儲存（APK＝手機私有空間；網頁版＝瀏覽器 IndexedDB）、分類排序、空間統計、匯出
   ============================================================ */
/* ---------- 檔案庫的「分類」：內建（網頁、PDF、圖片、影片、音樂、字幕、Word、Excel、文字檔、壓縮檔、其他）＋自己建立的；
   每個檔案可以移到任何分類，分類的名稱與圖示都能改 ---------- */
var AREA = lsGet('ws.area', null) || {custom: [], over: {}, map: {}};
AREA.order = AREA.order || [];
AREA.save = function(){ lsSet('ws.area', {custom: AREA.custom, over: AREA.over, map: AREA.map, order: AREA.order}); };
var CAT_BASE = JSON.parse(JSON.stringify(CAT));
function areaApply(){
  Object.keys(CAT).forEach(function(k){ if(!CAT_BASE[k]) delete CAT[k]; });
  Object.keys(CAT_BASE).forEach(function(k){ CAT[k] = Object.assign({}, CAT_BASE[k], AREA.over[k] || {}); });
  AREA.custom.forEach(function(a){ CAT[a.k] = Object.assign({ic: 'folder', c: a.c || '#8a6d4f'}, a, AREA.over[a.k] || {}); });
  /* 自訂排序（管理分類裡長按拖動） */
  if(AREA.order && AREA.order.length){
    var keys = Object.keys(CAT), tmp = {};
    keys.forEach(function(k){ tmp[k] = CAT[k]; delete CAT[k]; });
    AREA.order.filter(function(k){ return tmp[k]; }).concat(keys.filter(function(k){ return AREA.order.indexOf(k) < 0; })).forEach(function(k){ CAT[k] = tmp[k]; });
  }
}
areaApply();
function autoArea(it){
  var e = (String(it.name || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  /* 自訂分類設定了「自動收進來的副檔名」：優先於內建的分法 */
  if(e) for(var i = 0; i < AREA.custom.length; i++){ var x = AREA.custom[i]; if(x.ext && x.ext.indexOf(e) >= 0 && CAT[x.k]) return x.k; }
  if(/^(apk|xapk|apks|apkm)$/.test(e)) return 'apk';
  if(/^(exe|msi)$/.test(e)) return 'exe';
  if(/^(srt|vtt|ass|ssa|sub|lrc)$/.test(e)) return 'sub';
  if(/^(docx?|odt|rtf|pages)$/.test(e)) return 'word';
  if(/^(xlsx?|xlsm|xlsb|xltx|xltm|csv|ods|numbers)$/.test(e)) return 'excel';
  if(/^(pptx?|pptm|ppsx?|potx|odp|key)$/.test(e)) return 'ppt';
  if(/^(txt|md|log|text)$/.test(e)) return 'txt';
  return it.cat;
}
function areaOf(it){ var k = AREA.map[it.id]; return k && CAT[k] ? k : autoArea(it); }
/* 分類圖示：自訂的表情符號，或內建圖示 */
function areaIcon(k, sz){ var c = CAT[k] || CAT.other; return c.emo ? '<span class="emoIc' + (sz ? ' ' + sz : '') + '">' + esc(c.emo) + '</span>' : icon(c.ic, sz); }
function areaName(k){ return k === 'audio' && !(AREA.over.audio && AREA.over.audio.name) ? '音樂庫' : (CAT[k] || CAT.other).name; }
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
var TRASH = lsGet('ws.trash', {});
var Lib = {
  items: [], urls: {},
  refresh: async function(){
    try{
      if(isApp) this.all = NAT.json('libList') || [];
      else this.all = await IDB.tx(['meta'], 'readonly', function(t){ return t.objectStore('meta').getAll(); }) || [];
    }catch(e){ this.all = []; }
    /* 垃圾桶裡的檔案不出現在檔案庫的任何地方 */
    var ids = {}, ch = false;
    this.all.forEach(function(it){ ids[it.id] = 1; });
    Object.keys(TRASH).forEach(function(k){ if(!ids[k]){ delete TRASH[k]; ch = true; } });
    if(ch) lsSet('ws.trash', TRASH);
    this.items = this.all.filter(function(it){ return !TRASH[it.id]; });
    fire('libChanged');
  },
  byId: function(id){ return (this.all || this.items).filter(function(x){ return x.id === id; })[0]; },
  /* 刪除先丟進垃圾桶；在垃圾桶裡再刪除才是真的刪掉 */
  trash: async function(ids){ ids.forEach(function(id){ TRASH[id] = Date.now(); }); lsSet('ws.trash', TRASH); await this.refresh(); },
  restore: async function(ids){ ids.forEach(function(id){ delete TRASH[id]; }); lsSet('ws.trash', TRASH); await this.refresh(); },
  trashList: function(){ return (this.all || []).filter(function(it){ return TRASH[it.id]; }).sort(function(a, b){ return TRASH[b.id] - TRASH[a.id]; }); },
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
var LV = {sel: new Set(), selMode: false, q: '', folder: lsGet('ws.lvFolder', {}), open: false};
/* 進入檔案庫時先收起來，點分類才顯示檔案 */
on('view', function(e){ if(e.v === 'lib' && e.prev !== 'lib'){ LV.open = false; if(typeof renderCats === 'function'){ renderCats(); renderLibList(); } } });
function libVisible(){
  var c = CFG.lib, q = LV.q.toLowerCase();
  var L = Lib.items.filter(function(it){ return !SEC.hidden(it) && (q || c.cat === 'all' || areaOf(it) === c.cat) && (!q || (it.name + ' ' + (it.title || '') + ' ' + (it.src || '')).toLowerCase().indexOf(q) >= 0); });
  var k = c.sort, d = c.dir === 'asc' ? 1 : -1;
  L.sort(function(a, b){
    if(k === 'name') return d * String(a.name).localeCompare(String(b.name), 'zh-Hant', {numeric: true});
    if(k === 'size') return d * ((a.size || 0) - (b.size || 0));
    return d * ((a.time || 0) - (b.time || 0));
  });
  return L;
}
/* 目前畫面上真的看得到的檔案（在資料夾裡時只算這一層，不含子資料夾裡的） */
function libShown(){
  var cat = CFG.lib.cat, L = libVisible();
  if(!LV.open && !LV.q && !LV.selMode) return [];
  if(cat !== 'all' && !LV.q){ var cur = LV.folder[cat] || ''; if(cur && !LF.get(cur)) cur = ''; L = L.filter(function(it){ return LF.folderOf(it.id) === cur; }); }
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
  card.appendChild(h('div', {class: 'setRow', style: {borderTop: '1px solid var(--border-soft)', marginTop: '10px'}, onclick: async function(){ if(SEC.has() && SEC.catLocked('audio') && !SEC.open() && !(await SEC.need('解鎖「音樂庫」'))) return; LV.open = true; setCfg('lib.cat', 'audio'); LV.folder.audio = ''; renderLib(); renderCats(); renderLibList(); var cb = $('catBar'); if(cb) setTimeout(function(){ cb.scrollIntoView({behavior: 'smooth', block: 'start'}); }, 50); }},
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
  Lib.items.forEach(function(it){ var a = areaOf(it); cnt[a] = (cnt[a] || 0) + 1; });
  AREA.custom.forEach(function(a){ cnt[a.k] = cnt[a.k] || 0; });
  /* 不顯示「全部」：只有各分類（搜尋時會找所有分類） */
  if(CFG.lib.cat === 'all'){ var first = Object.keys(CAT).filter(function(k){ return cnt[k]; })[0]; if(first){ CFG.lib.cat = first; saveCfg(); } }
  Object.keys(CAT).map(function(k){ return [k, CAT[k].name, CAT[k].ic]; }).forEach(function(c){
    if(!cnt[c[0]] && !AREA.custom.some(function(a){ return a.k === c[0]; })) return;
    var lk = c[0] !== 'all' && SEC.has() && SEC.catLocked(c[0]) && !SEC.open();
    bar.appendChild(h('button', {class: 'fchip' + (LV.open && CFG.lib.cat === c[0] ? ' on' : ''), html: (lk ? icon('lock', 'sm') : areaIcon(c[0], 'sm')) + areaName(c[0]) + ' <span class="c">' + (lk ? '🔒' : (cnt[c[0]] || 0)) + '</span>', onclick: async function(){
      /* 音樂庫：不管目前狀態，點了一定是打開音樂庫（不會因為再點一次就收起來） */
      if(LV.open && CFG.lib.cat === c[0] && c[0] !== 'audio'){ LV.open = false; renderLibList(); renderCats(); return; }
      if(lk && !(await SEC.need('解鎖「' + (c[0] === 'audio' ? '音樂庫' : c[1]) + '」'))) return;
      /* 切換分類時一律從最上層（第一層資料夾）開始，不會停在上次看到的子資料夾裡 */
      LV.folder[c[0]] = '';
      LV.open = true; setCfg('lib.cat', c[0]); renderLibList(); renderCats();
    }}));
  });
  var tn = Lib.trashList().length;
  if(tn) bar.appendChild(h('button', {class: 'fchip', html: icon('trash', 'sm') + '垃圾桶 <span class="c">' + tn + '</span>', onclick: function(){ openTrash(); }}));
  bar.appendChild(h('button', {class: 'fchip', html: icon('gear', 'sm') + '分類', title: '管理分類', onclick: function(){ manageAreas(); }}));
  if(CFG.lib.cat !== 'all' && !cnt[CFG.lib.cat] && !CAT[CFG.lib.cat]){ var f2 = Object.keys(CAT).filter(function(k){ return cnt[k]; })[0]; CFG.lib.cat = f2 || 'all'; saveCfg(); }
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
  if(!LV.open && !LV.q && !LV.selMode){
    box.appendChild(h('div', {class: 'libClosed', html: icon('folder', 'lg') + '<b>點上方的分類顯示檔案</b><span class="sub">網頁、PDF、圖片、影片、音樂庫、字幕…再點一次可以收起來；最右邊「分類」可以自訂</span>'}));
    return;
  }
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
    crumbs.appendChild(h('button', {class: 'crumb' + (cur ? '' : ' on'), html: areaIcon(cat, 'sm') + areaName(cat), onclick: function(){ LV.folder[cat] = ''; redraw(); }}));
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
        var flk = SEC.has() && SEC.folderLocked(f.id) && !SEC.open();
        var el = h('div', {class: 'ftile'}, h('span', {class: 'fi', text: flk ? '🔒' : (f.icon || '📁')}), h('div', {class: 't'}, h('b', {text: f.name}), h('div', {class: 'sub', text: flk ? '已上鎖・點一下解鎖' : n + ' 個檔案' + (LF.children(cat, f.id).length ? '・' + LF.children(cat, f.id).length + ' 個資料夾' : '')})),
          h('button', {class: 'ib', html: icon('more'), onclick: function(e){ e.stopPropagation(); folderMenu(f, redraw); }}));
        el.addEventListener('pointerdown', function(){ press = setTimeout(function(){ press = -1; folderMenu(f, redraw); }, 500); });
        el.addEventListener('pointerup', function(){ if(press === -1){ press = 0; return; } clearTimeout(press); press = 0; });
        el.addEventListener('pointercancel', function(){ clearTimeout(press); press = 0; });
        el.addEventListener('click', async function(){
          if(flk){ if(!(await SEC.need('解鎖「' + f.name + '」'))) return; LV.folder[cat] = f.id; if(f.id === INTRUDER_F) intruderOpened(); redraw(); return; }
          if(f.id === INTRUDER_F) intruderOpened();
          if(LV.selMode && LV.sel.size){ var ids = Array.from(LV.sel); LF.setItems(ids, f.id); LV.sel.clear(); LV.selMode = false; toast('已移到「' + f.name + '」'); renderLib(); return; } LV.folder[cat] = f.id; redraw(); });
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
    el.addEventListener('pointerdown', function(e){ moved = false; sx = e.clientX; sy = e.clientY; press = setTimeout(function(){ press = -1; if(!LV.selMode){ LV.selMode = true; } LV.sel.add(it.id); buzz(15); renderLib(); }, 480); });
    el.addEventListener('pointermove', function(e){ if(Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10){ moved = true; clearTimeout(press); } });
    el.addEventListener('pointerup', function(){
      if(press === -1 || moved){ press = 0; return; }
      clearTimeout(press); press = 0;
      if(LV.selMode){ if(LV.sel.has(it.id)) LV.sel.delete(it.id); else LV.sel.add(it.id); el.classList.toggle('on'); renderSelBar(); }
      else if(it.cat === 'audio') Music.playItem(it, L);
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
  bar.appendChild(h('button', {class: 'ib', html: icon('checks'), title: '全選', onclick: function(){ var L = libShown(); var all = L.length && L.every(function(it){ return LV.sel.has(it.id); }); L.forEach(function(it){ if(all) LV.sel.delete(it.id); else LV.sel.add(it.id); }); renderLib(); }}));
  if(allHtml && isApp) bar.appendChild(h('button', {class: 'ib', html: icon('pdf'), title: '轉成 PDF', onclick: function(){ picked.forEach(function(it){ toPdf(it); }); }}));
  var cats = {}; picked.forEach(function(it){ cats[areaOf(it)] = 1; });
  var oneCat = Object.keys(cats).length === 1 ? Object.keys(cats)[0] : '';
  var moveArea = function(){
    menu('移到哪個分類？', Object.keys(CAT).map(function(k){ return [CAT[k].emo ? 'folder' : CAT[k].ic, areaName(k) + (oneCat === k ? '　（目前）' : ''), function(){
      var ids = picked.map(function(x){ return x.id; });
      ids.forEach(function(id){ var it = Lib.byId(id); if(it && autoArea(it) === k) delete AREA.map[id]; else AREA.map[id] = k; });
      AREA.save(); LF.setItems(ids, ''); LV.sel.clear(); LV.selMode = false; toast('已移到「' + areaName(k) + '」'); renderLib();
    }]; }).concat([['plus', '新增分類…', function(){ areaEdit(null, function(k){ var ids = picked.map(function(x){ return x.id; }); ids.forEach(function(id){ AREA.map[id] = k; }); AREA.save(); LF.setItems(ids, ''); LV.sel.clear(); LV.selMode = false; renderLib(); }); }]]));
  };
  bar.appendChild(h('button', {class: 'ib', html: icon('layers'), title: '移到其他分類', disabled: !n, onclick: moveArea}));
  bar.appendChild(h('button', {class: 'ib', html: icon('folder'), title: '移到資料夾', disabled: !n, onclick: function(){
    if(!oneCat){ toast('資料夾是依種類分開的，請只選同一種類的檔案', true); return; }
    folderPicker(oneCat, '移到資料夾', function(fid){ LF.setItems(picked.map(function(x){ return x.id; }), fid); LV.sel.clear(); LV.selMode = false; toast('已移動'); renderLib(); dupOnMove(picked, fid); }, {cur: LV.folder[oneCat] || '', other: ['layers', '移到其他分類（影片、APK、其他…）', moveArea]});
  }}));
  var htmls = picked.filter(function(x){ return x.cat === 'html'; });
  if(htmls.length) bar.appendChild(h('button', {class: 'ib', html: icon('pdf'), title: '轉成 PDF', onclick: function(){ batchPdfDlg(htmls); }}));
  bar.appendChild(h('button', {class: 'ib', html: icon('edit'), title: '重新命名', disabled: !n, onclick: function(){ renameItems(picked); }}));
  bar.appendChild(h('button', {class: 'ib', html: icon('share'), title: '匯出', disabled: !n, onclick: function(){ exportSheet(picked); }}));
  bar.appendChild(h('button', {class: 'ib', html: icon('trash'), title: '刪除', disabled: !n, style: {color: 'var(--danger)'}, onclick: async function(){
    var ids = Array.from(LV.sel);
    await Lib.trash(ids); LV.sel.clear(); LV.selMode = false;
    toast('已移到垃圾桶（' + n + ' 個）', false, ['復原', function(){ Lib.restore(ids).then(function(){ toast('已復原'); }); }]);
  }}));
}
function renderLib(){ renderCats(); renderSelBar(); renderLibList(); paintIcons($('v-lib')); }
on('libChanged', function(){ if(curView === 'lib'){ renderLib(); renderStor(); } if(BR.home) renderStart(); });
on('view', function(e){ if(e.v === 'lib'){ Lib.refresh(); } });
$('libQ').addEventListener('input', function(){ LV.q = this.value.trim(); renderLibList(); });
$('bView').addEventListener('click', function(){ setCfg('lib.view', CFG.lib.view === 'grid' ? 'list' : 'grid'); this.innerHTML = icon(CFG.lib.view === 'grid' ? 'list' : 'grid'); renderLibList(); });
$('bSel').addEventListener('click', function(){ LV.selMode = true; renderLib(); });
/* 重新整理：跟「其他 App 下載自動搬回」的「立即檢查」一樣，順便重讀檔案庫 */
$('bLibRefresh').addEventListener('click', async function(){
  var b = this; if(b.classList.contains('spinning')) return;
  b.classList.add('spinning');
  if(isApp && NAT.has('watchScan')) NAT.call('watchScan');
  toast('檢查中…');
  try{ await sleep(1500); await Lib.refresh(); renderLib(); if(typeof renderStor === 'function') renderStor(); }catch(e){}
  setTimeout(function(){ b.classList.remove('spinning'); }, 300);
});
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
    opt('inbox', '存到手機「下載」資料夾', '位置：下載/琥珀瀏覽器。用 USB 連接電腦時，在「內部儲存空間/Download/琥珀瀏覽器」就找得到', function(){ NAT.call('libExport', ids, 'downloads'); });
    var tn = NAT.call('treeName');
    opt('folder', '存到指定資料夾…', tn ? '目前：' + esc(tn) + '（可存到 SD 卡、USB 隨身碟、雲端硬碟資料夾）' : '自己選位置：SD 卡、USB 隨身碟、雲端硬碟…', function(){ NAT.call('libExport', ids, 'tree'); });
    if(tn) opt('edit', '換一個資料夾再存', '重新選擇要存放的位置', function(){ NAT.call('libExport', ids, 'pickTree'); });
    opt('share', '分享／傳送', 'LINE、Gmail、Google 雲端硬碟、Quick Share（傳到電腦或其他手機）…', function(){ NAT.call('libExport', ids, 'share'); });
    opt('wifi', '無線傳到電腦／其他手機', '掃 QR Code 或輸入網址就能下載；同一個網路、熱點、USB，或經過中繼站跨網路傳', function(){ openWifi(items); });
    if(items.length === 1) opt('open', '用其他 App 開啟', '例如用 Chrome 開 HTML、用相簿開圖片', function(){ NAT.call('libExport', ids, 'open'); });
    if(items.length > 1) opt('zip', '打包成 ZIP（存回檔案庫）', '合併成一個壓縮檔，再用上面的方式匯出', function(){ zipItems(items); });
  } else {
    opt('download', items.length > 1 ? '下載到這台裝置（逐一下載）' : '下載到這台裝置', '存到瀏覽器的下載資料夾', async function(){ for(var i = 0; i < items.length; i++){ downloadBlob(await Lib.blob(items[i]), items[i].name); await sleep(350); } });
    if(items.length > 1) opt('zip', '打包成 ZIP 下載', '一次下載全部', async function(){ toast('打包中…'); var z = new JSZip(); for(var i = 0; i < items.length; i++) z.file(items[i].name, await Lib.blob(items[i])); downloadBlob(await z.generateAsync({type: 'blob'}), '琥珀瀏覽器_' + items.length + '個檔案.zip'); });
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
  if(isApp && NAT.has('libZip')){ NAT.call('libZip', JSON.stringify(items.map(function(x){ return x.id; })), '琥珀瀏覽器_' + items.length + '個檔案'); toast('打包中…'); return; }
  toast('打包中…');
  var z = new JSZip(); for(var i = 0; i < items.length; i++) z.file(items[i].name, await Lib.blob(items[i]));
  await Lib.addBlob(await z.generateAsync({type: 'blob', compression: 'STORE'}), '琥珀瀏覽器_' + items.length + '個檔案.zip', {});
  toast('✓ 已打包成 ZIP');
}
function qrSvg(text, px){
  try{
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), m = 2, d = '';
    for(var r = 0; r < n; r++) for(var c = 0; c < n; c++) if(q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + m * 2) + ' ' + (n + m * 2) + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }catch(e){ return ''; }
}
var WIFI_KIND = {wifi: ['wifi', 'Wi-Fi', '對方連到同一台分享器（Wi-Fi 或網路線都可以）'], hotspot: ['wifi', '手機熱點', '對方連到這支手機開的熱點'], usb: ['link', 'USB 網路共用', '用傳輸線接電腦'],
  eth: ['link', '有線網路', '對方連到同一台分享器'], bt: ['link', '藍牙網路共用', '對方用藍牙連到這支手機'], p2p: ['wifi', 'Wi-Fi Direct', '對方用 Wi-Fi Direct 連到這支手機']};
function openWifi(items){
  if(!Array.isArray(items)) items = null;
  var body = h('div'), sel = 0, mode = 'lan', stopRelay = null;
  var s = openSheet({title: '無線傳到電腦／其他手機', icon: 'wifi', body: body, tall: true, onClose: function(){ if(stopRelay) stopRelay(); }});
  var MODES = [['lan', 'wifi', '同一個網路'], ['gh', 'link', 'GitHub 中繼'], ['pipe', 'globe', '公用中繼']];
  function draw(){
    if(stopRelay){ stopRelay(); stopRelay = null; }
    body.textContent = '';
    body.appendChild(h('div', {class: 'chips', style: {marginBottom: '10px'}}, MODES.map(function(m){
      return h('button', {class: 'chip' + (mode === m[0] ? ' pri' : ''), html: icon(m[1], 'sm') + m[2], onclick: function(){ if(mode !== m[0]){ mode = m[0]; draw(); } }}); })));
    if(mode !== 'lan'){
      body.appendChild(h('div', {class: 'sub', style: {marginBottom: '8px'}, html: mode === 'gh'
        ? '兩邊<b>不用在同一個網路</b>。檔案加密後暫存到<b>你自己的 GitHub</b>，對方隨時可以下載，傳完刪除暫存。'
        : '兩邊<b>不用在同一個網路</b>。檔案加密後經過<b>公開的中繼站</b>即時轉送，不會存下來；兩邊要同時在線。'}));
      stopRelay = relayPane(body, mode, items, draw); paintIcons(body); return;
    }
    var r = NAT.json('wifiStart');
    if(!r || r.ok === false){
      body.appendChild(h('div', {class: 'note err', text: '無法啟動：' + (r && r.err || '請確認手機已連上 Wi-Fi')}));
      body.appendChild(h('div', {class: 'note', html: '<b>沒有 Wi-Fi 也可以傳：</b>打開手機的「個人熱點」，讓電腦或另一支手機連進來，再按「重新整理」。'}));
      body.appendChild(h('div', {class: 'btn-row'}, h('button', {class: 'btn pri', html: icon('reload', 'sm') + '重新整理', onclick: draw})));
      paintIcons(body); return;
    }
    var nets = r.nets && r.nets.length ? r.nets : [{url: r.url, ip: r.ip, kind: 'wifi'}];
    if(sel >= nets.length) sel = 0;
    var cur = nets[sel], K = WIFI_KIND[cur.kind] || WIFI_KIND.wifi;
    if(nets.length > 1) body.appendChild(h('div', {class: 'chips', style: {marginBottom: '8px'}}, nets.map(function(n, i){ var k = WIFI_KIND[n.kind] || WIFI_KIND.wifi;
      return h('button', {class: 'chip' + (i === sel ? ' pri' : ''), html: icon(k[0], 'sm') + k[1], onclick: function(){ sel = i; draw(); }}); })));
    body.appendChild(h('div', {class: 'sub', html: '① ' + esc(K[2]) + '（目前用：<b>' + esc(K[1]) + '</b>）<br>② 用對方的相機掃這個 QR Code，或在瀏覽器網址列輸入下面的網址：'}));
    var qr = qrSvg(cur.url, 210);
    if(qr) body.appendChild(h('div', {class: 'wifiQr', html: qr}));
    body.appendChild(h('div', {class: 'wifiUrl', text: cur.url}));
    body.appendChild(h('div', {class: 'btn-row'}, h('button', {class: 'btn', html: icon('copy', 'sm') + '複製網址', onclick: function(){ copyText(cur.url); }}),
      h('button', {class: 'btn', html: icon('reload', 'sm') + '重新整理', onclick: draw}),
      h('button', {class: 'btn dang', html: icon('x', 'sm') + '停止分享', onclick: function(){ NAT.call('wifiStop'); s.close(); toast('已停止傳輸'); }})));
    body.appendChild(h('div', {class: 'note', html: '③ 網頁會列出檔案庫裡的所有檔案，按「下載」取得原始檔案，或「全部打包下載」。<br>網址裡的通行碼 <b>' + esc(r.key) + '</b> 可防止同網路的其他人讀取。離開 App 或按「停止分享」就會關閉。'}));
    body.appendChild(h('details', {class: 'note'}, h('summary', {html: '<b>對方不在同一個 Wi-Fi 怎麼辦？</b>'}), h('div', {html:
      '<p>檔案是由這支手機直接傳給對方，所以兩邊要「連得到彼此」，有三種接法：</p>' +
      '<p><b>同一台分享器</b>：不一定都要用 Wi-Fi。電腦插網路線、手機連 Wi-Fi，只要是同一台分享器（同一個家用／公司網路）就可以。</p>' +
      '<p><b>手機熱點</b>：沒有共同的網路時，打開這支手機的「個人熱點」，讓電腦或另一支手機連進來，再按上面的「重新整理」，選「手機熱點」。傳檔走的是熱點本身，不會用到行動網路流量。</p>' +
      '<p><b>USB 傳輸線</b>：用線接電腦，在手機開「USB 網路共用」，再按「重新整理」，選「USB 網路共用」。</p>' +
      '<p><b>完全不同的網路</b>（對方人在別的地方、手機只有行動網路）：改用上面的「GitHub 中繼」或「公用中繼」分頁。</p>'})));
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

/* 批次轉 PDF：選多個離線網頁，一個接一個轉（一般 PDF 或無縫圖片 PDF） */
var BATCH_PDF = null;
function waitEv(name, pred, ms){
  return new Promise(function(res){
    var done = false, tm = setTimeout(function(){ fin({timeout: true}); }, ms || 600000);
    function fin(d){ if(done) return; done = true; clearTimeout(tm); BUS[name] = (BUS[name] || []).filter(function(f){ return f !== once; }); res(d); }
    function once(d){ if(!pred || pred(d)) fin(d); }
    on(name, once);
  });
}
function batchPdfDlg(items){
  if(!isApp){ toast('批次轉 PDF 需要 APK 版', true); return; }
  if(BATCH_PDF){ toast('已經有批次轉換在進行中', true); return; }
  var mode = lsGet('ws.batchPdf', 'seamless');
  var opts = h('div', {class: 'opts'});
  [['seamless', '無縫圖片 PDF（長條漫畫）', '只留內容圖片，上下接起來，去掉按鈕與選單'], ['page', '一般 PDF（網頁排版）', '保留文字與版面，紙張設定依「擷取設定」']].forEach(function(x){
    opts.appendChild(h('label', {class: 'opt radio'}, h('input', {type: 'radio', name: 'bpdf', checked: mode === x[0], onchange: function(){ mode = x[0]; }}), h('div', {class: 'grow'}, h('b', {text: x[1]}), h('div', {class: 'sub', text: x[2]}))));
  });
  var go = h('button', {class: 'btn pri', html: icon('pdf', 'sm') + '開始轉換（' + items.length + ' 個）'});
  var s = openSheet({title: '批次轉成 PDF', icon: 'pdf', body: h('div', null, opts, h('div', {class: 'sub', style: {marginTop: '10px'}, text: '會依序一個一個轉換，可以切到其他 App 或關閉螢幕，全部完成時手機會震動提醒。'})), foot: go});
  go.onclick = function(){ lsSet('ws.batchPdf', mode); s.close(); LV.sel.clear(); LV.selMode = false; renderLib(); runBatchPdf(items.slice(), mode); };
}
async function runBatchPdf(items, mode){
  BATCH_PDF = {n: items.length, ok: 0, fail: 0};
  NAT.call('keep', 'cap', '批次轉 PDF');
  for(var i = 0; i < items.length; i++){
    var it = items[i];
    Tasks.set('bpdf', {title: '批次轉 PDF ' + (i + 1) + ' / ' + items.length, sub: it.name, pct: i / items.length, kind: 'pdf'});
    var d;
    if(mode === 'seamless'){
      CAPTURING = true;
      var w = waitEv('cap', function(x){ return x && (x.state === 'done' || x.state === 'error'); });
      NAT.call('libComic', it.id, '{}');
      d = await w;
      CAPTURING = false;
      if(d && d.state === 'done') BATCH_PDF.ok++; else BATCH_PDF.fail++;
    } else {
      var w2 = waitEv('pdf');
      NAT.call('libToPdf', it.id, JSON.stringify({paper: CFG.cap.paper, landscape: !!CFG.cap.landscape, margin: +CFG.cap.margin || 0}));
      d = await w2;
      if(d && d.ok) BATCH_PDF.ok++; else BATCH_PDF.fail++;
    }
  }
  Tasks.del('bpdf');
  NAT.call('keep', 'cap', '');
  var r = BATCH_PDF; BATCH_PDF = null;
  await Lib.refresh(); renderLib();
  NAT.call('doneBuzz', '批次轉 PDF：成功 ' + r.ok + ' 個' + (r.fail ? '，失敗 ' + r.fail + ' 個' : ''));
  toast('✓ 批次轉 PDF 完成：成功 ' + r.ok + ' 個' + (r.fail ? '，失敗 ' + r.fail + ' 個' : ''), !!r.fail);
}

/* ---------- 管理分類：改名稱、改圖示、新增、刪除自訂分類 ---------- */
var AREA_EMO = ['📁', '🎬', '🎞️', '📺', '🎵', '🎧', '🖼️', '📷', '📝', '📄', '📑', '📃', '📊', '📈', '📕', '📘', '📗', '📙', '💬', '🔤', '🈶', '📦', '🗜️', '💾', '🌐', '🔖', '⭐', '❤️', '🔥', '✈️', '🍳', '🛒', '💼', '🏠', '🎮', '📚', '🧾', '🔧', '🔒', '🎁'];
function iconPicker(title, cur, cb, onCancel){
  var grid = h('div', {class: 'chips'}), picked = false;
  function pick(v){ picked = true; s.close(); cb(v); }
  var inp = h('input', {type: 'text', placeholder: '或直接輸入任何表情符號', maxlength: 8, style: {width: '100%', marginBottom: '10px'}});
  var s = openSheet({title: title || '選擇圖示', icon: 'palette', body: h('div', null, inp, grid), onClose: function(){ if(!picked && onCancel) onCancel(); },
    foot: h('button', {class: 'btn pri', text: '使用輸入的圖示', onclick: function(){ var v = inp.value.trim(); if(v) pick(v); }})});
  AREA_EMO.concat(FOLDER_ICONS.filter(function(x){ return AREA_EMO.indexOf(x) < 0; })).forEach(function(ic){
    grid.appendChild(h('button', {class: 'fchip' + (ic === cur ? ' on' : ''), text: ic, style: {fontSize: '22px'}, onclick: function(){ pick(ic); }}));
  });
}
async function areaEdit(k, done){
  var a = k ? CAT[k] : null;
  var name = await promptDlg(k ? '分類名稱' : '新增分類', k ? areaName(k) : '', '例如：字幕、工作文件、旅遊影片');
  if(!name) return;
  /* 自訂分類可以指定副檔名：之後存進檔案庫的檔案，副檔名符合就自動收進這個分類 */
  var isCustom = !k || AREA.custom.some(function(x){ return x.k === k; }), ext = null;
  if(isCustom){
    var cu0 = k ? AREA.custom.filter(function(x){ return x.k === k; })[0] : null;
    var ev = await promptDlg('自動收進「' + name + '」的副檔名', cu0 && cu0.ext ? cu0.ext.join(', ') : '', '例如：apk, xapk（用逗號分開；不需要就留空）', '下一步');
    if(ev == null && !k) ev = '';
    if(ev != null) ext = String(ev).toLowerCase().split(/[\s,，、;]+/).map(function(x){ return x.replace(/^[.*]+/, '').replace(/[^a-z0-9]/g, ''); }).filter(Boolean).slice(0, 30);
  }
  var apply = function(emo){
    if(k){
      AREA.over[k] = Object.assign({}, AREA.over[k] || {}, {name: name.slice(0, 20), emo: emo});
      var cu = AREA.custom.filter(function(x){ return x.k === k; })[0]; if(cu){ cu.name = name.slice(0, 20); cu.emo = emo; if(ext) cu.ext = ext; }
    } else {
      k = 'u' + uid();
      AREA.custom.push({k: k, name: name.slice(0, 20), emo: emo, ext: ext || [], c: ['#8a6d4f', '#4f7a8a', '#7a4f8a', '#8a7a4f', '#4f8a5e'][AREA.custom.length % 5]});
    }
    AREA.save(); areaApply(); renderLib(); if(done) done(k);
    fire('areasChanged');
  };
  iconPicker('「' + name + '」的圖示', a && a.emo, apply, function(){ apply((a && a.emo) || ''); });
}
function manageAreas(){
  var body = h('div');
  var s = openSheet({title: '管理分類', icon: 'layers', body: body, tall: true, foot: h('button', {class: 'btn pri', html: icon('plus', 'sm') + '新增分類', onclick: function(){ areaEdit(null); }})});
  function draw(){
    body.textContent = '';
    body.appendChild(h('div', {class: 'sub', style: {marginBottom: '10px', lineHeight: '1.6'}, text: '可以改每個分類的名稱和圖示，或新增自己的分類。自己新增的分類可以指定副檔名（例如 apk），之後存進來的那種檔案會自動收進去。長按任一列上下拖動可以排序。檔案要換分類：在檔案上長按選取 → 上方工具列的「移到其他分類」（三層方塊的圖示）。'}));
    var cnt = {}; Lib.items.forEach(function(it){ var a = areaOf(it); cnt[a] = (cnt[a] || 0) + 1; });
    var list = h('div'); body.appendChild(list);
    Object.keys(CAT).forEach(function(k){
      var custom = AREA.custom.some(function(x){ return x.k === k; });
      list.appendChild(h('div', {class: 'setRow areaRow'},
        h('span', {class: 'dsGrip', html: icon('grip', 'sm'), title: '長按上下拖動排序'}),
        h('span', {class: 'ic', html: areaIcon(k)}),
        h('div', {class: 'grow'}, h('b', {text: areaName(k)}), h('div', {class: 'sub', text: (cnt[k] || 0) + ' 個檔案' + (custom ? '・自訂' + ((CAT[k].ext && CAT[k].ext.length) ? '・自動收 .' + CAT[k].ext.join(' .') : '') : '')})),
        h('button', {class: 'ib', html: icon('edit'), title: '改名稱與圖示', onclick: function(){ areaEdit(k); }}),
        !custom && AREA.over[k] ? h('button', {class: 'ib', html: icon('reload'), title: '恢復預設', onclick: function(){ delete AREA.over[k]; AREA.save(); areaApply(); renderLib(); draw(); }}) : null,
        custom ? h('button', {class: 'ib', html: icon('trash'), style: {color: 'var(--danger)'}, onclick: async function(){
          if(!(await confirmDlg('刪除分類「' + esc(areaName(k)) + '」？', '裡面的檔案會回到原本的分類，<b>檔案不會被刪除</b>。', '刪除', true))) return;
          AREA.custom = AREA.custom.filter(function(x){ return x.k !== k; });
          Object.keys(AREA.map).forEach(function(id){ if(AREA.map[id] === k) delete AREA.map[id]; });
          AREA.save(); areaApply(); if(CFG.lib.cat === k) setCfg('lib.cat', 'html'); renderLib(); draw();
        }}) : null));
    });
    paintIcons(body);
    /* 長按任一列上下拖動排序（震動＋提示線），檔案庫上方的分類順序跟著改 */
    dragSort(list, function(from, to){
      var ks = Object.keys(CAT), m = ks.splice(from, 1)[0]; ks.splice(to, 0, m);
      AREA.order = ks; AREA.save(); areaApply(); renderLib(); draw();
    });
  }
  draw();
  on('areasChanged', function(){ if(!s.closed) draw(); });
}
on('libChanged', function(){
  var ids = {}; (Lib.all || Lib.items).forEach(function(it){ ids[it.id] = 1; });
  var ch = false; Object.keys(AREA.map).forEach(function(k){ if(!ids[k]){ delete AREA.map[k]; ch = true; } });
  if(ch) AREA.save();
});

/* ---------- 檔案庫垃圾桶：可以還原，或永久刪除 ---------- */
async function openTrash(){
  if(SEC.cfg.trash && SEC.has() && !(await SEC.need('解鎖垃圾桶'))) return;
  var body = h('div');
  var s = openSheet({title: '垃圾桶', icon: 'trash', body: body, tall: true, foot: h('div', {style: {display: 'contents'}},
    h('button', {class: 'btn ghost', text: '全部還原', onclick: async function(){ var L = Lib.trashList(); if(!L.length) return; await Lib.restore(L.map(function(x){ return x.id; })); toast('已還原 ' + L.length + ' 個'); draw(); }}),
    h('button', {class: 'btn dang', html: icon('trash', 'sm') + '清空垃圾桶', onclick: async function(){
      var L = Lib.trashList(); if(!L.length) return;
      if(!(await confirmDlg('永久刪除 ' + L.length + ' 個檔案？', '共 ' + fmtSize(L.reduce(function(a, x){ return a + (x.size || 0); }, 0)) + '，刪除後<b>無法復原</b>。', '永久刪除', true))) return;
      await Lib.del(L.map(function(x){ return x.id; })); toast('已永久刪除'); draw();
    }}))});
  function draw(){
    body.textContent = '';
    var L = Lib.trashList();
    body.appendChild(h('div', {class: 'sub', style: {marginBottom: '10px', lineHeight: '1.6'}, text: L.length ? '共 ' + L.length + ' 個・' + fmtSize(L.reduce(function(a, x){ return a + (x.size || 0); }, 0)) + '（仍佔用手機空間，清空後才會釋放）' : ''}));
    if(!L.length){ body.appendChild(h('div', {class: 'empty', html: '<div class="big">🗑</div>垃圾桶是空的'})); return; }
    L.forEach(function(it){
      body.appendChild(h('div', {class: 'lrow'}, thumbEl(it),
        h('div', {class: 't'}, h('b', {text: it.name}), h('div', {class: 'sub', text: areaName(areaOf(it)) + '・' + fmtSize(it.size) + '・刪除於 ' + fmtDate(TRASH[it.id])})),
        h('button', {class: 'ib', html: icon('reload'), title: '還原', onclick: async function(){ await Lib.restore([it.id]); toast('已還原'); draw(); }}),
        h('button', {class: 'ib', html: icon('trash'), title: '永久刪除', style: {color: 'var(--danger)'}, onclick: async function(){
          if(!(await confirmDlg('永久刪除？', esc(it.name) + '<br>刪除後<b>無法復原</b>。', '永久刪除', true))) return;
          await Lib.del([it.id]); toast('已永久刪除'); draw();
        }})));
    });
    paintIcons(body);
  }
  draw();
}

/* ---------- 從手機匯入檔案：可多選，依副檔名自動分到各類別（放在類別的最外層，之後再自己移到資料夾） ---------- */
$('bLibAdd').addEventListener('click', function(){
  buzz(8);
  if(isApp && NAT.has('pickFiles')){ NAT.call('pickFiles'); return; }
  var inp = h('input', {type: 'file', multiple: true, style: {display: 'none'}});
  inp.onchange = async function(){
    var fs = Array.prototype.slice.call(inp.files || []), saved = [];
    for(var i = 0; i < fs.length; i++){ toast('匯入中 ' + (i + 1) + '／' + fs.length + '：' + fs[i].name); try{ var r = await Lib.addBlob(fs[i], fs[i].name, {}); if(r) saved.push(r); }catch(e){} }
    fire('picked', {items: saved}); inp.remove();
  };
  document.body.appendChild(inp); inp.click();
});
on('pickProg', function(d){ if(typeof d === 'string') try{ d = JSON.parse(d); }catch(e){ return; } if(d && d.n > 1) toast('匯入中 ' + d.i + '／' + d.n + '：' + d.name); });
on('picked', async function(d){
  if(typeof d === 'string') try{ d = JSON.parse(d); }catch(e){ d = {}; }
  d = d || {};
  if(d.cancel) return;
  await Lib.refresh(); renderLib(); if(typeof renderStor === 'function') renderStor();
  var items = (d.items || []).map(function(x){ return Lib.byId(x.id) || x; });
  if(items.length){
    var cnt = {};
    items.forEach(function(it){ var a = areaOf(it); cnt[a] = (cnt[a] || 0) + 1; });
    var parts = Object.keys(cnt).map(function(k){ return areaName(k) + ' ' + cnt[k]; });
    var first = Object.keys(cnt)[0];
    toast('✓ 已匯入 ' + items.length + ' 個檔案（' + parts.join('、') + '）', false, ['查看', function(){
      showView('lib'); LV.open = true; setCfg('lib.cat', Object.keys(cnt).length === 1 ? first : 'all'); if(LV.folder) LV.folder[first] = ''; renderLib(); renderCats(); renderLibList();
    }]);
  }
  if(d.err) toast('有檔案匯入失敗：' + d.err.split('\n')[0], true);
});

/* ---------- 重複檔案提醒：新進來的檔案（下載、匯入、擷取）跟已有的檔案「檔名一樣」或「大小完全一樣」時，讓你確認 ---------- */
var DUP = {known: null, queue: [], busy: false};
function dupKey(n){ return String(n || '').toLowerCase().replace(/\s*\(\d+\)(?=\.[a-z0-9]+$|$)/, '').trim(); }
function dupExt(n){ return (String(n || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase(); }
on('libChanged', function(){
  var items = Lib.items || [];
  if(!DUP.known){ DUP.known = {}; items.forEach(function(it){ DUP.known[it.id] = 1; }); return; }
  var fresh = items.filter(function(it){ return !DUP.known[it.id]; });
  items.forEach(function(it){ DUP.known[it.id] = 1; });
  if(!fresh.length || CFG.dupAsk === false) return;
  fresh.forEach(function(nw){
    if(nw.cat === 'html' || /^(筆記|字幕)/.test(nw.kind || '')) return;
    var sameName = null, sameSize = null;
    items.forEach(function(o){
      if(o.id === nw.id || fresh.indexOf(o) >= 0 && o.time >= nw.time && o.id > nw.id) return;
      if(dupKey(o.name) === dupKey(nw.name)) sameName = sameName || o;
      else if(o.size === nw.size && nw.size > 50 * 1024 && dupExt(o.name) === dupExt(nw.name)) sameSize = sameSize || o;
    });
    var o = sameName || sameSize;
    if(o) DUP.queue.push({nw: nw, old: o, name: !!sameName, size: o.size === nw.size});
  });
  dupNext();
});
/* 把檔案移到另一個資料夾時：那個資料夾裡已經有檔名一樣（或大小完全一樣）的檔案，也提醒 */
function dupOnMove(moved, fid){
  if(CFG.dupAsk === false) return;
  var ids = {}; moved.forEach(function(m){ ids[m.id] = 1; });
  moved.forEach(function(nw){
    var hit = null, nameHit = false;
    (Lib.items || []).forEach(function(o){
      if(ids[o.id] || areaOf(o) !== areaOf(nw) || LF.folderOf(o.id) !== (fid || '')) return;
      if(dupKey(o.name) === dupKey(nw.name)){ if(!nameHit){ hit = o; nameHit = true; } }
      else if(!hit && o.size === nw.size && nw.size > 50 * 1024 && dupExt(o.name) === dupExt(nw.name)) hit = o;
    });
    if(hit) DUP.queue.push({nw: nw, old: hit, name: nameHit, size: hit.size === nw.size, moved: true});
  });
  dupNext();
}
function dupNext(){
  if(DUP.busy || !DUP.queue.length) return;
  var d = DUP.queue.shift(), nw = Lib.byId(d.nw.id), old = Lib.byId(d.old.id);
  if(!nw || !old || TRASH[nw.id] || TRASH[old.id]){ dupNext(); return; }
  DUP.busy = true;
  var done = function(){ DUP.busy = false; setTimeout(dupNext, 250); };
  var verdict = d.name && d.size ? '檔名和大小都一樣，很可能是同一個檔案。' : d.name ? '只有檔名一樣、大小不同，可能是不同的檔案（或不同畫質／版本）。' : '檔名不同，但大小完全一樣，可能是同一個檔案。';
  var row = function(tag, it){ return h('div', {class: 'lrow', style: {cursor: 'default'}}, h('div', {class: 'th', style: Lib.thumb(it) ? {backgroundImage: 'url("' + Lib.thumb(it) + '")'} : {background: (CAT[areaOf(it)] || CAT.other).c}, html: Lib.thumb(it) ? '' : icon(areaIcon(areaOf(it)))}),
    h('div', {class: 't'}, h('b', {text: it.name}), h('div', {class: 'sub', text: tag + '・' + fmtSize(it.size) + '・' + new Date(it.time).toLocaleString('zh-TW', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}))); };
  var body = h('div', null, h('div', {class: 'note', text: verdict}), h('div', {class: 'list'}, row(d.moved ? '剛移過來' : '剛加入', nw), row(d.moved ? '這個資料夾原本就有' : '原本就有', old)));
  var s = openSheet({title: '可能是重複的檔案', icon: 'copy', body: body, onClose: done,
    foot: h('div', {style: {display: 'contents'}},
      h('button', {class: 'btn ghost', text: '都保留', onclick: function(){ s.close(); }}),
      h('button', {class: 'btn', html: icon('edit', 'sm') + '改檔名', onclick: async function(){
        var n = await promptDlg(d.moved ? '幫剛移過來的檔案改檔名' : '幫剛加入的檔案改檔名', nw.name.replace(/\.[a-z0-9]+$/i, ''));
        if(n){ await Lib.rename(nw, n); await Lib.refresh(); renderLib(); toast('已改檔名'); s.close(); }
      }}),
      h('button', {class: 'btn pri', html: icon('trash', 'sm') + (d.moved ? '刪除移過來的' : '刪除剛加入的'), onclick: async function(){ s.close(); await Lib.trash([nw.id]); renderLib(); toast('已把' + (d.moved ? '移過來' : '剛加入') + '的那個丟到垃圾桶'); }}))});
  paintIcons(body);
}
