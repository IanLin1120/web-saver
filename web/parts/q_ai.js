/* ============================================================
   AI 摘要（像 iOS 的 InsightTube）：YouTube 影片 → 逐字稿 → AI 洞察（摘要、章節、對話）
   AI 引擎：
   · Claude 訂閱（預設）：App 在背景開著你在 claude.ai 上的工作頁（AI 全能翻譯的網頁版），
     請求交給它用 window.claude 的 sample 處理，消耗的是你的 Claude 月訂閱額度。
   · API 金鑰：直接呼叫 Anthropic API（自己付費）。
   ============================================================ */
var AI_DEFAULT_URL = 'https://claude.ai/artifact/GrGKSNbfMi5K2saoWNStz9';
var AICFG = Object.assign({engine: 'sub', url: '', key: '', model: 'claude-sonnet-5-5', lang: 'zh'}, lsGet('ws.aiCfg', {}));
function aiSaveCfg(){ lsSet('ws.aiCfg', AICFG); }
function aiUrl(){ return /^https:\/\/claude\.ai\//.test(AICFG.url || '') ? AICFG.url : AI_DEFAULT_URL; }
function aiLangName(){ return AICFG.lang === 'en' ? 'English' : AICFG.lang === 'same' ? '影片本身的語言' : '繁體中文（台灣用語）'; }

var AI = {id: '', info: null, cues: [], track: null, tracks: [], ins: null, chat: [], tab: 'tr', loading: '', err: '', gen: false, asking: false, exp: false, follow: true, curT: 0};

/* ---------- 引擎 ---------- */
var AIENG = {state: 'none', waits: {}, started: false};
on('ceng', function(d){
  if(!d) return;
  if(d.state){ AIENG.state = d.state; aiEngPill(); return; }
  var w = AIENG.waits[d.id]; if(w){ delete AIENG.waits[d.id]; w(d); }
});
on('claudeClosed', function(){ if(AICFG.engine === 'sub' && isApp){ NAT.call('cengStop'); AIENG.started = false; setTimeout(aiEngStart, 300); } });
function aiEngStart(){
  if(AICFG.engine !== 'sub' || !isApp || !NAT.has('cengStart')) return;
  if(!AIENG.started){ AIENG.started = true; NAT.call('cengStart', aiUrl()); }
}
function aiEngState(){ return isApp && NAT.has('cengState') ? String(NAT.call('cengState') || 'none') : 'none'; }
function aiEngLabel(){
  if(AICFG.engine === 'api') return AICFG.key ? ['API 金鑰', 'ok'] : ['未設定 API 金鑰', 'bad'];
  var s = aiEngState();
  return s === 'ready' ? ['Claude 訂閱・就緒', 'ok'] : s === 'loading' ? ['Claude 訂閱・連線中', 'wait'] : s === 'login' ? ['Claude・需要登入', 'bad'] : s === 'noaccess' ? ['Claude・需要登入／授權', 'bad'] : ['Claude 訂閱・未連線', 'wait'];
}
function aiEngPill(){ var p = $('aiEng'); if(!p) return; var l = aiEngLabel(); p.className = 'aiEng ' + l[1]; p.querySelector('span').textContent = l[0]; }

function aiErr(code, msg){ var e = new Error(msg); e.code = code; return e; }
async function aiAsk(prompt){
  if(AICFG.engine === 'api') return aiAskApi(prompt);
  if(!isApp || !NAT.has('cengReq')) throw aiErr('noapp', 'Claude 訂閱模式只能在 App 裡使用；網頁版請到 AI 設定改用 API 金鑰。');
  aiEngStart();
  var t0 = Date.now();
  while(true){
    var s = aiEngState();
    if(s === 'ready') break;
    if(s === 'login' || (s === 'noaccess')) throw aiErr('login', '還沒登入 claude.ai，或這個帳號還沒授權工作頁使用 Claude。');
    if(s === 'none' && Date.now() - t0 > 3000){ AIENG.started = false; aiEngStart(); }
    if(Date.now() - t0 > 40000) throw aiErr('timeout', '連不上 claude.ai（40 秒內沒有回應）。請檢查網路，或到 AI 設定按「重新連線」。');
    await sleep(500);
  }
  var id = 'ai' + uid();
  var res = await new Promise(function(resolve, reject){
    AIENG.waits[id] = resolve;
    NAT.call('cengReq', id, JSON.stringify({prompt: prompt}));
    setTimeout(function(){ if(AIENG.waits[id]){ delete AIENG.waits[id]; reject(aiErr('timeout', 'AI 回應逾時（5 分鐘），請再試一次。')); } }, 300000);
  });
  if(!res.ok){
    var m = String(res.text || 'AI 發生錯誤');
    if(/尚未授權|not_granted/.test(m)) throw aiErr('grant', m);
    if(/用量|速率|rate/.test(m)) throw aiErr('rate', '已達 Claude 訂閱的用量或速率限制，請稍後再試。');
    throw aiErr('fail', m);
  }
  try{ return JSON.parse(res.text); }catch(e){ return res.text; }
}
async function aiAskApi(prompt){
  if(!AICFG.key) throw aiErr('nokey', '還沒設定 Anthropic API 金鑰。');
  var r = await fetch('https://api.anthropic.com/v1/messages', {method: 'POST', headers: {'content-type': 'application/json', 'x-api-key': AICFG.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'},
    body: JSON.stringify({model: AICFG.model || 'claude-sonnet-5-5', max_tokens: 8000, messages: [{role: 'user', content: prompt + '\n\n只輸出 JSON，不要加任何說明或 ``` 標記。'}]})});
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok) throw aiErr('fail', (j.error && j.error.message) || ('HTTP ' + r.status));
  var t = (j.content || []).map(function(c){ return c.text || ''; }).join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try{ return JSON.parse(t); }catch(e){ var m = t.match(/\{[\s\S]*\}/); if(m) return JSON.parse(m[0]); throw aiErr('fail', 'AI 回傳的格式無法解析'); }
}
function aiErrDlg(e){
  var code = e && e.code;
  if(code === 'login' || code === 'grant'){
    dialog(code === 'grant' ? '需要授權一次' : '需要登入 Claude',
      (code === 'grant' ? '第一次使用時，claude.ai 需要你同意工作頁使用 Claude：按「開啟工作頁」，在頁面裡隨便翻譯一句，跳出詢問時按「允許」，回來再按一次「探索洞察」。'
        : '用的是你的 Claude 月訂閱額度，所以要先在 App 裡登入 claude.ai（同一個帳號登入一次就好）。登入後回到這裡再按一次「探索洞察」。') +
      '<br><br><small>或到 AI 設定改用 API 金鑰。</small>',
      [[code === 'grant' ? '開啟工作頁' : '登入 Claude', function(){ NAT.call('openClaude', code === 'grant' ? aiUrl() : 'https://claude.ai/login'); }], ['AI 設定', function(){ setTimeout(aiSettings, 80); }, ''], ['取消', null, '']]);
    return;
  }
  if(code === 'nokey'){ dialog('還沒設定 API 金鑰', '請到 AI 設定填入 Anthropic API 金鑰，或改用 Claude 訂閱。', [['AI 設定', function(){ setTimeout(aiSettings, 80); }], ['取消', null, '']]); return; }
  toast((e && e.message) || 'AI 發生錯誤', true);
}

/* ---------- 影片資訊與字幕 ---------- */
function aiTs(s){ s = Math.max(0, Math.round(+s || 0)); var hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (hh ? hh + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + x).slice(-2); }
function aiParseTs(t){ var p = String(t).split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0); }
async function aiPlayerReq(id, kind){
  var body, hd;
  if(kind === 'vr'){
    var cl = {clientName: 'ANDROID_VR', clientVersion: YT_VR.ver, deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, userAgent: YT_VR.ua, osName: 'Android', osVersion: '12L', hl: 'zh-TW', gl: 'TW', utcOffsetMinutes: 480};
    body = {context: {client: cl}, videoId: id, contentCheckOk: true, racyCheckOk: true};
    hd = {'Content-Type': 'application/json', 'User-Agent': YT_VR.ua, 'X-YouTube-Client-Name': '28', 'X-YouTube-Client-Version': YT_VR.ver, 'Origin': 'https://www.youtube.com'};
  } else {
    var ver = (YT.cfg && YT.cfg.webVer) || '2.20251105.01.00';
    body = {context: {client: {clientName: 'WEB', clientVersion: ver, userAgent: YT_SAFARI_UA, osName: 'Macintosh', osVersion: '10_15_7', platform: 'DESKTOP', browserName: 'Safari', browserVersion: '18.1', hl: 'zh-TW', gl: 'TW', utcOffsetMinutes: 480}}, videoId: id, contentCheckOk: true, racyCheckOk: true};
    hd = {'Content-Type': 'application/json', 'User-Agent': YT_SAFARI_UA, 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': ver, 'Origin': 'https://www.youtube.com', 'Referer': 'https://www.youtube.com/watch?v=' + id};
  }
  var r = await natHttp('POST', 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false', hd, JSON.stringify(body), kind !== 'vr');
  return JSON.parse(r.body || '{}');
}
function aiTracksOf(j){
  return (((j.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || []).map(function(t){
    return {lang: t.languageCode, kind: t.kind || '', url: t.baseUrl, name: t.name && (t.name.simpleText || (t.name.runs || []).map(function(x){ return x.text; }).join(''))};
  });
}
async function aiLoadInfo(id, step){
  var info = {id: id, title: '', author: '', len: 0, desc: '', sb: ''}, tracks = [];
  function take(d){ if(!d) return; info.title = info.title || d.title || ''; info.author = info.author || d.author || ''; info.len = info.len || +(d.lengthSeconds || 0); info.desc = info.desc || d.shortDescription || ''; }
  /* 1. YouTube 分頁正好開著這部 */
  try{ var pd = isApp && NAT.json('ytSniff', id); if(pd && pd.info){ take(pd.info.details); tracks = (pd.info.captions || []).slice(); } }catch(e){}
  /* 2. 用 YouTube App（VR 版）身分要資訊：字幕網址通常可以直接讀 */
  step('讀取影片資訊…');
  try{ var j = await aiPlayerReq(id, 'vr'); take(j.videoDetails); var tv = aiTracksOf(j); if(tv.length) tracks = tv; }catch(e){}
  /* 3. 網頁版：章節縮圖用的預覽圖（storyboard），沒字幕時再試它的字幕 */
  try{
    var w = await aiPlayerReq(id, 'web'); take(w.videoDetails);
    info.sb = (((w.storyboards || {}).playerStoryboardSpecRenderer || {}).spec) || '';
    if(!tracks.length) tracks = aiTracksOf(w);
  }catch(e){}
  /* 4. 還是沒有：讓 YouTube 分頁打開影片後讀取 */
  if(!tracks.length && !info.title){
    var pd2 = await ytPageData(id, step).catch(function(){ return null; });
    if(pd2 && pd2.info){ take(pd2.info.details); tracks = pd2.info.captions || []; }
  }
  if(!info.title) info.title = 'YouTube 影片 ' + id;
  return {info: info, tracks: tracks};
}
function aiPickTrack(tracks){
  var man = tracks.filter(function(t){ return t.kind !== 'asr'; });
  var zh = function(L){ return L.filter(function(t){ return /^zh/.test(t.lang); }); };
  return zh(man)[0] || man[0] || zh(tracks)[0] || tracks[0] || null;
}
function aiSrtCues(srt){
  return String(srt).replace(/\r/g, '').split(/\n\n+/).map(function(b){
    var ls = b.split('\n'), i = ls.findIndex(function(x){ return x.indexOf('-->') >= 0; });
    if(i < 0) return null;
    var m = ls[i].match(/(\d+):(\d\d):(\d\d)[,.](\d+)\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d+)/);
    if(!m) return null;
    var s = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, e = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    var t = ls.slice(i + 1).join(' ').replace(/\s+/g, ' ').trim();
    return t ? {s: Math.round(s * 10) / 10, e: Math.round(e * 10) / 10, t: t} : null;
  }).filter(Boolean);
}
async function aiLoadCues(track, tr){
  var srt = await ytFetchSrt(track, tr);
  return aiSrtCues(srt);
}
/* 給 AI 的逐字稿：每 ~20 秒一行，太長就加大間隔 */
function aiTranscriptText(cues, maxChars){
  maxChars = maxChars || 110000;
  for(var span = 20; span <= 600; span *= 2){
    var out = [], cur = null;
    cues.forEach(function(c){
      if(!cur || c.s - cur.s >= span){ cur = {s: c.s, t: []}; out.push(cur); }
      cur.t.push(c.t);
    });
    var txt = out.map(function(o){ return '[' + aiTs(o.s) + '] ' + o.t.join(' '); }).join('\n');
    if(txt.length <= maxChars) return txt;
  }
  return txt.slice(0, maxChars);
}

/* ---------- 快取與記錄 ---------- */
function aiHist(){ return lsGet('ws.aiHist', []); }
function aiSaveCache(){
  if(!AI.id || !AI.info) return;
  var o = {info: AI.info, ins: AI.ins, chat: AI.chat, track: AI.track, tr: AI.tr || '', t: Date.now()};
  var hist = aiHist().filter(function(x){ return x.id !== AI.id; });
  hist.unshift({id: AI.id, title: AI.info.title, author: AI.info.author, len: AI.info.len, ins: !!AI.ins, t: Date.now()});
  /* 逐字稿只留最近 12 部（其他要用時重新抓） */
  hist.forEach(function(x, i){ if(i >= 12){ var c = lsGet('ws.ai.' + x.id, null); if(c && c.cues){ delete c.cues; lsSet('ws.ai.' + x.id, c); } } });
  o.cues = AI.cues;
  lsSet('ws.ai.' + AI.id, o);
  lsSet('ws.aiHist', hist.slice(0, 80));
}
function aiForget(id){ try{ localStorage.removeItem('ws.ai.' + id); }catch(e){} lsSet('ws.aiHist', aiHist().filter(function(x){ return x.id !== id; })); }

/* ---------- 開啟影片 ---------- */
async function aiOpenVideo(id, opts){
  opts = opts || {};
  if(!id) return;
  if(curView !== 'ai') showView('ai');
  aiEngStart();
  var c = lsGet('ws.ai.' + id, null);
  AI.id = id; AI.info = c && c.info || {id: id, title: '', author: ''}; AI.ins = c && c.ins || null; AI.chat = c && c.chat || [];
  AI.cues = c && c.cues || []; AI.track = c && c.track || null; AI.tr = c && c.tr || ''; AI.tracks = []; AI.err = ''; AI.exp = false;
  AI.tab = AI.ins ? (opts.tab || 'sum') : 'tr';
  AI.loading = AI.cues.length ? '' : '讀取逐字稿…';
  aiRender();
  if(isApp) NAT.call('aipLoad', id, opts.t || 0, false);
  aiSyncPlayer();
  try{
    var r = await aiLoadInfo(id, function(s){ if(AI.id === id && AI.loading){ AI.loading = s; aiRenderPane(); } });
    if(AI.id !== id) return;
    var keepTitle = AI.info.title;
    AI.info = Object.assign({}, AI.info, r.info, {title: r.info.title || keepTitle});
    AI.tracks = r.tracks;
    aiRenderMeta();
    if(!AI.cues.length){
      var t = aiPickTrack(r.tracks);
      if(!t){ AI.err = 'notrack'; AI.loading = ''; aiRenderPane(); aiSaveCache(); return; }
      AI.loading = '讀取逐字稿…'; aiRenderPane();
      AI.track = t; AI.tr = '';
      AI.cues = await aiLoadCues(t, '');
    }
    AI.loading = '';
    aiSaveCache();
  }catch(e){
    if(AI.id !== id) return;
    AI.loading = ''; if(!AI.cues.length) AI.err = e.message || String(e);
  }
  aiRender();
}
async function aiSwitchTrack(t, tr){
  AI.loading = '讀取逐字稿…'; AI.err = ''; aiRenderPane();
  try{ AI.cues = await aiLoadCues(t, tr || ''); AI.track = t; AI.tr = tr || ''; aiSaveCache(); }catch(e){ toast('字幕讀取失敗：' + e.message, true); }
  AI.loading = ''; aiRenderPane();
}

/* ---------- 產生洞察／對話 ---------- */
function aiVideoBlock(maxChars){
  var I = AI.info || {};
  return '影片標題：' + (I.title || '') + '\n頻道：' + (I.author || '') + '\n長度：' + aiTs(I.len || 0) +
    (I.desc ? '\n說明欄：\n' + String(I.desc).slice(0, 1500) : '') +
    '\n\n逐字稿（每行開頭是時間碼）：\n' + (AI.cues.length ? aiTranscriptText(AI.cues, maxChars) : '（這部影片沒有字幕，只有標題與說明欄可參考）');
}
async function aiGenerate(){
  if(AI.gen || !AI.id) return;
  AI.gen = true; AI.tab = 'sum'; aiRender();
  var prompt = '你是 YouTube 影片內容分析助理。請只根據下面提供的影片資訊與逐字稿分析，不要編造影片沒有的內容。所有文字用' + aiLangName() + '撰寫。\n' +
    (AI.cues.length ? '' : '注意：這部影片沒有逐字稿，只能根據標題與說明欄推測，請在 overview 第一句註明「此影片無字幕，以下根據標題與說明推測」。\n') +
    '只回傳 JSON，格式：\n{"overview":"總覽，2~4 段，段落之間用 \\n\\n 分隔","keyPoints":["重點，5~8 條，每條一句"],"details":["詳細說明，4~10 條，要具體（數字、人名、地名、例子）"],' +
    '"chapters":[{"start":開始秒數(整數),"end":結束秒數(整數),"title":"章節標題（20 字內）","summary":"2~3 句摘要","points":["這段的要點 2~4 條"]}],"tags":["3~6 個關鍵詞"],"questions":["3 個看完後值得追問的問題"]}\n' +
    '章節依時間順序涵蓋整部影片（通常 4~12 個），start 必須對應逐字稿裡的時間碼。\n\n' + aiVideoBlock();
  try{
    var v = await aiAsk(prompt);
    if(!v || typeof v !== 'object' || !v.overview) throw aiErr('fail', 'AI 回傳的內容不完整，請再試一次');
    v.chapters = (v.chapters || []).map(function(c){ return {start: Math.max(0, Math.round(+c.start || 0)), end: Math.round(+c.end || 0), title: String(c.title || ''), summary: String(c.summary || ''), points: (c.points || []).map(String)}; }).sort(function(a, b){ return a.start - b.start; });
    v.t = Date.now(); v.engine = AICFG.engine;
    AI.ins = v; aiSaveCache();
    if(typeof buzz === 'function') buzz(30);
  }catch(e){ aiErrDlg(e); }
  AI.gen = false; aiRender();
}
async function aiSend(q){
  q = String(q || '').trim();
  if(!q || AI.asking || !AI.id) return;
  AI.chat.push({role: 'user', text: q, t: Date.now()}); AI.asking = true; aiRenderPane();
  var hist = AI.chat.slice(-11, -1).map(function(m){ return (m.role === 'user' ? '使用者：' : '助理：') + m.text; }).join('\n');
  var prompt = '你是這部 YouTube 影片的問答助理。根據逐字稿回答問題，用' + aiLangName() + '，簡潔具體。提到影片內容時在句中標註時間碼，格式為 [mm:ss] 或 [h:mm:ss]。' +
    '影片沒提到的要直說「影片沒有提到」，可以再補充一般知識，但要標明是補充。\n只回傳 JSON：{"answer":"回答（可分段，用 \\n 換行；可用 **粗體** 與 - 條列）","suggest":["2~3 個可以接著問的問題"]}\n\n' +
    aiVideoBlock(80000) + (hist ? '\n\n先前的對話：\n' + hist : '') + '\n\n現在的問題：' + q;
  try{
    var v = await aiAsk(prompt);
    var ans = typeof v === 'string' ? v : (v && (v.answer || v.text)) || '';
    AI.chat.push({role: 'ai', text: String(ans || '（沒有回答）'), suggest: (v && v.suggest) || [], t: Date.now()});
  }catch(e){ AI.chat.pop(); aiErrDlg(e); var inp = $('aiQ'); if(inp && !inp.value) inp.value = q; }
  AI.asking = false; aiSaveCache(); aiRenderPane();
}

/* ---------- 文字格式（時間碼可點） ---------- */
function aiFmt(t){
  var s = esc(t);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/\[((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s*[-–~]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?\]/g, function(m, a){ return '<a class="aiTs" data-t="' + aiParseTs(a) + '">' + m.slice(1, -1) + '</a>'; });
  return s.split(/\n/).map(function(l){ return /^\s*[-•・]\s+/.test(l) ? '<div class="aiLi">' + l.replace(/^\s*[-•・]\s+/, '') + '</div>' : (l.trim() ? '<p>' + l + '</p>' : ''); }).join('');
}
function aiSeek(t){
  t = Math.max(0, +t || 0);
  if(!isApp){ openExternal('https://www.youtube.com/watch?v=' + AI.id + '&t=' + Math.floor(t) + 's'); return; }
  if(AI.exp){ AI.exp = false; aiRender(); }
  var st = NAT.json('aipState') || {};
  if(st.id !== AI.id || !(st.dur > 0)) NAT.call('aipLoad', AI.id, Math.floor(t), true);
  else NAT.call('aipSeek', t, true);
  NAT.call('ytNav', 'pause');
  AI.curT = t; aiHighlight();
}

/* ---------- 章節縮圖（YouTube 預覽圖） ---------- */
function aiThumb(t, w){
  w = w || 112;
  var I = AI.info || {}, sb = I.sb;
  if(sb){
    try{
      var P = sb.split('|'), base = P[0], L = P.length - 2, lv = P[L + 1].split('#');
      var fw = +lv[0], fh = +lv[1], cnt = +lv[2], cols = +lv[3], rows = +lv[4], iv = +lv[5], name = lv[6], sigh = lv[7];
      var idx = iv > 0 ? Math.floor(t * 1000 / iv) : Math.floor(t / Math.max(1, I.len || 1) * cnt);
      idx = Math.max(0, Math.min(cnt - 1, idx));
      var per = cols * rows, page = Math.floor(idx / per), k = idx % per;
      var url = base.replace('$L', L).replace('$N', name.replace('$M', page)) + (base.indexOf('?') < 0 ? '?' : '&') + 'sigh=' + sigh;
      var hh = Math.round(w * fh / fw);
      return '<div class="aiTh" style="width:' + w + 'px;height:' + hh + 'px;background-image:url(\'' + url.replace(/'/g, '%27') + '\');background-size:' + (cols * w) + 'px auto;background-position:-' + (k % cols * w) + 'px -' + (Math.floor(k / cols) * hh) + 'px"></div>';
    }catch(e){}
  }
  return '<div class="aiTh" style="width:' + w + 'px;height:' + Math.round(w * 9 / 16) + 'px;background-image:url(\'https://i.ytimg.com/vi/' + AI.id + '/mqdefault.jpg\');background-size:cover"></div>';
}

/* ---------- 畫面 ---------- */
function aiRender(){
  var v = $('v-ai'); if(!v) return;
  v.innerHTML = '';
  var top = h('div', {class: 'aiTop glass'},
    AI.id ? h('button', {class: 'ib', html: icon('back'), title: '回到列表', onclick: aiClose}) : h('span', {class: 'aiLogo', html: icon('sparkle')}),
    h('div', {class: 'aiTitle'}, h('b', {text: 'AI 摘要'}), h('small', {text: AI.id ? 'YouTube 影片洞察' : '貼上 YouTube 網址，產生摘要、章節與問答'})),
    h('button', {class: 'aiEng', id: 'aiEng', onclick: aiSettings}, h('i'), h('span')),
    h('button', {class: 'ib', html: icon('more'), title: 'AI 設定', onclick: aiMoreMenu}));
  v.appendChild(top);
  if(!AI.id){ v.appendChild(aiStartPage()); aiEngPill(); aiSyncPlayer(); return; }
  var body = h('div', {class: 'aiBody' + (AI.exp ? ' exp' : '')});
  body.appendChild(h('div', {class: 'aiPlayer', id: 'aiPlayer', style: {backgroundImage: 'url("https://i.ytimg.com/vi/' + AI.id + '/hqdefault.jpg")'}, onclick: function(){ aiSeek(AI.curT || 0); }},
    h('span', {class: 'aiPlay', html: icon('play')})));
  body.appendChild(h('div', {class: 'aiMeta', id: 'aiMeta'}));
  var tabs = h('div', {class: 'aiTabs'});
  var seg = h('div', {class: 'aiSeg'});
  [['tr', '逐字稿'], ['sum', '摘要'], ['chap', '章節'], ['chat', '對話']].forEach(function(x){
    seg.appendChild(h('button', {class: AI.tab === x[0] ? 'on' : '', text: x[1], onclick: function(){ AI.tab = x[0]; aiRender(); }}));
  });
  tabs.appendChild(seg);
  tabs.appendChild(h('button', {class: 'ib', html: icon('download'), title: '匯出', onclick: aiExport}));
  tabs.appendChild(h('button', {class: 'ib', html: icon(AI.exp ? 'shrink' : 'expand'), title: AI.exp ? '縮小' : '放大內容', onclick: function(){ AI.exp = !AI.exp; aiRender(); }}));
  body.appendChild(tabs);
  body.appendChild(h('div', {class: 'aiPane', id: 'aiPane'}));
  body.appendChild(h('div', {class: 'aiFoot', id: 'aiFoot'}));
  v.appendChild(body);
  aiRenderMeta(); aiRenderPane(); aiEngPill();
  requestAnimationFrame(aiSyncPlayer);
}
function aiRenderMeta(){
  var m = $('aiMeta'); if(!m) return;
  var I = AI.info || {};
  m.innerHTML = '';
  m.appendChild(h('div', {class: 'aiVt', text: I.title || '讀取中…', onclick: function(){ this.classList.toggle('open'); }}));
  m.appendChild(h('div', {class: 'aiVs'},
    h('span', {class: 'ell', text: [I.author, I.len ? aiTs(I.len) : ''].filter(Boolean).join('・')}),
    h('button', {class: 'chip', html: icon('ytplay', 'sm') + 'YouTube', onclick: function(){ var st = isApp && NAT.json('aipState') || {}; NAT.call('aipShow', false); ytOpen('https://m.youtube.com/watch?v=' + AI.id + (st.t > 3 ? '&t=' + Math.floor(st.t) + 's' : '')); }}),
    h('button', {class: 'chip', html: icon('download', 'sm') + '下載', onclick: function(){ openYt(AI.id); }})));
}
function aiSkel(n){ var d = h('div', {class: 'aiSkel'}); for(var i = 0; i < (n || 6); i++){ d.appendChild(h('i', {style: {width: (55 + (i * 37) % 40) + '%'}})); } return d; }
function aiRenderPane(){
  var p = $('aiPane'), f = $('aiFoot'); if(!p) return;
  var keep = p.scrollTop, tabWas = p.dataset.tab;
  p.innerHTML = ''; f.innerHTML = ''; p.dataset.tab = AI.tab;
  if(AI.tab === 'tr') aiPaneTr(p, f);
  else if(AI.tab === 'sum') aiPaneSum(p, f);
  else if(AI.tab === 'chap') aiPaneChap(p, f);
  else aiPaneChat(p, f);
  paintIcons(p); paintIcons(f);
  qsa('.aiTs', p).forEach(function(a){ a.onclick = function(e){ e.stopPropagation(); aiSeek(+a.dataset.t); }; });
  if(tabWas === AI.tab && AI.tab !== 'chat') p.scrollTop = keep;
  if(AI.tab === 'chat') p.scrollTop = p.scrollHeight;
}
function aiCta(f){
  if(AI.ins && !AI.gen) return;
  f.appendChild(h('button', {class: 'aiGo' + (AI.gen ? ' busy' : ''), disabled: AI.gen || !!AI.loading, onclick: aiGenerate},
    AI.gen ? h('span', {class: 'spin sm'}) : null, h('span', {text: AI.gen ? 'AI 分析中…' : '探索洞察'}), AI.gen ? null : h('span', {html: icon('sparkle', 'sm')})));
}
function aiPaneTr(p, f){
  if(AI.loading){ p.appendChild(h('div', {class: 'aiNote', text: AI.loading})); p.appendChild(aiSkel(8)); aiCta(f); return; }
  if(AI.err && !AI.cues.length){
    p.appendChild(h('div', {class: 'empty'}, h('div', {class: 'big', html: icon('sub', 'lg')}),
      h('div', {text: AI.err === 'notrack' ? '這部影片沒有字幕，AI 只能根據標題與說明欄推測內容。' : '讀取逐字稿失敗：' + AI.err}),
      AI.err === 'notrack' ? null : h('button', {class: 'btn', style: {marginTop: '12px'}, html: icon('reload', 'sm') + '再試一次', onclick: function(){ var c = lsGet('ws.ai.' + AI.id, null); if(c){ delete c.cues; lsSet('ws.ai.' + AI.id, c); } aiOpenVideo(AI.id); }})));
    aiCta(f); return;
  }
  var bar = h('div', {class: 'aiTrBar'});
  var tl = AI.track ? ((AI.track.name || AI.track.lang) + (AI.tr ? '→中文' : '') + (AI.track.kind === 'asr' ? '（自動）' : '')) : '字幕';
  bar.appendChild(h('button', {class: 'chip', html: icon('sub', 'sm') + esc(tl) + ' ▾', onclick: aiTrackMenu}));
  bar.appendChild(h('span', {class: 'grow'}));
  bar.appendChild(h('button', {class: 'chip' + (AI.follow ? ' pri' : ''), html: icon('play', 'sm') + '跟隨播放', onclick: function(){ AI.follow = !AI.follow; this.classList.toggle('pri', AI.follow); }}));
  p.appendChild(bar);
  var list = h('div', {class: 'aiTr', id: 'aiTr'});
  AI.cues.forEach(function(c, i){
    list.appendChild(h('div', {class: 'aiLine', 'data-i': i, onclick: function(){ aiSeek(c.s); }}, h('span', {class: 'aiLt', text: aiTs(c.s)}), h('span', {text: c.t})));
  });
  p.appendChild(list);
  aiCta(f);
  aiHighlight();
}
function aiTrackMenu(){
  if(!AI.tracks.length){ toast('沒有其他字幕可選'); return; }
  var items = AI.tracks.map(function(t){ return ['sub', (t.name || t.lang) + (t.kind === 'asr' ? '（自動產生）' : ''), function(){ aiSwitchTrack(t, ''); }, false, t.lang]; });
  var base = aiPickTrack(AI.tracks);
  if(base && !/^zh/.test(base.lang)) items.push(['sparkle', '自動翻譯成中文（繁體）', function(){ aiSwitchTrack(base, 'zh-Hant'); }, false, '由 ' + (base.name || base.lang) + ' 翻譯']);
  menu('選擇字幕', items);
}
function aiPaneSum(p, f){
  var S = AI.ins;
  if(!S){
    if(AI.gen){ p.appendChild(h('div', {class: 'aiNote', text: 'AI 正在看完整份逐字稿，通常要 20～90 秒…'})); p.appendChild(aiSkel(10)); }
    else p.appendChild(h('div', {class: 'empty'}, h('div', {class: 'big', html: icon('sparkle', 'lg')}), h('div', {text: '按下方「探索洞察」，AI 會整理這部影片的總覽、重點與詳細說明。'})));
    aiCta(f); return;
  }
  var box = h('div', {class: 'aiDoc'});
  box.appendChild(h('h4', {text: '總覽'}));
  box.appendChild(h('div', {html: aiFmt(S.overview || '')}));
  if(S.keyPoints && S.keyPoints.length){ box.appendChild(h('h4', {text: '重點'})); S.keyPoints.forEach(function(x){ box.appendChild(h('div', {class: 'aiLi', html: aiFmt(x).replace(/^<p>|<\/p>$/g, '')})); }); }
  if(S.details && S.details.length){ box.appendChild(h('h4', {text: '詳細說明'})); S.details.forEach(function(x){ box.appendChild(h('div', {class: 'aiLi', html: aiFmt(typeof x === 'string' ? x : (x.title ? x.title + '：' : '') + (x.body || '')).replace(/^<p>|<\/p>$/g, '')})); }); }
  if(S.tags && S.tags.length){ var tg = h('div', {class: 'aiTags'}); S.tags.forEach(function(t){ tg.appendChild(h('span', {text: '#' + t})); }); box.appendChild(tg); }
  box.appendChild(h('div', {class: 'aiMetaLine'}, h('span', {text: '由 ' + (S.engine === 'api' ? 'Claude API' : 'Claude 訂閱') + ' 產生・' + fmtDate(S.t || Date.now())}),
    h('button', {class: 'chip', html: icon('reload', 'sm') + '重新產生', onclick: async function(){ if(await confirmDlg('重新產生洞察？', '會用目前的逐字稿重新分析，覆蓋現在的摘要與章節（對話會保留）。', '重新產生')){ AI.ins = null; aiGenerate(); } }})));
  p.appendChild(box);
}
function aiPaneChap(p, f){
  var S = AI.ins;
  if(!S || !(S.chapters || []).length){
    if(AI.gen){ p.appendChild(aiSkel(8)); }
    else p.appendChild(h('div', {class: 'empty'}, h('div', {class: 'big', html: icon('list', 'lg')}), h('div', {text: S ? 'AI 沒有分出章節。' : '按下方「探索洞察」後，這裡會列出有時間碼的章節。'})));
    aiCta(f); return;
  }
  S.chapters.forEach(function(c, i){
    var nx = S.chapters[i + 1], end = c.end > c.start ? c.end : nx ? nx.start : (AI.info.len || c.start);
    var more = h('div', {class: 'aiChMore hide'});
    if(c.points && c.points.length) c.points.forEach(function(x){ more.appendChild(h('div', {class: 'aiLi', html: aiFmt(x).replace(/^<p>|<\/p>$/g, '')})); });
    var card = h('div', {class: 'aiCh', 'data-s': c.start, 'data-e': end},
      h('div', {class: 'aiChTop', onclick: function(){ aiSeek(c.start); }},
        h('div', {class: 'aiChTh', html: aiThumb(c.start, 104) + '<span class="aiChPlay">' + icon('play', 'sm') + '</span>'}),
        h('div', {class: 'grow'}, h('b', {text: c.title}), h('div', {class: 'aiChT', text: aiTs(c.start) + ' - ' + aiTs(end)}))),
      c.summary ? h('div', {class: 'aiChSum', html: aiFmt(c.summary)}) : null,
      more,
      (c.points && c.points.length) ? h('button', {class: 'aiChBtn', text: '查看更多…', onclick: function(){ var hid = more.classList.toggle('hide'); this.textContent = hid ? '查看更多…' : '收合'; }}) : null);
    p.appendChild(card);
  });
  aiHighlight();
}
function aiPaneChat(p, f){
  var list = h('div', {class: 'aiChat'});
  if(!AI.chat.length){
    list.appendChild(h('div', {class: 'aiNote', text: '問任何跟這部影片有關的問題，AI 會根據逐字稿回答並標出時間點。'}));
    var qs0 = (AI.ins && AI.ins.questions) || ['這部影片的重點是什麼？', '有哪些具體的數字或例子？', '講者的結論是什麼？'];
    var sg = h('div', {class: 'aiSug'}); qs0.forEach(function(q){ sg.appendChild(h('button', {class: 'chip', text: q, onclick: function(){ aiSend(q); }})); }); list.appendChild(sg);
  }
  AI.chat.forEach(function(m, i){
    list.appendChild(h('div', {class: 'aiMsg ' + (m.role === 'user' ? 'me' : 'ai'), html: m.role === 'user' ? esc(m.text) : aiFmt(m.text)}));
    if(m.role === 'ai' && i === AI.chat.length - 1 && m.suggest && m.suggest.length && !AI.asking){
      var sg2 = h('div', {class: 'aiSug'}); m.suggest.slice(0, 3).forEach(function(q){ sg2.appendChild(h('button', {class: 'chip', text: q, onclick: function(){ aiSend(q); }})); }); list.appendChild(sg2);
    }
  });
  if(AI.asking) list.appendChild(h('div', {class: 'aiMsg ai'}, h('span', {class: 'aiDots'}, h('i'), h('i'), h('i'))));
  p.appendChild(list);
  var inp = h('textarea', {id: 'aiQ', rows: 1, placeholder: '問這部影片…', onkeydown: function(e){ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); go(); } }, oninput: function(){ this.style.height = 'auto'; this.style.height = Math.min(110, this.scrollHeight) + 'px'; }});
  function go(){ var q = inp.value; inp.value = ''; inp.style.height = ''; aiSend(q); }
  f.appendChild(h('div', {class: 'aiAsk glass'}, inp,
    AI.chat.length ? h('button', {class: 'ib', html: icon('trash'), title: '清除對話', onclick: async function(){ if(await confirmDlg('清除對話？', '這部影片的問答記錄會被刪除。', '清除', true)){ AI.chat = []; aiSaveCache(); aiRenderPane(); } }}) : null,
    h('button', {class: 'ib pri', html: icon('send'), title: '送出', disabled: AI.asking, onclick: go})));
}

/* 播放中：逐字稿／章節跟著目前時間標示 */
function aiHighlight(){
  var t = AI.curT;
  var tr = $('aiTr');
  if(tr && AI.tab === 'tr'){
    var idx = -1;
    for(var i = 0; i < AI.cues.length; i++){ if(AI.cues[i].s <= t + 0.2) idx = i; else break; }
    var old = qs('.aiLine.on', tr); if(old && +old.dataset.i !== idx) old.classList.remove('on');
    var ln = idx >= 0 && qs('.aiLine[data-i="' + idx + '"]', tr);
    if(ln && !ln.classList.contains('on')){
      ln.classList.add('on');
      if(AI.follow){ var p = $('aiPane'); if(p){ var top = ln.offsetTop - p.clientHeight * 0.35; p.scrollTo({top: Math.max(0, top), behavior: 'smooth'}); } }
    }
  }
  if(AI.tab === 'chap') qsa('.aiCh').forEach(function(c){ c.classList.toggle('on', t >= +c.dataset.s && t < +c.dataset.e); });
}
setInterval(function(){
  if(curView !== 'ai' || !AI.id || !isApp || !NAT.has('aipState')) return;
  var st = NAT.json('aipState'); if(!st || st.id !== AI.id) return;
  var pl = $('aiPlayer'); if(pl) pl.classList.toggle('ready', st.dur > 0);
  if(Math.abs(st.t - AI.curT) > 0.3){ AI.curT = st.t; aiHighlight(); }
}, 700);

/* 原生小播放器放在 #aiPlayer 的位置上 */
function aiSyncPlayer(){
  if(!isApp || !NAT.has('aipRect')) return;
  var on = curView === 'ai' && !!AI.id && !AI.exp && !Viewer.isOpen();
  var el = $('aiPlayer');
  if(on && el){
    var off = $('v-ai').getBoundingClientRect().top, r = el.getBoundingClientRect();
    NAT.call('aipRect', r.top - off, r.left, r.width, r.height);
  }
  NAT.call('aipShow', on && !!el);
}
on('view', function(d){
  if(d.v === 'ai'){ if(!$('v-ai').firstChild) aiRender(); aiEngStart(); setTimeout(aiSyncPlayer, 60); setTimeout(aiSyncPlayer, 300); }
  else if(d.prev === 'ai' && isApp) NAT.call('aipShow', false);
});
on('layout', function(){ if(curView === 'ai') aiSyncPlayer(); });
window.addEventListener('resize', function(){ if(curView === 'ai') setTimeout(aiSyncPlayer, 80); });
on('aipLink', function(d){ var id = d && YT.idOf(d.url); NAT.call('aipShow', false); if(id) ytOpen('https://m.youtube.com/watch?v=' + id); else if(d && d.url) openExternal(d.url); });

function aiClose(){ AI.id = ''; if(isApp){ NAT.call('aipShow', false); } aiRender(); }

/* ---------- 起始頁 ---------- */
function aiStartPage(){
  var sc = h('div', {class: 'scroll aiStart'}), pg = h('div', {class: 'page'});
  sc.appendChild(pg);
  var inp = h('input', {type: 'url', placeholder: '貼上 YouTube 影片網址…', onkeydown: function(e){ if(e.key === 'Enter') go(); }});
  function go(){ var id = YT.idOf(inp.value.trim()) || (/^[\w-]{11}$/.test(inp.value.trim()) ? inp.value.trim() : ''); if(id) aiOpenVideo(id); else toast('這不是 YouTube 影片網址', true); }
  pg.appendChild(h('div', {class: 'card glass aiHero'},
    h('div', {class: 'aiHeroT', html: icon('sparkle') + '<b>YouTube 影片 AI 洞察</b>'}),
    h('div', {class: 'sub', text: '讀取影片的逐字稿，用 Claude 整理出總覽、重點、有時間碼的章節，還能針對影片內容提問。'}),
    h('div', {class: 'aiIn'}, inp,
      h('button', {class: 'ib', html: icon('copy'), title: '貼上', onclick: async function(){ try{ var t = await navigator.clipboard.readText(); if(t){ inp.value = t.trim(); go(); } }catch(e){ inp.focus(); } }}),
      h('button', {class: 'btn pri', html: icon('sparkle', 'sm') + '開始', onclick: go}))));
  var cid = typeof ytCurId === 'function' ? ytCurId() : null;
  if(cid){
    pg.appendChild(h('div', {class: 'card glass aiCur', onclick: function(){ aiOpenVideo(cid); }},
      h('div', {class: 'aiHTh', style: {backgroundImage: 'url("https://i.ytimg.com/vi/' + cid + '/mqdefault.jpg")'}}),
      h('div', {class: 'grow'}, h('small', {text: 'YouTube 分頁正在看'}), h('b', {class: 'ell2', text: YTB.title || cid})),
      h('span', {class: 'chip pri', html: icon('sparkle', 'sm') + '分析'})));
  }
  var hist = aiHist();
  if(hist.length){
    pg.appendChild(h('h3', {class: 'aiH3', text: '分析過的影片'}));
    hist.forEach(function(x){
      pg.appendChild(h('div', {class: 'aiHRow', onclick: function(){ aiOpenVideo(x.id); }},
        h('div', {class: 'aiHTh', style: {backgroundImage: 'url("https://i.ytimg.com/vi/' + x.id + '/mqdefault.jpg")'}}, x.len ? h('span', {text: aiTs(x.len)}) : null),
        h('div', {class: 'grow'}, h('b', {class: 'ell2', text: x.title || x.id}), h('small', {text: [x.author, x.ins ? '✦ 已有洞察' : '只有逐字稿', fmtDate(x.t)].filter(Boolean).join('・')})),
        h('button', {class: 'ib', html: icon('trash'), title: '刪除', onclick: function(e){ e.stopPropagation(); aiForget(x.id); aiRender(); }})));
    });
  } else {
    pg.appendChild(h('div', {class: 'empty'}, h('div', {text: '還沒有分析過的影片。也可以在 YouTube 分頁的「⋮」選「AI 摘要這部影片」。'})));
  }
  paintIcons(sc);
  return sc;
}

/* ---------- 匯出（純文字／Markdown／JSON） ---------- */
function aiExportText(fmt, withChat){
  var I = AI.info || {}, S = AI.ins || {}, url = 'https://www.youtube.com/watch?v=' + AI.id;
  var chat = withChat ? AI.chat.map(function(m){ return {role: m.role === 'user' ? 'user' : 'assistant', text: m.text}; }) : undefined;
  if(fmt === 'json') return JSON.stringify({video: {id: AI.id, url: url, title: I.title, channel: I.author, duration: I.len}, overview: S.overview || '', keyPoints: S.keyPoints || [], details: S.details || [], chapters: (S.chapters || []).map(function(c){ return Object.assign({time: aiTs(c.start)}, c); }), tags: S.tags || [], chat: chat, transcript: withChat ? undefined : undefined, generatedAt: S.t ? new Date(S.t).toISOString() : undefined}, null, 2);
  var md = fmt === 'md', L = [];
  L.push(md ? '# ' + I.title : I.title); L.push((md ? '' : '') + [I.author, aiTs(I.len || 0)].filter(Boolean).join('・')); L.push(url); L.push('');
  if(S.overview){ L.push(md ? '## 總覽' : '【總覽】'); L.push(S.overview); L.push(''); }
  if((S.keyPoints || []).length){ L.push(md ? '## 重點' : '【重點】'); S.keyPoints.forEach(function(x){ L.push((md ? '- ' : '・') + x); }); L.push(''); }
  if((S.details || []).length){ L.push(md ? '## 詳細說明' : '【詳細說明】'); S.details.forEach(function(x){ L.push((md ? '- ' : '・') + (typeof x === 'string' ? x : x.title + '：' + x.body)); }); L.push(''); }
  if((S.chapters || []).length){
    L.push(md ? '## 章節' : '【章節】');
    S.chapters.forEach(function(c){ L.push(md ? '### [' + aiTs(c.start) + '](' + url + '&t=' + c.start + 's) ' + c.title : aiTs(c.start) + '　' + c.title); if(c.summary) L.push(c.summary); (c.points || []).forEach(function(x){ L.push((md ? '- ' : '　・') + x); }); L.push(''); });
  }
  if(!AI.ins && AI.cues.length){ L.push(md ? '## 逐字稿' : '【逐字稿】'); L.push(aiTranscriptText(AI.cues)); L.push(''); }
  if(withChat && AI.chat.length){ L.push(md ? '## 對話' : '【對話】'); AI.chat.forEach(function(m){ L.push((md ? '**' : '') + (m.role === 'user' ? '我' : 'AI') + (md ? '**：' : '：') + m.text); L.push(''); }); }
  return L.join('\n');
}
function aiExport(){
  if(!AI.id) return;
  var fmt = lsGet('ws.aiExpFmt', 'txt'), withChat = false;
  var body = h('div');
  body.appendChild(h('div', {class: 'aiExpH', text: '選擇匯出格式'}));
  var grid = h('div', {class: 'aiFmtGrid'});
  [['txt', '純文字', '以純文字分享'], ['md', 'Markdown', '適合筆記或文件'], ['json', 'JSON', '包含結構化欄位']].forEach(function(x){
    grid.appendChild(h('button', {class: 'aiFmt' + (fmt === x[0] ? ' on' : ''), onclick: function(){ fmt = x[0]; lsSet('ws.aiExpFmt', fmt); qsa('.aiFmt', grid).forEach(function(b){ b.classList.remove('on'); }); this.classList.add('on'); }}, h('b', {text: x[1]}), h('small', {text: x[2]})));
  });
  body.appendChild(grid);
  body.appendChild(h('div', {class: 'aiExpH', text: '包含聊天記錄'}));
  var sw = h('input', {type: 'checkbox', onchange: function(){ withChat = this.checked; }});
  body.appendChild(h('label', {class: 'setRow aiSw'}, h('div', {class: 'grow'}, h('b', {text: '附上對話內容'}), h('div', {class: 'sub', text: AI.chat.length ? AI.chat.length + ' 則訊息' : '目前沒有對話'})), sw));
  if(!AI.ins) body.appendChild(h('div', {class: 'sub', style: {margin: '8px 2px'}, text: '還沒產生 AI 洞察，匯出的會是逐字稿。'}));
  async function make(){
    var txt = aiExportText(fmt, withChat), ext = fmt === 'md' ? 'md' : fmt === 'json' ? 'json' : 'txt';
    var mime = fmt === 'json' ? 'application/json' : fmt === 'md' ? 'text/markdown' : 'text/plain';
    var name = String((AI.info && AI.info.title) || AI.id).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim() + (AI.ins ? '・AI 洞察' : '・逐字稿') + '.' + ext;
    return {txt: txt, blob: new Blob([txt], {type: mime + ';charset=utf-8'}), name: name};
  }
  var s = openSheet({title: '匯出 AI 洞察', icon: 'download', body: body, foot: h('div', {class: 'btn-row', style: {width: '100%'}},
    h('button', {class: 'btn', html: icon('copy', 'sm') + '複製', onclick: async function(){ copyText((await make()).txt); }}),
    h('button', {class: 'btn', html: icon('folder', 'sm') + '存到檔案庫', onclick: async function(){ var m = await make(); try{ await saveBigBlob(m.blob, m.name, {src: 'https://www.youtube.com/watch?v=' + AI.id, title: m.name}); toast('✓ 已存到檔案庫'); s.close(); }catch(e){ toast('儲存失敗：' + e.message, true); } }}),
    h('button', {class: 'btn pri', html: icon('share', 'sm') + '分享', onclick: async function(){
      var m = await make();
      try{
        if(isApp){ var it = await saveBigBlob(m.blob, m.name, {src: 'https://www.youtube.com/watch?v=' + AI.id, title: m.name}); NAT.call('libExport', JSON.stringify([it.id]), 'share'); }
        else if(navigator.canShare && navigator.canShare({files: [new File([m.blob], m.name)]})) await navigator.share({files: [new File([m.blob], m.name, {type: m.blob.type})]});
        else downloadBlob(m.blob, m.name);
        s.close();
      }catch(e){ toast('分享失敗：' + e.message, true); }
    }}))});
}

/* ---------- 設定 ---------- */
function aiMoreMenu(){
  menu('AI 摘要', [
    AI.id ? ['reload', '重新讀取逐字稿', function(){ var c = lsGet('ws.ai.' + AI.id, null); if(c){ delete c.cues; lsSet('ws.ai.' + AI.id, c); } aiOpenVideo(AI.id); }] : null,
    AI.id ? ['copy', '複製逐字稿', function(){ copyText(AI.cues.map(function(c){ return '[' + aiTs(c.s) + '] ' + c.t; }).join('\n')); }] : null,
    ['gear', 'AI 設定', aiSettings, false, '引擎、Claude 登入、輸出語言'],
    ['trash', '清除所有 AI 記錄', async function(){ if(await confirmDlg('清除所有 AI 記錄？', '分析過的影片、摘要與對話都會刪除。', '清除', true)){ aiHist().forEach(function(x){ try{ localStorage.removeItem('ws.ai.' + x.id); }catch(e){} }); lsSet('ws.aiHist', []); AI.id = ''; aiRender(); } }, true]
  ]);
}
function aiSettings(){
  var body = h('div');
  function draw(){
    body.innerHTML = '';
    var seg = h('div', {class: 'seg', style: {marginBottom: '12px'}});
    [['sub', 'Claude 訂閱'], ['api', 'API 金鑰']].forEach(function(x){ seg.appendChild(h('button', {class: AICFG.engine === x[0] ? 'on' : '', text: x[1], onclick: function(){ AICFG.engine = x[0]; aiSaveCfg(); if(x[0] === 'sub'){ AIENG.started = false; aiEngStart(); } draw(); aiEngPill(); }})); });
    body.appendChild(h('div', {class: 'aiExpH', text: 'AI 引擎'})); body.appendChild(seg);
    if(AICFG.engine === 'sub'){
      var l = aiEngLabel();
      body.appendChild(h('div', {class: 'card glass'},
        h('div', {class: 'sub', html: '用你的 <b>Claude 月訂閱額度</b>：App 在背景開著你在 claude.ai 的工作頁（AI 全能翻譯的網頁版），把分析交給它處理。第一次要在 App 裡登入 claude.ai，並在工作頁按一次「允許」。'}),
        h('div', {class: 'aiStat ' + l[1], text: '狀態：' + l[0]}),
        h('div', {class: 'btn-row'},
          h('button', {class: 'btn pri', text: '登入 Claude', onclick: function(){ NAT.call('openClaude', 'https://claude.ai/login'); }}),
          h('button', {class: 'btn', text: '開啟工作頁（按允許）', onclick: function(){ NAT.call('openClaude', aiUrl()); }}),
          h('button', {class: 'btn', text: '重新連線', onclick: function(){ NAT.call('cengStop'); AIENG.started = false; setTimeout(function(){ aiEngStart(); setTimeout(draw, 400); }, 200); }}))));
      var u = h('input', {type: 'url', value: AICFG.url || '', placeholder: AI_DEFAULT_URL, style: {width: '100%'}, onchange: function(){ AICFG.url = this.value.trim(); aiSaveCfg(); NAT.call('cengStop'); AIENG.started = false; aiEngStart(); }});
      body.appendChild(h('div', {class: 'aiExpH', text: '工作頁網址（claude.ai 上的 artifact，空白＝預設）'})); body.appendChild(u);
    } else {
      var k = h('input', {type: 'password', value: AICFG.key || '', placeholder: 'sk-ant-…', style: {width: '100%'}, onchange: function(){ AICFG.key = this.value.trim(); aiSaveCfg(); aiEngPill(); }});
      var md = h('input', {type: 'text', value: AICFG.model || '', placeholder: 'claude-sonnet-5-5', style: {width: '100%'}, onchange: function(){ AICFG.model = this.value.trim() || 'claude-sonnet-5-5'; aiSaveCfg(); }});
      body.appendChild(h('div', {class: 'aiExpH', text: 'Anthropic API 金鑰（費用另計，跟 Claude 訂閱無關）'})); body.appendChild(k);
      body.appendChild(h('div', {class: 'aiExpH', text: '模型'})); body.appendChild(md);
    }
    var lg = h('div', {class: 'seg'});
    [['zh', '繁體中文'], ['en', 'English'], ['same', '跟影片相同']].forEach(function(x){ lg.appendChild(h('button', {class: AICFG.lang === x[0] ? 'on' : '', text: x[1], onclick: function(){ AICFG.lang = x[0]; aiSaveCfg(); draw(); }})); });
    body.appendChild(h('div', {class: 'aiExpH', text: '摘要與回答的語言'})); body.appendChild(lg);
  }
  draw();
  var s = openSheet({title: 'AI 設定', icon: 'sparkle', body: body, tall: true});
  on('ceng', function(d){ if(d && d.state && !s.closed) draw(); });
}

