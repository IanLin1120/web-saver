/* ============================================================
   AI 摘要（像 iOS 的 InsightTube）：YouTube 影片 → 逐字稿 → AI 洞察（摘要、章節、對話）
   AI 引擎：
   · Claude 訂閱（預設）：App 在背景開著你在 claude.ai 上的工作頁（AI 全能翻譯的網頁版），
     請求交給它用 window.claude 的 sample 處理，消耗的是你的 Claude 月訂閱額度。
   · API 金鑰：直接呼叫 Anthropic API（自己付費）。
   ============================================================ */
var AI_DEFAULT_URL = 'https://claude.ai/artifact/P8NBBFX1guznTq38525KZW';     /* 網頁擷取 AI 工作頁（可選模型） */
var AI_OLD_URL = 'https://claude.ai/artifact/GrGKSNbfMi5K2saoWNStz9';        /* AI 全能翻譯的網頁版（舊，不能選模型） */
var AICFG = Object.assign({engine: 'sub', url: '', subModel: 'default', effort: '', key: '', model: 'claude-sonnet-5-5', gkey: '', gmodel: 'gemini-3.8-flash', gmode: 'video', gfast: true, gfallback: true, listen: true, auto: true, lang: 'zh'}, lsGet('ws.aiCfg', {}));
function aiSaveCfg(){ lsSet('ws.aiCfg', AICFG); }
function aiUrl(){ return /^https:\/\/claude\.ai\//.test(AICFG.url || '') ? AICFG.url : AI_DEFAULT_URL; }
function aiLangName(){ return AICFG.lang === 'en' ? 'English' : AICFG.lang === 'same' ? '影片本身的語言' : '繁體中文（台灣用語）'; }
var AI_SUBMODELS = [['default', '標準（自動）', ''], ['quick', '快速', ''], ['complex', '最強', ''], ['claude-opus-5-5', 'Opus 5.5', 'complex'], ['claude-sonnet-5-5', 'Sonnet 5.5', 'default'], ['claude-haiku-5-5', 'Haiku 5.5', 'quick']];
/* Gemini 模型（有金鑰時會再向 Google 讀取完整清單）；paid＝免費方案不能用 */
var AI_GMODELS = [
  ['gemini-3.8-flash', '最新 Flash，速度快、品質好（尖峰時段可能忙碌）'],
  ['gemini-3.6-flash', ''],
  ['gemini-3.5-flash', '穩定，忙碌時的備援'],
  ['gemini-3.5-flash-lite', '最快、最省額度'],
  ['gemini-3.1-flash-lite', '輕量'],
  ['gemini-3-flash-preview', '預覽版'],
  ['gemini-3.1-pro-preview', '最強 Pro', true],
  ['gemini-4-argon', '最新旗艦', true]
];
var AI_GFALLBACK = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
function aiGPaid(id){ var k = AI_GMODELS.filter(function(x){ return x[0] === id; })[0]; if(k) return !!k[2]; return /argon|gemini-3(\.\d)?-pro|image|computer-use|customtools|-tts/.test(id); }
function aiGModels(){
  var live = lsGet('ws.aiGList', null), out = AI_GMODELS.map(function(x){ return {id: x[0], note: x[1], paid: !!x[2]}; });
  if(live && live.list) live.list.forEach(function(m){ if(!out.some(function(x){ return x.id === m.id; })) out.push({id: m.id, note: m.name || '', paid: aiGPaid(m.id)}); });
  var dead = lsGet('ws.aiGDead', {}); out = out.filter(function(x){ return !dead[x.id] || x.id === AICFG.gmodel; });
  if(live && live.list && live.list.length) out = out.filter(function(x){ return live.list.some(function(m){ return m.id === x.id; }) || x.id === AICFG.gmodel; });
  return out;
}
/* 向 Google 讀取這把金鑰能用的模型 */
async function aiGFetchList(){
  if(!AICFG.gkey) return;
  try{
    var r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {headers: {'x-goog-api-key': AICFG.gkey}});
    var j = await r.json();
    var L = (j.models || []).filter(function(m){
      var id = String(m.name || '').replace(/^models\//, '');
      return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /^gemini-/.test(id) && !/embedding|image|tts|live|audio|robotics|computer-use|customtools|aqa|learnlm/.test(id);
    }).map(function(m){ return {id: String(m.name).replace(/^models\//, ''), name: m.displayName || ''}; });
    if(L.length) lsSet('ws.aiGList', {t: Date.now(), list: L});
  }catch(e){}
}
var AI_CMODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

var AI = {pmode: '', perr: 0, id: '', info: null, cues: [], track: null, tracks: [], ins: null, chat: [], tab: 'tr', loading: '', err: '', gen: false, asking: false, exp: false, follow: true, curT: 0};

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
  if(AICFG.engine === 'api') return AICFG.key ? ['Claude API・' + (AICFG.model || '').replace(/^claude-/, ''), 'ok'] : ['未設定 Claude API 金鑰', 'bad'];
  if(AICFG.engine === 'gemini') return AICFG.gkey ? ['Gemini・' + (AICFG.gmodel || '').replace(/^gemini-/, ''), 'ok'] : ['未設定 Gemini 金鑰', 'bad'];
  var s = aiEngState();
  var mn = (AI_SUBMODELS.filter(function(x){ return x[0] === AICFG.subModel; })[0] || AI_SUBMODELS[0])[1];
  return s === 'ready' ? ['Claude 訂閱・' + mn, 'ok'] : s === 'loading' ? ['Claude 訂閱・連線中', 'wait'] : s === 'login' ? ['Claude・需要登入', 'bad'] : s === 'noaccess' ? ['Claude・需要登入／授權', 'bad'] : ['Claude 訂閱・未連線', 'wait'];
}
function aiEngPill(){ var p = $('aiEng'); if(!p) return; var l = aiEngLabel(); p.className = 'aiEng ' + l[1]; p.querySelector('span').textContent = l[0]; }

function aiErr(code, msg){ var e = new Error(msg); e.code = code; return e; }
async function aiAsk(prompt, opt){
  opt = opt || {};
  if(AICFG.engine === 'api') return aiAskApi(prompt);
  if(AICFG.engine === 'gemini') return aiAskGemini(prompt, opt);
  if(!isApp || !NAT.has('cengReq')) throw aiErr('noapp', 'Claude 訂閱模式只能在 App 裡使用；網頁版請到 AI 設定改用 Gemini 或 Claude API 金鑰。');
  aiEngStart();
  var t0 = Date.now(), warned = false;
  while(true){
    var s = aiEngState();
    if(s === 'ready') break;
    if(s === 'login' || s === 'noaccess') throw aiErr('login', '還沒登入 claude.ai，或這個帳號還沒授權工作頁使用 Claude。');
    if(s === 'none' && Date.now() - t0 > 3000){ AIENG.started = false; aiEngStart(); }
    /* 沒登入時 claude.ai 不會跳到 /login 網址，工作頁也不會開始：連線中太久就當作要登入 */
    if(Date.now() - t0 > 20000) throw aiErr('login', '20 秒內連不上 Claude 工作頁，通常是還沒在這個 App 登入 claude.ai。');
    await sleep(500);
  }
  var id = 'ai' + uid(), sm = AI_SUBMODELS.filter(function(x){ return x[0] === AICFG.subModel; })[0] || AI_SUBMODELS[0];
  var req = {prompt: prompt};
  if(/^claude-/.test(sm[0])){ req.model = sm[0]; req.modelTier = sm[2] || 'default'; } else req.modelTier = sm[0];
  if(AICFG.effort) req.effort = AICFG.effort;
  if(opt.noCache) req.cache = false;
  var res = await new Promise(function(resolve, reject){
    AIENG.waits[id] = resolve;
    NAT.call('cengReq', id, JSON.stringify(req));
    setTimeout(function(){ if(AIENG.waits[id]){ delete AIENG.waits[id]; reject(aiErr('timeout', 'AI 回應逾時（6 分鐘），請再試一次，或換「快速」模型。')); } }, 360000);
  });
  if(!res.ok){
    var m = String(res.text || 'AI 發生錯誤'), code = (m.match(/^\[(\w+)\]/) || [])[1] || '';
    if(code === 'not_granted' || /尚未授權/.test(m)) throw aiErr('grant', m);
    if(code === 'rate_limited' || /用量|速率/.test(m)) throw aiErr('rate', '已達 Claude 訂閱的用量或速率限制，請稍後再試，或到 AI 設定改用 Gemini。');
    if(code === 'unavailable' || code === 'unsupported') throw aiErr('fail', 'Claude 工作頁目前無法使用：' + m);
    throw aiErr('fail', m.replace(/^\[\w+\]\s*/, ''));
  }
  try{ return JSON.parse(res.text); }catch(e){ return res.text; }
}
function aiJsonOf(t){
  t = String(t || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try{ return JSON.parse(t); }catch(e){ var m = t.match(/\{[\s\S]*\}/); if(m){ try{ return JSON.parse(m[0]); }catch(x){} } throw aiErr('fail', 'AI 回傳的格式無法解析，請再試一次'); }
}
/* ---------- 網路請求：App 裡走原生執行緒（關螢幕、切到別的 App 也會繼續，忙碌時自動重試） ---------- */
var AIHTTP = {};
on('aiHttp', function(d){ if(d && AIHTTP[d.id]){ var f = AIHTTP[d.id]; delete AIHTTP[d.id]; if(isApp) NAT.call('aiTake', d.id); f(d); } });
function aiPost(url, headers, body, retries, signal){
  if(isApp && NAT.has('aiPost')){
    return new Promise(function(resolve, reject){
      var id = 'h' + uid(), tm = null;
      function fin(d){ clearInterval(tm); resolve({status: d.status, body: d.body || ''}); }
      AIHTTP[id] = fin;
      NAT.call('aiPost', id, url, JSON.stringify(headers || {}), typeof body === 'string' ? body : JSON.stringify(body), retries || 0);
      /* 備援：事件漏掉時（例如網頁剛回到前景）自己去拿結果 */
      tm = setInterval(function(){ if(!AIHTTP[id]) return clearInterval(tm); var t = NAT.call('aiTake', id); if(t){ delete AIHTTP[id]; try{ fin(JSON.parse(t)); }catch(e){} } }, 3000);
      if(signal) signal.addEventListener('abort', function(){ NAT.call('aiCancel', id); delete AIHTTP[id]; clearInterval(tm); reject(aiErr('cancel', '已取消')); });
    });
  }
  return fetch(url, {method: 'POST', headers: headers, body: typeof body === 'string' ? body : JSON.stringify(body), signal: signal}).then(function(r){ return r.text().then(function(t){ return {status: r.status, body: t}; }); });
}
function aiBusyStatus(st){ return st === 429 || st === 500 || st === 502 || st === 503 || st === 504 || st === -1; }

/* Gemini：可以直接「看」YouTube 影片（公開影片），沒有字幕也能分析 */
async function aiAskGemini(prompt, opt){
  opt = opt || {};
  if(!AICFG.gkey) throw aiErr('nogkey', '還沒設定 Gemini API 金鑰。');
  /* 已停用（Google 回「no longer available」）的模型記下來，以後直接跳過 */
  var dead = lsGet('ws.aiGDead', {});
  var chain = [AICFG.gmodel || 'gemini-3.8-flash'];
  if(AICFG.gfallback !== false) AI_GFALLBACK.forEach(function(m){ if(chain.indexOf(m) < 0) chain.push(m); });
  chain = chain.filter(function(m, i){ return i === 0 || !dead[m]; });
  var lastMsg = '', lastSt = 0, errs = [];
  for(var k = 0; k < chain.length; k++){
    var model = chain[k];
    if(k > 0 && opt.step) opt.step(chain[k - 1] + ' 無法使用，改用 ' + model + '…');
    var parts = [];
    if(opt.video){
      var vm = {};
      if(opt.clip){ vm.start_offset = opt.clip[0] + 's'; vm.end_offset = opt.clip[1] + 's'; }
      if(opt.fps) vm.fps = opt.fps;
      var fd = {file_data: {file_uri: 'https://www.youtube.com/watch?v=' + opt.video}};
      if(Object.keys(vm).length) fd.video_metadata = vm;
      parts.push(fd);
    }
    parts.push({text: prompt});
    var gc = {responseMimeType: 'application/json', maxOutputTokens: 65536};
    if(opt.video) gc.mediaResolution = 'MEDIA_RESOLUTION_LOW';
    var think = AICFG.gfast !== false && /^gemini-([3-9]|\d\d)/.test(model);
    var stripped = false;
    for(var pass = 0; pass < 2; pass++){
      if(think) gc.thinkingConfig = {thinkingLevel: 'low'}; else delete gc.thinkingConfig;
      var r = await aiPost('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
        {'content-type': 'application/json', 'x-goog-api-key': AICFG.gkey}, {contents: [{role: 'user', parts: parts}], generationConfig: gc}, 3, opt.signal);
      var j = {}; try{ j = JSON.parse(r.body || '{}'); }catch(e){}
      lastSt = r.status;
      if(r.status >= 200 && r.status < 300){
        var c = (j.candidates || [])[0];
        var t = c && c.content && (c.content.parts || []).filter(function(x){ return !x.thought; }).map(function(x){ return x.text || ''; }).join('');
        if(!t) throw aiErr('fail', 'Gemini 沒有回傳內容' + (c && c.finishReason ? '（' + c.finishReason + '）' : (j.promptFeedback && j.promptFeedback.blockReason ? '（' + j.promptFeedback.blockReason + '）' : '')));
        var v = aiJsonOf(t); if(v && typeof v === 'object') try{ Object.defineProperty(v, '_model', {value: model}); }catch(e){}
        return v;
      }
      lastMsg = (j.error && j.error.message) || r.body || ('HTTP ' + r.status);
      /* 這個模型不支援「思考程度」或影片參數：拿掉再送一次 */
      if(r.status === 400 && think && /think/i.test(lastMsg)){ think = false; continue; }
      if(r.status === 400 && /media_?resolution|fps|video_?metadata/i.test(lastMsg) && !stripped && opt.video){ stripped = true; delete gc.mediaResolution; if(parts[0].file_data && parts[0].file_data.video_metadata) delete parts[0].file_data.video_metadata.fps; pass--; continue; }
      break;
    }
    errs.push(model + '：' + String(lastMsg).slice(0, 160));
    /* 模型已停用：記下來，並改用 Google 建議的新模型 */
    if(/no longer available|deprecated|has been (retired|shut ?down)|not found for API version/i.test(lastMsg)){
      dead[model] = Date.now(); lsSet('ws.aiGDead', dead);
      if(model === AICFG.gmodel){ var sug = (String(lastMsg).match(/models\/(gemini-[\w.-]+)/g) || []).map(function(x){ return x.replace('models/', ''); }).filter(function(x){ return x !== model; })[0]; if(sug){ AICFG.gmodel = sug; aiSaveCfg(); try{ aiEngPill(); }catch(e){} } }
      var sg = String(lastMsg).match(/use models\/(gemini-[\w.-]+)/); if(sg && chain.indexOf(sg[1]) < 0) chain.splice(k + 1, 0, sg[1]);
      continue;
    }
    if(lastSt === 400 && /API key/i.test(lastMsg)) throw aiErr('nogkey', 'Gemini API 金鑰不正確：' + lastMsg);
    if(lastSt === 403 || lastSt === 401) throw aiErr('nogkey', 'Gemini 金鑰沒有權限：' + lastMsg);
    /* 忙碌、額度用完、或這個模型不存在／要付費：換下一個模型 */
    if(aiBusyStatus(lastSt) || lastSt === 404 || (lastSt === 400 && /not found|not supported|paid|billing/i.test(lastMsg))) continue;
    break;
  }
  var detail = errs.length > 1 ? '\n' + errs.map(function(e){ return '・' + e; }).join('\n') : '';
  if(lastSt === 429 || errs.some(function(e){ return /quota|RESOURCE_EXHAUSTED|rate/i.test(e); })) throw aiErr('rate', 'Gemini 免費額度用完或太頻繁了，請稍後再試。' + (detail || '（' + lastMsg + '）'));
  /* 只顯示最有用的那個錯誤：優先你選的模型，不要讓備援模型的「已停用」蓋掉真正原因 */
  throw aiErr('fail', 'Gemini：' + (errs.length > 1 ? '所有模型都失敗了' + detail : lastMsg));
}
async function aiAskApi(prompt){
  if(!AICFG.key) throw aiErr('nokey', '還沒設定 Anthropic API 金鑰。');
  var r = await aiPost('https://api.anthropic.com/v1/messages', {'content-type': 'application/json', 'x-api-key': AICFG.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'},
    {model: AICFG.model || 'claude-sonnet-5-5', max_tokens: 16000, messages: [{role: 'user', content: prompt + '\n\n只輸出 JSON，不要加任何說明或 ``` 標記。'}]}, 3);
  var j = {}; try{ j = JSON.parse(r.body || '{}'); }catch(e){}
  if(r.status < 200 || r.status >= 300) throw aiErr(r.status === 429 ? 'rate' : 'fail', (j.error && j.error.message) || ('HTTP ' + r.status));
  return aiJsonOf((j.content || []).map(function(c){ return c.text || ''; }).join(''));
}
function aiErrDlg(e){
  var code = e && e.code;
  if(code === 'login' || code === 'grant'){
    dialog(code === 'grant' ? '需要授權一次' : '需要登入 Claude',
      (code === 'grant' ? '第一次使用時，claude.ai 需要你同意工作頁使用 Claude：按「開啟工作頁」，按「授權並測試」，跳出詢問時按「允許」，回來再按一次「探索洞察」。'
        : '用的是你的 Claude 月訂閱額度，所以要先在 App 裡登入 claude.ai（同一個帳號登入一次就好）。登入後回到這裡再按一次「探索洞察」。') +
      '<br><br><small>或到 AI 設定改用 API 金鑰。</small>',
      [[code === 'grant' ? '開啟工作頁' : '登入 Claude', function(){ NAT.call('openClaude', code === 'grant' ? aiUrl() : 'https://claude.ai/login'); }], ['AI 設定', function(){ setTimeout(aiSettings, 80); }, ''], ['取消', null, '']]);
    return;
  }
  if(code === 'nogkey'){ dialog('需要 Gemini API 金鑰', esc(e.message) + '<br><br>到 Google AI Studio 免費申請金鑰（用 Google 帳號登入即可），貼到 AI 設定。', [['取得金鑰', function(){ openExternal('https://aistudio.google.com/apikey'); }], ['AI 設定', function(){ setTimeout(aiSettings, 80); }, ''], ['取消', null, '']]); return; }
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
function aiTracksOf(j, ua){
  return (((j.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || []).map(function(t){
    var u = String(t.baseUrl || '');
    if(/^\/\//.test(u)) u = 'https:' + u; else if(/^\//.test(u)) u = 'https://www.youtube.com' + u;   /* VR 版給的是相對網址 */
    return {lang: t.languageCode, kind: t.kind || '', url: u, ua: ua || '', name: t.name && (t.name.simpleText || (t.name.runs || []).map(function(x){ return x.text; }).join(''))};
  });
}
async function aiLoadInfo(id, step){
  var info = {id: id, title: '', author: '', channelId: '', pub: '', len: 0, desc: '', sb: '', prog: ''}, tracks = [], seen = {};
  function take(d){ if(!d) return; info.title = info.title || d.title || ''; info.author = info.author || d.author || ''; info.channelId = info.channelId || d.channelId || ''; info.len = info.len || +(d.lengthSeconds || 0); info.desc = info.desc || d.shortDescription || ''; }
  /* 字幕來源全部收集起來（同一語言可能有好幾個網址），讀取失敗就換下一個 */
  function add(L){ (L || []).forEach(function(t){ if(t && t.url){ var k = t.lang + '|' + t.kind + '|' + t.url; if(!seen[k]){ seen[k] = 1; tracks.push(t); } } }); }
  /* 1. YouTube 分頁正好開著這部 */
  try{ var pd = isApp && NAT.json('ytSniff', id); if(pd && pd.info){ take(pd.info.details); add(pd.info.captions); } }catch(e){}
  /* 2. YouTube App（VR 版）身分：字幕網址可以直接讀，也有可直接播放的影片網址 */
  step('讀取影片資訊…');
  try{
    var j = await aiPlayerReq(id, 'vr'); take(j.videoDetails); add(aiTracksOf(j, YT_VR.ua));
    var prog = ((j.streamingData || {}).formats || []).filter(function(f){ return f.url && /^video\/mp4/.test(f.mimeType || ''); }).sort(function(a, b){ return (b.height || 0) - (a.height || 0); })[0];
    if(prog) info.prog = prog.url;
  }catch(e){}
  /* 3. 網頁版：章節縮圖用的預覽圖（storyboard），也收它的字幕 */
  try{
    var w = await aiPlayerReq(id, 'web'); take(w.videoDetails);
    info.sb = (((w.storyboards || {}).playerStoryboardSpecRenderer || {}).spec) || '';
    var mf = (w.microformat || {}).playerMicroformatRenderer || {};
    info.pub = mf.publishDate || mf.uploadDate || '';
    if(!info.channelId) info.channelId = mf.externalChannelId || '';
    add(aiTracksOf(w, YT_SAFARI_UA));
  }catch(e){}
  /* 4. 還是沒有：讓 YouTube 分頁打開影片後讀取 */
  if(!tracks.length && !info.title){
    var pd2 = await ytPageData(id, step).catch(function(){ return null; });
    if(pd2 && pd2.info){ take(pd2.info.details); add(pd2.info.captions); }
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
  var c = aiSrtCues(srt);
  if(!c.length) throw new Error('字幕是空的');
  return c;
}
/* 依序試同語言的其他來源 */
async function aiLoadBest(tracks, first, tr){
  var order = [first].concat(tracks.filter(function(t){ return t !== first && t.lang === first.lang && t.kind === first.kind; })), last = null;
  for(var i = 0; i < order.length; i++){
    try{ return {cues: await aiLoadCues(order[i], tr), track: order[i]}; }catch(e){ last = e; }
  }
  throw last || new Error('讀不到字幕');
}
/* AI 聽寫：沒有字幕時，讓 Gemini 直接看 YouTube 影片，把說的話完整寫成逐字稿（長片分段） */
async function aiListen(id, len, step){
  if(!AICFG.gkey) throw aiErr('nogkey', '沒有字幕的影片要用 Gemini「看」影片產生逐字稿，請先設定 Gemini API 金鑰（免費申請）。');
  var SEG = 600, segs = [];
  if(len > SEG * 1.3){ for(var a = 0; a < len; a += SEG) segs.push([a, Math.min(len, a + SEG)]); }
  else segs.push(null);
  var done = 0;
  step('AI 正在看影片並聽寫逐字稿' + (segs.length > 1 ? '（分 ' + segs.length + ' 段同時處理）' : '') + '…');
  /* 各段同時送出：總時間約等於最慢的那一段 */
  var res = await Promise.all(segs.map(async function(c){
    var prompt = '請完整聽寫這部影片' + (c ? '從 ' + aiTs(c[0]) + ' 到 ' + aiTs(c[1]) + ' 這一段' : '') + '的所有語音內容：用影片原本說的語言逐字寫出，不要摘要、不要翻譯、不要省略。' +
      '每一句話（或每 5~15 秒）一筆；t 是這句話在「整部影片」裡開始的時間，格式 m:ss 或 h:mm:ss。沒有人說話但畫面有重要內容時，用「［畫面：…］」簡短描述。' +
      '只回傳 JSON：{"cues":[{"t":"0:05","text":"…"}]}';
    var v = await aiAskGemini(prompt, {video: id, clip: c, fps: 0.25, step: step});
    var L = ((v && v.cues) || []).map(function(x){ return {s: aiParseTs(x.t || x.time || 0), t: String(x.text || '').trim()}; }).filter(function(x){ return x.t; });
    /* 有些模型給的是這一段的相對時間：加回段落起點 */
    if(c && c[0] > 0 && L.length && L[0].s < c[0] - 30) L.forEach(function(x){ x.s += c[0]; });
    done++; if(segs.length > 1) step('AI 聽寫中：已完成 ' + done + '／' + segs.length + ' 段…');
    return L;
  }));
  var all = [].concat.apply([], res);
  all.sort(function(a, b){ return a.s - b.s; });
  all.forEach(function(x, i){ x.e = all[i + 1] ? all[i + 1].s : x.s + 5; });
  if(!all.length) throw new Error('AI 沒有聽到任何語音內容');
  return all;
}

/* ---------- 快取與記錄 ---------- */
function aiHist(){ return lsGet('ws.aiHist', []); }
function aiSaveCache(){
  if(!AI.id || !AI.info) return;
  var info = Object.assign({}, AI.info); delete info.prog;
  var o = {info: info, ins: AI.ins, chat: AI.chat, track: AI.track, tr: AI.tr || '', t: Date.now()};
  var all = aiHist(), old = all.filter(function(x){ return x.id === AI.id; })[0] || {};
  var hist = all.filter(function(x){ return x.id !== AI.id; });
  hist.unshift(Object.assign({}, old, {id: AI.id, title: AI.info.title, author: AI.info.author, channelId: AI.info.channelId || old.channelId || '', pub: AI.info.pub || old.pub || '', len: AI.info.len, ins: !!AI.ins, t: old.t0 ? Date.now() : Date.now(), t0: old.t0 || Date.now()}));
  /* 逐字稿只留最近 15 部（其他要用時重新抓） */
  hist.forEach(function(x, i){ if(i >= 15){ var c = lsGet('ws.ai.' + x.id, null); if(c && c.cues){ delete c.cues; lsSet('ws.ai.' + x.id, c); } } });
  o.cues = AI.cues;
  lsSet('ws.ai.' + AI.id, o);
  lsSet('ws.aiHist', hist.slice(0, 300));
}
function aiForget(id){ try{ localStorage.removeItem('ws.ai.' + id); }catch(e){} lsSet('ws.aiHist', aiHist().filter(function(x){ return x.id !== id; })); }

/* ---------- 開啟影片 ---------- */
var AI_LISTEN_TRACK = {lang: 'ai', kind: 'ai', name: 'AI 聽寫（Gemini）', url: ''};
/* 每部影片的背景工作（換到別部影片、切到別的 App 都會繼續，完成後寫進那部影片的記錄） */
var AIJOB = {};
Object.defineProperty(AI, 'gen', {get: function(){ return !!(AIJOB[AI.id] && AIJOB[AI.id].gen); }, set: function(){}});
function aiJob(id){ return AIJOB[id] || (AIJOB[id] = {}); }
function aiBusyAny(){ return Object.keys(AIJOB).some(function(k){ return AIJOB[k].gen || AIJOB[k].listen; }); }
function aiCacheMerge(id, patch){
  var c = lsGet('ws.ai.' + id, null) || {};
  Object.assign(c, patch, {t: Date.now()});
  lsSet('ws.ai.' + id, c);
  var hist = aiHist(), i = hist.findIndex(function(x){ return x.id === id; });
  if(i >= 0){ if(patch.ins) hist[i].ins = true; lsSet('ws.aiHist', hist); }
}
function aiNotifyDone(id, what){
  if(!isApp || !NAT.has('aiNotice')) return;
  if(NAT.call('appVisible') && curView === 'ai' && AI.id === id) return;
  var c = lsGet('ws.ai.' + id, null), t = (c && c.info && c.info.title) || id;
  NAT.call('aiNotice', what, t);
}
function aiUseVideo(){ return AICFG.engine === 'gemini' && AICFG.gmode === 'video'; }

async function aiOpenVideo(id, opts){
  opts = opts || {};
  if(!id) return;
  if(curView !== 'ai') showView('ai');
  aiEngStart();
  var c = lsGet('ws.ai.' + id, null);
  var vNow = $('aiVid'); if(vNow) vNow.pause();
  AI.id = id; AI.info = c && c.info || {id: id, title: '', author: ''}; AI.ins = c && c.ins || null; AI.chat = c && c.chat || [];
  AI.cues = c && c.cues || []; AI.track = c && c.track || null; AI.tr = c && c.tr || ''; AI.tracks = []; AI.err = ''; AI.exp = false;
  AI.pmode = ''; AI.perr = 0; AI.curT = opts.t || 0;
  var J = aiJob(id);
  AI.tab = AI.ins || J.gen ? (opts.tab || 'sum') : 'tr';
  AI.loading = AI.cues.length ? '' : (J.listen ? J.msg || 'AI 聽寫中…' : '讀取逐字稿…');
  aiRender();
  var step = function(s){ if(AI.id === id && AI.loading){ AI.loading = s; aiRenderPane(); } };
  var autoGo = function(){ if(opts.auto && AICFG.auto !== false && !AI.ins && !aiJob(id).gen && AI.id === id) aiGenerate(); };
  try{
    var r = await aiLoadInfo(id, step);
    if(AI.id !== id) return;
    var keepTitle = AI.info.title;
    AI.info = Object.assign({}, AI.info, r.info, {title: r.info.title || keepTitle});
    AI.tracks = r.tracks;
    aiSaveCache();
    aiRenderMeta(); aiSetupPlayer(false);
    /* Gemini「直接看影片」：分析不用等逐字稿，兩邊同時跑 */
    if(aiUseVideo()) autoGo();
    if(!AI.cues.length && !J.listen){
      var t = aiPickTrack(r.tracks), got = null, why = '';
      if(t){
        AI.loading = '讀取逐字稿…'; aiRenderPane();
        try{ got = await aiLoadBest(r.tracks, t, ''); }catch(e){ why = e.message || String(e); }
      }
      if(got){ if(AI.id === id){ AI.cues = got.cues; AI.track = got.track; AI.tr = ''; } aiCacheMerge(id, {cues: got.cues, track: got.track, tr: ''}); }
      else if(AICFG.gkey && AICFG.listen !== false){
        if(AI.id === id){ AI.loading = '這部影片' + (t ? '的字幕讀不到' : '沒有字幕') + '，改用 AI 看影片聽寫…'; aiRenderPane(); }
        if(!aiUseVideo()) { await aiListenJob(id, AI.info.len || 0); }
        else aiListenJob(id, AI.info.len || 0);
      } else if(AI.id === id){ AI.err = t ? 'fail:' + why : 'notrack'; AI.loading = ''; aiRender(); return; }
    }
    if(AI.id === id && AI.cues.length) AI.loading = '';
  }catch(e){
    if(AI.id !== id) return;
    AI.loading = ''; if(!AI.cues.length) AI.err = 'fail:' + (e.message || String(e));
    if(e && e.code) aiErrDlg(e);
  }
  if(AI.id === id){ aiRender(); aiSetupPlayer(false); if(!aiUseVideo() && AI.cues.length) autoGo(); }
}
/* AI 聽寫逐字稿（背景工作） */
async function aiListenJob(id, len){
  var J = aiJob(id); if(J.listen) return;
  J.listen = true; J.msg = 'AI 正在看影片並聽寫逐字稿…';
  if(isApp) NAT.call('aiLabel', 'AI 聽寫逐字稿');
  var step = function(s){ J.msg = s; if(AI.id === id && AI.loading){ AI.loading = s; aiRenderPane(); } };
  try{
    var c = await aiListen(id, len, step);
    aiCacheMerge(id, {cues: c, track: AI_LISTEN_TRACK, tr: ''});
    if(AI.id === id){ AI.cues = c; AI.track = AI_LISTEN_TRACK; AI.tr = ''; AI.err = ''; }
    aiNotifyDone(id, 'AI 逐字稿完成');
  }catch(e){
    if(AI.id === id && !AI.cues.length) AI.err = 'fail:' + (e.message || String(e));
    if(AI.id === id) aiErrDlg(e);
  }
  J.listen = false;
  if(AI.id === id){ AI.loading = ''; aiRender(); aiSetupPlayer(false); }
}
async function aiListenNow(){
  if(!AICFG.gkey){ aiErrDlg(aiErr('nogkey', '用 AI 看影片聽寫逐字稿需要 Gemini API 金鑰（免費申請）。')); return; }
  AI.loading = 'AI 正在看影片並聽寫逐字稿…'; AI.err = ''; AI.tab = 'tr'; aiRender();
  await aiListenJob(AI.id, AI.info.len || 0);
}
async function aiSwitchTrack(t, tr){
  AI.loading = '讀取逐字稿…'; AI.err = ''; aiRenderPane();
  try{ var g = await aiLoadBest(AI.tracks, t, tr || ''); AI.cues = g.cues; AI.track = g.track; AI.tr = tr || ''; aiSaveCache(); }catch(e){ toast('字幕讀取失敗：' + e.message, true); }
  AI.loading = ''; aiRenderPane();
}

/* ---------- 產生洞察／對話 ---------- */
function aiVideoBlock(maxChars, video){
  var I = AI.info || {};
  return '影片標題：' + (I.title || '') + '\n頻道：' + (I.author || '') + '\n長度：' + aiTs(I.len || 0) +
    (I.desc ? '\n說明欄：\n' + String(I.desc).slice(0, 1500) : '') +
    (video ? '\n\n（請直接觀看附上的影片：畫面與聲音都要看，時間碼以影片為準）' :
    '\n\n逐字稿（每行開頭是時間碼）：\n' + (AI.cues.length ? aiTranscriptText(AI.cues, maxChars) : '（這部影片沒有字幕，只有標題與說明欄可參考）'));
}
async function aiGenerate(){
  var id = AI.id, J = aiJob(id);
  if(J.gen || !id) return;
  var video = AICFG.engine === 'gemini' && (AICFG.gmode === 'video' || !AI.cues.length);
  J.gen = true; J.msg = video ? 'Gemini 正在看整部影片分析（不用播放，可以關螢幕或切到別的 App）…' : 'AI 正在讀完整份逐字稿，通常要 20～90 秒…';
  AI.tab = 'sum'; aiRender();
  if(isApp) NAT.call('aiLabel', 'AI 摘要分析中');
  var prompt = '你是 YouTube 影片內容分析助理。請只根據' + (video ? '影片本身' : '下面提供的影片資訊與逐字稿') + '分析，不要編造影片沒有的內容。所有文字用' + aiLangName() + '撰寫。\n' +
    (AI.cues.length || video ? '' : '注意：這部影片沒有逐字稿，只能根據標題與說明欄推測，請在 overview 第一句註明「此影片無字幕，以下根據標題與說明推測」。\n') +
    '只回傳 JSON，格式：\n{"overview":"總覽，2~4 段，段落之間用 \\n\\n 分隔","keyPoints":["重點，5~8 條，每條一句"],"details":["詳細說明，4~10 條，要具體（數字、人名、地名、例子）"],' +
    '"chapters":[{"start":開始秒數(整數),"end":結束秒數(整數),"title":"章節標題（20 字內）","summary":"2~3 句摘要","points":["這段的要點 2~4 條"]}],"tags":["3~6 個關鍵詞"],"questions":["3 個看完後值得追問的問題"]}\n' +
    '章節依時間順序涵蓋整部影片（通常 4~12 個），start 必須對應' + (video ? '影片裡的實際時間' : '逐字稿裡的時間碼') + '。\n\n' + aiVideoBlock(null, video);
  var step = function(m){ J.msg = m; if(AI.id === id) aiRenderPane(); };
  try{
    var v = await aiAsk(prompt, video ? {video: id, fps: (AI.info.len || 0) > 2400 ? 0.2 : 0.5, step: step} : {step: step});
    if(!v || typeof v !== 'object' || !v.overview) throw aiErr('fail', 'AI 回傳的內容不完整，請再試一次');
    var model = v._model;
    v.chapters = (v.chapters || []).map(function(c){ return {start: Math.max(0, Math.round(+c.start || 0)), end: Math.round(+c.end || 0), title: String(c.title || ''), summary: String(c.summary || ''), points: (c.points || []).map(String)}; }).sort(function(a, b){ return a.start - b.start; });
    v.t = Date.now(); v.engine = AICFG.engine; v.model = model || (AICFG.engine === 'api' ? AICFG.model : AICFG.engine === 'sub' ? AICFG.subModel : AICFG.gmodel); v.video = video;
    aiCacheMerge(id, {ins: v});
    if(AI.id === id){ AI.ins = v; }
    if(typeof buzz === 'function') buzz(30);
    aiNotifyDone(id, 'AI 摘要完成');
  }catch(e){ if(AI.id === id) aiErrDlg(e); else toast('AI 分析失敗：' + (e.message || e), true); }
  J.gen = false;
  if(AI.id === id) aiRender();
}
async function aiSend(q){
  q = String(q || '').trim();
  if(!q || AI.asking || !AI.id) return;
  AI.chat.push({role: 'user', text: q, t: Date.now()}); AI.asking = true; aiRenderPane();
  var hist = AI.chat.slice(-11, -1).map(function(m){ return (m.role === 'user' ? '使用者：' : '助理：') + m.text; }).join('\n');
  var prompt = '你是這部 YouTube 影片的問答助理。根據逐字稿回答問題，用' + aiLangName() + '，簡潔具體。提到影片內容時在句中標註時間碼，格式為 [mm:ss] 或 [h:mm:ss]。' +
    '影片沒提到的要直說「影片沒有提到」，可以再補充一般知識，但要標明是補充。\n只回傳 JSON：{"answer":"回答（可分段，用 \\n 換行；可用 **粗體** 與 - 條列）","suggest":["2~3 個可以接著問的問題"]}\n\n' +
    aiVideoBlock(50000) + (hist ? '\n\n先前的對話：\n' + hist : '') + '\n\n現在的問題：' + q;
  try{
    var v = await aiAsk(prompt, Object.assign({noCache: true}, AI.cues.length ? {} : {video: AI.id}));
    var ans = typeof v === 'string' ? v : (v && (v.answer || v.text)) || '';
    AI.chat.push({role: 'ai', text: String(ans || '（沒有回答）'), suggest: (v && v.suggest) || [], t: Date.now()});
  }catch(e){ AI.chat.pop(); aiErrDlg(e); var inp = $('aiQ'); if(inp && !inp.value) inp.value = q; }
  AI.asking = false; aiSaveCache(); aiRenderPane();
}

/* ---------- 文字格式（時間碼可點） ---------- */
/* 數學公式：AI 常用 LaTeX（$…$、$$…$$、\(…\)、\[…\]），用 KaTeX 排成真正的公式 */
function aiTex(tex, disp){
  if(!window.katex) return esc(tex);
  try{ return katex.renderToString(tex.trim(), {displayMode: !!disp, throwOnError: false, strict: 'ignore', output: 'html'}); }catch(e){ return esc(tex); }
}
function aiMathHtml(t){
  /* 先把公式挖出來換成記號，其他文字照常跳脫，最後再放回排好的公式 */
  var M = [], s = String(t == null ? '' : t);
  function keep(html, disp){ M.push(disp ? '<div class="aiMath">' + html + '</div>' : html); return '\u0000' + (M.length - 1) + '\u0000'; }
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, function(m, a){ return keep(aiTex(a, true), true); })
       .replace(/\\\[([\s\S]+?)\\\]/g, function(m, a){ return keep(aiTex(a, true), true); })
       .replace(/\\\(([\s\S]+?)\\\)/g, function(m, a){ return keep(aiTex(a, false)); })
       .replace(/\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g, function(m, a){
         /* 避免把金額（$5 到 $10）當公式：要有 LaTeX 的樣子 */
         if(!/[\\^_{}=+\-*\/<>|]|^[A-Za-z]$|^[A-Za-z]\w?$/.test(a) || /^\d+([.,]\d+)?$/.test(a)) return m;
         return keep(aiTex(a, false));
       });
  s = esc(s);
  return s.replace(/\u0000(\d+)\u0000/g, function(m, i){ return M[+i]; });
}
function aiFmt(t){
  var s = aiMathHtml(t);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/\[((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s*[-–~]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?\]/g, function(m, a){ return '<a class="aiTs" data-t="' + aiParseTs(a) + '">' + m.slice(1, -1) + '</a>'; });
  return s.split(/\n/).map(function(l){ return /^\s*[-•・]\s+/.test(l) ? '<div class="aiLi">' + l.replace(/^\s*[-•・]\s+/, '') + '</div>' : (l.trim() ? '<p>' + l + '</p>' : ''); }).join('');
}
/* ---------- 小播放器：優先用可直接播放的影片網址（App 內 <video>），不行再用 YouTube 嵌入播放器 ---------- */
function aiSetupPlayer(autoplay){
  if(!AI.id) return;
  if(!AI.pmode){
    if(AI.info && AI.info.prog) AI.pmode = 'html';
    else if(isApp && NAT.has('aipLoad')){ AI.pmode = 'native'; NAT.call('aipLoad', AI.id, Math.floor(AI.curT || 0), !!autoplay); }
    else AI.pmode = 'none';
  }
  aiPlayerBox(autoplay);
  aiSyncPlayer();
}
function aiPlayerBox(autoplay){
  var el = $('aiPlayer'); if(!el) return;
  var thumb = 'https://i.ytimg.com/vi/' + AI.id + '/hqdefault.jpg';
  el.innerHTML = ''; el.className = 'aiPlayer m-' + (AI.pmode || 'wait');
  el.style.backgroundImage = 'url("' + thumb + '")';
  if(AI.pmode === 'html'){
    var v = h('video', {id: 'aiVid', src: AI.info.prog, poster: thumb, playsinline: true, controls: true, preload: 'metadata'});
    v.addEventListener('loadedmetadata', function(){ if(AI.curT > 1 && v.currentTime < 1) v.currentTime = AI.curT; });
    v.addEventListener('timeupdate', function(){ AI.curT = v.currentTime; aiHighlight(); });
    v.addEventListener('play', function(){ if(isApp) NAT.call('ytNav', 'pause'); });
    v.addEventListener('error', function(){
      /* 直接網址播不了（過期或被拒）：改用 YouTube 嵌入播放器 */
      if(AI.pmode !== 'html') return;
      AI.info.prog = ''; AI.pmode = isApp && NAT.has('aipLoad') ? 'native' : 'none';
      if(AI.pmode === 'native') NAT.call('aipLoad', AI.id, Math.floor(AI.curT || 0), true);
      aiPlayerBox(); aiSyncPlayer();
    });
    el.appendChild(v);
    if(autoplay) v.play().catch(function(){});
    return;
  }
  if(AI.pmode === 'none'){
    el.appendChild(h('div', {class: 'aiPErr'}, h('b', {text: AI.perr ? '這部影片不允許在其他 App 裡播放（錯誤 ' + AI.perr + '）' : '這裡無法播放這部影片'}),
      h('button', {class: 'btn sm', html: icon('ytplay', 'sm') + '到 YouTube 分頁播放', onclick: function(e){ e.stopPropagation(); aiToYt(); }})));
    el.onclick = null; return;
  }
  el.appendChild(h('span', {class: 'aiPlay', html: AI.pmode ? icon('play') : '<span class="spin"></span>'}));
  el.onclick = function(){ aiSeek(AI.curT || 0); };
}
function aiCurTime(){
  if(AI.pmode === 'html'){ var v = $('aiVid'); return v ? v.currentTime : AI.curT; }
  if(AI.pmode === 'native' && isApp){ var st = NAT.json('aipState') || {}; if(st.id === AI.id) return st.t || 0; }
  return AI.curT || 0;
}
function aiToYt(){
  var t = aiCurTime();
  var v = $('aiVid'); if(v) v.pause();
  if(isApp) NAT.call('aipShow', false);
  ytOpen('https://m.youtube.com/watch?v=' + AI.id + (t > 3 ? '&t=' + Math.floor(t) + 's' : ''));
}
function aiSeek(t){
  t = Math.max(0, +t || 0);
  if(AI.exp){ AI.exp = false; aiRender(); }
  AI.curT = t; aiHighlight();
  if(AI.pmode === 'html'){ var v = $('aiVid'); if(v){ try{ v.currentTime = t; }catch(e){} v.play().catch(function(){}); } return; }
  if(AI.pmode === 'none'){ aiToYt(); return; }
  if(AI.pmode === 'native'){
    var st = NAT.json('aipState') || {};
    if(st.id !== AI.id || !(st.dur > 0)) NAT.call('aipLoad', AI.id, Math.floor(t), true);
    else NAT.call('aipSeek', t, true);
    NAT.call('ytNav', 'pause');
    return;
  }
  if(!isApp) openExternal('https://www.youtube.com/watch?v=' + AI.id + '&t=' + Math.floor(t) + 's');
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
  body.appendChild(h('div', {class: 'aiPlayer', id: 'aiPlayer'}));
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
  aiRenderMeta(); aiRenderPane(); aiEngPill(); aiPlayerBox();
  requestAnimationFrame(aiSyncPlayer);
}
function aiRenderMeta(){
  var m = $('aiMeta'); if(!m) return;
  var I = AI.info || {};
  m.innerHTML = '';
  m.appendChild(h('div', {class: 'aiVt', text: I.title || '讀取中…', onclick: function(){ this.classList.toggle('open'); }}));
  m.appendChild(h('div', {class: 'aiVs'},
    h('span', {class: 'ell', text: [I.author, I.len ? aiTs(I.len) : ''].filter(Boolean).join('・')}),
    h('button', {class: 'chip', html: icon('ytplay', 'sm') + 'YouTube', onclick: aiToYt}),
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
  f.appendChild(h('button', {class: 'aiGo' + (AI.gen ? ' busy' : ''), disabled: AI.gen || (!!AI.loading && !aiUseVideo()), onclick: aiGenerate},
    AI.gen ? h('span', {class: 'spin sm'}) : null, h('span', {text: AI.gen ? 'AI 分析中…' : '探索洞察'}), AI.gen ? null : h('span', {html: icon('sparkle', 'sm')})));
}
function aiPaneTr(p, f){
  if(AI.loading || (!AI.cues.length && AIJOB[AI.id] && AIJOB[AI.id].listen)){ p.appendChild(h('div', {class: 'aiNote', text: AI.loading || AIJOB[AI.id].msg})); p.appendChild(aiSkel(8)); aiCta(f); return; }
  if(AI.err && !AI.cues.length){
    var nt = AI.err === 'notrack';
    p.appendChild(h('div', {class: 'empty'}, h('div', {class: 'big', html: icon('sub', 'lg')}),
      h('div', {text: nt ? '這部影片沒有字幕。' : '讀取逐字稿失敗：' + AI.err.replace(/^fail:/, '')}),
      h('div', {class: 'sub', style: {marginTop: '6px'}, text: '可以讓 AI（Gemini）直接看影片，把說的話完整聽寫成逐字稿，再做摘要與章節；不用播放影片，在背景完成。'}),
      h('div', {class: 'btn-row', style: {justifyContent: 'center'}},
        h('button', {class: 'btn pri', html: icon('sparkle', 'sm') + 'AI 看影片聽寫', onclick: aiListenNow}),
        nt ? null : h('button', {class: 'btn', html: icon('reload', 'sm') + '再試一次', onclick: function(){ var c = lsGet('ws.ai.' + AI.id, null); if(c){ delete c.cues; lsSet('ws.ai.' + AI.id, c); } aiOpenVideo(AI.id); }}))));
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
    list.appendChild(h('div', {class: 'aiLine', 'data-i': i, onclick: function(){ aiSeek(c.s); }}, h('span', {class: 'aiLt', text: aiTs(c.s)}), h('span', {html: aiMathHtml(c.t)})));
  });
  p.appendChild(list);
  aiCta(f);
  aiHighlight();
}
function aiTrackMenu(){
  var items = AI.tracks.filter(function(t, i, L){ return L.findIndex(function(x){ return x.lang === t.lang && x.kind === t.kind; }) === i; })
    .map(function(t){ return ['sub', (t.name || t.lang) + (t.kind === 'asr' ? '（自動產生）' : ''), function(){ aiSwitchTrack(t, ''); }, false, t.lang]; });
  var base = aiPickTrack(AI.tracks);
  if(base && !/^zh/.test(base.lang)) items.push(['sparkle', '自動翻譯成中文（繁體）', function(){ aiSwitchTrack(base, 'zh-Hant'); }, false, '由 ' + (base.name || base.lang) + ' 翻譯']);
  items.push(['sparkle', 'AI 看影片重新聽寫（Gemini）', aiListenNow, false, '字幕不準或沒有字幕時用；需要 Gemini 金鑰']);
  menu('選擇逐字稿來源', items);
}
function aiPaneSum(p, f){
  var S = AI.ins;
  if(!S){
    if(AI.gen){ p.appendChild(h('div', {class: 'aiNote', text: (AIJOB[AI.id] && AIJOB[AI.id].msg) || 'AI 分析中…'})); p.appendChild(aiSkel(10)); }
    else p.appendChild(h('div', {class: 'empty'}, h('div', {class: 'big', html: icon('sparkle', 'lg')}), h('div', {text: '按下方「探索洞察」，AI 會整理這部影片的總覽、重點與詳細說明。'})));
    aiCta(f); return;
  }
  var box = h('div', {class: 'aiDoc'});
  box.appendChild(h('h4', {text: '總覽'}));
  box.appendChild(h('div', {html: aiFmt(S.overview || '')}));
  if(S.keyPoints && S.keyPoints.length){ box.appendChild(h('h4', {text: '重點'})); S.keyPoints.forEach(function(x){ box.appendChild(h('div', {class: 'aiLi', html: aiFmt(x).replace(/^<p>|<\/p>$/g, '')})); }); }
  if(S.details && S.details.length){ box.appendChild(h('h4', {text: '詳細說明'})); S.details.forEach(function(x){ box.appendChild(h('div', {class: 'aiLi', html: aiFmt(typeof x === 'string' ? x : (x.title ? x.title + '：' : '') + (x.body || '')).replace(/^<p>|<\/p>$/g, '')})); }); }
  if(S.tags && S.tags.length){ var tg = h('div', {class: 'aiTags'}); S.tags.forEach(function(t){ tg.appendChild(h('span', {text: '#' + t})); }); box.appendChild(tg); }
  box.appendChild(h('div', {class: 'aiMetaLine'}, h('span', {text: '由 ' + (S.engine === 'api' ? 'Claude API' : S.engine === 'gemini' ? 'Gemini' : 'Claude 訂閱') + (S.model ? '（' + S.model + '）' : '') + (S.video ? '看影片' : '') + ' 產生・' + fmtDate(S.t || Date.now())}),
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
        h('div', {class: 'grow'}, h('b', {html: aiMathHtml(c.title)}), h('div', {class: 'aiChT', text: aiTs(c.start) + ' - ' + aiTs(end)}))),
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
  if(AI.pmode !== 'native') return;
  var st = NAT.json('aipState'); if(!st || st.id !== AI.id) return;
  if(st.err){ AI.perr = st.err; AI.pmode = 'none'; NAT.call('aipShow', false); aiPlayerBox(); return; }
  if(Math.abs(st.t - AI.curT) > 0.3){ AI.curT = st.t; aiHighlight(); }
}, 700);

/* 原生小播放器放在 #aiPlayer 的位置上 */
function aiSyncPlayer(){
  if(!isApp || !NAT.has('aipRect')) return;
  var on = curView === 'ai' && !!AI.id && !AI.exp && !Viewer.isOpen() && AI.pmode === 'native';
  var el = $('aiPlayer');
  if(on && el){
    var off = $('v-ai').getBoundingClientRect().top, r = el.getBoundingClientRect();
    NAT.call('aipRect', r.top - off, r.left, r.width, r.height);
  }
  NAT.call('aipShow', on && !!el);
}
on('view', function(d){
  if(d.v === 'ai'){ if(!$('v-ai').firstChild) aiRender(); aiEngStart(); setTimeout(aiSyncPlayer, 60); setTimeout(aiSyncPlayer, 300); }
  else if(d.prev === 'ai'){ if(isApp) NAT.call('aipShow', false); var v = $('aiVid'); if(v) v.pause(); }
});
on('layout', function(){ if(curView === 'ai') aiSyncPlayer(); });
window.addEventListener('resize', function(){ if(curView === 'ai') setTimeout(aiSyncPlayer, 80); });
on('aipLink', function(d){ var id = d && YT.idOf(d.url); NAT.call('aipShow', false); if(id) ytOpen('https://m.youtube.com/watch?v=' + id); else if(d && d.url) openExternal(d.url); });

function aiClose(){ var v = $('aiVid'); if(v) v.pause(); AI.id = ''; AI.pmode = ''; if(isApp){ NAT.call('aipShow', false); } aiRender(); }

/* ---------- 起始頁：分析過的影片（依頻道分資料夾，頻道裡可再自訂資料夾） ---------- */
var AIV = {ch: '', sub: ''};
function aiChKey(x){ return String(x.author || '未知頻道'); }
function aiFolders(){ return lsGet('ws.aiFolders', {}); }
function aiSortOf(k){ return (lsGet('ws.aiSort', {})[k]) || 'added'; }
function aiSetSort(k, v){ var o = lsGet('ws.aiSort', {}); o[k] = v; lsSet('ws.aiSort', o); }
var AI_SORTS = [['added', '最新分析'], ['pubNew', '上傳時間（新→舊）'], ['pubOld', '上傳時間（舊→新）']];
function aiSorted(L, k){
  var m = aiSortOf(k), pub = function(x){ return x.pub ? Date.parse(x.pub) || 0 : 0; };
  return L.slice().sort(function(a, b){
    if(m === 'pubNew') return (pub(b) - pub(a)) || ((b.t0 || b.t) - (a.t0 || a.t));
    if(m === 'pubOld') return (pub(a) || 9e15) - (pub(b) || 9e15);
    return (b.t0 || b.t) - (a.t0 || a.t);
  });
}
function aiPubTxt(x){ if(!x.pub) return ''; var d = new Date(x.pub); return isNaN(d) ? '' : '上傳 ' + d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
function aiStartPage(){
  var sc = h('div', {class: 'scroll aiStart'}), pg = h('div', {class: 'page'});
  sc.appendChild(pg);
  var hist = aiHist();
  if(!AIV.ch){
    var inp = h('input', {type: 'url', placeholder: '貼上 YouTube 影片網址…', onkeydown: function(e){ if(e.key === 'Enter') go(); }});
    var go = function(){ var v = inp.value.trim(), id = YT.idOf(v) || (/^[\w-]{11}$/.test(v) ? v : ''); if(id) aiOpenVideo(id, {auto: true}); else toast('這不是 YouTube 影片網址', true); };
    pg.appendChild(h('div', {class: 'card glass aiHero'},
      h('div', {class: 'aiHeroT', html: icon('sparkle') + '<b>YouTube 影片 AI 洞察</b>'}),
      h('div', {class: 'sub', text: '在 YouTube App 按「分享」→「AI 摘要（網頁擷取）」就會自動分析；也可以在這裡貼上網址。'}),
      h('div', {class: 'aiIn'}, inp,
        h('button', {class: 'ib', html: icon('copy'), title: '貼上', onclick: async function(){ try{ var t = await navigator.clipboard.readText(); if(t){ inp.value = t.trim(); go(); } }catch(e){ inp.focus(); } }}),
        h('button', {class: 'btn pri', html: icon('sparkle', 'sm') + '開始', onclick: go}))));
    var running = Object.keys(AIJOB).filter(function(k){ return AIJOB[k].gen || AIJOB[k].listen; });
    if(running.length){
      pg.appendChild(h('h3', {class: 'aiH3', text: '分析中'}));
      running.forEach(function(k){ var c = lsGet('ws.ai.' + k, null); pg.appendChild(aiVidRow({id: k, title: (c && c.info && c.info.title) || k, author: c && c.info && c.info.author, len: c && c.info && c.info.len}, AIJOB[k].msg || '分析中…')); });
    }
    if(!hist.length){ pg.appendChild(h('div', {class: 'empty'}, h('div', {text: '還沒有分析過的影片。'}))); paintIcons(sc); return sc; }
    var groups = {};
    hist.forEach(function(x){ var k = aiChKey(x); (groups[k] = groups[k] || []).push(x); });
    var keys = Object.keys(groups).sort(function(a, b){
      var la = Math.max.apply(null, groups[a].map(function(x){ return x.t0 || x.t; })), lb = Math.max.apply(null, groups[b].map(function(x){ return x.t0 || x.t; }));
      return lb - la;
    });
    pg.appendChild(h('h3', {class: 'aiH3', text: '分析過的影片・依頻道'}));
    keys.forEach(function(k){
      var L = groups[k], last = Math.max.apply(null, L.map(function(x){ return x.t0 || x.t; })), nf = (aiFolders()[k] || []).length;
      pg.appendChild(h('div', {class: 'aiFRow', onclick: function(){ AIV.ch = k; AIV.sub = ''; aiRender(); }},
        h('div', {class: 'aiFIc'}, h('div', {class: 'aiHTh', style: {backgroundImage: 'url("https://i.ytimg.com/vi/' + aiSorted(L, k)[0].id + '/mqdefault.jpg")'}}), h('span', {html: icon('folder', 'sm')})),
        h('div', {class: 'grow'}, h('b', {class: 'ell2', text: k}), h('small', {text: L.length + ' 部影片' + (nf ? '・' + nf + ' 個資料夾' : '') + '・' + fmtDate(last)})),
        h('span', {class: 'aiChev', html: icon('chevR')})));
    });
    paintIcons(sc); return sc;
  }
  /* 頻道（或頻道裡的資料夾） */
  var ch = AIV.ch, F = aiFolders(), mine = F[ch] || [], sub = AIV.sub && mine.filter(function(f){ return f.id === AIV.sub; })[0];
  if(AIV.sub && !sub) AIV.sub = '';
  var key = ch + (AIV.sub ? '/' + AIV.sub : '');
  var vids = hist.filter(function(x){ return aiChKey(x) === ch && (x.folder || '') === (AIV.sub || '') && (AIV.sub || !mine.length || !x.folder || mine.some(function(f){ return f.id === x.folder; }) || true); });
  if(!AIV.sub) vids = hist.filter(function(x){ return aiChKey(x) === ch && (!x.folder || !mine.some(function(f){ return f.id === x.folder; })); });
  var head = h('div', {class: 'aiFHead'},
    h('button', {class: 'ib', html: icon('back'), title: '上一層', onclick: function(){ if(AIV.sub) AIV.sub = ''; else AIV.ch = ''; aiRender(); }}),
    h('div', {class: 'grow'}, h('small', {text: AIV.sub ? ch : '頻道'}), h('b', {class: 'ell', text: sub ? sub.name : ch})),
    h('button', {class: 'chip', html: icon('sort', 'sm') + esc((AI_SORTS.filter(function(x){ return x[0] === aiSortOf(key); })[0] || AI_SORTS[0])[1]), onclick: function(){
      menu('排序', AI_SORTS.map(function(x){ return [aiSortOf(key) === x[0] ? 'check' : 'sort', x[1], function(){ aiSetSort(key, x[0]); aiRender(); }]; }));
    }}),
    AIV.sub ? null : h('button', {class: 'ib', html: icon('folderPlus'), title: '新增資料夾', onclick: async function(){
      var n = await promptDlg('新增資料夾', '', '資料夾名稱'); if(!n) return;
      var F2 = aiFolders(); (F2[ch] = F2[ch] || []).push({id: 'f' + uid(), name: n}); lsSet('ws.aiFolders', F2); aiRender();
    }}));
  pg.appendChild(head);
  if(!AIV.sub) mine.forEach(function(f){
    var n = hist.filter(function(x){ return aiChKey(x) === ch && x.folder === f.id; }).length;
    pg.appendChild(h('div', {class: 'aiFRow', onclick: function(){ AIV.sub = f.id; aiRender(); }},
      h('span', {class: 'aiFIc2', html: icon('folder')}),
      h('div', {class: 'grow'}, h('b', {text: f.name}), h('small', {text: n + ' 部影片'})),
      h('button', {class: 'ib', html: icon('more'), onclick: function(e){ e.stopPropagation(); aiFolderMenu(ch, f); }})));
  });
  var sorted = aiSorted(vids, key);
  if(!sorted.length) pg.appendChild(h('div', {class: 'empty'}, h('div', {text: AIV.sub ? '這個資料夾還沒有影片。在影片右邊的「⋮」選「移到資料夾」。' : '影片都在資料夾裡。'})));
  sorted.forEach(function(x){ pg.appendChild(aiVidRow(x)); });
  paintIcons(sc);
  return sc;
}
function aiVidRow(x, busy){
  return h('div', {class: 'aiHRow', onclick: function(){ aiOpenVideo(x.id); }},
    h('div', {class: 'aiHTh', style: {backgroundImage: 'url("https://i.ytimg.com/vi/' + x.id + '/mqdefault.jpg")'}}, x.len ? h('span', {text: aiTs(x.len)}) : null),
    h('div', {class: 'grow'}, h('b', {class: 'ell2', text: x.title || x.id}),
      h('small', {text: busy || [x.ins ? '✦ 已有洞察' : '只有逐字稿', aiPubTxt(x), '分析 ' + fmtDate(x.t0 || x.t)].filter(Boolean).join('・')})),
    busy ? h('span', {class: 'spin sm'}) : h('button', {class: 'ib', html: icon('more'), title: '更多', onclick: function(e){ e.stopPropagation(); aiVidMenu(x); }}));
}
function aiVidMenu(x){
  var ch = aiChKey(x), mine = aiFolders()[ch] || [];
  menu(x.title || x.id, [
    ['folder', '移到資料夾…', function(){
      var items = [['folder', '頻道最上層（' + ch + '）', function(){ aiMoveVid(x.id, ''); }]].concat(mine.map(function(f){ return [x.folder === f.id ? 'check' : 'folder', f.name, function(){ aiMoveVid(x.id, f.id); }]; }));
      items.push(['folderPlus', '新增資料夾並移入…', async function(){ var n = await promptDlg('新增資料夾', '', '資料夾名稱'); if(!n) return; var F = aiFolders(), f = {id: 'f' + uid(), name: n}; (F[ch] = F[ch] || []).push(f); lsSet('ws.aiFolders', F); aiMoveVid(x.id, f.id); }]);
      menu('移到資料夾', items);
    }],
    ['ytplay', '在 YouTube 分頁開啟', function(){ ytOpen('https://m.youtube.com/watch?v=' + x.id); }],
    ['trash', '刪除這部的分析', async function(){ if(await confirmDlg('刪除分析？', '這部影片的逐字稿、摘要與對話會被刪除。', '刪除', true)){ aiForget(x.id); aiRender(); } }, true]
  ]);
}
function aiMoveVid(id, folder){ var hist = aiHist(); hist.forEach(function(x){ if(x.id === id) x.folder = folder; }); lsSet('ws.aiHist', hist); toast('✓ 已移動'); aiRender(); }
function aiFolderMenu(ch, f){
  menu(f.name, [
    ['edit', '重新命名', async function(){ var n = await promptDlg('重新命名', f.name, '資料夾名稱'); if(!n) return; var F = aiFolders(); (F[ch] || []).forEach(function(x){ if(x.id === f.id) x.name = n; }); lsSet('ws.aiFolders', F); aiRender(); }],
    ['trash', '刪除資料夾（影片移回頻道）', async function(){
      if(!(await confirmDlg('刪除資料夾？', '「' + f.name + '」裡的影片會移回頻道最上層，不會被刪除。', '刪除', true))) return;
      var F = aiFolders(); F[ch] = (F[ch] || []).filter(function(x){ return x.id !== f.id; }); lsSet('ws.aiFolders', F);
      var hist = aiHist(); hist.forEach(function(x){ if(x.folder === f.id) x.folder = ''; }); lsSet('ws.aiHist', hist); aiRender();
    }, true]
  ]);
}

function aiPickGModel(){
  var L = aiGModels();
  var items = L.map(function(m){ return [m.id === AICFG.gmodel ? 'check' : 'sparkle', m.id + (m.paid ? '（需付費）' : ''), function(){ AICFG.gmodel = m.id; aiSaveCfg(); aiEngPill(); Sheets.stack.slice(-1)[0] && aiRefreshSettings(); }, false, m.note || (m.paid ? '免費方案不能用，要在 Google AI Studio 開啟付費' : '')]; });
  items.push(['reload', '向 Google 讀取最新模型清單', async function(){ if(!AICFG.gkey){ toast('先填 Gemini 金鑰', true); return; } toast('讀取中…'); await aiGFetchList(); aiPickGModel(); }, false, AICFG.gkey ? '用你的金鑰查詢目前可用的模型' : '需要先填金鑰']);
  items.push(['edit', '自訂模型 ID…', async function(){ var n = await promptDlg('自訂 Gemini 模型', AICFG.gmodel, 'gemini-…'); if(n){ AICFG.gmodel = n; aiSaveCfg(); aiEngPill(); aiRefreshSettings(); } }]);
  menu('選擇 Gemini 模型', items);
}
var aiRefreshSettings = function(){};

/* 從 YouTube App「分享」→「AI 摘要（網頁擷取）」 */
on('shareAi', function(u){
  u = String(u || '');
  var id = YT.idOf(u);
  if(!id){ toast('分享進來的不是 YouTube 影片網址', true); return; }
  aiOpenVideo(id, {auto: true});
});

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
  function segOf(list, cur, fn){ var g = h('div', {class: 'seg aiSegW'}); list.forEach(function(x){ g.appendChild(h('button', {class: cur === x[0] ? 'on' : '', text: x[1], onclick: function(){ fn(x[0]); draw(); aiEngPill(); }})); }); return g; }
  function inp(type, val, ph, fn, list){
    var e = h('input', {type: type, value: val || '', placeholder: ph || '', style: {width: '100%'}, onchange: function(){ fn(this.value.trim()); aiSaveCfg(); aiEngPill(); }});
    if(list){ var id = 'dl' + uid(); e.setAttribute('list', id); var dl = h('datalist', {id: id}); list.forEach(function(m){ dl.appendChild(h('option', {value: m})); }); return h('div', null, e, dl); }
    return e;
  }
  function H(t){ body.appendChild(h('div', {class: 'aiExpH', text: t})); }
  function draw(){
    body.innerHTML = '';
    H('分析用的 AI');
    body.appendChild(segOf([['sub', 'Claude 訂閱'], ['gemini', 'Gemini'], ['api', 'Claude API']], AICFG.engine, function(v){ AICFG.engine = v; aiSaveCfg(); if(v === 'sub'){ AIENG.started = false; aiEngStart(); } }));
    if(AICFG.engine === 'sub'){
      var l = aiEngLabel();
      body.appendChild(h('div', {class: 'card glass', style: {marginTop: '10px'}},
        h('div', {class: 'sub', html: '用你的 <b>Claude 月訂閱額度</b>，不用另外付費。App 在背景開著你 claude.ai 上的「網頁擷取 AI 工作頁」，把分析交給它。第一次要在 App 裡登入 claude.ai，再到工作頁按「授權並測試」→「允許」。'}),
        h('div', {class: 'aiStat ' + l[1], text: '狀態：' + l[0]}),
        h('div', {class: 'btn-row'},
          h('button', {class: 'btn pri', text: '登入 Claude', onclick: function(){ NAT.call('openClaude', 'https://claude.ai/login'); }}),
          h('button', {class: 'btn', text: '開啟工作頁（授權）', onclick: function(){ NAT.call('openClaude', aiUrl()); }}),
          h('button', {class: 'btn', text: '重新連線', onclick: function(){ NAT.call('cengStop'); AIENG.started = false; setTimeout(function(){ aiEngStart(); setTimeout(draw, 400); }, 200); }}))));
      H('Claude 模型');
      body.appendChild(segOf(AI_SUBMODELS.map(function(x){ return [x[0], x[1]]; }), AICFG.subModel || 'default', function(v){ AICFG.subModel = v; aiSaveCfg(); }));
      body.appendChild(h('div', {class: 'sub', style: {margin: '6px 2px 0'}, text: '「最強」或 Opus 最準但最慢、用量最多；「快速」或 Haiku 幾秒就好，適合問答。指定的模型不能用時會自動改用同等級的。'}));
      H('思考程度（指定模型時）');
      body.appendChild(segOf([['', '預設'], ['low', '低'], ['medium', '中'], ['high', '高']], AICFG.effort || '', function(v){ AICFG.effort = v; aiSaveCfg(); }));
      H('工作頁網址（空白＝預設）');
      body.appendChild(inp('url', AICFG.url, AI_DEFAULT_URL, function(v){ AICFG.url = v; NAT.call('cengStop'); AIENG.started = false; aiEngStart(); }));
    } else if(AICFG.engine === 'gemini'){
      body.appendChild(h('div', {class: 'sub', style: {margin: '10px 2px 0'}, html: 'Google Gemini 可以<b>直接看 YouTube 影片</b>（畫面＋聲音），沒有字幕的影片也能分析。Google AI Studio 有免費額度（每天可分析數小時的 YouTube 影片），只能分析公開影片。'}));
    } else {
      H('Anthropic API 金鑰（另外計費，跟 Claude 訂閱無關）');
      body.appendChild(inp('password', AICFG.key, 'sk-ant-…', function(v){ AICFG.key = v; }));
      H('模型');
      body.appendChild(inp('text', AICFG.model, 'claude-sonnet-5-5', function(v){ AICFG.model = v || 'claude-sonnet-5-5'; }, AI_CMODELS));
    }
    H('Gemini API 金鑰' + (AICFG.engine === 'gemini' ? '' : '（沒有字幕時用來「看」影片聽寫）'));
    body.appendChild(inp('password', AICFG.gkey, 'AIza…', function(v){ AICFG.gkey = v; }));
    body.appendChild(h('div', {class: 'btn-row', style: {marginTop: '8px'}}, h('button', {class: 'btn sm', html: icon('open', 'sm') + '免費取得金鑰（Google AI Studio）', onclick: function(){ openExternal('https://aistudio.google.com/apikey'); }})));
    H('Gemini 模型');
    body.appendChild(h('button', {class: 'aiPick', onclick: aiPickGModel}, h('div', {class: 'grow'}, h('b', {text: AICFG.gmodel + (aiGPaid(AICFG.gmodel) ? '（需付費）' : '')}),
      h('small', {text: ((aiGModels().filter(function(x){ return x.id === AICFG.gmodel; })[0] || {}).note) || '點這裡選擇模型'})), h('span', {html: icon('chevR', 'sm')})));
    if(AICFG.engine === 'gemini'){
      H('Gemini 分析方式');
      body.appendChild(segOf([['video', '直接看影片（推薦）'], ['text', '先讀字幕再分析']], AICFG.gmode || 'video', function(v){ AICFG.gmode = v; aiSaveCfg(); }));
      body.appendChild(h('div', {class: 'sub', style: {margin: '6px 2px 0'}, text: AICFG.gmode === 'text' ? '有字幕時把字幕交給 Gemini 分析，最省額度；沒有字幕才看影片。' : '不管有沒有字幕，都讓 Gemini 直接看整部影片（畫面＋聲音），分析和逐字稿同時進行。'}));
    }
    var fc = h('input', {type: 'checkbox', checked: AICFG.gfast !== false, onchange: function(){ AICFG.gfast = this.checked; aiSaveCfg(); }});
    body.appendChild(h('label', {class: 'setRow aiSw', style: {marginTop: '10px'}}, h('div', {class: 'grow'}, h('b', {text: '速度優先'}), h('div', {class: 'sub', text: 'Gemini 少「思考」一點、影片用低解析度與較少畫面，快很多，品質通常差不多'})), fc));
    var fb = h('input', {type: 'checkbox', checked: AICFG.gfallback !== false, onchange: function(){ AICFG.gfallback = this.checked; aiSaveCfg(); }});
    body.appendChild(h('label', {class: 'setRow aiSw', style: {marginTop: '8px'}}, h('div', {class: 'grow'}, h('b', {text: '模型忙碌時自動換備援模型'}), h('div', {class: 'sub', text: '遇到「high demand」會先自動重試，還是不行就改用 gemini-3.8-flash／3.5-flash／3.5-flash-lite'})), fb));
    var lc = h('input', {type: 'checkbox', checked: AICFG.listen !== false, onchange: function(){ AICFG.listen = this.checked; aiSaveCfg(); }});
    body.appendChild(h('label', {class: 'setRow aiSw', style: {marginTop: '10px'}}, h('div', {class: 'grow'}, h('b', {text: '沒有字幕時自動用 AI 聽寫'}), h('div', {class: 'sub', text: '讀不到字幕就讓 Gemini 看影片產生完整逐字稿（有設定金鑰才會）'})), lc));
    var ac = h('input', {type: 'checkbox', checked: AICFG.auto !== false, onchange: function(){ AICFG.auto = this.checked; aiSaveCfg(); }});
    body.appendChild(h('label', {class: 'setRow aiSw', style: {marginTop: '8px'}}, h('div', {class: 'grow'}, h('b', {text: '分享進來就自動分析'}), h('div', {class: 'sub', text: '從 YouTube 分享到「AI 摘要（網頁擷取）」或貼上網址時，直接開始產生摘要與章節'})), ac));
    H('摘要與回答的語言');
    body.appendChild(segOf([['zh', '繁體中文'], ['en', 'English'], ['same', '跟影片相同']], AICFG.lang, function(v){ AICFG.lang = v; aiSaveCfg(); }));
    paintIcons(body);
  }
  draw();
  aiRefreshSettings = function(){ if(!s.closed) draw(); };
  if(AICFG.gkey && !lsGet('ws.aiGList', null)) aiGFetchList();
  var s = openSheet({title: 'AI 設定', icon: 'sparkle', body: body, tall: true});
  on('ceng', function(d){ if(d && d.state && !s.closed && AICFG.engine === 'sub') draw(); });
}

