/* ============================================================
   多國語言 ＋ AI 網頁翻譯
   介面原文是繁體中文。選了其他語言時：
   - 打包時已把程式裡所有中文介面文字列成清單（I18N_SRC），第一次切換時用 Gemini 一次翻好、存在手機裡；
   - 之後畫面上的文字由 I18N.apply 即時換成翻好的文字（只換介面文字，不動檔名、歌名、網頁標題等使用者的內容）。
   網頁翻譯：把瀏覽分頁裡的網頁文字抓出來，同樣交給 Gemini 翻成目前的介面語言（預設繁體中文）。
   ============================================================ */
var I18N = {
  LANGS: [['zh-TW', '繁體中文', '繁體中文（台灣用語）'], ['en', 'English', 'English'], ['ja', '日本語', '日本語'], ['ko', '한국어', '한국어'], ['zh-CN', '简体中文', '简体中文（中国大陆用语）'],
    ['vi', 'Tiếng Việt', 'Tiếng Việt'], ['th', 'ไทย', 'ภาษาไทย'], ['id', 'Bahasa Indonesia', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu', 'Bahasa Melayu'], ['es', 'Español', 'Español'],
    ['fr', 'Français', 'Français'], ['de', 'Deutsch', 'Deutsch'], ['pt', 'Português', 'Português'], ['ru', 'Русский', 'Русский']],
  lang: lsGet('ws.lang', 'zh-TW'), dict: {}, idx: null, busy: false,
  name: function(l){ var x = this.LANGS.filter(function(a){ return a[0] === (l || I18N.lang); })[0]; return x ? x[2] : '繁體中文（台灣用語）'; },
  label: function(l){ var x = this.LANGS.filter(function(a){ return a[0] === (l || I18N.lang); })[0]; return x ? x[1] : '繁體中文'; },
  on: function(){ return this.lang !== 'zh-TW'; },
  spaced: function(){ return !/^(ja|zh-CN|th|ko)$/.test(this.lang); }
};
var HAN = /[㐀-鿿]/;
function i18nLoad(){ I18N.dict = I18N.on() ? lsGet('ws.i18n.' + I18N.lang, {}) : {}; }
function i18nSave(){ try{ lsSet('ws.i18n.' + I18N.lang, I18N.dict); }catch(e){} }
/* 介面文字的索引：第一個字 → 這個字開頭的所有文字（長的排前面） */
function i18nIndex(){
  if(I18N.idx) return I18N.idx;
  var m = {}; (window.I18N_SRC || []).forEach(function(s){ (m[s[0]] = m[s[0]] || []).push(s); });
  Object.keys(m).forEach(function(k){ m[k].sort(function(a, b){ return b.length - a.length; }); });
  return I18N.idx = m;
}
/* 把一段文字換成目前語言：整段就是介面文字 → 直接換；否則找出裡面的介面片語逐段換。
   剩下的部分還有中文（＝檔名、歌名這類使用者內容）時，只換 4 個字以上的片語，避免把內容改壞 */
function i18nText(v){
  if(!v || !HAN.test(v)) return v;
  var D = I18N.dict, t = v.trim();
  if(D[t]) return v.replace(t, D[t]);
  var idx = i18nIndex(), segs = [], i = 0, raw = '';
  while(i < v.length){
    var c = idx[v[i]], hit = null;
    if(c) for(var k = 0; k < c.length; k++) if(v.startsWith(c[k], i)){ hit = c[k]; break; }
    if(hit){ if(raw){ segs.push([0, raw]); raw = ''; } segs.push([1, hit]); i += hit.length; }
    else raw += v[i++];
  }
  if(raw) segs.push([0, raw]);
  var left = segs.some(function(s){ return !s[0] && HAN.test(s[1]); }), out = '', ch = false, sp = I18N.spaced();
  segs.forEach(function(s, n){
    var tr = s[0] && D[s[1]] && (!left || s[1].replace(/[^㐀-鿿]/g, '').length >= 4) ? D[s[1]] : null;
    if(tr == null){ out += s[1]; return; }
    ch = true;
    if(sp && out && /[A-Za-z0-9%)\]]$/.test(out) && /^[A-Za-z0-9(]/.test(tr)) out += ' ';
    out += tr;
    var nx = segs[n + 1]; if(sp && nx && /[A-Za-z0-9]$/.test(tr) && /^[A-Za-z0-9㐀-鿿]/.test(nx[1])) out += ' ';
  });
  return ch ? out : v;
}
function i18nNode(n){
  if(n.nodeType === 3){
    var v = n.nodeValue; if(n.__i18n === v || !HAN.test(v)) return;
    var p = n.parentNode; if(p && p.closest && p.closest('[data-i18n-skip],script,style,textarea,.katex')) return;
    var t = i18nText(v); if(t !== v){ n.__i18n = t; n.nodeValue = t; }
    return;
  }
  if(n.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.tagName) || n.hasAttribute('data-i18n-skip')) return;
  ['placeholder', 'title', 'aria-label'].forEach(function(a){ var v = n.getAttribute(a); if(v && HAN.test(v)){ var t = i18nText(v); if(t !== v) n.setAttribute(a, t); } });
  for(var c = n.firstChild; c; c = c.nextSibling) i18nNode(c);
}
function i18nApplyAll(){ if(I18N.on()) i18nNode(document.body); }
function i18nWatch(){
  if(I18N.mo || !I18N.on()) return;
  I18N.mo = new MutationObserver(function(ms){
    for(var i = 0; i < ms.length; i++){
      var m = ms[i];
      if(m.type === 'characterData') i18nNode(m.target);
      else if(m.type === 'attributes') { var v = m.target.getAttribute(m.attributeName); if(v && HAN.test(v)){ var t = i18nText(v); if(t !== v) m.target.setAttribute(m.attributeName, t); } }
      else for(var k = 0; k < m.addedNodes.length; k++) i18nNode(m.addedNodes[k]);
    }
  });
  I18N.mo.observe(document.body, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title']});
}

/* ---------- 交給 Gemini 翻一批文字：回傳同樣長度的陣列 ---------- */
async function trBatch(list, langName, kind, sig){
  var prompt = '你是專業的在地化翻譯。把下面 JSON 陣列裡的每一項翻譯成「' + langName + '」。\n' +
    (kind === 'ui' ? '這些是一套手機 App（瀏覽器、Terra 瀏覽器、YouTube 下載、AI 摘要、檔案庫）介面上的文字：按鈕、選單、提示、說明。用該語言的 App 慣用說法，簡短自然；有些是句子的片段（前後會接數字或檔名），照片段翻，不要補字。\n'
      : kind === 'html' ? '這些是 App 使用說明書的 HTML 片段：只翻譯文字，所有 HTML 標籤、屬性、class 原樣保留，不要增減標籤。\n'
      : '這些是一個網頁上依出現順序排列的文字片段（相鄰幾項可能是同一句話被粗體或連結切開的部分，請照上下文翻得前後連貫）。翻得準確、通順、符合該語言的自然說法；專有名詞、程式碼、網址、已經是目標語言的文字保持原樣。\n') +
    '規則：保留原有的標點風格、數字、符號、emoji、App 名稱「Terra 瀏覽器」裡的 Terra 不要翻譯（例如英文寫 Terra Browser）；英文品牌名（YouTube、Gemini、GitHub、Wi-Fi、QR Code、APK、PDF…）和 {n} 這類佔位符；不要加任何解釋。\n' +
    '只回傳一個 JSON 陣列（字串陣列），長度和順序必須和輸入完全一樣（' + list.length + ' 項）。\n\n' + JSON.stringify(list);
  for(var tries = 0; ; tries++){
    try{
      var r = await aiAskGemini(prompt, {signal: sig});
      if(r && !Array.isArray(r)){ var k = Object.keys(r).filter(function(x){ return Array.isArray(r[x]); })[0]; if(k) r = r[k]; }
      if(Array.isArray(r) && r.length === list.length) return r.map(function(x, i){ return typeof x === 'string' && x ? x : list[i]; });
      if(list.length > 1){ var h2 = Math.ceil(list.length / 2); return (await trBatch(list.slice(0, h2), langName, kind, sig)).concat(await trBatch(list.slice(h2), langName, kind, sig)); }
      return list;
    }catch(e){
      if(sig && sig.aborted) throw e;
      if(e && e.code === 'rate' && tries < 6){ await sleep(15000); continue; }
      if(tries < 1 && !(e && e.code === 'nogkey')){ await sleep(1500); continue; }
      throw e;
    }
  }
}
function trChunks(list, maxChars, maxN){
  var out = [], cur = [], n = 0;
  list.forEach(function(s){ if(cur.length && (n + s.length > maxChars || cur.length >= maxN)){ out.push(cur); cur = []; n = 0; } cur.push(s); n += s.length; });
  if(cur.length) out.push(cur);
  return out;
}
async function trPool(chunks, worker, par){
  var i = 0, err = null;
  async function run(){ while(i < chunks.length && !err){ var k = i++; try{ await worker(chunks[k], k); }catch(e){ err = e; } } }
  var ps = []; for(var p = 0; p < Math.min(par, chunks.length); p++) ps.push(run());
  await Promise.all(ps); if(err) throw err;
}

/* ---------- 介面語言：把還沒翻過的介面文字（和說明書）翻好存起來 ---------- */
function i18nGuideKey(i){ return '\u0001g' + i + ':' + GUIDE[i].html.length; }
async function i18nPrepare(onStep){
  if(!I18N.on() || I18N.busy) return;
  I18N.busy = true;
  try{
    var lang = I18N.lang, name = I18N.name();
    var todo = (window.I18N_SRC || []).filter(function(s){ return !I18N.dict[s]; });
    var gtodo = []; (typeof GUIDE !== 'undefined' ? GUIDE : []).forEach(function(g, i){ if(!I18N.dict[i18nGuideKey(i)]) gtodo.push(i); });
    var total = todo.length + gtodo.length, done = 0;
    if(!total){ onStep && onStep(1, 1); return; }
    onStep && onStep(0, total);
    await trPool(trChunks(todo, 1800, 70), async function(ch){
      var r = await trBatch(ch, name, 'ui');
      if(I18N.lang !== lang) return;
      ch.forEach(function(s, i){ if(r[i] && r[i] !== s) I18N.dict[s] = r[i]; else I18N.dict[s] = I18N.dict[s] || s; });
      done += ch.length; i18nSave(); i18nApplyAll(); onStep && onStep(done, total);
    }, 3);
    await trPool(gtodo.map(function(i){ return [i]; }), async function(one){
      var i = one[0], r = await trBatch([GUIDE[i].html], name, 'html');
      if(I18N.lang !== lang) return;
      if(r[0] && r[0] !== GUIDE[i].html) I18N.dict[i18nGuideKey(i)] = r[0];
      done++; i18nSave(); onStep && onStep(done, total);
    }, 2);
  } finally { I18N.busy = false; }
}
function i18nGuideHtml(i){ return (I18N.on() && I18N.dict[i18nGuideKey(i)]) || GUIDE[i].html; }
function openLang(){
  var body = h('div');
  var s = openSheet({title: '語言 Language', icon: 'globe', body: body, tall: true});
  function draw(){
    body.textContent = '';
    body.appendChild(h('div', {class: 'sub', 'data-i18n-skip': '', style: {marginBottom: '10px', lineHeight: '1.6'}, html: '介面原文是繁體中文。選其他語言時，App 會用你的 Gemini 金鑰把介面和說明書翻好（第一次約 1～3 分鐘，之後就不用再翻）。<br>The UI is written in Traditional Chinese. Other languages are translated once with your Gemini API key and then stored on this phone.'}));
    var st = h('div', {class: 'note', style: {display: 'none'}}); body.appendChild(st);
    var list = h('div', {class: 'opts', 'data-i18n-skip': ''}); body.appendChild(list);
    I18N.LANGS.forEach(function(L){
      var n = L[0] === 'zh-TW' ? '' : Object.keys(lsGet('ws.i18n.' + L[0], {})).length;
      list.appendChild(h('div', {class: 'opt' + (I18N.lang === L[0] ? ' on' : ''), onclick: function(){ pick(L[0]); }}, h('span', {class: 'oi', html: icon(I18N.lang === L[0] ? 'check' : 'globe')}),
        h('div', {class: 'grow'}, h('b', {text: L[1]}), n ? h('div', {class: 'sub', text: '✓ ' + n}) : null)));
    });
    paintIcons(body);
    async function pick(l){
      if(I18N.busy){ toast('翻譯進行中，請稍候'); return; }
      if(l === I18N.lang && l === 'zh-TW') return;
      if(l === 'zh-TW'){ lsSet('ws.lang', l); toast('重新載入…'); setTimeout(function(){ location.reload(); }, 400); return; }
      if(!AICFG.gkey){ toast('要先設定 Gemini 金鑰（AI 摘要 → AI 設定）才能翻譯介面', true, ['去設定', function(){ s.close(); showView('ai'); if(typeof aiSettings === 'function') aiSettings(); }]); return; }
      var was = I18N.lang;
      I18N.lang = l; lsSet('ws.lang', l); i18nLoad();
      st.style.display = ''; st.className = 'note'; st.setAttribute('data-i18n-skip', ''); st.textContent = '翻譯介面中… Translating…';
      try{
        await i18nPrepare(function(d, t){ st.textContent = '翻譯介面中… Translating… ' + Math.round(d / t * 100) + '%'; });
        st.textContent = '✓ ' + I18N.label();
        /* 從中文換過去可以直接套用；從別的語言換過來要重新載入（畫面上已經不是原文） */
        if(was === 'zh-TW'){ i18nWatch(); i18nApplyAll(); draw(); } else setTimeout(function(){ location.reload(); }, 500);
      }catch(e){ st.className = 'note err'; st.textContent = '翻譯沒有完成：' + ((e && e.message) || e) + '　已翻好的部分會先套用，再選一次同一個語言可以繼續。'; i18nWatch(); i18nApplyAll(); }
    }
  }
  draw();
}
i18nLoad();
if(I18N.on()){ i18nWatch(); i18nApplyAll(); setTimeout(function(){ if(AICFG.gkey) i18nPrepare().then(i18nApplyAll).catch(function(){}); }, 5000); }

/* ============================================================
   AI 網頁翻譯：把瀏覽分頁的網頁文字翻成介面語言（預設繁體中文）
   ============================================================ */
var PTR = {on: false, busy: false, url: '', ctl: null};
var PTR_COLLECT = "(function(zhSkip){var W=window.__wsTr=window.__wsTr||{nodes:[],orig:[],seen:new WeakSet()};var out=[],start=W.nodes.length;" +
  "var han=/[\\u3400-\\u9fff]/,other=/[A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u3040-\\u30FF\\uAC00-\\uD7AF\\u0E00-\\u0E7F\\u0600-\\u06FF\\u0590-\\u05FF\\u0900-\\u097F]/;" +
  "var hans=/^zh-(cn|hans|sg)/i.test(document.documentElement.lang||'');" +
  "var tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n;" +
  "while((n=tw.nextNode())&&out.length<4000){if(W.seen.has(n))continue;var p=n.parentElement;if(!p||/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE|KBD|SAMP)$/.test(p.tagName)||p.isContentEditable||p.closest('svg,math,[translate=no],.notranslate'))continue;" +
  "var t=n.nodeValue;if(!t||t.trim().length<2)continue;if(!other.test(t)&&!(han.test(t)&&(!zhSkip||hans)))continue;if(zhSkip&&!hans&&han.test(t)&&!/[\\u3040-\\u30FF\\uAC00-\\uD7AF]/.test(t)&&t.replace(/[^A-Za-z]/g,'').length<t.length*0.5)continue;" +
  "if(!p.getClientRects().length)continue;W.seen.add(n);W.nodes.push(n);W.orig.push(t);out.push(t.trim());}" +
  "W.on=true;return JSON.stringify({start:start,texts:out,title:document.title||''});})";
var PTR_SET = "(function(start,arr){var W=window.__wsTr;if(!W)return 0;for(var i=0;i<arr.length;i++){var n=W.nodes[start+i],o=W.orig[start+i];if(!n||arr[i]==null)continue;var a=/^\\s*/.exec(o)[0],b=/\\s*$/.exec(o)[0];n.nodeValue=a+arr[i]+b;}return 1;})";
var PTR_RESTORE = "(function(){var W=window.__wsTr;if(!W)return 0;for(var i=0;i<W.nodes.length;i++){try{W.nodes[i].nodeValue=W.orig[i];}catch(e){}}window.__wsTr=null;return 1;})()";
function pageTranslateMenu(){
  if(!isApp || !NAT.has('brRun')){ toast('網頁翻譯需要 APK 版', true); return; }
  if(PTR.busy){ menu('網頁翻譯', [['x', '停止翻譯', function(){ try{ PTR.ctl.abort(); }catch(e){} }]]); return; }
  if(PTR.on && PTR.url === BR.url){ menu('網頁翻譯', [['sparkle', '翻譯新載入的內容', function(){ pageTranslate(); }], ['reload', '顯示原文', function(){ NAT.call('brRun', PTR_RESTORE, ''); PTR.on = false; toast('已恢復原文'); }]]); return; }
  pageTranslate();
}
async function pageTranslate(){
  if(!AICFG.gkey){ toast('網頁翻譯要用 Gemini：請先到「AI 摘要」設定 Gemini 金鑰', true, ['去設定', function(){ showView('ai'); if(typeof aiSettings === 'function') aiSettings(); }]); return; }
  if(PTR.busy) return;
  PTR.busy = true; PTR.ctl = new AbortController();
  var url = BR.url, zh = /^zh/.test(I18N.lang), name = I18N.name();
  try{
    toast('讀取網頁文字…');
    var d = await brRun(PTR_COLLECT + '(' + (I18N.lang === 'zh-TW' ? 'true' : 'false') + ')');
    if(!d || !d.texts){ toast('讀不到這個網頁的文字', true); return; }
    if(!d.texts.length){ toast(PTR.on ? '沒有新的內容需要翻譯' : '這個網頁沒有需要翻譯的文字（已經是' + I18N.label() + '）'); return; }
    PTR.on = true; PTR.url = url;
    /* 一樣的文字只翻一次 */
    var uniq = [], pos = {}; d.texts.forEach(function(t){ if(pos[t] == null){ pos[t] = uniq.length; uniq.push(t); } });
    var res = new Array(uniq.length), chunks = trChunks(uniq, 2600, 60), done = 0, base = 0, bases = chunks.map(function(c){ var b = base; base += c.length; return b; });
    toast('翻譯中… 0%');
    await trPool(chunks, async function(ch, k){
      var r = await trBatch(ch, name, 'page', PTR.ctl.signal);
      if(BR.url !== url) throw new Error('已離開這個網頁');
      r.forEach(function(x, i){ res[bases[k] + i] = x; });
      /* 翻好一批就先換上去 */
      var arr = d.texts.map(function(t){ var x = res[pos[t]]; return x == null ? null : x; });
      NAT.call('brRun', PTR_SET + '(' + d.start + ',' + JSON.stringify(arr) + ')', '');
      done += ch.length; toast('翻譯中… ' + Math.round(done / uniq.length * 100) + '%');
    }, 3);
    buzz(15); toast('✓ 已翻譯成' + I18N.label() + '。往下捲出現新內容時，功能選單 →「翻譯網頁」可以再翻');
  }catch(e){
    if(PTR.ctl.signal.aborted) toast('已停止翻譯'); else toast('翻譯失敗：' + ((e && e.message) || e), true);
  }finally{ PTR.busy = false; }
}
on('br', function(){ if(PTR.on && BR.url !== PTR.url && !PTR.busy) PTR.on = false; });
