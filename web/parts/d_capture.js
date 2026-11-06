/* ============================================================
   擷取（SingleFile 功能）：去廣告 → 單一離線 HTML／PDF
   ============================================================ */
var IMGQ = [['orig', '原始畫質', 0], ['high', '高（最長邊 1920px）', 1920], ['mid', '中（1280px）', 1280], ['low', '省空間（800px）', 800]];
function capName(tpl){
  var d = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; };
  return (tpl || '{title}').replace('{title}', (BR.title || BR.host || '網頁').replace(/\s+/g, ' ').trim().slice(0, 80))
    .replace('{host}', BR.host || '').replace('{date}', d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()))
    .replace('{time}', p(d.getHours()) + p(d.getMinutes())).replace(/[\\\/:*?"<>|]/g, '_');
}
var CAPTURING = false, CAP_SNAP = null;
on('snap', function(d){ if(d && CAP_SNAP && !CAP_SNAP.s.closed) CAP_SNAP.el.style.backgroundImage = 'url("' + d + '")'; });
function openCapture(){
  if(CAPTURING){ toast('正在擷取中，請稍候'); return; }
  var c = CFG.cap;
  if(!c.mode) c.mode = c.reader ? 'reader' : 'full';
  var comicNote = h('div', {class: 'note' + (c.mode === 'comic' ? '' : ' hide'), html: '🖼 <b>長條漫畫／圖集模式</b>：會先自動捲動載入整頁，只取出網頁裡的<b>內容圖片</b>（漫畫頁、相片），依順序<b>無縫接起來</b>，首頁按鈕、選單、留言、廣告等都不會出現。PDF 把圖片接在同一張長頁上（任何 PDF 閱讀器看都是連續長條），圖片不重新壓縮。'});
  var name = h('input', {type: 'text', value: capName(c.nameTpl)});
  var snap = h('div', {class: 'snap'});
  var fmts = [['html', 'HTML', '離線網頁', 'html', 'var(--c-html)'], ['pdf', 'PDF', '文件', 'pdf', 'var(--c-pdf)'], ['both', '兩者', 'HTML＋PDF', 'layers', 'var(--olive)']];
  var fmtBox = h('div', {class: 'fmtGrid'});
  var pdfBox = h('div');
  if(!c.pdfStyle) c.pdfStyle = 'page';
  var styleBox = h('div', {class: 'field'}, h('div', {class: 'lbl'}, 'PDF 版面'),
    segRow([['page', '一般網頁排版', 'pdf'], ['seamless', '無縫長條圖片', 'image']], 'cap.pdfStyle', function(){ drawFmt(); }),
    h('div', {class: 'sub', style: {margin: '6px 2px 0', fontSize: '12px'}, text: '無縫長條圖片：PDF 只放網頁裡的內容圖片，上下接起來沒有空隙，按鈕、選單、廣告都不會出現（適合漫畫、圖集）。'}));
  function drawFmt(){
    fmtBox.textContent = '';
    fmts.forEach(function(f){
      fmtBox.appendChild(h('div', {class: 'fmt' + (c.format === f[0] ? ' on' : ''), onclick: function(){ c.format = f[0]; saveCfg(); drawFmt(); }},
        h('div', {class: 'fi', html: icon(f[3]), style: {background: f[4]}}), f[1], h('div', {class: 'sub', text: f[2]})));
    });
    var comic = c.mode === 'comic';
    styleBox.classList.toggle('hide', c.format === 'html' || comic);
    pdfBox.classList.toggle('hide', c.format === 'html' || comic || c.pdfStyle === 'seamless');
  }
  drawFmt();
  var body = h('div', null,
    h('div', {class: 'capHead'}, snap, h('div', {class: 'grow'}, h('b', {class: 'ell', style: {display: 'block'}, text: BR.title || BR.host}), h('div', {class: 'sub ell', text: BR.url}),
      isApp ? h('div', {class: 'sub', style: {marginTop: '4px'}, html: icon('shield', 'sm') + ' 本頁已阻擋 ' + BR.blocked + ' 個廣告請求'}) : null)),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '檔名'), name),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '輸出格式'), fmtBox),
    styleBox,
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '擷取內容'), segRow([['full', '完整頁面', 'globe'], ['reader', '只要文章', 'book'], ['comic', '只要圖片', 'image']], 'cap.mode', function(v){ drawFmt(); CFG.cap.reader = v === 'reader'; saveCfg(); comicNote.classList.toggle('hide', v !== 'comic'); })),
    comicNote,
    h('div', {class: 'card glass', style: {padding: '4px 12px', marginTop: '12px'}},
      swRow('移除廣告', '依內建規則＋你的自訂規則移除廣告區塊', 'cap.removeAds'),
      swRow('嵌入圖片', '圖片存進檔案裡，離線也看得到', 'cap.embedImages'),
      swRow('嵌入字型', '保留網站原本的字體（檔案會大一點）', 'cap.embedFonts'),
      swRow('移除隱藏的元素', '彈出層、選單等看不見的內容不存', 'cap.removeHidden'),
      isApp ? swRow('先捲動載入所有圖片', '有「捲到才載入」的圖片時建議開啟', 'cap.autoScroll') : null,
      swRow('頁首加上原網址與儲存時間', null, 'cap.banner')),
    selRow('圖片畫質', IMGQ.map(function(x){ return [x[0], x[1]]; }), 'cap.imgQ'),
    pdfBox);
  pdfBox.appendChild(h('div', {class: 'card glass', style: {padding: '10px 12px'}}, h('h3', {html: icon('pdf') + 'PDF 設定'}),
    h('div', {class: 'two'}, selRow('紙張', [['a4', 'A4'], ['letter', 'Letter'], ['a3', 'A3']], 'cap.paper'), selRow('方向', [[false, '直式'], [true, '橫式']], 'cap.landscape', function(v){ CFG.cap.landscape = v === 'true'; saveCfg(); })),
    rangeRow('邊界', 'cap.margin', 0, 25, 1, function(v){ return v + ' mm'; }),
    !isApp ? h('div', {class: 'note', html: '網頁版會開啟瀏覽器的「列印」視窗，請選擇 <b>另存為 PDF</b>。'}) : null));
  drawFmt();
  var start = h('button', {class: 'btn pri lg', html: icon('download', 'sm') + '開始擷取'});
  var zapB = h('button', {class: 'btn', html: icon('scissors', 'sm') + '先手動清理', onclick: function(){ s.close(); if(!BR.zap) $('bZap').click(); }});
  var s = openSheet({title: '擷取網頁', icon: 'download', body: body, foot: h('div', {style: {display: 'contents'}}, zapB, start)});
  var sn = $('brSnap'); if(sn.src && isApp) snap.style.backgroundImage = 'url("' + sn.src + '")'; else snap.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:var(--accent)">' + icon('globe', 'lg') + '</div>';
  CAP_SNAP = {el: snap, s: s};
  start.onclick = function(){
    var nm = name.value.trim() || capName(c.nameTpl);
    s.close();
    runCapture(nm);
  };
}
$('bCap').addEventListener('click', openCapture);

