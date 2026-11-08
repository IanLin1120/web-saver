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
function openMedia(force){
  if(force !== true && isApp){ var yid = YT.idOf(BR.url); if(yid){ openYt(yid); return; } }
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
  MEDIA.rec = ''; if(isApp && NAT.has('brRecCheck')) NAT.call('brRecCheck', '');
  else setTimeout(function(){ fire('media', {items: WEB.doc ? WSMedia.scan(WEB.doc, {minPx: CFG.media.minPx, live: false}) : [], page: WEB.url, title: BR.title}); }, 50);
}
$('bMedia').addEventListener('click', function(){ openMedia(); });
on('media', function(d){
  MEDIA.items = (d && d.items || []).filter(function(m){ return m.url; });
  MEDIA.page = d.page || BR.url; MEDIA.title = d.title || BR.title;
  BR.mediaN = MEDIA.items.filter(function(m){ return m.kind !== 'image' && mClass(m) !== 'ad'; }).length; renderBr();
  MEDIA.playing = d.playing || null; MEDIA.touched = false; MEDIA.showAds = false;
  /* 先讀每個串流的長度（用來對應正在播放的影片、分辨廣告） */
  if(isApp) MEDIA.items.forEach(function(m){ if(m.kind === 'hls' && !MEDIA.hls[m.url]){ MEDIA.hls[m.url] = {loading: true}; NAT.call('hlsInfo', m.url, MEDIA.page); } });
  autoSelMedia();
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
  var rc = recCard(); if(rc) body.appendChild(rc);
  var hob = handOffButtons(MEDIA.page || BR.url, function(){ if(MEDIA.sheet) MEDIA.sheet.close(); }); if(hob){ hob.style.marginBottom = '10px'; body.appendChild(hob); }
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
    var groups = {play: [], other: [], ad: []};
    vids.forEach(function(m){ groups[mClass(m)].push(m); });
    if(!groups.play.length && MEDIA.playing && MEDIA.playing.dur > 0 && Object.keys(MEDIA.hls).some(function(k){ return MEDIA.hls[k].loading; }))
      vb.appendChild(h('div', {class: 'note', style: {fontSize: '12px'}, text: '正在比對哪一個是你播放中的影片…'}));
    else if(!MEDIA.playing && vids.length > 1) vb.appendChild(h('div', {class: 'note', style: {fontSize: '12px'}, text: '小提示：先在網頁按播放影片幾秒再開這裡，App 會自動找出你正在看的那一部，並標示出廣告。'}));
    var order = groups.play.concat(groups.other).concat(MEDIA.showAds ? groups.ad : []);
    var shownN = 0;
    order.forEach(function(m){
      var cls = mClass(m);
      if(cls === 'play' && shownN === 0) vb.appendChild(h('div', {class: 'sect-h', style: {margin: '4px 2px 8px'}}, h('span', {text: '▶ 你正在播放的影片'})));
      if(cls === 'other' && (shownN === groups.play.length) && groups.play.length) vb.appendChild(h('div', {class: 'sect-h', style: {margin: '12px 2px 8px'}}, h('span', {text: '其他影片'})));
      if(cls === 'ad' && shownN === groups.play.length + groups.other.length) vb.appendChild(h('div', {class: 'sect-h', style: {margin: '12px 2px 8px'}}, h('span', {text: '可能是廣告或網站音效'})));
      shownN++;
      var dis = m.kind === 'stream' || m.kind === 'dash';
      var row = h('div', {class: 'mRow' + (MEDIA.sel.has(m.url) ? ' on' : ''), style: dis ? {opacity: .6} : null});
      var vi = h('div', {class: 'vi', html: icon(m.kind === 'audio' ? 'audio' : 'video', 'lg'), style: {background: m.kind === 'audio' ? 'var(--c-audio)' : 'var(--c-video)'}});
      if(m.poster){ vi.style.backgroundImage = 'url("' + pxUrl(m.poster) + '")'; vi.innerHTML = '<span style="background:rgba(0,0,0,.4);border-radius:50%;width:26px;height:26px;display:grid;place-items:center">' + icon('play', 'sm fill') + '</span>'; }
      var meta = [KIND_NAME[m.kind] || m.kind];
      if(m.w && m.h) meta.push(m.w + '×' + m.h);
      if(m.dur) meta.push(fmtDur(m.dur));
      if(m.net) meta.push('網路偵測');
      var P = MEDIA.playing, dd = mDur(m);
      if(cls === 'play' && P){
        row.classList.add('mPlay');
        if(P.thumb || P.poster){ vi.style.backgroundImage = 'url("' + (P.thumb || pxUrl(P.poster)) + '")'; vi.innerHTML = '<span class="pb">' + icon('play', 'sm fill') + '</span>'; }
        if(!m.name || m.net) m.name = pageVideoName();
        if(!m.w && P.w){ m.w = P.w; m.h = P.h; }
      } else if(m.net && !m.name){ m.name = (m.kind === 'audio' ? '音訊' : '影片') + (dd ? '（' + fmtDur(dd) + '）' : '') + '・' + hostOf(m.url); }
      if(dd && !m.dur) meta.push(fmtDur(dd));
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
    if(groups.ad.length) vb.appendChild(h('button', {class: 'btn block ghost', style: {marginTop: '6px'}, text: (MEDIA.showAds ? '隱藏' : '顯示') + '可能是廣告或網站音效的項目（' + groups.ad.length + '）', onclick: function(){ MEDIA.showAds = !MEDIA.showAds; drawMedia(); }}));
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
  opt.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '音訊格式（音訊檔與「只要音訊」）'), segRow([['orig', '原始'], ['mp3', 'MP3'], ['flac', 'FLAC'], ['wav', 'WAV']], 'media.audFmt')));
  opt.appendChild(swRow('打包成一個 ZIP', '選了多個檔案時，合併成一個壓縮檔存進檔案庫（需要轉成 MP3／FLAC／WAV 的音訊不打包）', 'media.zip'));
  /* 檔名與流水號 */
  var nm = h('div', {class: 'card glass', style: {marginTop: '12px'}}, h('h3', {html: icon('edit') + '檔名'}));
  nm.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '檔名用'), segRow([['orig', '原始檔名'], ['title', '網頁標題'], ['custom', '自訂']], 'media.nameMode', function(){ drawMedia(); })));
  if(mo.nameMode === 'custom'){ var ci = h('input', {type: 'text', value: mo.customName || '', placeholder: '例如：旅遊照片'}); ci.onchange = function(){ setCfg('media.customName', ci.value.trim()); drawMedia(); }; nm.appendChild(h('div', {class: 'field'}, ci)); }
  nm.appendChild(swRow('檔名後面加流水號', '依網頁上的順序：第一張圖是 001，往下依序編號', 'media.seqOn', function(){ drawMedia(); }));
  if(mo.seqOn){
    nm.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '編號方式'), segRow([['page', '依網頁中的位置'], ['sel', '依選取的檔案重新編號']], 'media.seqMode', function(){ drawMedia(); })));
    nm.appendChild(h('div', {class: 'two'}, selRow('位數', [[1, '1、2、3'], [2, '01、02'], [3, '001、002'], [4, '0001']], 'media.seqDigits', function(){ drawMedia(); }),
      selRow('連接符號', [['_', '底線 _'], ['-', '連字號 -'], [' ', '空格'], ['(', '括號 (1)']], 'media.seqSep', function(){ drawMedia(); })));
  }
  var ex = MEDIA.items.filter(function(m){ return MEDIA.sel.has(m.url); })[0] || MEDIA.items[0];
  if(ex) nm.appendChild(h('div', {class: 'note', html: '範例：<b>' + esc(mediaName(ex, 0)) + '</b>'}));
  opt.appendChild(nm);
  opt.appendChild(rangeRow('忽略小於這個尺寸的圖片', 'media.minPx', 0, 400, 20, function(v){ return v ? v + 'px' : '不忽略'; }));
  if(!isApp) opt.appendChild(h('div', {class: 'note', text: '網頁版：圖片可轉格式與解析度；影片只能下載直連的 mp4／webm（HLS 串流、轉 M4A 需 APK 版）。'}));
  body.appendChild(opt);
  paintIcons(body);
  updateMediaBtn();
}
function vidQName(v){ return {max: '最高', min: '最低'}[v] || v + 'p'; }
on('hlsInfo', function(d){ MEDIA.hls[d.url] = d; if(!MEDIA.touched) autoSelMedia(); if(MEDIA.sheet) drawMedia(); });
/* ---------- 分類：正在播放的影片／其他影片／可能是廣告或網站音效 ---------- */
function mDur(m){ var i = MEDIA.hls[m.url]; return m.dur || (i && i.dur) || 0; }
function mClass(m){
  if(m.kind === 'image') return 'image';
  if(m.kind === 'stream' && MEDIA.playing) return 'ad';
  var P = MEDIA.playing, d = mDur(m), u = String(m.url || '');
  if(P){
    if(P.src && /^https?:/.test(P.src) && P.src.split('#')[0] === u.split('#')[0]) return 'play';
    if(P.dur > 0 && d > 0 && Math.abs(d - P.dur) <= Math.max(3, P.dur * 0.015)) return 'play';
  }
  var path = u.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].toLowerCase();
  if(/\/(static|assets?|sounds?|sfx|media\/sound)\//.test(path) && m.kind !== 'hls') return 'ad';
  if(/(^|\/)(tip|notify|notice|message|beep|click|scan|qr|screen[_-]?shot|ding|ring|alert|test|sample|silence|blank)[^\/]*\.(mp3|mp4|wav|ogg|m4a|webm)$/.test(path)) return 'ad';
  if(/(^|[\/._-])(ads?|advert|preroll|vast|vpaid|promo|banner)([\/._-]|$)/.test(path)) return 'ad';
  if(d > 0 && d < 90 && (!P || P.dur > 300)) return 'ad';
  if(P && P.dur > 300 && d > 0 && d < P.dur * 0.5) return 'ad';
  return 'other';
}
function autoSelMedia(){
  MEDIA.sel = new Set();
  var vids = MEDIA.items.filter(function(m){ return m.kind !== 'image' && m.kind !== 'stream' && m.kind !== 'dash'; });
  var play = vids.filter(function(m){ return mClass(m) === 'play'; });
  var pick = play.length ? play.slice(0, 1) : vids.filter(function(m){ return mClass(m) === 'other' && (m.kind === 'hls' || m.kind === 'video'); }).slice(0, 1);
  pick.forEach(function(m){ MEDIA.sel.add(m.url); });
  if(MEDIA.dlBtn) updateMediaBtn();
}
function pageVideoName(){
  var t = String((MEDIA.playing && (MEDIA.playing.title || MEDIA.playing.heading)) || MEDIA.title || BR.title || '影片');
  return t.replace(/\s*[-|｜_–—]\s*[^-|｜_–—]{1,20}$/, '').trim() || t;
}
function toggleMedia(m, cell){
  MEDIA.touched = true;
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
    items: pick.map(function(m, i){
      var it = {url: m.url, kind: m.kind, name: mediaName(m, i), variant: m.variant || '', referer: MEDIA.page, seq: m.seq || i + 1};
      var aud = m.kind === 'audio' || ((m.kind === 'video' || m.kind === 'hls') && mo.vidOut === 'm4a');
      if(aud && mo.audFmt && mo.audFmt !== 'orig') it.convert = mo.audFmt + (mo.audFmt === 'mp3' ? ':320' : '');
      return it;
    }),
    opts: {imgFmt: mo.imgFmt, imgMax: +mo.imgMax || 0, imgQ: +mo.imgQ || 90, vidOut: mo.vidOut, vidQ: mo.vidQ, zip: !!mo.zip && !(mo.audFmt && mo.audFmt !== 'orig' && pick.some(function(m){ return m.kind === 'audio' || mo.vidOut === 'm4a'; })), zipName: (MEDIA.title || '媒體').slice(0, 60) + '_媒體'}};
  if(MEDIA.sheet) MEDIA.sheet.close();
  dlCard(0, pick.length, '準備下載…', 0);
  req.job = dlJobId(MEDIA.title || pick[0].name);
  if(isApp) NAT.call('dlStart', JSON.stringify(req)); else webMediaDl(req);
}
function mediaName(m, i){
  var mo = CFG.media, clean = function(x){ return String(x || '').replace(/[\\\/:*?"<>|]/g, '_').trim(); };
  var orig = (m.name || '').replace(/\?.*$/, ''), ext = (orig.match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
  var stem = orig.replace(/\.[a-z0-9]{2,5}$/i, '');
  var base;
  if(mo.nameMode === 'title') base = clean(MEDIA.title || hostOf(MEDIA.page) || '媒體').slice(0, 60);
  else if(mo.nameMode === 'custom') base = clean(mo.customName) || '媒體';
  else base = (!stem || stem.length < 2 || /^(index|master|playlist|video|image|img|default|large|original)$/i.test(stem)) ? clean(MEDIA.title || hostOf(MEDIA.page) || 'media').slice(0, 40) : clean(stem).slice(0, 80);
  var needSeq = mo.seqOn || (mo.nameMode !== 'orig');
  if(needSeq){
    var num;
    if(mo.seqMode === 'sel'){
      var g = m.kind === 'image' ? 'image' : m.kind === 'audio' ? 'audio' : 'video';
      var sel = MEDIA.items.filter(function(x){ return MEDIA.sel.has(x.url) && (x.kind === 'image' ? 'image' : x.kind === 'audio' ? 'audio' : 'video') === g; });
      num = sel.indexOf(m) + 1 || i + 1;
    } else num = m.seq || i + 1;
    var d = +mo.seqDigits || 3, s = String(num); while(s.length < d) s = '0' + s;
    var sep = mo.seqSep == null ? '_' : mo.seqSep;
    base += sep === '(' ? ' (' + s + ')' : sep + s;
  }
  return base + ext;
}
var DL = {n: 0};
var DLJ = {};
/* 還沒交給下載器之前（例如正在找串流網址）：先在懸浮按鈕顯示「準備中」 */
function dlCard(i, n, name, pct){
  if(!isApp && n > 1){ Tasks.set('dlpre', {title: '下載中 ' + Math.min(n, i + 1) + '/' + n, sub: name || '', pct: (i + Math.max(0, Math.min(1, pct || 0))) / n, kind: 'dl', cancel: function(){ DL.cancel = true; }}); return; }
  Tasks.set('dlpre', {title: '準備下載…', sub: name || '', pct: -1, kind: 'dl'});
}
function dlPreClear(){ Tasks.del('dlpre'); }
function dlJobId(label){ var j = 'j' + uid(); DLJ[j] = {label: label || ''}; return j; }
on('dl', function(d){
  var job = d.job || '', id = 'dl:' + (job || '0'), J = DLJ[job] = DLJ[job] || {label: ''};
  var cancel = function(){ if(isApp) NAT.call(NAT.has('dlCancelJob') ? 'dlCancelJob' : 'dlCancel', job); else DL.cancel = true; };
  if(d.state === 'queued'){
    dlPreClear();
    Tasks.set(id, {title: d.running >= d.max ? '排隊中（同時下載 ' + d.max + ' 個已滿）' : '開始下載…', sub: J.label, pct: 0, kind: 'dl', cancel: cancel});
  } else if(d.state === 'start'){
    dlPreClear(); J.n = d.n || 1; if(d.label) J.label = d.label;
    Tasks.set(id, {title: '下載中 0%', sub: J.label, pct: 0, kind: 'dl', cancel: cancel});
  } else if(d.state === 'item'){
    var n = d.n || J.n || 1, p = Math.max(0, Math.min(1, d.pct > 0 ? d.pct : 0)), all = ((d.i || 0) + p) / n;
    var sz = d.got ? fmtSize(d.got) + (d.total > 0 ? ' / ' + fmtSize(d.total) : '') : (d.seg ? '片段 ' + d.seg : '');
    Tasks.set(id, {title: '下載中 ' + (n > 1 ? Math.min(n, (d.i || 0) + 1) + '/' + n + '・' : '') + Math.round(all * 100) + '%', sub: (d.name || J.label || '') + (sz ? '・' + sz : ''), pct: all, kind: 'dl', cancel: cancel});
  } else if(d.state === 'zip'){
    Tasks.set(id, {title: '打包成 ZIP…', sub: J.label, pct: 1, kind: 'dl'});
  } else if(d.state === 'done'){
    Tasks.del(id); delete DLJ[job]; if(!job) dlPreClear();
    Lib.refresh(); flashLib();
    var items = d.items || [];
    if(d.fail && !d.ok && typeof ytWillRetry === 'function' && ytWillRetry(d)) return;
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
      out.push({name: nm, blob: b, convert: it.convert}); ok++;
    }catch(e){ fail++; errs.push(it.name + '：' + e.message); }
  }
  var items = [];
  try{
    if(req.opts.zip && out.length > 1){
      dlCard(n - 1, n, '打包成 ZIP…', 1);
      var z = new JSZip(); out.forEach(function(o){ z.file(o.name, o.blob); });
      var zb = await z.generateAsync({type: 'blob', compression: 'STORE'});
      items.push(await Lib.addBlob(zb, req.opts.zipName + '.zip', {src: req.page, title: req.title}));
    } else for(var j = 0; j < out.length; j++){
      var sv = await Lib.addBlob(out[j].blob, out[j].name, {src: req.page, title: req.title});
      if(out[j].convert){ var cp = String(out[j].convert).split(':'); Conv.add(sv, cp[0], {kbps: +cp[1] || 320}); }
      items.push(sv);
    }
  }catch(e){ errs.push('儲存：' + e.message); }
  fire('dl', {state: 'done', ok: ok, fail: fail, msg: errs.join('\n'), items: items, cancel: DL.cancel});
}

/* ---------- 錄製下載：把網頁上的影片（原畫面＋聲音）完整錄下來 ---------- */
on('recCan', function(r){ MEDIA.rec = String(r || ''); if(MEDIA.sheet) drawMedia(); });
function recCard(){
  if(!isApp || !NAT.has('brRecCheck')) return null;
  var r = MEDIA.rec;
  if(!r || r === 'novideo' || r === 'noscript' || r === 'err') return null;
  var ok = r === 'ok';
  var scr = NAT.has('srecAsk') ? h('div', {class: 'card glass', style: {padding: '12px 14px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px'}},
    h('span', {style: {background: 'var(--olive)', width: '40px', height: '40px', borderRadius: '12px', display: 'grid', placeItems: 'center', color: '#fff', flex: 'none'}, html: icon('phone')}),
    h('div', {class: 'grow', style: {minWidth: 0}}, h('b', {text: '手機螢幕錄影（勿擾模式）'}),
      h('div', {class: 'sub', style: {fontSize: '12px'}, text: '用手機內建的螢幕錄影：影片放大到整個螢幕、從頭播到結束自動停止。錄影時自動開勿擾、擋通知，結束後恢復'})),
    h('button', {class: 'btn sm', text: '錄影', onclick: function(){ startScreenRec(); }})) : null;
  return h('div', null, h('div', {class: 'card glass', style: {padding: '12px 14px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px'}},
    h('span', {class: 'oi', style: {background: ok ? 'var(--c-video)' : '#999', width: '40px', height: '40px', borderRadius: '12px', display: 'grid', placeItems: 'center', color: '#fff', flex: 'none'}, html: icon('film')}),
    h('div', {class: 'grow', style: {minWidth: 0}}, h('b', {text: '錄製下載（畫面＋聲音）'}),
      h('div', {class: 'sub', style: {fontSize: '12px'}, text: ok ? '偵測到可以錄製：錄下影片原本的畫面與聲音（最高畫質、只有影片畫面），需要跟影片一樣長的時間' : '這部影片有防錄製保護或來自其他網域，不能錄製，請用下面的一般下載'})),
    ok ? h('button', {class: 'btn sm pri', text: '錄製', onclick: function(){ startRec(); }}) : null), scr);
}
function startRec(){
  var src = MEDIA.playing && MEDIA.playing.src || '';
  var title = (pageVideoName ? pageVideoName() : (MEDIA.title || '影片')).replace(/\.[a-z0-9]{2,4}$/i, '');
  function go(here){
    if(MEDIA.sheet) MEDIA.sheet.close();
    var req = {job: dlJobId(title), page: MEDIA.page, title: MEDIA.title, items: [{kind: 'rec', url: src, page: MEDIA.page, referer: MEDIA.page, here: here, name: title, src: MEDIA.page, title: MEDIA.title, thumbUrl: MEDIA.playing && MEDIA.playing.poster || ''}], opts: {zip: false}};
    dlCard(0, 1, '準備錄製…', 0);
    NAT.call('dlStart', JSON.stringify(req));
    toast(here ? '開始錄製：這個分頁要保持開著，錄製期間影片不會發出聲音' : '在背景錄製：會在看不到的分頁從頭播放到結束');
  }
  menu('錄製方式', [
    ['film', '在背景錄製（建議）', function(){ go(false); }, false, '另開一個看不到的分頁從頭錄到結束，你可以繼續用 App'],
    ['play', '在目前分頁錄製', function(){ go(true); }, false, '網頁需要先點播放或登入時用這個；錄製期間不要離開這個網頁']
  ]);
}

/* ---------- 手機內建螢幕錄影：影片放大到整個螢幕 → 系統錄影（含 App 聲音）→ 播完自動停止，期間開勿擾 ---------- */
var SREC = {on: false};
function brRun(js){
  var ev = 'brr' + uid();
  var p = waitEv(ev, null, 8000).then(function(d){ try{ return JSON.parse(typeof d === 'string' ? JSON.parse(d) : d); }catch(e){ return {}; } });
  NAT.call('brRun', js, ev);
  return p;
}
async function startScreenRec(){
  if(MEDIA.sheet) MEDIA.sheet.close();
  if(SREC.on || NAT.call('srecOn')){ toast('已經在錄影中', true); return; }
  if(!NAT.call('dndOk')){
    var go = await new Promise(function(res){
      dialog('允許勿擾設定', '錄影時要自動開啟勿擾模式、擋掉通知橫幅，需要先允許「網頁擷取」變更勿擾設定（只要設定一次）。<br><br>按「去設定」後，在清單裡打開「網頁擷取」，再回來按一次錄影。',
        [['去設定', function(){ NAT.call('dndSettings'); res(false); }], ['這次不用勿擾', function(){ res(true); }], ['取消', function(){ res(false); }, '']]);
    });
    if(!go) return;
  }
  if(!NAT.call('audioOk')){
    toast('要錄到影片聲音，請允許「錄音」權限（只錄 App 播出的聲音，不會錄麥克風）');
    NAT.call('audioAsk');
    await waitEv('perm', null, 30000);
  }
  var info = await brRun("(function(){try{return window.__wsRec?__wsRec.screen(true):'{\"err\":\"noscript\"}'}catch(e){return '{\"err\":\"'+e.message+'\"}'}})()");
  if(!info || info.err){ toast('在網頁裡找不到影片，請先播放影片再試', true); return; }
  SREC.on = true; SREC.title = (typeof pageVideoName === 'function' ? pageVideoName() : (BR.title || '影片')).replace(/\.[a-z0-9]{2,4}$/i, '');
  setBrFull(true, true);
  NAT.call('uiFull', true, info.w > info.h);
  fabSync();
  setTimeout(function(){ NAT.call('srecAsk', SREC.title); }, 900);
}
function srecCleanup(){
  if(!SREC.on) return;
  SREC.on = false;
  brRun("(function(){return window.__wsRec?__wsRec.screen(false):'{}'})()");
  setBrFull(false, true);
  NAT.call('uiFull', false, false);
  fabSync();
}
on('srec', function(d){
  if(!d) return;
  if(d.state === 'start'){ setTimeout(function(){ brRun("(function(){return JSON.stringify(window.__wsRec?__wsRec.screenPlay():'none')})()"); }, 400); return; }
  srecCleanup();
  if(d.state === 'done'){
    Lib.refresh(); flashLib();
    var it = d.item;
    toast('✓ 螢幕錄影已存入檔案庫', false, it ? ['播放', function(){ Viewer.open(Lib.byId(it.id) || it); }] : null);
  } else if(d.state === 'err') dialog('螢幕錄影失敗', esc(d.msg || ''), [['好', null]]);
  else if(d.state === 'cancel') toast('已取消螢幕錄影');
});
