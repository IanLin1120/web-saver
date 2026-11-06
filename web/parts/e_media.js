/* ============================================================
   媒體下載：偵測頁面上的圖片／影片／音訊，選格式與解析度，個別存或打包 ZIP
   ============================================================ */
var MEDIA = {items: [], sel: new Set(), tab: 'all', sheet: null, hls: {}};
var KIND_NAME = {image: '圖片', video: '影片', audio: '音訊', hls: 'HLS 串流', dash: 'DASH 串流', stream: '串流（無法下載）'};
function mKindGroup(k){ return k === 'image' ? 'image' : k === 'audio' ? 'audio' : 'video'; }
function pxUrl(u){
  if(/^data:/.test(u)) return u;
  return isApp ? 'https://wslib.local/px?u=' + encodeURIComponent(u) + '&r=' + encodeURIComponent(BR.url) : u;
}
function openMedia(){
  var body = h('div', {html: '<div class="ringBox"><div class="spin"></div><div class="sub">正在偵測頁面上的圖片與影片…</div></div>'});
  var dlBtn = h('button', {class: 'btn pri lg', html: icon('download', 'sm') + '下載', disabled: true});
  var selAll = h('button', {class: 'btn', html: icon('checks', 'sm') + '全選'});
  MEDIA.sel = new Set(); MEDIA.tab = 'all';
  MEDIA.sheet = openSheet({title: '媒體下載', icon: 'film', body: body, tall: true, foot: h('div', {style: {display: 'contents'}}, selAll, dlBtn), onClose: function(){ MEDIA.sheet = null; }});
  MEDIA.dlBtn = dlBtn; MEDIA.selAll = selAll;
  dlBtn.onclick = startMediaDl;
  selAll.onclick = function(){
    var vis = visibleMedia().filter(function(m){ return m.kind !== 'stream' && m.kind !== 'dash'; });
    var allOn = vis.length && vis.every(function(m){ return MEDIA.sel.has(m.url); });
    vis.forEach(function(m){ if(allOn) MEDIA.sel.delete(m.url); else MEDIA.sel.add(m.url); });
    drawMedia();
  };
  if(isApp) NAT.call('brMedia', CFG.media.minPx);
  else setTimeout(function(){ fire('media', {items: WEB.doc ? WSMedia.scan(WEB.doc, {minPx: CFG.media.minPx, live: false}) : [], page: WEB.url, title: BR.title}); }, 50);
}
$('bMedia').addEventListener('click', openMedia);
on('media', function(d){
  MEDIA.items = (d && d.items || []).filter(function(m){ return m.url; });
  MEDIA.page = d.page || BR.url; MEDIA.title = d.title || BR.title;
  BR.mediaN = MEDIA.items.length; renderBr();
  /* 預設勾選：影片（非串流）全部，圖片不勾 */
  MEDIA.items.forEach(function(m){ if((m.kind === 'video' || m.kind === 'hls') && MEDIA.sel.size < 3) MEDIA.sel.add(m.url); });
  if(MEDIA.sheet) drawMedia();
});
function visibleMedia(){
  return MEDIA.items.filter(function(m){ return MEDIA.tab === 'all' || mKindGroup(m.kind) === MEDIA.tab; });
}
function drawMedia(){
  var s = MEDIA.sheet; if(!s) return;
  var body = s.body; body.textContent = '';
  var cnt = {all: MEDIA.items.length, image: 0, video: 0, audio: 0};
  MEDIA.items.forEach(function(m){ cnt[mKindGroup(m.kind)]++; });
  if(!MEDIA.items.length){
    body.appendChild(h('div', {class: 'empty', html: '<div class="big">🎞</div>這個頁面沒有偵測到可下載的圖片或影片<br><span class="sub">影片請先按下播放，App 會從網路請求中找到真正的影片來源（m3u8／mp4），再按一次「媒體」。</span>'}));
    MEDIA.dlBtn.disabled = true; return;
  }
  var seg = h('div', {class: 'seg', style: {marginBottom: '10px'}});
  [['all', '全部'], ['image', '圖片'], ['video', '影片'], ['audio', '音訊']].forEach(function(t){
    if(t[0] !== 'all' && !cnt[t[0]]) return;
    seg.appendChild(h('button', {class: MEDIA.tab === t[0] ? 'on' : '', text: t[1] + ' ' + cnt[t[0]], onclick: function(){ MEDIA.tab = t[0]; drawMedia(); }}));
  });
  body.appendChild(seg);
  var vis = visibleMedia();
  var vids = vis.filter(function(m){ return m.kind !== 'image'; });
  var imgs = vis.filter(function(m){ return m.kind === 'image'; });
  if(vids.length){
    var vb = h('div');
    vids.forEach(function(m){
      var dis = m.kind === 'stream' || m.kind === 'dash';
      var row = h('div', {class: 'mRow' + (MEDIA.sel.has(m.url) ? ' on' : ''), style: dis ? {opacity: .6} : null});
      var vi = h('div', {class: 'vi', html: icon(m.kind === 'audio' ? 'audio' : 'video', 'lg'), style: {background: m.kind === 'audio' ? 'var(--c-audio)' : 'var(--c-video)'}});
      if(m.poster){ vi.style.backgroundImage = 'url("' + pxUrl(m.poster) + '")'; vi.innerHTML = '<span style="background:rgba(0,0,0,.4);border-radius:50%;width:26px;height:26px;display:grid;place-items:center">' + icon('play', 'sm fill') + '</span>'; }
      var meta = [KIND_NAME[m.kind] || m.kind];
      if(m.w && m.h) meta.push(m.w + '×' + m.h);
      if(m.dur) meta.push(fmtDur(m.dur));
      if(m.net) meta.push('網路偵測');
      var t = h('div', {class: 't'}, h('b', {text: m.name || m.alt || hostOf(m.url)}), h('div', {class: 'sub', text: (m.note ? m.note + '・' : '') + meta.join('・') + '\n' + m.url}));
      if(m.kind === 'hls' && isApp){
        var q = h('select', {onclick: function(e){ e.stopPropagation(); }});
        q.appendChild(h('option', {value: ''}, '畫質：依設定（' + vidQName(CFG.media.vidQ) + '）'));
        var info = MEDIA.hls[m.url];
        if(info && info.variants) info.variants.forEach(function(v){ var o = h('option', {value: v.url}, v.name || (v.h + 'p')); if(m.variant === v.url) o.selected = true; q.appendChild(o); });
        else if(info && info.err) q.appendChild(h('option', {value: '', disabled: true}, '讀取畫質失敗'));
        else { q.appendChild(h('option', {value: '', disabled: true}, '讀取可用畫質中…')); if(!info){ MEDIA.hls[m.url] = {loading: true}; NAT.call('hlsInfo', m.url, MEDIA.page); } }
        q.onchange = function(){ m.variant = q.value; };
        t.appendChild(q);
      }
      row.appendChild(vi); row.appendChild(t);
      row.appendChild(h('span', {class: 'ck', html: icon('check'), style: {position: 'static', width: '26px', height: '26px', borderRadius: '50%', display: 'grid', placeItems: 'center', border: '2px solid var(--border)', background: MEDIA.sel.has(m.url) ? 'var(--accent)' : 'none', color: '#fff', flex: 'none'}}));
      row.onclick = function(){ if(dis){ toast(m.kind === 'dash' ? 'DASH 串流暫不支援，請找同一部影片的 m3u8／mp4' : '這是瀏覽器內部的串流，請改選偵測到的 m3u8／mp4', true); return; } toggleMedia(m); };
      vb.appendChild(row);
    });
    body.appendChild(vb);
  }
  if(imgs.length){
    if(vids.length) body.appendChild(h('div', {class: 'sect-h', style: {margin: '12px 2px 8px'}}, h('span', {text: '圖片 ' + imgs.length})));
    var g = h('div', {class: 'mGrid'});
    imgs.forEach(function(m){
      var img = h('img', {loading: 'lazy', alt: '', referrerpolicy: 'no-referrer', src: pxUrl(m.url)});
      img.onerror = function(){ if(!isApp && !img.__p){ img.__p = 1; proxyFetch(m.url, 'blob').then(function(r){ img.src = URL.createObjectURL(r.blob); }).catch(function(){}); } };
      img.onload = function(){ if(!m.w){ m.w = img.naturalWidth; m.h = img.naturalHeight; var mt = cell.querySelector('.meta'); if(mt) mt.textContent = m.w + '×' + m.h; } };
      var cell = h('div', {class: 'mCell' + (MEDIA.sel.has(m.url) ? ' on' : '')}, img,
        h('span', {class: 'ck', html: icon('check')}),
        h('div', {class: 'meta', text: m.w && m.h ? m.w + '×' + m.h : (m.alt || '')}));
      var press = 0;
      cell.addEventListener('pointerdown', function(){ press = setTimeout(function(){ press = -1; previewImg(m); }, 450); });
      cell.addEventListener('pointerup', function(){ if(press > 0){ clearTimeout(press); toggleMedia(m, cell); } press = 0; });
      cell.addEventListener('pointerleave', function(){ if(press > 0) clearTimeout(press); press = 0; });
      g.appendChild(cell);
    });
    body.appendChild(g);
    body.appendChild(h('div', {class: 'sub', style: {textAlign: 'center', marginTop: '8px'}, text: '點一下選取・長按預覽大圖'}));
  }
  /* 輸出設定 */
  var mo = CFG.media;
  var opt = h('div', {class: 'card glass', style: {marginTop: '14px'}}, h('h3', {html: icon('sliders') + '輸出格式與解析度'}));
  opt.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '圖片格式'), segRow([['orig', '原始'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']], 'media.imgFmt', function(){ drawMedia(); })));
  opt.appendChild(selRow('圖片解析度', [[0, '原始大小'], [3840, '最長邊 3840px（4K）'], [2560, '2560px'], [1920, '1920px（Full HD）'], [1280, '1280px'], [800, '800px（省空間）']], 'media.imgMax'));
  if(mo.imgFmt === 'jpg' || mo.imgFmt === 'webp' || (mo.imgFmt === 'orig' && mo.imgMax)) opt.appendChild(rangeRow('圖片品質', 'media.imgQ', 50, 100, 5, function(v){ return v + '%'; }));
  opt.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '影片輸出'), segRow([['mp4', 'MP4'], ['orig', '原始格式'], ['m4a', '只要音訊 M4A']], 'media.vidOut')));
  opt.appendChild(selRow('影片畫質（串流影片可選）', [['max', '最高畫質'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['min', '最低（省空間）']], 'media.vidQ'));
  opt.appendChild(swRow('打包成一個 ZIP', '選了多個檔案時，合併成一個壓縮檔存進檔案庫', 'media.zip'));
  opt.appendChild(rangeRow('忽略小於這個尺寸的圖片', 'media.minPx', 0, 400, 20, function(v){ return v ? v + 'px' : '不忽略'; }));
  if(!isApp) opt.appendChild(h('div', {class: 'note', text: '網頁版：圖片可轉格式與解析度；影片只能下載直連的 mp4／webm（HLS 串流、轉 M4A 需 APK 版）。'}));
  body.appendChild(opt);
  paintIcons(body);
  updateMediaBtn();
}
function vidQName(v){ return {max: '最高', min: '最低'}[v] || v + 'p'; }
on('hlsInfo', function(d){ MEDIA.hls[d.url] = d; if(MEDIA.sheet) drawMedia(); });
function toggleMedia(m, cell){
  if(MEDIA.sel.has(m.url)) MEDIA.sel.delete(m.url); else MEDIA.sel.add(m.url);
  if(cell) cell.classList.toggle('on', MEDIA.sel.has(m.url)); else drawMedia();
  updateMediaBtn();
}
function updateMediaBtn(){
  var n = MEDIA.sel.size;
  MEDIA.dlBtn.disabled = !n;
  MEDIA.dlBtn.innerHTML = icon('download', 'sm') + (n ? '下載 ' + n + ' 個' + (n > 1 && CFG.media.zip ? '（ZIP）' : '') : '請選擇要下載的檔案');
  var vis = visibleMedia().filter(function(m){ return m.kind !== 'stream' && m.kind !== 'dash'; });
  var allOn = vis.length && vis.every(function(m){ return MEDIA.sel.has(m.url); });
  MEDIA.selAll.innerHTML = icon('checks', 'sm') + (allOn ? '取消全選' : '全選');
}
function previewImg(m){
  var img = h('img', {src: pxUrl(m.url), referrerpolicy: 'no-referrer', style: {maxWidth: '100%', maxHeight: '60vh', display: 'block', margin: '0 auto', borderRadius: '12px'}});
  var d = dialog(esc(m.name || '圖片'), '', [[MEDIA.sel.has(m.url) ? '取消選取' : '選取', function(){ toggleMedia(m); }], ['關閉', null, '']]);
  d.el.insertBefore(h('div', null, img, h('div', {class: 'sub', style: {marginTop: '6px', wordBreak: 'break-all'}, text: (m.w ? m.w + '×' + m.h + '・' : '') + m.url})), d.el.querySelector('.acts'));
}
function startMediaDl(){
  var pick = MEDIA.items.filter(function(m){ return MEDIA.sel.has(m.url) && m.kind !== 'stream' && m.kind !== 'dash'; });
  if(!pick.length) return;
  var mo = CFG.media;
  var req = {page: MEDIA.page, title: MEDIA.title,
    items: pick.map(function(m, i){ return {url: m.url, kind: m.kind, name: mediaName(m, i), variant: m.variant || '', referer: MEDIA.page}; }),
    opts: {imgFmt: mo.imgFmt, imgMax: +mo.imgMax || 0, imgQ: +mo.imgQ || 90, vidOut: mo.vidOut, vidQ: mo.vidQ, zip: !!mo.zip, zipName: (MEDIA.title || '媒體').slice(0, 60) + '_媒體'}};
  if(MEDIA.sheet) MEDIA.sheet.close();
  dlCard(0, pick.length, '準備下載…', 0);
  if(isApp) NAT.call('dlStart', JSON.stringify(req)); else webMediaDl(req);
}
function mediaName(m, i){
  var n = (m.name || '').replace(/\?.*$/, '');
  if(!n || n.length < 3 || /^(index|master|playlist|video|image|img)\.?/i.test(n)){
    var base = (MEDIA.title || hostOf(MEDIA.page) || 'media').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 40);
    n = base + '_' + (i + 1) + (n ? '_' + n : '');
  }
  return n;
}
var DL = {n: 0};
function dlCard(i, n, name, pct){
  DL.n = n;
  var overall = n ? (i + Math.max(0, Math.min(1, pct || 0))) / n : 0;
  Dock.set('dl', h('div', {class: 'dockCard glass'}, h('span', {html: ring(overall)}),
    h('div', {class: 't'}, h('b', {text: '下載中 ' + Math.min(n, i + 1) + '/' + n + '・' + Math.round(overall * 100) + '%'}), h('div', {class: 'sub', text: name || ''})),
    h('button', {class: 'btn sm ghost', text: '取消', onclick: function(){ if(isApp) NAT.call('dlCancel'); else DL.cancel = true; toast('正在取消…'); }})));
}
on('dl', function(d){
  if(d.state === 'start') dlCard(0, d.n, '準備下載…', 0);
  else if(d.state === 'item'){
    var sz = d.got ? fmtSize(d.got) + (d.total > 0 ? ' / ' + fmtSize(d.total) : '') : (d.seg ? '片段 ' + d.seg : '');
    dlCard(d.i, d.n, (d.name || '') + (sz ? '・' + sz : ''), d.pct > 0 ? d.pct : 0);
  }
  else if(d.state === 'zip') dlCard(DL.n - 1, DL.n, '打包成 ZIP…', 1);
  else if(d.state === 'done'){
    Dock.remove('dl'); Lib.refresh(); flashLib();
    var items = d.items || [];
    if(d.fail && !d.ok) dialog('下載失敗', esc(d.msg || '').replace(/\n/g, '<br>'), [['好', null]]);
    else toast((d.cancel ? '已取消・' : '') + '✓ 已存入檔案庫 ' + (d.ok || 0) + ' 個' + (d.fail ? '，' + d.fail + ' 個失敗' : ''), !!d.fail,
      items.length ? ['查看', function(){ if(items.length === 1) Viewer.open(Lib.byId(items[0].id) || items[0]); else showView('lib'); }] : null);
  }
});