var CAP_NEXT = null;
function capOpts(nm){
  var c = CFG.cap, q = IMGQ.filter(function(x){ return x[0] === c.imgQ; })[0] || IMGQ[0];
  return {name: nm, mode: c.mode || (c.reader ? 'reader' : 'full'), minRatio: 0.6, format: c.format, reader: c.mode === 'reader' || (!c.mode && !!c.reader), removeAds: !!c.removeAds, removeHidden: !!c.removeHidden, embedImages: !!c.embedImages, embedFonts: !!c.embedFonts,
    imgMaxPx: q[2], imgQuality: 0.85, pruneCss: true, autoScroll: !!c.autoScroll, banner: !!c.banner,
    extraCss: (CFG.adCss || '').split(/\n+/).map(function(x){ return x.trim(); }).filter(Boolean).join(','),
    paper: c.paper, landscape: !!c.landscape, margin: +c.margin || 0};
}
function capCard(pct, msg){
  Dock.set('cap', h('div', {class: 'dockCard glass'}, h('span', {html: ring(pct / 100)}),
    h('div', {class: 't'}, h('b', {text: '擷取中 ' + Math.round(pct) + '%'}), h('div', {class: 'sub', text: msg || ''}))));
}
function runCapture(nm){
  CAPTURING = true;
  capCard(1, '準備擷取…');
  var o = capOpts(nm);
  /* 一般擷取但 PDF 選「無縫長條圖片」：PDF 用圖片模式做；選「兩者」時先存 HTML，再做無縫 PDF */
  if(o.mode !== 'comic' && o.format !== 'html' && CFG.cap.pdfStyle === 'seamless'){
    var co = Object.assign({}, o, {mode: 'comic', format: 'pdf'});
    if(o.format === 'pdf') o = co;
    else { o.format = 'html'; CAP_NEXT = co; }
  }
  if(o.mode === 'comic'){ if(isApp) setTimeout(function(){ NAT.call('brComic', JSON.stringify(o)); }, 380); else webComic(o); return; }
  if(isApp){ setTimeout(function(){ NAT.call('brCapture', JSON.stringify(o)); }, 380); return; }
  webCapture(o);
}
on('cap', function(d){
  if(!d) return;
  if(d.state === 'progress') capCard(d.pct || 0, d.msg);
  else if(d.state === 'done'){
    CAPTURING = false; Dock.remove('cap');
    if(CAP_NEXT){ var nx = CAP_NEXT; CAP_NEXT = null; Lib.refresh(); CAPTURING = true; capCard(1, '製作無縫圖片 PDF…'); if(isApp) NAT.call('brComic', JSON.stringify(nx)); else webComic(nx); return; }
    var items = d.items || [];
    Lib.refresh();
    flashLib();
    toast('✓ 已儲存 ' + items.map(function(x){ return (CAT[x.cat] || CAT.other).name; }).join('＋') + '（' + fmtSize(items.reduce(function(s, x){ return s + (x.size || 0); }, 0)) + '）', false,
      items.length ? ['開啟', function(){ Viewer.open(Lib.byId(items[0].id) || items[0]); }] : null);
  } else if(d.state === 'error'){
    CAPTURING = false; Dock.remove('cap'); CAP_NEXT = null;
    dialog('擷取失敗', esc(d.msg || '未知錯誤') + '<br><br>可以試試：切換「只要文章」、關閉「嵌入字型」，或重新整理網頁後再擷取。', [['好', null]]);
  }
});
function flashLib(){ var d = $('libDot'); d.classList.remove('hide'); d.textContent = '新'; }
on('view', function(e){ if(e.v === 'lib') $('libDot').classList.add('hide'); });

