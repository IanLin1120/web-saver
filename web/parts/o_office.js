/* ============================================================
   文件：Word（.docx）、Excel（.xlsx／.xlsm 啟用巨集）、PowerPoint（.pptx）、文字檔（.txt…）
   在 App 內開啟、編輯、存檔；簡報可以全螢幕投影播放。
   做法：直接讀寫 Office 檔裡的 XML，只改你編輯的文字或儲存格，其他內容（排版、樣式、圖片、巨集 vbaProject.bin）原封不動保留。
   舊格式（.xls／.xlsb 二進位、.doc、.ppt）：.xls／.xlsb 可以讀取顯示；.doc／.ppt 請用其他 App。
   ============================================================ */
var Office = {dirty: false, back: null, saveFn: null};
function officeKind(it){
  var e = (String(it.name || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  if(e === 'docx' || e === 'docm') return 'docx';
  if(e === 'xlsx' || e === 'xlsm') return 'xlsx';
  if(e === 'xlsb' || e === 'xls' || e === 'ods') return 'xlsbin';
  if(e === 'pptx' || e === 'ppsx' || e === 'pptm') return 'pptx';
  if(e === 'csv') return 'txt';
  if(/^(txt|md|log|text|json|xml|ini|cfg|srt|vtt|lrc|bas|vb|js|css|html?)$/.test(e) && it.cat !== 'html') return 'txt';
  if(e === 'doc' || e === 'ppt') return 'old';
  return '';
}
/* ---------- 共用 ---------- */
var NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  s: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  pr: 'http://schemas.openxmlformats.org/package/2006/relationships'
};
function xParse(t){ return new DOMParser().parseFromString(t, 'application/xml'); }
function xStr(d){ return new XMLSerializer().serializeToString(d); }
function xKids(el, ns, name){ var out = []; if(!el) return out; for(var c = el.firstElementChild; c; c = c.nextElementSibling){ if(c.namespaceURI === ns && (!name || c.localName === name)) out.push(c); } return out; }
function xKid(el, ns, name){ if(!el) return null; for(var c = el.firstElementChild; c; c = c.nextElementSibling){ if(c.namespaceURI === ns && c.localName === name) return c; } return null; }
function xDesc(el, ns, name){ return el ? Array.prototype.slice.call(el.getElementsByTagNameNS(ns, name)) : []; }
function att(el, name, ns){ if(!el) return null; return ns ? el.getAttributeNS(ns, name) : el.getAttribute(name); }
function wv(el){ return el ? (el.getAttributeNS(NS.w, 'val') || el.getAttribute('w:val')) : null; }
async function zipText(zip, path){ var f = zip.file(path); return f ? await f.async('string') : null; }
async function zipRels(zip, path){
  var i = path.lastIndexOf('/'), relp = path.slice(0, i + 1) + '_rels/' + path.slice(i + 1) + '.rels';
  var t = await zipText(zip, relp), m = {};
  if(!t) return m;
  xDesc(xParse(t), NS.pr, 'Relationship').forEach(function(r){ m[r.getAttribute('Id')] = {target: r.getAttribute('Target'), type: r.getAttribute('Type'), mode: r.getAttribute('TargetMode')}; });
  return m;
}
function zipResolve(base, target){
  if(/^\//.test(target)) return target.slice(1);
  var parts = base.split('/'); parts.pop();
  target.split('/').forEach(function(p){ if(p === '..') parts.pop(); else if(p !== '.') parts.push(p); });
  return parts.join('/');
}
var OFF_URLS = [];
async function zipImg(zip, path){
  var f = zip.file(path); if(!f) return '';
  var ext = path.split('.').pop().toLowerCase();
  var mime = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp'}[ext];
  if(!mime) return '';   /* emf／wmf 瀏覽器不能顯示 */
  var u = URL.createObjectURL(new Blob([await f.async('uint8array')], {type: mime}));
  OFF_URLS.push(u); return u;
}
function offCleanup(){ OFF_URLS.forEach(function(u){ try{ URL.revokeObjectURL(u); }catch(e){} }); OFF_URLS = []; Office.dirty = false; Office.back = null; Office.saveFn = null; }
/* 把新內容寫回檔案庫裡的同一個檔案（分段傳給 App） */
async function officeSave(it, data){
  var u8 = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  if(!isApp){ downloadBlob(new Blob([u8], {type: it.mime || 'application/octet-stream'}), it.name); return true; }
  var token = 'ow' + uid(), CH = 512 * 1024, r = null;
  for(var i = 0; i < u8.length || i === 0; i += CH){
    var part = u8.subarray(i, Math.min(u8.length, i + CH)), s = '';
    for(var k = 0; k < part.length; k += 0x8000) s += String.fromCharCode.apply(null, part.subarray(k, k + 0x8000));
    var last = i + CH >= u8.length;
    r = JSON.parse(NAT.call('libOverwriteChunk', token, btoa(s), last, it.id) || '{}');
    if(r.ok === false) throw new Error(r.error || '寫入失敗');
    if(last) break;
  }
  it.size = r && r.size || u8.length; it.time = Date.now();
  if(typeof Lib !== 'undefined' && Lib.refresh) Lib.refresh().catch(function(){});
  return true;
}
/* 上方工具列：編輯／存檔／其他動作 */
function offBar(btns){ var b = h('div', {class: 'offBar'}); btns.filter(Boolean).forEach(function(x){ b.appendChild(x); }); paintIcons(b); return b; }
function offBtn(ic, text, fn, cls){ return h('button', {class: 'chip ' + (cls || ''), html: icon(ic, 'sm') + esc(text), onclick: fn}); }
function offMark(dirty){
  Office.dirty = dirty;
  var s = $('offSave'); if(s){ s.disabled = !dirty; s.classList.toggle('pri', dirty); }
  var st = $('offState'); if(st) st.textContent = dirty ? '● 尚未儲存' : '';
}
async function offDoSave(it, build){
  var s = $('offSave'); if(s){ s.disabled = true; s.innerHTML = '<span class="spin sm"></span>儲存中…'; }
  try{ var data = await build(); await officeSave(it, data); offMark(false); toast('✓ 已儲存'); }
  catch(e){ toast('儲存失敗：' + e.message, true); offMark(true); }
  if(s){ s.innerHTML = icon('check', 'sm') + '儲存'; paintIcons(s.parentNode); }
}

/* ============================================================ 文字檔 ============================================================ */
async function viewTxt(it, body){
  var buf = new Uint8Array(await (await Lib.blob(it)).arrayBuffer());
  var enc = 'utf-8', t = new TextDecoder('utf-8').decode(buf);
  /* 看起來不是 UTF-8（很多亂碼）：試 Big5（繁中 Windows 記事本） */
  if((t.match(/�/g) || []).length > 3){ try{ var b5 = new TextDecoder('big5').decode(buf); if((b5.match(/�/g) || []).length < (t.match(/�/g) || []).length){ t = b5; enc = 'big5'; } }catch(e){} }
  if(t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  var wrap = h('div', {class: 'offWrap'});
  var ta = h('textarea', {class: 'offTxt sel-text', spellcheck: false, readOnly: true, oninput: function(){ offMark(true); }}); ta.value = t;
  var mono = lsGet('ws.txtMono', false); ta.classList.toggle('mono', mono);
  var editB = offBtn('edit', '編輯', function(){ ta.readOnly = !ta.readOnly; editB.innerHTML = icon(ta.readOnly ? 'edit' : 'check', 'sm') + (ta.readOnly ? '編輯' : '完成'); if(!ta.readOnly) ta.focus(); });
  var saveB = offBtn('check', '儲存', function(){ Office.saveFn(); }); saveB.id = 'offSave'; saveB.disabled = true;
  wrap.appendChild(offBar([editB, saveB, h('span', {id: 'offState', class: 'offState'}), h('span', {class: 'grow'}),
    offBtn('txt', '等寬', function(){ mono = !mono; lsSet('ws.txtMono', mono); ta.classList.toggle('mono', mono); }),
    h('span', {class: 'offInfo', text: (enc === 'big5' ? 'Big5（存檔改 UTF-8）' : 'UTF-8') + '・' + t.length + ' 字'})]));
  wrap.appendChild(ta);
  body.appendChild(wrap);
  Office.saveFn = function(){ return offDoSave(it, async function(){ return new TextEncoder().encode(ta.value); }); };
}

/* ============================================================ Word（.docx） ============================================================ */
async function viewDocx(it, body){
  var zip = await JSZip.loadAsync(await Lib.blob(it));
  var docPath = 'word/document.xml';
  var doc = xParse(await zipText(zip, docPath));
  var rels = await zipRels(zip, docPath);
  /* 樣式：段落樣式的字級、粗體、標題等級 */
  var ST = {};
  var stx = await zipText(zip, 'word/styles.xml');
  if(stx){
    xDesc(xParse(stx), NS.w, 'style').forEach(function(s){
      var id = s.getAttributeNS(NS.w, 'styleId') || s.getAttribute('w:styleId'), rp = xKid(s, NS.w, 'rPr'), pp = xKid(s, NS.w, 'pPr'), nm = wv(xKid(s, NS.w, 'name')) || '';
      ST[id] = {name: nm.toLowerCase(), sz: rp && wv(xKid(rp, NS.w, 'sz')), b: rp && !!xKid(rp, NS.w, 'b'), i: rp && !!xKid(rp, NS.w, 'i'), color: rp && wv(xKid(rp, NS.w, 'color')), jc: pp && wv(xKid(pp, NS.w, 'jc')), based: wv(xKid(s, NS.w, 'basedOn'))};
    });
  }
  function stOf(id){ var s = ST[id], out = {}; var guard = 0; while(s && guard++ < 8){ ['sz', 'b', 'i', 'color', 'jc'].forEach(function(k){ if(out[k] == null && s[k] != null && s[k] !== false) out[k] = s[k]; }); if(!out.name) out.name = s.name; s = ST[s.based]; } return out; }
  var tNodes = [];   /* 每個 <w:t> 一個 span，編輯後依序寫回 */
  var numCnt = {};
  var page = h('div', {class: 'docPage'});
  async function runEl(r){
    var rp = xKid(r, NS.w, 'rPr'), frag = document.createDocumentFragment();
    var css = {};
    if(rp){
      if(xKid(rp, NS.w, 'b') && wv(xKid(rp, NS.w, 'b')) !== '0') css.fontWeight = '700';
      if(xKid(rp, NS.w, 'i') && wv(xKid(rp, NS.w, 'i')) !== '0') css.fontStyle = 'italic';
      var u = xKid(rp, NS.w, 'u'), st = xKid(rp, NS.w, 'strike');
      if((u && wv(u) !== 'none') || st) css.textDecoration = (u && wv(u) !== 'none' ? 'underline ' : '') + (st ? 'line-through' : '');
      var sz = wv(xKid(rp, NS.w, 'sz')); if(sz) css.fontSize = (sz / 2) + 'pt';
      var col = wv(xKid(rp, NS.w, 'color')); if(col && col !== 'auto') css.color = '#' + col;
      var hl = wv(xKid(rp, NS.w, 'highlight')); if(hl && hl !== 'none') css.background = hl;
      var sh = xKid(rp, NS.w, 'shd'); if(sh){ var f = sh.getAttributeNS(NS.w, 'fill'); if(f && f !== 'auto') css.background = '#' + f; }
      var va = wv(xKid(rp, NS.w, 'vertAlign')); if(va === 'superscript') css.verticalAlign = 'super'; if(va === 'subscript') css.verticalAlign = 'sub';
    }
    for(var c = r.firstElementChild; c; c = c.nextElementSibling){
      if(c.namespaceURI !== NS.w && c.localName !== 'drawing' && c.localName !== 'AlternateContent') continue;
      var ln = c.localName;
      if(ln === 't'){ var sp = h('span', {class: 'dT', 'data-i': tNodes.length, text: c.textContent}); Object.assign(sp.style, css); tNodes.push(c); frag.appendChild(sp); }
      else if(ln === 'tab') frag.appendChild(h('span', {class: 'dTab', text: '\t'}));
      else if(ln === 'br' || ln === 'cr') frag.appendChild(h('br'));
      else if(ln === 'drawing' || ln === 'pict' || ln === 'AlternateContent'){
        var blips = xDesc(c, NS.a, 'blip');
        for(var k = 0; k < blips.length; k++){
          var rid = blips[k].getAttributeNS(NS.r, 'embed'); var rel = rels[rid];
          if(rel){ var src = await zipImg(zip, zipResolve(docPath, rel.target)); if(src){
            var ext = xDesc(c, NS.wp, 'extent')[0], img = h('img', {src: src, class: 'dImg', contentEditable: 'false'});
            if(ext){ img.style.width = Math.min(100, (+ext.getAttribute('cx') / 914400 * 96) / 6.5) + '%'; }
            frag.appendChild(img);
          } }
        }
      }
    }
    return frag;
  }
  async function paraEl(p){
    var pp = xKid(p, NS.w, 'pPr'), sid = pp && wv(xKid(pp, NS.w, 'pStyle')), so = stOf(sid);
    var hm = (so.name || '').match(/^heading (\d)|^title$/);
    var el = h(hm ? 'h' + Math.min(6, +(hm[1] || 1)) : 'p', {class: 'dP'});
    var jc = (pp && wv(xKid(pp, NS.w, 'jc'))) || so.jc;
    if(jc) el.style.textAlign = {both: 'justify', center: 'center', right: 'right', end: 'right', distribute: 'justify'}[jc] || 'left';
    if(so.sz) el.style.fontSize = (so.sz / 2) + 'pt';
    if(so.b) el.style.fontWeight = '700';
    if(so.color && so.color !== 'auto') el.style.color = '#' + so.color;
    var ind = pp && xKid(pp, NS.w, 'ind'); if(ind){ var l = +(ind.getAttributeNS(NS.w, 'left') || ind.getAttributeNS(NS.w, 'start') || 0); if(l) el.style.paddingLeft = (l / 1440 * 96 * .8) + 'px'; var fl = +(ind.getAttributeNS(NS.w, 'firstLine') || 0); if(fl) el.style.textIndent = (fl / 1440 * 96 * .8) + 'px'; }
    var num = pp && xKid(pp, NS.w, 'numPr');
    if(!num && /^list (bullet|number)/.test(so.name || '')){ el.appendChild(h('span', {class: 'dNum', contentEditable: 'false', text: (/bullet/.test(so.name) ? '•' : ((numCnt[sid] = (numCnt[sid] || 0) + 1) + '.')) + ' '})); el.style.paddingLeft = '18px'; }
    if(num){ var nid = wv(xKid(num, NS.w, 'numId')), lv = +(wv(xKid(num, NS.w, 'ilvl')) || 0), key = nid + '.' + lv; numCnt[key] = (numCnt[key] || 0) + 1;
      el.appendChild(h('span', {class: 'dNum', contentEditable: 'false', text: (/bullet|list bullet/.test(so.name || '') || lv % 2 ? '•' : numCnt[key] + '.') + ' '})); el.style.paddingLeft = (18 + lv * 20) + 'px'; }
    for(var c = p.firstElementChild; c; c = c.nextElementSibling){
      if(c.namespaceURI !== NS.w) continue;
      if(c.localName === 'r') el.appendChild(await runEl(c));
      else if(c.localName === 'hyperlink' || c.localName === 'ins' || c.localName === 'smartTag' || c.localName === 'sdt' || c.localName === 'fldSimple'){
        var rs = xDesc(c, NS.w, 'r'); for(var k = 0; k < rs.length; k++) el.appendChild(await runEl(rs[k]));
      }
    }
    if(!el.textContent && !el.querySelector('img')) el.appendChild(h('br'));
    return el;
  }
  async function tblEl(t){
    var tb = h('table', {class: 'dTbl'});
    var rows = xKids(t, NS.w, 'tr');
    for(var i = 0; i < rows.length; i++){
      var tr = h('tr');
      var cells = xKids(rows[i], NS.w, 'tc');
      for(var j = 0; j < cells.length; j++){
        var tcp = xKid(cells[j], NS.w, 'tcPr'), td = h('td');
        var span = tcp && wv(xKid(tcp, NS.w, 'gridSpan')); if(span) td.colSpan = +span;
        var vm = tcp && xKid(tcp, NS.w, 'vMerge'); if(vm && wv(vm) !== 'restart'){ td.className = 'vmc'; }
        var shd = tcp && xKid(tcp, NS.w, 'shd'); if(shd){ var f = shd.getAttributeNS(NS.w, 'fill'); if(f && f !== 'auto') td.style.background = '#' + f; }
        await blockInto(cells[j], td);
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    return h('div', {class: 'dTblW'}, tb);
  }
  async function blockInto(parent, out){
    for(var c = parent.firstElementChild; c; c = c.nextElementSibling){
      if(c.namespaceURI !== NS.w) continue;
      if(c.localName === 'p') out.appendChild(await paraEl(c));
      else if(c.localName === 'tbl') out.appendChild(await tblEl(c));
      else if(c.localName === 'sdt'){ var sc = xKid(c, NS.w, 'sdtContent'); if(sc) await blockInto(sc, out); }
    }
  }
  await blockInto(xKid(doc.documentElement, NS.w, 'body'), page);
  var wrap = h('div', {class: 'offWrap'}), scroll = h('div', {class: 'docScroll'}, page);
  var editing = false;
  var editB = offBtn('edit', '編輯', function(){
    editing = !editing;
    page.contentEditable = editing ? 'true' : 'false';
    page.classList.toggle('editing', editing);
    editB.innerHTML = icon(editing ? 'check' : 'edit', 'sm') + (editing ? '完成' : '編輯');
    if(editing) toast('點文字就能修改；Enter 會換行（同一段）');
  });
  page.addEventListener('input', function(){ offMark(true); });
  page.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); document.execCommand('insertText', false, '\n'); } });
  page.addEventListener('paste', function(e){ e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
  async function build(){
    /* 依 span 把文字寫回對應的 <w:t>；不在 span 裡的新字併到前一個 span */
    var texts = tNodes.map(function(){ return null; });
    var lastI = -1;
    (function walk(n){
      for(var c = n.firstChild; c; c = c.nextSibling){
        if(c.nodeType === 3){ if(lastI >= 0) texts[lastI] = (texts[lastI] || '') + c.nodeValue; continue; }
        if(c.nodeType !== 1) continue;
        if(c.classList.contains('dNum') || c.classList.contains('dTab')) continue;
        if(c.tagName === 'BR'){ continue; }
        if(c.classList.contains('dT')){ var i = +c.getAttribute('data-i'); lastI = i; texts[i] = (texts[i] || '') + c.textContent; continue; }
        walk(c);
      }
    })(page);
    tNodes.forEach(function(t, i){
      var v = texts[i] == null ? '' : texts[i];
      if(v === t.textContent) return;
      var parts = v.split('\n');
      t.textContent = parts[0];
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      var after = t;
      for(var k = 1; k < parts.length; k++){
        var br = doc.createElementNS(NS.w, 'w:br'); after.parentNode.insertBefore(br, after.nextSibling);
        var nt = doc.createElementNS(NS.w, 'w:t'); nt.textContent = parts[k]; nt.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        br.parentNode.insertBefore(nt, br.nextSibling); after = nt;
      }
    });
    zip.file(docPath, xStr(doc));
    return await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE', mimeType: it.mime});
  }
  var saveB = offBtn('check', '儲存', function(){ return offDoSave(it, build); }); saveB.id = 'offSave'; saveB.disabled = true;
  var zoom = lsGet('ws.docZoom', 1);
  function applyZoom(){ page.style.zoom = zoom; }
  wrap.appendChild(offBar([editB, saveB, h('span', {id: 'offState', class: 'offState'}), h('span', {class: 'grow'}),
    offBtn('minus', '', function(){ zoom = Math.max(.6, zoom - .1); lsSet('ws.docZoom', zoom); applyZoom(); }),
    offBtn('plus', '', function(){ zoom = Math.min(2, zoom + .1); lsSet('ws.docZoom', zoom); applyZoom(); })]));
  wrap.appendChild(scroll); applyZoom();
  body.appendChild(wrap);
  Office.saveFn = function(){ return saveB.onclick(); };
}

/* ============================================================ PowerPoint（.pptx）＋投影 ============================================================ */
var EMU = 914400 / 96;   /* 1px = 9525 EMU */
async function viewPptx(it, body){
  var zip = await JSZip.loadAsync(await Lib.blob(it));
  var presPath = 'ppt/presentation.xml', pres = xParse(await zipText(zip, presPath)), prels = await zipRels(zip, presPath);
  var sz = xKid(pres.documentElement, NS.p, 'sldSz'), W = +(sz && sz.getAttribute('cx') || 12192000) / EMU, H = +(sz && sz.getAttribute('cy') || 6858000) / EMU;
  var ids = xDesc(xKid(pres.documentElement, NS.p, 'sldIdLst'), NS.p, 'sldId').map(function(s){ var r = prels[s.getAttributeNS(NS.r, 'id')]; return r ? zipResolve(presPath, r.target) : null; }).filter(Boolean);
  /* 主題色 */
  var theme = {}, thPath = null;
  Object.keys(prels).forEach(function(k){ if(/theme$/.test(prels[k].type)) thPath = zipResolve(presPath, prels[k].target); });
  if(!thPath){ var any = Object.keys(zip.files).filter(function(f){ return /^ppt\/theme\/theme\d+\.xml$/.test(f); })[0]; thPath = any; }
  if(thPath){ var thx = await zipText(zip, thPath); if(thx){ var cs = xDesc(xParse(thx), NS.a, 'clrScheme')[0]; if(cs) for(var c = cs.firstElementChild; c; c = c.nextElementSibling){ var v = c.firstElementChild; if(v) theme[c.localName] = '#' + (v.getAttribute('lastClr') || v.getAttribute('val')); } } }
  theme.tx1 = theme.tx1 || theme.dk1; theme.bg1 = theme.bg1 || theme.lt1; theme.tx2 = theme.tx2 || theme.dk2; theme.bg2 = theme.bg2 || theme.lt2;
  function colorOf(el){
    if(!el) return null;
    var s = xKid(el, NS.a, 'srgbClr'), sc = xKid(el, NS.a, 'schemeClr'), sys = xKid(el, NS.a, 'sysClr'), c = null, node = null;
    if(s){ c = '#' + s.getAttribute('val'); node = s; } else if(sc){ c = theme[sc.getAttribute('val')] || null; node = sc; } else if(sys){ c = '#' + (sys.getAttribute('lastClr') || '000000'); node = sys; }
    if(c && node){
      var lm = xKid(node, NS.a, 'lumMod'), lo = xKid(node, NS.a, 'lumOff'), al = xKid(node, NS.a, 'alpha');
      if(lm || lo){ var n = parseInt(c.slice(1), 16), rgb = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function(x){ x = x * (lm ? +lm.getAttribute('val') / 1e5 : 1) + 255 * (lo ? +lo.getAttribute('val') / 1e5 : 0); return Math.max(0, Math.min(255, Math.round(x))); }); c = 'rgb(' + rgb.join(',') + ')'; }
      if(al){ var a = +al.getAttribute('val') / 1e5; if(c[0] === '#'){ var n2 = parseInt(c.slice(1), 16); c = 'rgba(' + [n2 >> 16 & 255, n2 >> 8 & 255, n2 & 255].join(',') + ',' + a + ')'; } }
    }
    return c;
  }
  var cache = {};
  async function part(path){
    if(cache[path]) return cache[path];
    var t = await zipText(zip, path); if(!t) return null;
    var o = {path: path, doc: xParse(t), rels: await zipRels(zip, path)};
    var lay = Object.keys(o.rels).map(function(k){ return o.rels[k]; }).filter(function(r){ return /slideLayout$|slideMaster$/.test(r.type); })[0];
    o.parent = lay ? zipResolve(path, lay.target) : null;
    cache[path] = o; return o;
  }
  function phOf(sp){ var nv = sp.firstElementChild; var ph = nv && xDesc(nv, NS.p, 'ph')[0]; return ph ? {type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || ''} : null; }
  async function inherit(o, ph){
    /* 從版面配置／母片找同一個預留位置：位置大小、對齊、預設字級與顏色 */
    var res = {xfrm: null, lvl: [], anchor: null}, cur = o.parent ? await part(o.parent) : null, guard = 0;
    while(cur && guard++ < 3){
      var sps = xDesc(cur.doc, NS.p, 'sp'), hit = null;
      for(var i = 0; i < sps.length && !hit; i++){ var q = phOf(sps[i]); if(q && ph.idx && q.idx === ph.idx && (q.type === ph.type || ph.type === 'body')) hit = sps[i]; }
      for(i = 0; i < sps.length && !hit; i++){ var q2 = phOf(sps[i]); if(q2 && (q2.type === ph.type || (/title/i.test(ph.type) && /title/i.test(q2.type)) || (ph.idx && q2.idx === ph.idx))) hit = sps[i]; }
      if(hit){
        var x = xDesc(hit, NS.a, 'xfrm')[0]; if(x && !res.xfrm) res.xfrm = x;
        var tb = xKid(hit, NS.p, 'txBody');
        if(tb){ var bp = xKid(tb, NS.a, 'bodyPr'); if(bp && !res.anchor && bp.getAttribute('anchor')) res.anchor = bp.getAttribute('anchor'); var ls = xKid(tb, NS.a, 'lstStyle'), l1 = ls && xKid(ls, NS.a, 'lvl1pPr'); if(l1) res.lvl.push(l1); }
      }
      if(/slideMaster/.test(cur.path)){ var txs = xDesc(cur.doc, NS.p, 'txStyles')[0], st = txs && xKid(txs, NS.p, /title/i.test(ph.type) ? 'titleStyle' : 'bodyStyle'), m1 = st && xKid(st, NS.a, 'lvl1pPr'); if(m1) res.lvl.push(m1); }
      cur = cur.parent ? await part(cur.parent) : null;
    }
    var d = {};
    res.lvl.forEach(function(l){ if(d.algn == null && l.getAttribute('algn')) d.algn = l.getAttribute('algn'); var rp = xKid(l, NS.a, 'defRPr'); if(rp){ if(d.sz == null && rp.getAttribute('sz')) d.sz = +rp.getAttribute('sz') / 100; if(d.b == null && rp.getAttribute('b')) d.b = rp.getAttribute('b') === '1'; if(d.color == null){ var c = colorOf(xKid(rp, NS.a, 'solidFill')); if(c) d.color = c; } } if(d.bu == null){ if(xKid(l, NS.a, 'buNone')) d.bu = ''; else if(xKid(l, NS.a, 'buChar')) d.bu = xKid(l, NS.a, 'buChar').getAttribute('char') || '•'; } });
    res.d = d;
    return res;
  }
  var tNodes = [];
  async function shapeEl(sp, o, grp){
    var ln = sp.localName, el, x = null;
    var spPr = xKid(sp, NS.p, 'spPr') || xKid(sp, NS.p, 'grpSpPr');
    x = spPr && xKid(spPr, NS.a, 'xfrm');
    var ph = phOf(sp), inh = null;
    if(ph){ inh = await inherit(o, ph); if(!x) x = inh.xfrm; }
    if(ln === 'grpSp'){
      var gx = xKid(xKid(sp, NS.p, 'grpSpPr'), NS.a, 'xfrm');
      var g = h('div', {class: 'pShape'});
      var off = gx && xKid(gx, NS.a, 'off'), ext = gx && xKid(gx, NS.a, 'ext'), co = gx && xKid(gx, NS.a, 'chOff'), ce = gx && xKid(gx, NS.a, 'chExt');
      var sub = {ox: off ? +off.getAttribute('x') : 0, oy: off ? +off.getAttribute('y') : 0, cx: co ? +co.getAttribute('x') : 0, cy: co ? +co.getAttribute('y') : 0, sx: ext && ce && +ce.getAttribute('cx') ? +ext.getAttribute('cx') / +ce.getAttribute('cx') : 1, sy: ext && ce && +ce.getAttribute('cy') ? +ext.getAttribute('cy') / +ce.getAttribute('cy') : 1};
      var frag = document.createDocumentFragment();
      for(var c = sp.firstElementChild; c; c = c.nextElementSibling){ if(/^(sp|pic|grpSp|graphicFrame|cxnSp)$/.test(c.localName) && c.namespaceURI === NS.p){ var e2 = await shapeEl(c, o, combine(grp, sub)); if(e2) frag.appendChild(e2); } }
      return frag;
    }
    if(!x) return null;
    var off2 = xKid(x, NS.a, 'off'), ext2 = xKid(x, NS.a, 'ext');
    if(!off2 || !ext2) return null;
    var X = +off2.getAttribute('x'), Y = +off2.getAttribute('y'), CX = +ext2.getAttribute('cx'), CY = +ext2.getAttribute('cy');
    if(grp){ X = grp.ox + (X - grp.cx) * grp.sx; Y = grp.oy + (Y - grp.cy) * grp.sy; CX *= grp.sx; CY *= grp.sy; }
    el = h('div', {class: 'pShape'});
    Object.assign(el.style, {left: X / EMU + 'px', top: Y / EMU + 'px', width: CX / EMU + 'px', height: CY / EMU + 'px'});
    var rot = +(x.getAttribute('rot') || 0); if(rot) el.style.transform = 'rotate(' + rot / 60000 + 'deg)';
    if(spPr){
      var sf = xKid(spPr, NS.a, 'solidFill'); if(sf){ var bc = colorOf(sf); if(bc) el.style.background = bc; }
      var lnn = xKid(spPr, NS.a, 'ln'); if(lnn && !xKid(lnn, NS.a, 'noFill')){ var lc = colorOf(xKid(lnn, NS.a, 'solidFill')); if(lc) el.style.border = Math.max(1, +(lnn.getAttribute('w') || 12700) / EMU) + 'px solid ' + lc; }
      var geom = xKid(spPr, NS.a, 'prstGeom'); if(geom && /ellipse/.test(geom.getAttribute('prst'))) el.style.borderRadius = '50%'; if(geom && /roundRect/.test(geom.getAttribute('prst'))) el.style.borderRadius = '10px';
      var bf = xKid(spPr, NS.a, 'blipFill'); if(bf){ var bl = xKid(bf, NS.a, 'blip'), rr = bl && o.rels[bl.getAttributeNS(NS.r, 'embed')]; if(rr){ var u = await zipImg(zip, zipResolve(o.path, rr.target)); if(u){ el.style.backgroundImage = 'url("' + u + '")'; el.style.backgroundSize = 'cover'; } } }
    }
    if(ln === 'pic'){
      var blip = xDesc(sp, NS.a, 'blip')[0], rel = blip && o.rels[blip.getAttributeNS(NS.r, 'embed')];
      if(rel){ var src = await zipImg(zip, zipResolve(o.path, rel.target)); if(src) el.appendChild(h('img', {src: src, class: 'pImg', draggable: false})); }
      return el;
    }
    if(ln === 'graphicFrame'){
      var tbl = xDesc(sp, NS.a, 'tbl')[0];
      if(tbl){
        var t = h('table', {class: 'pTbl'});
        xDesc(tbl, NS.a, 'tr').forEach(function(tr){ var r = h('tr'); xKids(tr, NS.a, 'tc').forEach(function(tc){ var td = h('td'); var tcPr = xKid(tc, NS.a, 'tcPr'); var f = tcPr && colorOf(xKid(tcPr, NS.a, 'solidFill')); if(f) td.style.background = f; var gs = tc.getAttribute('gridSpan'); if(gs) td.colSpan = +gs; if(tc.getAttribute('hMerge') || tc.getAttribute('vMerge')) return; textInto(xKid(tc, NS.a, 'txBody'), td, 14); r.appendChild(td); }); t.appendChild(r); });
        el.appendChild(t);
      }
      return el;
    }
    var tx = xKid(sp, NS.p, 'txBody');
    if(tx){
      var dd = inh ? inh.d : {}, defSz = dd.sz || (ph && /title/i.test(ph.type) ? 44 : ph ? 24 : 18);
      var bp = xKid(tx, NS.a, 'bodyPr');
      var tb = h('div', {class: 'pText'});
      var anc = (bp && bp.getAttribute('anchor')) || (inh && inh.anchor); tb.style.justifyContent = anc === 'ctr' ? 'center' : anc === 'b' ? 'flex-end' : 'flex-start';
      if(bp){ ['lIns', 'tIns', 'rIns', 'bIns'].forEach(function(k, i){ var v = bp.getAttribute(k); if(v != null) tb.style['padding' + ['Left', 'Top', 'Right', 'Bottom'][i]] = (+v / EMU) + 'px'; }); }
      var auto = bp && xKid(bp, NS.a, 'normAutofit'); var scale = auto && auto.getAttribute('fontScale') ? +auto.getAttribute('fontScale') / 1e5 : 1;
      textInto(tx, tb, defSz * scale, ph && /title/i.test(ph.type), dd);
      el.appendChild(tb);
    }
    return el;
  }
  function combine(a, b){ if(!a) return b; return {ox: a.ox + (b.ox - a.cx) * a.sx, oy: a.oy + (b.oy - a.cy) * a.sy, cx: b.cx, cy: b.cy, sx: a.sx * b.sx, sy: a.sy * b.sy}; }
  function textInto(tx, out, defSz, isTitle, dd){
    if(!tx) return; dd = dd || {};
    xKids(tx, NS.a, 'p').forEach(function(p){
      var pe = h('div', {class: 'pP'});
      var ppr = xKid(p, NS.a, 'pPr'); var al = (ppr && ppr.getAttribute('algn')) || dd.algn; if(al) pe.style.textAlign = {ctr: 'center', r: 'right', just: 'justify'}[al] || 'left';
      var lvl = ppr ? +(ppr.getAttribute('lvl') || 0) : 0; if(lvl) pe.style.paddingLeft = (lvl * 28) + 'px';
      var buc = ppr && xKid(ppr, NS.a, 'buChar'), bu = ppr && xKid(ppr, NS.a, 'buNone') ? '' : buc ? (buc.getAttribute('char') || '•') : (lvl ? '' : dd.bu || '');
      if(bu && !isTitle && p.textContent.trim()) pe.appendChild(h('span', {class: 'pBu', contentEditable: 'false', text: bu + ' '}));
      var any = false;
      for(var r = p.firstElementChild; r; r = r.nextElementSibling){
        if(r.namespaceURI !== NS.a) continue;
        if(r.localName === 'br'){ pe.appendChild(h('br')); continue; }
        if(r.localName !== 'r' && r.localName !== 'fld') continue;
        var t = xKid(r, NS.a, 't'); if(!t) continue;
        var rp = xKid(r, NS.a, 'rPr'), sp = h('span', {class: 'pT', 'data-i': tNodes.length, text: t.textContent});
        tNodes.push(t); any = true;
        var szz = rp && rp.getAttribute('sz'); sp.style.fontSize = (szz ? +szz / 100 : defSz) * (96 / 72) + 'px';
        if(rp && rp.getAttribute('b') ? rp.getAttribute('b') === '1' : dd.b) sp.style.fontWeight = '700';
        if(rp && rp.getAttribute('i') === '1') sp.style.fontStyle = 'italic';
        if(rp && rp.getAttribute('u') && rp.getAttribute('u') !== 'none') sp.style.textDecoration = 'underline';
        var cc = (rp && colorOf(xKid(rp, NS.a, 'solidFill'))) || dd.color; if(cc) sp.style.color = cc;
        pe.appendChild(sp);
      }
      var endSz = xKid(p, NS.a, 'endParaRPr'); if(!any){ pe.style.fontSize = ((endSz && endSz.getAttribute('sz') ? +endSz.getAttribute('sz') / 100 : defSz) * 96 / 72) + 'px'; pe.appendChild(h('br')); }
      out.appendChild(pe);
    });
  }
  async function bgOf(o){
    var cur = o, guard = 0;
    while(cur && guard++ < 3){
      var bg = xDesc(cur.doc, NS.p, 'bg')[0];
      if(bg){
        var bpr = xKid(bg, NS.p, 'bgPr');
        if(bpr){ var c = colorOf(xKid(bpr, NS.a, 'solidFill')); if(c) return c;
          var bf = xKid(bpr, NS.a, 'blipFill'), bl = bf && xKid(bf, NS.a, 'blip'), rr = bl && cur.rels[bl.getAttributeNS(NS.r, 'embed')];
          if(rr){ var u = await zipImg(zip, zipResolve(cur.path, rr.target)); if(u) return 'center/cover url("' + u + '")'; }
          var gf = xKid(bpr, NS.a, 'gradFill'); if(gf){ var gs = xDesc(gf, NS.a, 'gs').map(function(g){ return colorOf(g); }).filter(Boolean); if(gs.length) return 'linear-gradient(' + gs.join(',') + ')'; }
        }
        var ref = xKid(bg, NS.p, 'bgRef'); if(ref){ var c2 = colorOf(ref); if(c2) return c2; }
      }
      cur = cur.parent ? await part(cur.parent) : null;
    }
    return '#fff';
  }
  async function renderSlide(path, withMaster){
    var o = await part(path);
    var s = h('div', {class: 'pSlide', style: {width: W + 'px', height: H + 'px'}});
    s.style.background = await bgOf(o);
    /* 母片／版面配置上的固定圖片與裝飾（不是預留位置的） */
    if(withMaster){
      var chain = [], cur = o.parent ? await part(o.parent) : null, g = 0;
      while(cur && g++ < 2){ chain.unshift(cur); cur = cur.parent ? await part(cur.parent) : null; }
      for(var ci = 0; ci < chain.length; ci++){
        var tree0 = xDesc(chain[ci].doc, NS.p, 'spTree')[0];
        for(var c0 = tree0 && tree0.firstElementChild; c0; c0 = c0.nextElementSibling){
          if(c0.namespaceURI !== NS.p || !/^(sp|pic|grpSp)$/.test(c0.localName) || phOf(c0)) continue;
          var save = tNodes.length, e0 = await shapeEl(c0, chain[ci], null); tNodes.length = save;
          if(e0){ if(e0.querySelectorAll) qsa('.pT', e0).forEach(function(x){ x.classList.remove('pT'); x.removeAttribute('data-i'); }); e0.classList && e0.classList.add('pMaster'); s.appendChild(e0); }
        }
      }
    }
    var tree = xDesc(o.doc, NS.p, 'spTree')[0];
    for(var c = tree && tree.firstElementChild; c; c = c.nextElementSibling){
      if(c.namespaceURI !== NS.p || !/^(sp|pic|grpSp|graphicFrame|cxnSp)$/.test(c.localName)) continue;
      var e = await shapeEl(c, o, null); if(e) s.appendChild(e);
    }
    return s;
  }
  var wrap = h('div', {class: 'offWrap'}), list = h('div', {class: 'pList'});
  var slides = [];
  wrap.appendChild(h('div', {class: 'empty', id: 'pLoad', text: '讀取簡報中…（共 ' + ids.length + ' 張）'}));
  body.appendChild(wrap);
  for(var i = 0; i < ids.length; i++){
    var sl = await renderSlide(ids[i], true);
    var box = h('div', {class: 'pBox'}, h('div', {class: 'pNo', text: (i + 1) + ' / ' + ids.length}), h('div', {class: 'pFit'}, sl));
    slides.push({path: ids[i], el: sl, box: box});
    list.appendChild(box);
  }
  var ld = $('pLoad'); if(ld) ld.remove();
  function fit(){ slides.forEach(function(s){ var fw = s.box.clientWidth - 2; var k = fw / W; s.el.style.transform = 'scale(' + k + ')'; s.box.querySelector('.pFit').style.height = (H * k) + 'px'; }); }
  var editing = false;
  var editB = offBtn('edit', '編輯文字', function(){
    editing = !editing;
    slides.forEach(function(s){ s.el.contentEditable = editing ? 'true' : 'false'; s.el.classList.toggle('editing', editing); });
    editB.innerHTML = icon(editing ? 'check' : 'edit', 'sm') + (editing ? '完成' : '編輯文字');
  });
  list.addEventListener('input', function(){ offMark(true); });
  list.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); } });
  list.addEventListener('paste', function(e){ e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\n/g, ' ')); });
  async function build(){
    var texts = tNodes.map(function(){ return null; });
    slides.forEach(function(s){
      var lastI = -1;
      (function walk(n){ for(var c = n.firstChild; c; c = c.nextSibling){
        if(c.nodeType === 3){ if(lastI >= 0 && c.parentNode.classList && !c.parentNode.classList.contains('pT')) texts[lastI] = (texts[lastI] || '') + c.nodeValue; continue; }
        if(c.nodeType !== 1 || c.classList.contains('pBu') || c.classList.contains('pMaster')) continue;
        if(c.classList.contains('pT')){ var i = +c.getAttribute('data-i'); lastI = i; texts[i] = (texts[i] || '') + c.textContent; continue; }
        walk(c);
      } })(s.el);
    });
    var changed = {};
    tNodes.forEach(function(t, i){ var v = texts[i] == null ? '' : texts[i]; if(v !== t.textContent){ t.textContent = v; changed[t.ownerDocument.__path] = true; } });
    Object.keys(cache).forEach(function(p){ var o = cache[p]; if(/slides\/slide\d+\.xml$/.test(p)) zip.file(p, xStr(o.doc)); });
    return await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE', mimeType: it.mime});
  }
  var saveB = offBtn('check', '儲存', function(){ return offDoSave(it, build); }); saveB.id = 'offSave'; saveB.disabled = true;
  wrap.appendChild(offBar([offBtn('play', '投影播放', function(){ slideShow(0); }, 'pri'), editB, saveB, h('span', {id: 'offState', class: 'offState'})]));
  var sc = h('div', {class: 'docScroll pScroll'}, list);
  wrap.appendChild(sc);
  requestAnimationFrame(fit); setTimeout(fit, 200);
  var ro = window.ResizeObserver ? new ResizeObserver(fit) : null; if(ro) ro.observe(list);
  slides.forEach(function(s, i){ s.box.addEventListener('dblclick', function(){ if(!editing) slideShow(i); }); });
  Office.saveFn = function(){ return saveB.onclick(); };

  /* ---------- 全螢幕投影：點右邊／往左滑下一張，點左邊／往右滑上一張 ---------- */
  function slideShow(start){
    var idx = start, ov = h('div', {class: 'pShow'}), stage = h('div', {class: 'pStage'}), info = h('div', {class: 'pShowInfo'});
    var bar = h('div', {class: 'pShowBar'},
      h('button', {class: 'ib', html: icon('x'), onclick: close}),
      info,
      h('span', {class: 'grow'}),
      h('button', {class: 'ib', html: icon('back'), onclick: function(e){ e.stopPropagation(); go(-1); }}),
      h('button', {class: 'ib', html: icon('back'), style: {transform: 'scaleX(-1)'}, onclick: function(e){ e.stopPropagation(); go(1); }}));
    ov.appendChild(stage); ov.appendChild(bar); paintIcons(bar);
    document.body.appendChild(ov);
    if(isApp && NAT.has('uiFull')) NAT.call('uiFull', true, W > H);
    try{ if(ov.requestFullscreen && !isApp) ov.requestFullscreen().catch(function(){}); }catch(e){}
    var hideT = 0;
    function poke(){ bar.classList.add('on'); clearTimeout(hideT); hideT = setTimeout(function(){ bar.classList.remove('on'); }, 2500); }
    function draw(){
      stage.textContent = '';
      var c = slides[idx].el.cloneNode(true); c.contentEditable = 'false'; c.classList.remove('editing');
      var k = Math.min(innerWidth / W, innerHeight / H);
      c.style.transform = 'scale(' + k + ')'; c.style.position = 'absolute'; c.style.left = ((innerWidth - W * k) / 2) + 'px'; c.style.top = ((innerHeight - H * k) / 2) + 'px'; c.style.transformOrigin = '0 0';
      stage.appendChild(c);
      info.textContent = (idx + 1) + ' / ' + slides.length;
    }
    function go(d){ var n = idx + d; if(n < 0){ buzz(20); return; } if(n >= slides.length){ buzz(20); toast('已經是最後一張'); return; } idx = n; buzz(8); draw(); }
    function close(){ ov.remove(); window.removeEventListener('resize', draw); document.removeEventListener('keydown', key); if(isApp && NAT.has('uiFull')) NAT.call('uiFull', false, false); try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){} Office.back = prevBack; }
    function key(e){ if(e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') go(1); else if(e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1); else if(e.key === 'Escape') close(); }
    var sx = 0, sy = 0, st = 0;
    stage.addEventListener('touchstart', function(e){ sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); }, {passive: true});
    stage.addEventListener('touchend', function(e){ var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)){ go(dx < 0 ? 1 : -1); e.preventDefault(); } });
    stage.addEventListener('click', function(e){ var x = e.clientX; if(x > innerWidth * .66) go(1); else if(x < innerWidth * .33) go(-1); else poke(); });
    window.addEventListener('resize', draw); document.addEventListener('keydown', key);
    var prevBack = Office.back; Office.back = function(){ close(); return true; };
    draw(); poke();
  }
}

