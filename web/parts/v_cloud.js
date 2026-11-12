/* ============================================================
   AI 摘要：GitHub 雲端執行
   在使用者自己的 GitHub 建一個私人倉庫（terra-ai-cloud），放一支 GitHub Actions 程式。
   App 把工作（影片 ID ＋ 已經組好的 AI 題目）寫進 jobs/，雲端依序呼叫 Gemini，結果寫進 results/；
   App 開著時每分鐘取回一次，存進該影片的記錄後把雲端的結果檔刪掉。手機關掉也會在雲端繼續跑。
   ============================================================ */
var CLOUD_VER = 1;
var CLOUD = {
  REPO: 'terra-ai-cloud', API: 'https://api.github.com',
  cfg: Object.assign({tok: '', login: '', ok: false, auto: false, ver: 0, kh: '', branch: 'main'}, lsGet('ws.cloud', {})),
  pend: lsGet('ws.cloudPend', {}), busy: false, last: 0, timer: 0,
  save: function(){ lsSet('ws.cloud', this.cfg); lsSet('ws.cloudPend', this.pend); }
};
function clKeyHash(k){ var h = 0; k = String(k || ''); for(var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; return String(h); }
function clB64(str){ var u = new TextEncoder().encode(str), s = ''; for(var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function clGh(path, method, body, tok, raw){
  var r = await fetch(CLOUD.API + path, {method: method || 'GET', cache: 'no-store', headers: {'Authorization': 'Bearer ' + (tok || CLOUD.cfg.tok), 'Accept': raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined});
  var txt = ''; try{ txt = await r.text(); }catch(e){}
  var j = null; if(!raw){ try{ j = txt ? JSON.parse(txt) : {}; }catch(e){ j = {}; } }
  if(!r.ok){
    var e = new Error(r.status === 401 ? 'GitHub 權杖無效或已過期' : r.status === 403 ? 'GitHub 拒絕：權杖缺少需要的權限（要勾 repo 和 workflow），或暫時超過用量' : (j && j.message) || ('GitHub 錯誤 ' + r.status));
    e.status = r.status; throw e;
  }
  return {json: j, text: txt, scopes: r.headers.get('x-oauth-scopes')};
}
function clRepo(){ return '/repos/' + CLOUD.cfg.login + '/' + CLOUD.REPO; }
/* 一次 commit 寫入／刪除多個檔案（null＝刪除） */
async function clCommit(files, msg){
  for(var tries = 0; tries < 4; tries++){
    try{
      var R = clRepo(), br = CLOUD.cfg.branch || 'main';
      var ref = (await clGh(R + '/git/ref/heads/' + br)).json, head = ref.object.sha;
      var base = (await clGh(R + '/git/commits/' + head)).json.tree.sha;
      var tree = Object.keys(files).map(function(p){ return files[p] == null ? {path: p, mode: '100644', type: 'blob', sha: null} : {path: p, mode: '100644', type: 'blob', content: files[p]}; });
      var t = (await clGh(R + '/git/trees', 'POST', {base_tree: base, tree: tree})).json;
      var c = (await clGh(R + '/git/commits', 'POST', {message: msg, tree: t.sha, parents: [head]})).json;
      await clGh(R + '/git/refs/heads/' + br, 'PATCH', {sha: c.sha});
      return;
    }catch(e){ if(e.status !== 422 && e.status !== 409 || tries === 3) throw e; await sleep(1500); }
  }
}
/* 第一次設定：檢查權杖 → 建私人倉庫 → 放程式 → 把 Gemini 金鑰存成倉庫的加密 Secret */
async function clSetup(tok, step){
  step = step || function(){};
  step('檢查 GitHub 權杖…');
  var u = await clGh('/user', 'GET', null, tok);
  var login = u.json && u.json.login; if(!login) throw new Error('讀不到 GitHub 帳號');
  if(u.scopes != null && u.scopes !== ''){
    var sc = u.scopes.split(/\s*,\s*/);
    if(sc.indexOf('repo') < 0 || sc.indexOf('workflow') < 0) throw new Error('這個權杖的權限不夠：要勾選「repo」和「workflow」兩項（目前只有：' + (u.scopes || '無') + '）');
  }
  CLOUD.cfg.tok = tok; CLOUD.cfg.login = login;
  step('建立雲端倉庫…');
  var repo = null;
  try{ repo = (await clGh(clRepo())).json; }catch(e){ if(e.status !== 404) throw e; }
  if(!repo){
    repo = (await clGh('/user/repos', 'POST', {name: CLOUD.REPO, private: true, auto_init: true, description: 'Terra 瀏覽器：AI 摘要雲端執行（GitHub Actions）'})).json;
    await sleep(2500);
  }
  CLOUD.cfg.branch = repo.default_branch || 'main';
  step('放入雲端程式…');
  var F = window.CLOUD_FILES || {};
  await clCommit({'run.py': F.run, '.github/workflows/ai.yml': F.yml,
    'README.md': '# Terra 瀏覽器：AI 摘要雲端執行\n\n這個私人倉庫由 Terra 瀏覽器 App 自動建立。App 把要分析的影片放進 `jobs/`，GitHub Actions 依序呼叫 Gemini，結果寫進 `results/`，App 取回後會刪除。\n\nGemini 金鑰存在倉庫的 Secrets（GEMINI_KEY），不會出現在檔案裡。\n'}, '更新雲端程式 v' + CLOUD_VER);
  await clPutKey(step);
  CLOUD.cfg.ok = true; CLOUD.cfg.ver = CLOUD_VER; CLOUD.save();
  return login;
}
async function clPutKey(step){
  if(!AICFG.gkey) throw new Error('要先在 AI 設定填好 Gemini 金鑰');
  if(typeof sealBox !== 'function') throw new Error('加密元件沒有載入');
  (step || function(){})('把 Gemini 金鑰加密存到 GitHub…');
  var pk = (await clGh(clRepo() + '/actions/secrets/public-key')).json;
  var kb = Uint8Array.from(atob(pk.key), function(c){ return c.charCodeAt(0); });
  var sealed = sealBox(new TextEncoder().encode(AICFG.gkey), kb), s = '';
  sealed.forEach(function(c){ s += String.fromCharCode(c); });
  await clGh(clRepo() + '/actions/secrets/GEMINI_KEY', 'PUT', {encrypted_value: btoa(s), key_id: pk.key_id});
  CLOUD.cfg.kh = clKeyHash(AICFG.gkey);
}
/* 程式版本或金鑰換過：自動更新 */
async function clEnsure(){
  if(!CLOUD.cfg.ok) throw new Error('還沒設定 GitHub 雲端');
  if(CLOUD.cfg.ver !== CLOUD_VER){ var F = window.CLOUD_FILES || {}; await clCommit({'run.py': F.run, '.github/workflows/ai.yml': F.yml}, '更新雲端程式 v' + CLOUD_VER); CLOUD.cfg.ver = CLOUD_VER; }
  if(CLOUD.cfg.kh !== clKeyHash(AICFG.gkey)) await clPutKey();
  CLOUD.save();
}
/* 一部影片要做哪些事：沒有逐字稿就聽寫、沒有摘要就分析（題目在手機上組好，雲端只負責送給 Gemini） */
function clJob(id, redo){
  var c = aiDbGet(id) || {}, info = c.info || {id: id}, cues = c.cues || [], tasks = [];
  if(!cues.length) aiListenSegs(info.len || 0).forEach(function(clip, i){ tasks.push({k: 'seg' + i, prompt: aiListenPrompt(clip), video: true, clip: clip, fps: 0.25}); });
  if(redo || !(c.ins && c.ins.overview) || !(c.ins.chapters && c.ins.chapters.length)){
    var video = !cues.length || AICFG.gmode === 'video';
    tasks.push({k: 'ins', prompt: aiInsPrompt(video, info, cues), video: video, fps: (info.len || 0) > 2400 ? 0.2 : 0.5});
  }
  return {id: id, t: Date.now(), model: AICFG.gmodel || 'gemini-3.8-flash', fallback: AICFG.gfallback === false ? [] : AI_GFALLBACK, fast: AICFG.gfast !== false, info: {title: info.title || '', len: info.len || 0}, tasks: tasks};
}
async function clSubmit(list, opt){
  opt = opt || {};
  if(!CLOUD.cfg.ok){ clSettings(); return false; }
  try{
    toast('交給 GitHub 雲端…');
    await clEnsure();
    var files = {}, n = 0;
    list.forEach(function(x){
      var j = clJob(x.id, opt.redo);
      if(!j.tasks.length) return;
      files['jobs/' + x.id + '.json'] = JSON.stringify(j);
      CLOUD.pend[x.id] = {t: Date.now(), title: x.title || j.info.title || x.id, n: j.tasks.length};
      n++;
    });
    if(!n){ toast('這些影片都已經完成，不需要再跑'); return false; }
    await clCommit(files, '新增 ' + n + ' 部影片');
    CLOUD.save(); clSchedule();
    toast('已交給 GitHub 雲端：' + n + ' 部。手機關掉也會繼續跑，完成後打開 App 就會取回');
    if(curView === 'ai' && !AI.id) aiRender();
    return true;
  }catch(e){ toast('交給雲端失敗：' + (e.message || e), true); return false; }
}
/* 取回結果 */
async function clPoll(force){
  if(!CLOUD.cfg.ok || CLOUD.busy) return;
  if(!force && !Object.keys(CLOUD.pend).length) return;
  CLOUD.busy = true; CLOUD.last = Date.now();
  try{
    var list = [];
    try{ list = (await clGh(clRepo() + '/contents/results?ref=' + (CLOUD.cfg.branch || 'main'))).json || []; }catch(e){ if(e.status !== 404) throw e; }
    var del = {}, done = [], fail = [];
    for(var i = 0; i < list.length; i++){
      var f = list[i]; if(!/\.json$/.test(f.name)) continue;
      try{
        var txt = (await clGh(clRepo() + '/contents/results/' + f.name + '?ref=' + (CLOUD.cfg.branch || 'main'), 'GET', null, null, true)).text;
        var r = JSON.parse(txt), res = clImport(r);
        (res.ok ? done : fail).push(res);
        del['results/' + f.name] = null;
      }catch(e){ console.error('cloud import', f.name, e); }
    }
    if(Object.keys(del).length) await clCommit(del, '取回 ' + Object.keys(del).length + ' 部結果');
    CLOUD.save();
    if(done.length || fail.length){
      var msg = '雲端分析：完成 ' + done.length + ' 部' + (fail.length ? '，失敗 ' + fail.length + ' 部（' + fail[0].why + '）' : '');
      toast(msg, !!fail.length);
      if(isApp && NAT.has('aiNotice') && !NAT.call('appVisible')){
        if(done.length === 1 && NAT.has('aiNoticeOpen')) NAT.call('aiNoticeOpen', '雲端 AI 摘要完成', done[0].title, done[0].id);
        else NAT.call('aiNotice', '雲端 AI 摘要', msg);
      }
      if(curView === 'ai' && !AI.id) aiRender();
    }
  }catch(e){ console.error('cloud poll', e); }
  CLOUD.busy = false;
  clSchedule();
}
function clImport(r){
  var id = r.id, P = CLOUD.pend[id] || {}, c = aiDbGet(id) || {}, out = r.out || {}, why = r.err || '', patch = {};
  var info = Object.assign({id: id}, c.info || {}, (r.info && r.info.title) ? {title: c.info && c.info.title || r.info.title, author: c.info && c.info.author || r.info.author} : {});
  if(!info.title) info.title = P.title || id;
  var segK = Object.keys(out).filter(function(k){ return /^seg\d+$/.test(k); }).sort(function(a, b){ return +a.slice(3) - +b.slice(3); });
  if(segK.length){
    if(segK.every(function(k){ return out[k].ok; })){
      var cues = aiListenJoin(segK.map(function(k){ return aiListenSeg(out[k].ok, out[k].clip || null); }));
      if(cues.length){ patch.cues = cues; patch.track = AI_LISTEN_TRACK; patch.tr = ''; }
    } else why = why || (out[segK.filter(function(k){ return !out[k].ok; })[0]].err || '聽寫失敗');
  }
  if(out.ins){
    var v = out.ins.ok;
    if(v && typeof v === 'object' && v.overview){ patch.ins = aiInsFinish(v, out.ins.model, true, 'gemini'); patch.ins.cloud = true; }
    else why = why || out.ins.err || '沒有產生摘要';
  }
  patch.info = info;
  aiCacheMerge(id, patch);
  /* 記錄清單裡沒有這部（例如新影片直接交給雲端）：加進去 */
  var hist = aiHist(), k = hist.findIndex(function(x){ return x.id === id; });
  if(k < 0){ hist.unshift({id: id, title: info.title, author: info.author || '', len: info.len || 0, ins: !!patch.ins, t: Date.now(), t0: Date.now()}); aiHistSet(hist.slice(0, 5000)); }
  if(AI.id === id){ if(patch.cues){ AI.cues = patch.cues; AI.track = patch.track; } if(patch.ins) AI.ins = patch.ins; AI.loading = ''; aiRender(); }
  delete CLOUD.pend[id];
  var ok = !!(patch.ins || (patch.cues && !out.ins));
  return {id: id, title: info.title, ok: ok, why: why};
}
function clSchedule(){
  clearTimeout(CLOUD.timer);
  if(!CLOUD.cfg.ok || !Object.keys(CLOUD.pend).length) return;
  CLOUD.timer = setTimeout(function(){ if(!document.hidden) clPoll(); else clSchedule(); }, 60000);
}
document.addEventListener('visibilitychange', function(){ if(!document.hidden && CLOUD.cfg.ok && Date.now() - CLOUD.last > 20000) clPoll(); });
setTimeout(function(){ clPoll(); }, 5000);

/* ---------- 設定畫面 ---------- */
function clSettings(){
  var body = h('div');
  var s = openSheet({title: 'GitHub 雲端執行', icon: 'link', body: body, tall: true});
  function draw(){
    body.textContent = '';
    body.appendChild(h('div', {class: 'sub', style: {lineHeight: '1.7', marginBottom: '10px'}, html: '把 AI 摘要交給<b>你自己的 GitHub</b> 執行（GitHub Actions）。交出去之後，手機關螢幕、把 App 完全關掉，雲端都會繼續跑；下次打開 App 會自動取回結果。<br>雲端用的是 Gemini「直接看影片」，所以要先設定好 Gemini 金鑰。'}));
    if(!CLOUD.cfg.ok){
      var inp = h('input', {type: 'password', placeholder: 'ghp_… 貼上 GitHub 權杖', autocomplete: 'off', style: {width: '100%', margin: '8px 0'}});
      body.appendChild(h('div', {class: 'note', html: '<b>第一次要貼上 GitHub 權杖</b>（只存在這支手機）：<br>① 瀏覽器登入 github.com → 右上角頭像 → Settings → 最下面 Developer settings → Personal access tokens → <b>Tokens (classic)</b> → Generate new token (classic)<br>② Note 隨便填（例如「Terra 雲端」），Expiration 選你要的期限，權限勾 <b>repo</b> 和 <b>workflow</b> 兩項<br>③ 按 Generate token，複製 <b>ghp_</b> 開頭的那串貼到下面<br><small>跨網路傳檔用的權杖只有 public_repo 權限，不夠用，要另外產生一個。</small>'}));
      body.appendChild(inp);
      var st = h('div', {class: 'sub'}); body.appendChild(st);
      body.appendChild(h('div', {class: 'btn-row'}, h('button', {class: 'btn pri', html: icon('check', 'sm') + '連接並自動設定', onclick: async function(){
        var t = inp.value.trim(); if(!t){ toast('請先貼上權杖', true); return; }
        if(!AICFG.gkey){ toast('要先在 AI 設定填好 Gemini 金鑰', true); return; }
        this.disabled = true;
        try{ var who = await clSetup(t, function(m){ st.textContent = m; }); toast('✓ 已連上 GitHub 雲端：' + who); draw(); }
        catch(e){ this.disabled = false; st.textContent = ''; CLOUD.cfg.ok = false; toast(e.message || '設定失敗', true); }
      }})));
      body.appendChild(h('div', {class: 'note', html: 'App 會在你的 GitHub 自動建立一個<b>私人</b>倉庫 <b>' + CLOUD.REPO + '</b>，放入執行程式，並把 Gemini 金鑰存成倉庫的加密 Secret（不會出現在任何檔案裡）。<br>私人倉庫每月有 2,000 分鐘免費的 GitHub Actions 時間；一部影片通常用 1～5 分鐘。Gemini 的用量和在手機上跑一樣，算在你的金鑰額度裡。'}));
      paintIcons(body); return;
    }
    var P = Object.keys(CLOUD.pend);
    body.appendChild(h('div', {class: 'note', html: '✓ 已連接：<b>' + esc(CLOUD.cfg.login) + '/' + CLOUD.REPO + '</b>（私人倉庫）<br>等待雲端完成：' + P.length + ' 部' + (CLOUD.last ? '・上次檢查 ' + fmtDate(CLOUD.last) : '')}));
    var au = h('input', {type: 'checkbox', checked: !!CLOUD.cfg.auto, onchange: function(){ CLOUD.cfg.auto = this.checked; CLOUD.save(); }});
    body.appendChild(h('label', {class: 'setRow aiSw'}, h('div', {class: 'grow'}, h('b', {text: '新影片直接交給雲端分析'}), h('div', {class: 'sub', text: '從 YouTube 分享進來或在 AI 摘要貼上網址時，不在手機上跑，改交給 GitHub 雲端'})), au));
    body.appendChild(h('div', {class: 'btn-row', style: {flexWrap: 'wrap'}},
      h('button', {class: 'btn', html: icon('reload', 'sm') + '立即取回結果', onclick: async function(){ this.disabled = true; await clPoll(true); draw(); }}),
      h('button', {class: 'btn', html: icon('globe', 'sm') + '在 GitHub 查看執行狀態', onclick: function(){ s.close(); navigate('https://github.com/' + CLOUD.cfg.login + '/' + CLOUD.REPO + '/actions'); }}),
      h('button', {class: 'btn', html: icon('key', 'sm') + '重新上傳 Gemini 金鑰', onclick: async function(){ this.disabled = true; try{ await clPutKey(); CLOUD.save(); toast('✓ 已更新'); }catch(e){ toast(e.message, true); } this.disabled = false; }})));
    if(P.length){
      var list = h('div', {class: 'list'});
      P.forEach(function(id){ var x = CLOUD.pend[id]; list.appendChild(h('div', {class: 'lrow'}, h('div', {class: 'grow'}, h('b', {class: 'ell2', 'data-i18n-skip': '', text: x.title || id}), h('div', {class: 'sub', text: '交出 ' + fmtDate(x.t)})),
        h('button', {class: 'ib', html: icon('x'), title: '不再等待', onclick: function(){ delete CLOUD.pend[id]; CLOUD.save(); draw(); }}))); });
      body.appendChild(list);
    }
    body.appendChild(h('div', {class: 'btn-row'}, h('button', {class: 'btn sm dang', text: '中斷連接', onclick: function(){ CLOUD.cfg = {tok: '', login: '', ok: false, auto: false, ver: 0, kh: '', branch: 'main'}; CLOUD.pend = {}; CLOUD.save(); toast('已中斷連接（GitHub 上的倉庫沒有刪除）'); draw(); }})));
    paintIcons(body);
  }
  draw();
}