/* ---------- 網頁版擷取 ---------- */
async function webFetchRes(url, kind){
  if(/^data:/.test(url)) return null;
  try{
    if(kind === 'css'){ var r = await proxyFetch(url, 'text'); return {mime: 'text/css', text: r.text}; }
    var b = await proxyFetch(url, 'blob');
    var mime = b.blob.type || b.mime || 'application/octet-stream';
    if(kind === 'img' && !/^image\//.test(mime)) mime = /\.png/i.test(url) ? 'image/png' : /\.webp/i.test(url) ? 'image/webp' : /\.gif/i.test(url) ? 'image/gif' : /\.svg/i.test(url) ? 'image/svg+xml' : 'image/jpeg';
    if(kind === 'font'){ mime = /\.woff2/i.test(url) ? 'font/woff2' : /\.woff/i.test(url) ? 'font/woff' : /\.ttf/i.test(url) ? 'font/ttf' : mime; }
    return {mime: mime, b64: await blobToB64(b.blob)};
  }catch(e){ return null; }
}
async function webCapture(o){
  try{
    if(!WEB.doc) throw new Error('請先開啟一個網頁');
    var r = await WSCapture.run(WEB.doc, Object.assign({}, o, {live: false, url: WEB.url, title: BR.title, removeHidden: false}), {
      fetch: webFetchRes, progress: function(p, m){ capCard(p, m); }
    });
    var items = [], thumbBlob = null;
    try{
      var og = WEB.doc.querySelector('meta[property="og:image"]'), fi = WEB.doc.querySelector('article img[src],main img[src],img[src]');
      var tu = og && og.content ? new URL(og.content, WEB.url).href : fi ? new URL(fi.getAttribute('src'), WEB.url).href : '';
      if(tu && !/^data:/.test(tu)) thumbBlob = (await proxyFetch(tu, 'blob')).blob;
    }catch(e){}
    var it = await Lib.addBlob(new Blob([r.html], {type: 'text/html'}), o.name + '.html', {src: WEB.url, title: r.title, thumbBlob: thumbBlob});
    items.push(it);
    if(o.format !== 'html') printHtml(r.html, o);
    if(o.format === 'pdf') toast('請在列印視窗選「另存為 PDF」');
    fire('cap', {state: 'done', items: items});
  }catch(e){ fire('cap', {state: 'error', msg: e.message}); }
}
function printHtml(html, o){
  var fr = h('iframe', {style: {position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0'}});
  document.body.appendChild(fr);
  var page = '@page{size:' + (o.paper || 'a4') + (o.landscape ? ' landscape' : '') + ';margin:' + (o.margin || 10) + 'mm}';
  fr.srcdoc = html.replace('</head>', '<style>' + page + '</style></head>');
  fr.onload = function(){ setTimeout(function(){ try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){ toast('無法開啟列印視窗', true); } setTimeout(function(){ fr.remove(); }, 60000); }, 600); };
}

/* ---------- 網頁版的長條漫畫模式：抓圖片 → JPEG → 自己寫 PDF ---------- */
function jsComicPdf(pages, title){
  /* pages: [{jpg: Uint8Array, w, h}] */
  var enc = new TextEncoder(), parts = [], pos = 0, off = [];
  function add(x){ var b = typeof x === 'string' ? latin(x) : x; parts.push(b); pos += b.length; }
  function latin(s){ var u = new Uint8Array(s.length); for(var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u; }
  var n = pages.length, info = 3 + n * 3;
  add('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  off[1] = pos; add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  var kids = []; for(var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
  off[2] = pos; add('2 0 obj\n<< /Type /Pages /Count ' + n + ' /Kids [' + kids.join(' ') + '] >>\nendobj\n');
  pages.forEach(function(p, i){
    var po = 3 + i * 3, ph = Math.max(10, 595 * p.h / p.w).toFixed(2), cs = 'q 595 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
    off[po] = pos; add(po + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ' + ph + '] /Resources << /XObject << /Im0 ' + (po + 2) + ' 0 R >> >> /Contents ' + (po + 1) + ' 0 R >>\nendobj\n');
    off[po + 1] = pos; add((po + 1) + ' 0 obj\n<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream\nendobj\n');
    off[po + 2] = pos; add((po + 2) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpg.length + ' >>\nstream\n'); add(p.jpg); add('\nendstream\nendobj\n');
  });
  var t = '<FEFF' + Array.prototype.map.call(String(title || ''), function(c){ return ('000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }).join('') + '>';
  off[info] = pos; add(info + ' 0 obj\n<< /Title ' + t + ' /Producer (WebSaver) >>\nendobj\n');
  var xref = pos, x = 'xref\n0 ' + (info + 1) + '\n0000000000 65535 f \n';
  for(var k = 1; k <= info; k++) x += ('0000000000' + off[k]).slice(-10) + ' 00000 n \n';
  add(x + 'trailer\n<< /Size ' + (info + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, {type: 'application/pdf'});
}
async function webComic(o){
  try{
    if(!WEB.doc) throw new Error('請先開啟一個網頁');
    var urls = [], seen = {};
    WEB.doc.querySelectorAll('img').forEach(function(img){
      var u = WSCapture.lazySrc(img, WEB.url) || img.getAttribute('src'); if(!u) return;
      try{ u = new URL(u, WEB.url).href; }catch(e){ return; }
      if(/^data:image\/(gif|svg)/.test(u) || seen[u]) return; seen[u] = 1; urls.push(u);
    });
    var got = [];
    for(var i = 0; i < urls.length; i++){
      capCard(5 + 70 * i / urls.length, '下載圖片 ' + (i + 1) + '/' + urls.length);
      try{ var b = (await proxyFetch(urls[i], 'blob')).blob; var bmp = await createImageBitmap(b); got.push({bmp: bmp, w: bmp.width, h: bmp.height}); }catch(e){}
    }
    var maxW = Math.max.apply(null, got.map(function(g){ return g.w; }).concat([1]));
    got = got.filter(function(g){ return g.w >= maxW * (o.minRatio || 0.6) && g.h >= 80; });
    if(!got.length) throw new Error('沒有找到內容圖片');
    var pages = [];
    for(var j = 0; j < got.length; j++){
      capCard(78 + 15 * j / got.length, '整理圖片 ' + (j + 1) + '/' + got.length);
      var g = got[j], s = Math.min(1, 1600 / g.w), c = document.createElement('canvas'); c.width = Math.round(g.w * s); c.height = Math.round(g.h * s);
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(g.bmp, 0, 0, c.width, c.height);
      var jb = await new Promise(function(r){ c.toBlob(r, 'image/jpeg', .92); });
      pages.push({jpg: new Uint8Array(await jb.arrayBuffer()), w: c.width, h: c.height});
    }
    var items = [];
    if(o.format !== 'html'){ var pdf = await Lib.addBlob(jsComicPdf(pages, BR.title), o.name + '.pdf', {src: WEB.url, title: BR.title}); pdf.seamless = true; lsSet('ws.seam:' + pdf.id, true); items.push(pdf); }
    if(o.format !== 'pdf'){
      var html = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(BR.title) + '</title><style>html,body{margin:0;background:#111}img{display:block;width:100%;max-width:900px;margin:0 auto}</style>';
      var hp = [html];
      for(var k = 0; k < pages.length; k++) hp.push('<img src="data:image/jpeg;base64,' + await blobToB64(new Blob([pages[k].jpg])) + '">');
      items.push(await Lib.addBlob(new Blob(hp, {type: 'text/html'}), o.name + '.html', {src: WEB.url, title: BR.title}));
    }
    fire('cap', {state: 'done', items: items});
  }catch(e){ fire('cap', {state: 'error', msg: e.message}); }
}