/* ============================================================ Excel（.xlsx／.xlsm）：保留樣式與巨集 ============================================================ */
function colName(n){ var s = ''; n++; while(n > 0){ var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function colIdx(s){ var n = 0; for(var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n - 1; }
function refRC(ref){ var m = /^([A-Z]+)(\d+)$/.exec(ref || ''); return m ? {c: colIdx(m[1]), r: +m[2] - 1} : null; }
var XL_FMT = {0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 14: 'yyyy/m/d', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy/m/d h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@'};
function xlFormat(v, fmt){
  if(v === '' || v == null || isNaN(+v)) return v;
  var n = +v; fmt = fmt || 'General';
  var f = fmt.split(';')[n < 0 && fmt.indexOf(';') > 0 ? 1 : 0].replace(/\[(Red|Black|Blue|Green|Color\d+|\$-[^\]]*)\]/gi, '').replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_.|\*./g, '');
  if(/General/i.test(f)) return String(Math.round(n * 1e10) / 1e10);
  if(/[ymdhs]/i.test(f) && !/0\.0*E/.test(f)){
    var d = new Date(Math.round((n - 25569) * 864e5)), pad = function(x, l){ x = String(x); while(x.length < (l || 2)) x = '0' + x; return x; };
    var hh = d.getUTCHours(), ap = /AM\/PM/i.test(f);
    return f.replace(/yyyy/gi, d.getUTCFullYear()).replace(/yy/gi, String(d.getUTCFullYear()).slice(2)).replace(/mmmm/gi, '%M4').replace(/mmm/gi, '%M3')
      .replace(/(h+)(:)(mm?)/gi, function(m, a, b, c){ return (ap ? (hh % 12 || 12) : (a.length > 1 ? pad(hh) : hh)) + ':' + pad(d.getUTCMinutes()); })
      .replace(/mm/g, pad(d.getUTCMonth() + 1)).replace(/m/g, d.getUTCMonth() + 1).replace(/dd/gi, pad(d.getUTCDate())).replace(/d/gi, d.getUTCDate())
      .replace(/hh?/gi, ap ? (hh % 12 || 12) : pad(hh)).replace(/ss/gi, pad(d.getUTCSeconds())).replace(/AM\/PM/i, hh < 12 ? 'AM' : 'PM')
      .replace('%M4', d.toLocaleString('en', {month: 'long', timeZone: 'UTC'})).replace('%M3', d.toLocaleString('en', {month: 'short', timeZone: 'UTC'}));
  }
  var pct = /%/.test(f); if(pct) n *= 100;
  var dm = /0\.(0+)/.exec(f), dec = dm ? dm[1].length : 0;
  if(/E\+/i.test(f)) return n.toExponential(dec).toUpperCase();
  var s = Math.abs(n).toFixed(dec);
  if(/#,##0|,/.test(f)){ var ps = s.split('.'); ps[0] = ps[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = ps.join('.'); }
  var pre = (f.match(/^[^#0?.,%]*/) || [''])[0], post = (f.match(/[^#0?.,%]*$/) || [''])[0];
  return (n < 0 && fmt.indexOf(';') < 0 ? '-' : '') + pre + s + (pct ? '%' : '') + post.replace('%', '');
}
async function viewXlsx(it, body){
  var zip = await JSZip.loadAsync(await Lib.blob(it));
  var wbPath = 'workbook.xml';
  var ct = await zipText(zip, '[Content_Types].xml');
  wbPath = Object.keys(zip.files).filter(function(f){ return /^xl\/workbook\d*\.xml$/.test(f); })[0] || 'xl/workbook.xml';
  var wb = xParse(await zipText(zip, wbPath)), wrels = await zipRels(zip, wbPath);
  var sheets = xDesc(wb, NS.s, 'sheet').map(function(s){ var r = wrels[s.getAttributeNS(NS.r, 'id')]; return {name: s.getAttribute('name'), path: r ? zipResolve(wbPath, r.target) : null, hidden: s.getAttribute('state') === 'hidden' || s.getAttribute('state') === 'veryHidden'}; }).filter(function(s){ return s.path && zip.file(s.path); });
  var hasVba = !!zip.file('xl/vbaProject.bin');
  /* 共用字串 */
  var SS = [], ssPath = null;
  Object.keys(wrels).forEach(function(k){ if(/sharedStrings$/.test(wrels[k].type)) ssPath = zipResolve(wbPath, wrels[k].target); });
  if(ssPath){ var sx = await zipText(zip, ssPath); if(sx) xDesc(xParse(sx), NS.s, 'si').forEach(function(si){ SS.push(xDesc(si, NS.s, 't').filter(function(t){ return t.parentNode.localName !== 'rPh'; }).map(function(t){ return t.textContent; }).join('')); }); }
  /* 樣式 */
  var stPath = null; Object.keys(wrels).forEach(function(k){ if(/styles$/.test(wrels[k].type)) stPath = zipResolve(wbPath, wrels[k].target); });
  var FMT = {}, FONTS = [], FILLS = [], BORDERS = [], XF = [];
  var theme = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
  var thp = Object.keys(zip.files).filter(function(f){ return /^xl\/theme\/theme\d+\.xml$/.test(f); })[0];
  if(thp){ var thx = await zipText(zip, thp); var cs = thx && xDesc(xParse(thx), NS.a, 'clrScheme')[0]; if(cs){ var order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']; order.forEach(function(nm, i){ var e = xKid(cs, NS.a, nm), v = e && e.firstElementChild; if(v) theme[i] = '#' + (v.getAttribute('lastClr') || v.getAttribute('val')); }); } }
  var IDX = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
  function xc(e){
    if(!e) return null;
    var rgb = e.getAttribute('rgb'), th = e.getAttribute('theme'), ix = e.getAttribute('indexed'), tint = +(e.getAttribute('tint') || 0), c = null;
    if(rgb) c = '#' + rgb.slice(-6); else if(th != null) c = theme[+th]; else if(ix != null && +ix < 64) c = '#' + IDX[+ix];
    if(c && tint){ var n = parseInt(c.slice(1), 16), rgbA = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function(x){ return Math.round(tint < 0 ? x * (1 + tint) : x + (255 - x) * tint); }); c = 'rgb(' + rgbA.join(',') + ')'; }
    return c;
  }
  if(stPath){
    var sd = xParse(await zipText(zip, stPath));
    xDesc(sd, NS.s, 'numFmt').forEach(function(n){ FMT[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
    xKids(xKid(sd.documentElement, NS.s, 'fonts'), NS.s, 'font').forEach(function(f){ FONTS.push({b: !!xKid(f, NS.s, 'b'), i: !!xKid(f, NS.s, 'i'), u: !!xKid(f, NS.s, 'u'), s: !!xKid(f, NS.s, 'strike'), sz: xKid(f, NS.s, 'sz') && +xKid(f, NS.s, 'sz').getAttribute('val'), c: xc(xKid(f, NS.s, 'color'))}); });
    xKids(xKid(sd.documentElement, NS.s, 'fills'), NS.s, 'fill').forEach(function(f){ var pf = xKid(f, NS.s, 'patternFill'); FILLS.push(pf && pf.getAttribute('patternType') && pf.getAttribute('patternType') !== 'none' ? xc(xKid(pf, NS.s, 'fgColor')) || xc(xKid(pf, NS.s, 'bgColor')) : null); });
    xKids(xKid(sd.documentElement, NS.s, 'borders'), NS.s, 'border').forEach(function(b){ var o = {}; ['left', 'right', 'top', 'bottom'].forEach(function(k){ var e = xKid(b, NS.s, k); if(e && e.getAttribute('style')) o[k] = {st: e.getAttribute('style'), c: xc(xKid(e, NS.s, 'color')) || '#000'}; }); BORDERS.push(o); });
    xKids(xKid(sd.documentElement, NS.s, 'cellXfs'), NS.s, 'xf').forEach(function(x){ var al = xKid(x, NS.s, 'alignment'); XF.push({fmt: +(x.getAttribute('numFmtId') || 0), font: +(x.getAttribute('fontId') || 0), fill: +(x.getAttribute('fillId') || 0), border: +(x.getAttribute('borderId') || 0), ha: al && al.getAttribute('horizontal'), va: al && al.getAttribute('vertical'), wrap: al && al.getAttribute('wrapText') === '1'}); });
  }
  var SHEETS = {};
  async function loadSheet(sh){
    if(SHEETS[sh.path]) return SHEETS[sh.path];
    var d = xParse(await zipText(zip, sh.path));
    var o = {doc: d, cells: {}, maxR: 0, maxC: 0, cols: {}, rows: {}, merges: [], data: xKid(d.documentElement, NS.s, 'sheetData')};
    xDesc(xKid(d.documentElement, NS.s, 'cols'), NS.s, 'col').forEach(function(c){ for(var i = +c.getAttribute('min'); i <= +c.getAttribute('max') && i < 400; i++) o.cols[i - 1] = {w: +c.getAttribute('width') || 8.43, hidden: c.getAttribute('hidden') === '1', s: c.getAttribute('style')}; });
    var dfc = xKid(d.documentElement, NS.s, 'sheetFormatPr'); o.defW = dfc && dfc.getAttribute('defaultColWidth') ? +dfc.getAttribute('defaultColWidth') : 8.43; o.defH = dfc && dfc.getAttribute('defaultRowHeight') ? +dfc.getAttribute('defaultRowHeight') : 15;
    xKids(o.data, NS.s, 'row').forEach(function(r){
      var ri = +r.getAttribute('r') - 1; o.rows[ri] = {el: r, h: r.getAttribute('ht') ? +r.getAttribute('ht') : null, hidden: r.getAttribute('hidden') === '1'};
      xKids(r, NS.s, 'c').forEach(function(c){ var rc = refRC(c.getAttribute('r')); if(!rc) return; o.cells[rc.r + ',' + rc.c] = c; if(rc.r > o.maxR) o.maxR = rc.r; if(rc.c > o.maxC) o.maxC = rc.c; });
      if(ri > o.maxR && r.firstElementChild) o.maxR = ri;
    });
    xDesc(xKid(d.documentElement, NS.s, 'mergeCells'), NS.s, 'mergeCell').forEach(function(m){ var p = m.getAttribute('ref').split(':'), a = refRC(p[0]), b = refRC(p[1] || p[0]); if(a && b) o.merges.push({r1: a.r, c1: a.c, r2: b.r, c2: b.c}); });
    SHEETS[sh.path] = o; return o;
  }
  function cellRaw(c){
    if(!c) return {v: '', f: ''};
    var t = c.getAttribute('t'), v = xKid(c, NS.s, 'v'), f = xKid(c, NS.s, 'f'), val = v ? v.textContent : '';
    if(t === 's') val = SS[+val] || '';
    else if(t === 'inlineStr'){ var is = xKid(c, NS.s, 'is'); val = is ? xDesc(is, NS.s, 't').map(function(x){ return x.textContent; }).join('') : ''; }
    else if(t === 'b') val = val === '1' ? 'TRUE' : 'FALSE';
    return {v: val, f: f ? f.textContent : '', t: t, num: !t || t === 'n'};
  }
  function cellText(c){
    var r = cellRaw(c); if(!c) return '';
    if(r.num && r.v !== ''){ var xf = XF[+(c.getAttribute('s') || 0)] || {}; return xlFormat(r.v, FMT[xf.fmt] || XL_FMT[xf.fmt] || 'General'); }
    return r.v;
  }
  var BW = {thin: 1, hair: 1, dotted: 1, dashed: 1, medium: 2, thick: 3, double: 3, mediumDashed: 2, dashDot: 1, mediumDashDot: 2, slantDashDot: 2};
  var wrap = h('div', {class: 'offWrap'}), cur = sheets.filter(function(s){ return !s.hidden; })[0] || sheets[0], curO = null, sel = null;
  var fx = h('input', {class: 'xlFx', placeholder: '點一個儲存格，在這裡輸入內容或公式（= 開頭）', disabled: true, onkeydown: function(e){ if(e.key === 'Enter'){ e.preventDefault(); commit(); fx.blur(); } }});
  var refLb = h('span', {class: 'xlRef', text: ''});
  var grid = h('div', {class: 'xlGrid'}), tabs = h('div', {class: 'xlTabs'});
  var MAXR = 500, MAXC = 60;
  async function drawSheet(){
    curO = await loadSheet(cur);
    grid.textContent = ''; sel = null; fx.value = ''; fx.disabled = true; refLb.textContent = '';
    var o = curO, R = Math.min(Math.max(o.maxR + 6, 30), MAXR), C = Math.min(Math.max(o.maxC + 3, 10), MAXC);
    var skip = {}, span = {};
    o.merges.forEach(function(m){ span[m.r1 + ',' + m.c1] = m; for(var r = m.r1; r <= m.r2; r++) for(var c = m.c1; c <= m.c2; c++) if(r !== m.r1 || c !== m.c1) skip[r + ',' + c] = 1; });
    var tb = h('table', {class: 'xlT'}), cg = h('colgroup'); cg.appendChild(h('col', {style: {width: '40px'}}));
    for(var c = 0; c < C; c++){ var cd = o.cols[c]; cg.appendChild(h('col', {style: {width: cd && cd.hidden ? '0px' : Math.round((cd ? cd.w : o.defW) * 7 + 5) + 'px'}})); }
    tb.appendChild(cg);
    var hr = h('tr', {class: 'xlH'}, h('th', {class: 'xlCorner'}));
    for(c = 0; c < C; c++) hr.appendChild(h('th', {text: colName(c)}));
    tb.appendChild(hr);
    for(var r = 0; r < R; r++){
      var rd = o.rows[r]; if(rd && rd.hidden) continue;
      var tr = h('tr', {style: {height: Math.round(((rd && rd.h) || o.defH) * 4 / 3) + 'px'}});
      tr.appendChild(h('th', {text: String(r + 1)}));
      for(c = 0; c < C; c++){
        var k = r + ',' + c; if(skip[k]) continue;
        var cell = o.cells[k], td = h('td', {'data-r': r, 'data-c': c});
        if(span[k]){ td.rowSpan = span[k].r2 - span[k].r1 + 1; td.colSpan = span[k].c2 - span[k].c1 + 1; }
        var si = cell ? +(cell.getAttribute('s') || 0) : (rd && rd.el.getAttribute('s') ? +rd.el.getAttribute('s') : (o.cols[c] && o.cols[c].s ? +o.cols[c].s : 0));
        styleTd(td, si, cell);
        td.textContent = cellText(cell);
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    grid.appendChild(tb);
    if(o.maxR >= MAXR || o.maxC >= MAXC) grid.appendChild(h('div', {class: 'sub', style: {padding: '8px'}, text: '這張工作表很大，只顯示前 ' + MAXR + ' 列、' + MAXC + ' 欄。'}));
    qsa('.xlTab', tabs).forEach(function(b){ b.classList.toggle('on', b.dataset.p === cur.path); });
  }
  function styleTd(td, si, cell){
    var xf = XF[si] || {}, f = FONTS[xf.font] || {}, fill = FILLS[xf.fill], b = BORDERS[xf.border] || {};
    if(f.b) td.style.fontWeight = '700'; if(f.i) td.style.fontStyle = 'italic';
    if(f.u || f.s) td.style.textDecoration = (f.u ? 'underline ' : '') + (f.s ? 'line-through' : '');
    if(f.sz && f.sz !== 11) td.style.fontSize = Math.round(f.sz * 4 / 3) + 'px';
    if(f.c && f.c !== '#000000' && !/^#?FF000000$/i.test(f.c)) td.style.color = f.c;
    if(fill) td.style.background = fill;
    ['left', 'right', 'top', 'bottom'].forEach(function(k){ if(b[k]) td.style['border' + k[0].toUpperCase() + k.slice(1)] = (BW[b[k].st] || 1) + 'px ' + (b[k].st === 'double' ? 'double' : /dash|dot/i.test(b[k].st) ? 'dashed' : 'solid') + ' ' + b[k].c; });
    var num = cell && cellRaw(cell).num && cellRaw(cell).v !== '';
    td.style.textAlign = xf.ha && xf.ha !== 'general' ? ({centerContinuous: 'center', fill: 'left', distributed: 'justify'}[xf.ha] || xf.ha) : (num ? 'right' : 'left');
    td.style.verticalAlign = xf.va === 'center' ? 'middle' : xf.va === 'top' ? 'top' : 'bottom';
    if(xf.wrap) td.style.whiteSpace = 'pre-wrap';
  }
  grid.addEventListener('click', function(e){
    var td = e.target.closest('td[data-r]'); if(!td) return;
    if(sel) sel.classList.remove('sel');
    sel = td; td.classList.add('sel');
    var r = +td.dataset.r, c = +td.dataset.c, raw = cellRaw(curO.cells[r + ',' + c]);
    refLb.textContent = colName(c) + (r + 1);
    fx.disabled = false; fx.value = raw.f ? '=' + raw.f : raw.v;
  });
  grid.addEventListener('dblclick', function(e){ if(e.target.closest('td[data-r]')){ fx.focus(); fx.select(); } });
  function commit(){
    if(!sel) return;
    var r = +sel.dataset.r, c = +sel.dataset.c, o = curO, k = r + ',' + c, v = fx.value;
    var cell = o.cells[k], raw = cellRaw(cell);
    if((raw.f ? '=' + raw.f : raw.v) === v) return;
    var d = o.doc;
    if(!cell){
      /* 沒有這一列／這一格：依順序插入 */
      var row = o.rows[r] && o.rows[r].el;
      if(!row){
        row = d.createElementNS(NS.s, 'row'); row.setAttribute('r', r + 1);
        var after = null; xKids(o.data, NS.s, 'row').forEach(function(x){ if(+x.getAttribute('r') < r + 1) after = x; });
        o.data.insertBefore(row, after ? after.nextSibling : o.data.firstChild);
        o.rows[r] = {el: row, h: null};
      }
      cell = d.createElementNS(NS.s, 'c'); cell.setAttribute('r', colName(c) + (r + 1));
      var aft = null; xKids(row, NS.s, 'c').forEach(function(x){ var rc = refRC(x.getAttribute('r')); if(rc && rc.c < c) aft = x; });
      row.insertBefore(cell, aft ? aft.nextSibling : row.firstChild);
      o.cells[k] = cell; if(r > o.maxR) o.maxR = r; if(c > o.maxC) o.maxC = c;
    }
    while(cell.firstChild) cell.removeChild(cell.firstChild);
    cell.removeAttribute('t');
    if(v === ''){ /* 清空 */ }
    else if(v[0] === '='){ var fe = d.createElementNS(NS.s, 'f'); fe.textContent = v.slice(1); cell.appendChild(fe); FORMULA_EDIT = true; }
    else if(/^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(v.trim())){ var ve = d.createElementNS(NS.s, 'v'); ve.textContent = v.trim(); cell.appendChild(ve); }
    else if(/^(TRUE|FALSE)$/i.test(v)){ cell.setAttribute('t', 'b'); var vb = d.createElementNS(NS.s, 'v'); vb.textContent = /^TRUE$/i.test(v) ? '1' : '0'; cell.appendChild(vb); }
    else { cell.setAttribute('t', 'inlineStr'); var is = d.createElementNS(NS.s, 'is'), te = d.createElementNS(NS.s, 't'); te.textContent = v; te.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); is.appendChild(te); cell.appendChild(is); }
    o.dirty = true; ANY_EDIT = true;
    sel.textContent = v[0] === '=' ? v : cellText(cell);
    if(v[0] === '=') sel.classList.add('xlNeedCalc');
    offMark(true); buzz(8);
  }
  var FORMULA_EDIT = false, ANY_EDIT = false;
  async function build(){
    Object.keys(SHEETS).forEach(function(p){ if(SHEETS[p].dirty) zip.file(p, xStr(SHEETS[p].doc)); });
    /* 改過內容：讓 Excel 打開時重新計算所有公式（快取的計算結果可能過時了） */
    if(ANY_EDIT){
      var calc = xKid(wb.documentElement, NS.s, 'calcPr');
      if(!calc){ calc = wb.createElementNS(NS.s, 'calcPr'); var ext = xKid(wb.documentElement, NS.s, 'extLst'); wb.documentElement.insertBefore(calc, ext); }
      calc.setAttribute('fullCalcOnLoad', '1');
      zip.file(wbPath, xStr(wb));
      /* 計算鏈快取也要拿掉，不然 Excel 可能提示修復 */
      var chain = Object.keys(zip.files).filter(function(f){ return /xl\/calcChain\.xml$/.test(f); })[0];
      if(chain){ zip.remove(chain); var ctd = xParse(await zipText(zip, '[Content_Types].xml')); xDesc(ctd, 'http://schemas.openxmlformats.org/package/2006/content-types', 'Override').forEach(function(o){ if(/calcChain/.test(o.getAttribute('PartName'))) o.parentNode.removeChild(o); }); zip.file('[Content_Types].xml', xStr(ctd));
        var wr = await zipText(zip, wbPath.replace(/[^/]+$/, '_rels/') + wbPath.split('/').pop() + '.rels'); if(wr){ var wrd = xParse(wr); xDesc(wrd, NS.pr, 'Relationship').forEach(function(r){ if(/calcChain$/.test(r.getAttribute('Type'))) r.parentNode.removeChild(r); }); zip.file(wbPath.replace(/[^/]+$/, '_rels/') + wbPath.split('/').pop() + '.rels', xStr(wrd)); } }
    }
    return await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE', mimeType: it.mime});
  }
  sheets.forEach(function(s){ if(s.hidden) return; tabs.appendChild(h('button', {class: 'xlTab', 'data-p': s.path, text: s.name, onclick: function(){ cur = s; drawSheet(); }})); });
  var saveB = offBtn('check', '儲存', function(){ commit(); return offDoSave(it, build); }); saveB.id = 'offSave'; saveB.disabled = true;
  wrap.appendChild(offBar([saveB, h('span', {id: 'offState', class: 'offState'}), h('span', {class: 'grow'}),
    hasVba ? offBtn('code', '巨集', function(){ showMacros(zip); }) : null,
    hasVba ? h('span', {class: 'offInfo', text: '含巨集・存檔會完整保留'}) : null]));
  wrap.appendChild(h('div', {class: 'xlFxRow'}, refLb, fx, h('button', {class: 'ib', html: icon('check'), title: '確定', onclick: function(){ commit(); }})));
  wrap.appendChild(grid);
  wrap.appendChild(tabs);
  body.appendChild(wrap);
  paintIcons(wrap);
  await drawSheet();
  Office.saveFn = function(){ return saveB.onclick(); };
}

/* ---------- 巨集：讀出 vbaProject.bin 裡每個模組的 VBA 程式碼（MS-CFB ＋ MS-OVBA 解壓縮） ---------- */
function cfbRead(u8){
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if(dv.getUint32(0, true) !== 0xE011CFD0) throw new Error('不是 OLE 檔');
  var ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
  var nFat = dv.getUint32(44, true), dirStart = dv.getInt32(48, true), miniCut = dv.getUint32(56, true), miniFatStart = dv.getInt32(60, true), difStart = dv.getInt32(68, true);
  function sec(n){ return 512 + n * ss; }
  var fatSecs = [];
  for(var i = 0; i < 109 && fatSecs.length < nFat; i++){ var v = dv.getInt32(76 + i * 4, true); if(v >= 0) fatSecs.push(v); }
  var d = difStart; while(d >= 0 && fatSecs.length < nFat){ for(i = 0; i < ss / 4 - 1 && fatSecs.length < nFat; i++){ var v2 = dv.getInt32(sec(d) + i * 4, true); if(v2 >= 0) fatSecs.push(v2); } d = dv.getInt32(sec(d) + ss - 4, true); }
  var FAT = []; fatSecs.forEach(function(s){ for(var j = 0; j < ss / 4; j++) FAT.push(dv.getInt32(sec(s) + j * 4, true)); });
  function chain(start, table){ var out = [], g = 0; while(start >= 0 && g++ < 1e6){ out.push(start); start = table[start]; } return out; }
  function readBig(start, size){ var ch = chain(start, FAT), out = new Uint8Array(ch.length * ss); ch.forEach(function(s, k){ out.set(u8.subarray(sec(s), sec(s) + ss), k * ss); }); return size != null ? out.subarray(0, size) : out; }
  var dir = readBig(dirStart), ents = [];
  for(var o = 0; o + 128 <= dir.length; o += 128){
    var nl = dir[o + 64] | dir[o + 65] << 8, name = '';
    for(var k = 0; k < Math.max(0, nl / 2 - 1); k++) name += String.fromCharCode(dir[o + k * 2] | dir[o + k * 2 + 1] << 8);
    var dd = new DataView(dir.buffer, dir.byteOffset + o, 128);
    ents.push({name: name, type: dir[o + 66], left: dd.getInt32(68, true), right: dd.getInt32(72, true), child: dd.getInt32(76, true), start: dd.getInt32(116, true), size: dd.getUint32(120, true)});
  }
  var root = ents[0], miniStream = readBig(root.start, root.size), MINIFAT = [];
  if(miniFatStart >= 0){ var mf = readBig(miniFatStart); var mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength); for(i = 0; i < mf.length / 4; i++) MINIFAT.push(mdv.getInt32(i * 4, true)); }
  function readStream(e){
    if(e.size < miniCut){ var ch = chain(e.start, MINIFAT), out = new Uint8Array(ch.length * mss); ch.forEach(function(s, k){ out.set(miniStream.subarray(s * mss, s * mss + mss), k * mss); }); return out.subarray(0, e.size); }
    return readBig(e.start, e.size);
  }
  /* 依樹狀結構找出路徑 */
  var paths = {};
  function walk(idx, base){ if(idx < 0 || idx >= ents.length) return; var e = ents[idx]; walk(e.left, base); walk(e.right, base); var p = base + e.name; paths[p] = e; if(e.type === 1 && e.child >= 0) walk(e.child, p + '/'); }
  walk(root.child, '');
  return {get: function(p){ var e = paths[p]; return e && e.type === 2 ? readStream(e) : null; }, list: Object.keys(paths)};
}
function ovbaDecompress(buf){
  if(!buf || buf[0] !== 1) return new Uint8Array(0);
  var out = [], pos = 1;
  while(pos < buf.length){
    var hdr = buf[pos] | buf[pos + 1] << 8; pos += 2;
    var size = (hdr & 0x0FFF) + 3, compressed = hdr & 0x8000, end = Math.min(buf.length, pos + size - 2), chunkStart = out.length;
    if(!compressed){ for(var i = 0; i < 4096 && pos < buf.length; i++) out.push(buf[pos++]); continue; }
    while(pos < end){
      var flags = buf[pos++];
      for(var b = 0; b < 8 && pos < end; b++){
        if(!(flags & (1 << b))){ out.push(buf[pos++]); continue; }
        var tok = buf[pos] | buf[pos + 1] << 8; pos += 2;
        var dlen = out.length - chunkStart, bits = 4; while((1 << bits) < dlen) bits++; if(bits < 4) bits = 4; if(bits > 12) bits = 12;
        var lenMask = 0xFFFF >> bits, off = (tok >> (16 - bits)) + 1, len = (tok & lenMask) + 3;
        for(var j = 0; j < len; j++) out.push(out[out.length - off]);
      }
    }
  }
  return new Uint8Array(out);
}
async function showMacros(zip){
  try{
    var cf = cfbRead(await zip.file('xl/vbaProject.bin').async('uint8array'));
    var dirS = cf.get('VBA/dir'); if(!dirS) throw new Error('找不到 VBA 目錄');
    var dir = ovbaDecompress(dirS), dv = new DataView(dir.buffer), p = 0, mods = [], curM = null, cp = 1252;
    while(p + 6 <= dir.length){
      var id = dv.getUint16(p, true), sz = dv.getUint32(p + 2, true); p += 6;
      if(id === 0x0009){ p += 6; continue; }   /* PROJECTVERSION：長度欄位不準 */
      var data = dir.subarray(p, p + sz); p += sz;
      if(id === 0x0003) cp = data[0] | data[1] << 8;
      else if(id === 0x0019){ curM = {name: new TextDecoder('latin1').decode(data), off: 0, type: 'std'}; mods.push(curM); }
      else if(id === 0x0047 && curM){ var s = ''; for(var i = 0; i + 1 < data.length; i += 2) s += String.fromCharCode(data[i] | data[i + 1] << 8); curM.name = s || curM.name; }
      else if(id === 0x001A && curM){ curM.stream = new TextDecoder('latin1').decode(data); }
      else if(id === 0x0032 && curM){ var s2 = ''; for(var k = 0; k + 1 < data.length; k += 2) s2 += String.fromCharCode(data[k] | data[k + 1] << 8); curM.stream = s2 || curM.stream; }
      else if(id === 0x0031 && curM){ curM.off = new DataView(data.buffer, data.byteOffset).getUint32(0, true); }
      else if(id === 0x0022 && curM) curM.type = 'doc';
    }
    var enc = {950: 'big5', 936: 'gbk', 932: 'shift_jis', 949: 'euc-kr', 65001: 'utf-8'}[cp] || 'windows-1252';
    var dec; try{ dec = new TextDecoder(enc); }catch(e){ dec = new TextDecoder('windows-1252'); }
    mods.forEach(function(m){ var raw = cf.get('VBA/' + (m.stream || m.name)); m.code = raw ? dec.decode(ovbaDecompress(raw.subarray(m.off))) : '（讀不到）'; m.code = m.code.replace(/^Attribute VB_.*\r?\n/gm, '').trim(); });
    var body = h('div');
    body.appendChild(h('div', {class: 'note', html: '這是檔案裡的 VBA 巨集程式碼（唯讀）。<b>手機上沒有 Excel 的巨集引擎，無法執行</b>；存檔時巨集會原封不動保留，用電腦版 Excel 打開就能照常執行。'}));
    var shown = mods.filter(function(m){ return m.code; });
    shown.forEach(function(m){
      var pre = h('pre', {class: 'vbaCode sel-text', text: m.code});
      var det = h('details', {class: 'vbaMod', open: shown.length <= 2}, h('summary', null, h('b', {text: m.name}), h('small', {text: (m.type === 'doc' ? '　工作表／活頁簿模組' : '　一般模組') + '・' + m.code.split('\n').length + ' 行'})), pre,
        h('div', {class: 'btn-row'}, h('button', {class: 'btn sm', html: icon('copy', 'sm') + '複製程式碼', onclick: function(){ copyText(m.code); }})));
      body.appendChild(det);
    });
    if(!mods.length) body.appendChild(h('div', {class: 'empty', text: '沒有找到模組'}));
    openSheet({title: '巨集（VBA）', icon: 'code', body: body, tall: true});
  }catch(e){ toast('讀取巨集失敗：' + e.message, true); }
}

/* ---------- 舊版二進位 Excel（.xls、.xlsb）：用 SheetJS 讀取顯示（第一次需要網路下載讀取程式） ---------- */
async function loadSheetJS(){
  if(window.XLSX) return window.XLSX;
  await new Promise(function(res, rej){ var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = function(){ rej(new Error('需要網路才能讀取這種格式（下載讀取程式失敗）')); }; document.head.appendChild(s); });
  return window.XLSX;
}
async function viewXlsBin(it, body){
  var wrap = h('div', {class: 'offWrap'}); body.appendChild(wrap);
  wrap.appendChild(h('div', {class: 'empty', id: 'xbLoad', text: '讀取中…'}));
  var X = await loadSheetJS();
  var wbk = X.read(new Uint8Array(await (await Lib.blob(it)).arrayBuffer()), {type: 'array', cellStyles: true, bookVBA: true});
  var ld = $('xbLoad'); if(ld) ld.remove();
  var grid = h('div', {class: 'xlGrid'}), tabs = h('div', {class: 'xlTabs'});
  function draw(name){
    var ws = wbk.Sheets[name]; grid.innerHTML = X.utils.sheet_to_html(ws, {editable: false}).replace(/^[\s\S]*?<table/, '<table class="xlT xlBin"').replace(/<\/table>[\s\S]*$/, '</table>');
    qsa('.xlTab', tabs).forEach(function(b){ b.classList.toggle('on', b.textContent === name); });
  }
  wbk.SheetNames.forEach(function(n){ tabs.appendChild(h('button', {class: 'xlTab', text: n, onclick: function(){ draw(n); }})); });
  wrap.appendChild(offBar([h('span', {class: 'offInfo', text: '二進位格式（' + it.name.split('.').pop().toUpperCase() + '）：可以閱讀；要編輯請另存成 .xlsx'}), h('span', {class: 'grow'}),
    wbk.vbaraw ? h('span', {class: 'offInfo', text: '含巨集'}) : null,
    offBtn('download', '另存成 .xlsx', async function(){
      var out = X.write(wbk, {type: 'array', bookType: 'xlsx'});
      var nm = it.name.replace(/\.[^.]+$/, '') + '.xlsx';
      var r = await saveBigBlob(new Blob([out], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), nm, {});
      toast('✓ 已另存「' + nm + '」（只保留內容；巨集與樣式要用電腦版 Excel 轉換）', false, r ? ['開啟', function(){ Viewer.open(Lib.byId(r.id) || r); }] : null);
    })]));
  wrap.appendChild(grid); wrap.appendChild(tabs);
  draw(wbk.SheetNames[0]);
}

/* ---------- 進入點 ---------- */
Office.open = async function(it, body){
  var k = officeKind(it);
  if(k === 'txt') return viewTxt(it, body);
  if(k === 'docx') return viewDocx(it, body);
  if(k === 'xlsx') return viewXlsx(it, body);
  if(k === 'xlsbin') return viewXlsBin(it, body);
  if(k === 'pptx') return viewPptx(it, body);
  return false;
};
/* 關閉檢視器前：有沒存的修改就先問 */
Office.confirmClose = async function(){
  if(!Office.dirty) return true;
  return new Promise(function(res){
    dialog('還沒儲存', '這個檔案有修改還沒儲存，要先儲存嗎？', [
      ['儲存', function(){ if(Office.saveFn) Promise.resolve(Office.saveFn()).then(function(){ res(!Office.dirty); }); else res(true); }],
      ['不儲存', function(){ Office.dirty = false; res(true); }, ''],
      ['取消', function(){ res(false); }, '']
    ]);
  });
};

/* 檢視器關閉（返回鍵、✕）時，先確認有沒有未儲存的修改 */
(function(){
  var _close = Viewer.close;
  Viewer.close = function(force){
    var self = this;
    if(Office.dirty && force !== true){ Office.confirmClose().then(function(ok){ if(ok){ Office.dirty = false; _close.call(self); } }); return; }
    _close.call(self);
  };
})();