/* ---------- 網頁版下載 ---------- */
async function convertImageBlob(blob, fmt, maxPx, q){
  if((fmt === 'orig' && !maxPx) || /svg|gif/.test(blob.type) && fmt === 'orig') return blob;
  var bmp = await createImageBitmap(blob);
  var s = maxPx ? Math.min(1, maxPx / Math.max(bmp.width, bmp.height)) : 1;
  var c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  var x = c.getContext('2d');
  var type = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : fmt === 'jpg' ? 'image/jpeg' : (blob.type === 'image/png' ? 'image/png' : 'image/jpeg');
  if(type === 'image/jpeg'){ x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
  x.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(function(res){ c.toBlob(function(b){ res(b || blob); }, type, q / 100); });
}
function extOfType(t){ return ({'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg'})[t] || ''; }
async function webMediaDl(req){
  DL.cancel = false;
  var out = [], ok = 0, fail = 0, errs = [], n = req.items.length, used = {};
  for(var i = 0; i < n && !DL.cancel; i++){
    var it = req.items[i];
    dlCard(i, n, it.name, 0);
    try{
      if(it.kind === 'hls') throw new Error('HLS 串流需 APK 版');
      var r = await proxyFetch(it.url, 'blob');
      var b = r.blob;
      if(it.kind === 'image') b = await convertImageBlob(b, req.opts.imgFmt, req.opts.imgMax, req.opts.imgQ);
      var ext = extOfType(b.type) || (it.url.split('?')[0].match(/\.([a-z0-9]{2,4})$/i) || [, 'bin'])[1];
      var nm = it.name.replace(/\.[a-z0-9]{2,5}$/i, '') + '.' + ext;
      var k = 2; while(used[nm.toLowerCase()]) nm = nm.replace(/(\.\w+)$/, ' (' + (k++) + ')$1'); used[nm.toLowerCase()] = 1;
      out.push({name: nm, blob: b}); ok++;
    }catch(e){ fail++; errs.push(it.name + '：' + e.message); }
  }
  var items = [];
  try{
    if(req.opts.zip && out.length > 1){
      dlCard(n - 1, n, '打包成 ZIP…', 1);
      var z = new JSZip(); out.forEach(function(o){ z.file(o.name, o.blob); });
      var zb = await z.generateAsync({type: 'blob', compression: 'STORE'});
      items.push(await Lib.addBlob(zb, req.opts.zipName + '.zip', {src: req.page, title: req.title}));
    } else for(var j = 0; j < out.length; j++) items.push(await Lib.addBlob(out[j].blob, out[j].name, {src: req.page, title: req.title}));
  }catch(e){ errs.push('儲存：' + e.message); }
  fire('dl', {state: 'done', ok: ok, fail: fail, msg: errs.join('\n'), items: items, cancel: DL.cancel});
}
