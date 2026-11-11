/* ============================================================
   跨網路傳檔（中繼）
   兩邊不在同一個網路時，檔案先經過一台「中繼站」再到對方：
   - GitHub 中繼：加密後暫存到使用者自己 GitHub 的 web-saver-relay 倉庫的一個暫時分支，傳完刪掉分支
   - 公用中繼：經過公開的 piping 伺服器即時轉送（不落地），兩邊要同時在線
   兩種都先在手機用 AES-GCM 加密，金鑰只放在網址的 # 後面（不會送到任何伺服器），對方用 get.html 解密
   ============================================================ */
var RELAY = {
  PAGE: 'https://ianlin1120.github.io/web-saver/get.html',
  API: 'https://api.github.com', RAW: 'https://raw.githubusercontent.com', REPO: 'web-saver-relay',
  PIPE: 'https://ppng.io', CHUNK: 6 * 1024 * 1024, KEEP_MIN: 60,
  cfg: Object.assign({gh: '', login: '', pipe: ''}, lsGet('ws.relay', {})),
  save: function(){ lsSet('ws.relay', this.cfg); }
};
function rlB64u(u8){ var s = ''; for(var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function rlRand(n){ var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function rlId(){ var a = rlRand(10), s = ''; for(var i = 0; i < a.length; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[a[i] % 32]; return s; }
async function rlKey(){ var raw = rlRand(16); return {raw: raw, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])}; }
async function rlEnc(key, buf){ var iv = rlRand(12), ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: iv}, key, buf)), out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; }
function rlBlobB64(u8){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result).split(',')[1] || ''); }; fr.onerror = function(){ rej(new Error('讀取失敗')); }; fr.readAsDataURL(new Blob([u8])); }); }
function rlManifest(items){ return {v: 1, cs: RELAY.CHUNK, files: items.map(function(it){ return {n: it.name, s: it.size || 0, c: Math.max(1, Math.ceil((it.size || 0) / RELAY.CHUNK))}; })}; }

/* ---------- GitHub ---------- */
async function rlGh(path, method, body, tok){
  var r = await fetch(RELAY.API + path, {method: method || 'GET', headers: {'Authorization': 'Bearer ' + (tok || RELAY.cfg.gh), 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});
  if(r.status === 204) return {};
  var j = null; try{ j = await r.json(); }catch(e){}
  if(!r.ok){ var e = new Error(r.status === 401 ? 'GitHub 權杖無效或已過期' : r.status === 403 ? 'GitHub 拒絕：權杖沒有需要的權限（要勾選 public_repo），或暫時超過用量' : (j && j.message) || ('GitHub 錯誤 ' + r.status)); e.status = r.status; throw e; }
  return j || {};
}
/* 檢查權杖、確認（或建立）中繼用的倉庫 */
async function rlGhSetup(tok){
  var u = await rlGh('/user', 'GET', null, tok);
  if(!u.login) throw new Error('讀不到 GitHub 帳號');
  var repo = null;
  try{ repo = await rlGh('/repos/' + u.login + '/' + RELAY.REPO, 'GET', null, tok); }catch(e){ if(e.status !== 404) throw e; }
  if(!repo){
    await rlGh('/user/repos', 'POST', {name: RELAY.REPO, description: '網頁擷取 App 跨網路傳檔的暫存中繼（內容皆已加密，傳完自動刪除）', private: false, auto_init: true, has_issues: false, has_wiki: false}, tok);
    await sleep(1500);
  } else if(repo.private) throw new Error('「' + RELAY.REPO + '」是私人倉庫，對方會下載不到。請到 GitHub 把它改成公開（裡面的檔案都有加密）');
  return u.login;
}
async function rlGhSend(items, onStep, sig){
  var login = RELAY.cfg.login || (RELAY.cfg.login = await rlGhSetup(RELAY.cfg.gh)); RELAY.save();
  var base = '/repos/' + login + '/' + RELAY.REPO + '/git', k = await rlKey(), id = rlId(), tree = [], total = 0, done = 0;
  items.forEach(function(it){ total += it.size || 0; });
  async function put(path, u8){
    var b = await rlGh(base + '/blobs', 'POST', {content: await rlBlobB64(u8), encoding: 'base64'});
    tree.push({path: path, mode: '100644', type: 'blob', sha: b.sha});
  }
  var man = rlManifest(items);
  for(var i = 0; i < items.length; i++){
    var bl = await Lib.blob(items[i]); man.files[i].s = bl.size; man.files[i].c = Math.max(1, Math.ceil(bl.size / RELAY.CHUNK));
    for(var c = 0; c < man.files[i].c; c++){
      if(sig && sig.aborted) throw new Error('已取消');
      var part = await bl.slice(c * RELAY.CHUNK, (c + 1) * RELAY.CHUNK).arrayBuffer();
      await put(i + '/' + c, await rlEnc(k.key, part));
      done += part.byteLength; onStep && onStep(done, Math.max(total, done), items[i].name);
    }
  }
  await put('m', await rlEnc(k.key, new TextEncoder().encode(JSON.stringify(man))));
  var t = await rlGh(base + '/trees', 'POST', {tree: tree});
  var cm = await rlGh(base + '/commits', 'POST', {message: 'transfer ' + id, tree: t.sha, parents: []});
  await rlGh(base + '/refs', 'POST', {ref: 'refs/heads/t-' + id, sha: cm.sha});
  var pend = lsGet('ws.relayPend', []); pend.push({id: id, login: login, at: Date.now()}); lsSet('ws.relayPend', pend);
  return {id: id, url: RELAY.PAGE + '#g/' + login + '/' + id + '/' + rlB64u(k.raw) + (RELAY.RAW !== 'https://raw.githubusercontent.com' ? '/' + rlB64u(new TextEncoder().encode(RELAY.RAW)) : '')};
}
async function rlGhDelete(id){
  var pend = lsGet('ws.relayPend', []), p = pend.filter(function(x){ return x.id === id; })[0];
  if(!p) return true;
  try{ await rlGh('/repos/' + p.login + '/' + RELAY.REPO + '/git/refs/heads/t-' + id, 'DELETE'); }
  catch(e){ if(e.status !== 404 && e.status !== 422) return false; }
  lsSet('ws.relayPend', lsGet('ws.relayPend', []).filter(function(x){ return x.id !== id; }));
  return true;
}
/* 忘了按刪除、或 App 中途被關掉：超過保留時間的暫存，下次開 App 自動刪 */
function rlSweep(){
  if(!RELAY.cfg.gh) return;
  lsGet('ws.relayPend', []).forEach(function(p){ if(Date.now() - p.at > RELAY.KEEP_MIN * 60000) rlGhDelete(p.id); });
}
setTimeout(rlSweep, 6000); setInterval(rlSweep, 5 * 60000);

/* ---------- 公用中繼（piping）：每個檔案一條連線，對方來拿的時候才開始傳 ---------- */
async function rlPipeSend(items, onState, sig){
  var srv = (RELAY.cfg.pipe || RELAY.PIPE).replace(/\/+$/, ''), k = await rlKey(), id = rlId() + rlId();
  var url = RELAY.PAGE + '#p/' + id + '/' + rlB64u(k.raw) + (srv !== RELAY.PIPE ? '/' + rlB64u(new TextEncoder().encode(srv)) : '');
  var man = rlManifest(items), blobs = [];
  for(var i = 0; i < items.length; i++){ var b = await Lib.blob(items[i]); blobs.push(b); man.files[i].s = b.size; man.files[i].c = Math.max(1, Math.ceil(b.size / RELAY.CHUNK)); }
  async function put(name, body){
    var r = await fetch(srv + '/ws-' + id + '-' + name, {method: 'PUT', body: body, signal: sig, headers: {'Content-Type': 'application/octet-stream'}});
    if(!r.ok) throw new Error('中繼站回應 ' + r.status);
    await r.text();
  }
  var run = (async function(){
    onState('wait');
    await put('m', new Blob([await rlEnc(k.key, new TextEncoder().encode(JSON.stringify(man)))]));
    for(var i = 0; i < items.length; i++){
      onState('enc', i, items[i].name);
      var parts = [];
      for(var c = 0; c < man.files[i].c; c++){
        var e = await rlEnc(k.key, await blobs[i].slice(c * RELAY.CHUNK, (c + 1) * RELAY.CHUNK).arrayBuffer()), len = new Uint8Array(4);
        new DataView(len.buffer).setUint32(0, e.length);
        parts.push(new Blob([len, e]));
      }
      onState('send', i, items[i].name);
      await put(String(i), new Blob(parts));
    }
    onState('done');
  })();
  return {url: url, run: run};
}

/* ---------- 畫面：放在「無線傳到電腦／其他手機」面板裡 ---------- */
function relayPane(body, mode, items, redraw){
  var ctl = new AbortController(), alive = true;
  var total = (items || []).reduce(function(a, it){ return a + (it.size || 0); }, 0);
  function stop(){ alive = false; try{ ctl.abort(); }catch(e){} }
  function qrBox(url){
    var qr = qrSvg(url, 210); if(qr) body.appendChild(h('div', {class: 'wifiQr', html: qr}));
    body.appendChild(h('div', {class: 'wifiUrl', style: {fontSize: '12.5px'}, text: url}));
  }
  if(!window.crypto || !crypto.subtle){ body.appendChild(h('div', {class: 'note err', text: '這支手機的系統元件不支援加密，無法使用中繼傳檔。'})); return stop; }
  if(!items || !items.length){
    body.appendChild(h('div', {class: 'note', html: '中繼傳檔一次傳「選好的檔案」：<br>到<b>檔案庫</b>長按（或按右上角多選）勾選要傳的檔案 → 按「匯出／分享」→「無線傳到電腦／其他手機」，再選這個分頁。'}));
    return stop;
  }
  var head = h('div', {class: 'sub', text: '要傳 ' + items.length + ' 個檔案（' + fmtSize(total) + '）'}); body.appendChild(head);
  if(total > 300 * 1024 * 1024) body.appendChild(h('div', {class: 'note err', text: '檔案超過 300 MB，經過中繼會很慢、也比較容易失敗。大檔案建議用「同一個網路／熱點」直接傳。'}));

  if(mode === 'gh'){
    if(!RELAY.cfg.gh){
      var inp = h('input', {style: {width: '100%', margin: '8px 0'}, type: 'password', placeholder: 'ghp_… 貼上 GitHub 權杖', autocomplete: 'off'});
      body.appendChild(h('div', {class: 'note', html: '<b>第一次使用要先貼上你的 GitHub 權杖</b>（只存在這支手機）：<br>① 用瀏覽器登入 github.com → 右上角頭像 → Settings → 最下面 Developer settings → Personal access tokens → <b>Tokens (classic)</b> → Generate new token (classic)<br>② Note 隨便填（例如「網頁擷取傳檔」），Expiration 選你要的期限，權限只勾 <b>public_repo</b><br>③ 按 Generate token，複製 <b>ghp_</b> 開頭的那串貼到下面'}));
      body.appendChild(inp);
      body.appendChild(h('div', {class: 'btn-row'}, h('button', {class: 'btn pri', html: icon('check', 'sm') + '儲存並檢查', onclick: async function(){
        var t = inp.value.trim(); if(!t){ toast('請先貼上權杖', true); return; }
        this.disabled = true; toast('檢查中…');
        try{ RELAY.cfg.login = await rlGhSetup(t); RELAY.cfg.gh = t; RELAY.save(); toast('✓ 已連上 GitHub：' + RELAY.cfg.login); redraw(); }
        catch(e){ this.disabled = false; toast(e.message || '檢查失敗', true); }
      }})));
      body.appendChild(h('div', {class: 'note', html: 'App 會在你的 GitHub 自動建立一個公開倉庫 <b>' + RELAY.REPO + '</b> 當中繼站。檔案上傳前會先在手機加密，別人就算看到倉庫也打不開；傳完會把暫存刪掉。'}));
      paintIcons(body); return stop;
    }
    var st = h('div', {class: 'note', text: '按「開始上傳」後，檔案會加密並暫存到你的 GitHub（' + (RELAY.cfg.login || '') + '/' + RELAY.REPO + '）。'}); body.appendChild(st);
    var bar = h('div', {class: 'btn-row'}); body.appendChild(bar);
    var go = h('button', {class: 'btn pri', html: icon('share', 'sm') + '開始上傳', onclick: async function(){
      go.disabled = true; st.textContent = '準備中…';
      try{
        var r = await rlGhSend(items, function(d, t, name){ if(alive) st.textContent = '上傳中 ' + Math.round(d / t * 100) + '%（' + fmtSize(d) + ' / ' + fmtSize(t) + '）・' + name; }, ctl.signal);
        if(!alive){ rlGhDelete(r.id); return; }
        bar.textContent = ''; st.className = 'note'; st.innerHTML = '<b>✓ 上傳完成。</b>把下面的 QR Code 或網址給對方，對方在任何網路都能下載。<br>對方下載完之後請按「對方收到了，刪除暫存」；沒按的話 ' + RELAY.KEEP_MIN + ' 分鐘後也會自動刪除。';
        qrBox(r.url);
        body.appendChild(h('div', {class: 'btn-row'},
          h('button', {class: 'btn', html: icon('copy', 'sm') + '複製網址', onclick: function(){ copyText(r.url); }}),
          h('button', {class: 'btn', html: icon('share', 'sm') + '傳給對方', onclick: function(){ if(isApp && NAT.has('shareText')) NAT.call('shareText', r.url); else if(navigator.share) navigator.share({url: r.url}).catch(function(){}); else copyText(r.url); }}),
          h('button', {class: 'btn dang', html: icon('trash', 'sm') + '對方收到了，刪除暫存', onclick: async function(){ this.disabled = true; var ok = await rlGhDelete(r.id); toast(ok ? '✓ 已刪除 GitHub 上的暫存' : '刪除失敗，稍後會自動再試', !ok); if(ok) redraw(); else this.disabled = false; }})));
        paintIcons(body);
      }catch(e){ go.disabled = false; st.className = 'note err'; st.textContent = '上傳失敗：' + (e.message || e); }
    }});
    bar.appendChild(go);
    bar.appendChild(h('button', {class: 'btn', text: '更換權杖', onclick: function(){ RELAY.cfg.gh = ''; RELAY.cfg.login = ''; RELAY.save(); redraw(); }}));
    var pend = lsGet('ws.relayPend', []);
    if(pend.length) body.appendChild(h('div', {class: 'note'}, h('span', {text: 'GitHub 上還有 ' + pend.length + ' 份之前的暫存。 '}),
      h('button', {class: 'btn sm', text: '全部刪除', onclick: async function(){ this.disabled = true; for(var i = 0; i < pend.length; i++) await rlGhDelete(pend[i].id); toast('✓ 已清除'); redraw(); }})));
    paintIcons(body); return stop;
  }

  /* 公用中繼 */
  var st2 = h('div', {class: 'note', text: '準備中…'}); body.appendChild(st2);
  rlPipeSend(items, function(s, i, name){
    if(!alive) return;
    st2.className = 'note';
    st2.textContent = s === 'wait' ? '等待對方打開連結…（這個畫面要開著）' : s === 'enc' ? '加密中（' + (i + 1) + '/' + items.length + '）・' + name
      : s === 'send' ? '傳送中（' + (i + 1) + '/' + items.length + '）・' + name + '　對方那邊按下載後才會開始傳' : '✓ 全部傳完了';
    if(s === 'done') buzz(20);
  }, ctl.signal).then(function(r){
    if(!alive) return;
    body.appendChild(h('div', {class: 'sub', html: '把 QR Code 或網址給對方。檔案是<b>即時轉送</b>：對方打開連結、按下載時才開始傳，所以傳完之前這個畫面要開著；每個檔案只能下載一次。'}));
    qrBox(r.url);
    body.appendChild(h('div', {class: 'btn-row'},
      h('button', {class: 'btn', html: icon('copy', 'sm') + '複製網址', onclick: function(){ copyText(r.url); }}),
      h('button', {class: 'btn', html: icon('share', 'sm') + '傳給對方', onclick: function(){ if(isApp && NAT.has('shareText')) NAT.call('shareText', r.url); else if(navigator.share) navigator.share({url: r.url}).catch(function(){}); else copyText(r.url); }})));
    var pi = h('input', {style: {width: '100%', margin: '8px 0'}, placeholder: RELAY.PIPE, value: RELAY.cfg.pipe || ''});
    body.appendChild(h('details', {class: 'note'}, h('summary', {html: '<b>中繼站是誰的？可以換嗎？</b>'}), h('div', null,
      h('p', {html: '預設用公開的免費中繼站 <b>ppng.io</b>（開源的 Piping Server，別人架設的）。檔案只是「經過」不會存下來，而且在手機就已加密，中繼站看不到內容。它是別人的免費服務，偶爾可能連不上。'}),
      h('p', {text: '如果你有自己架的 Piping Server，可以在這裡換成它的網址：'}), pi,
      h('div', {class: 'btn-row'}, h('button', {class: 'btn sm', text: '套用', onclick: function(){ var v = pi.value.trim().replace(/\/+$/, ''); if(v && !/^https:\/\//.test(v)){ toast('網址要用 https:// 開頭', true); return; } RELAY.cfg.pipe = v; RELAY.save(); redraw(); }})))));
    paintIcons(body);
    r.run.catch(function(e){ if(!alive) return; st2.className = 'note err'; st2.textContent = '傳送失敗：' + ((e && e.message) || e) + '（中繼站可能暫時連不上，可以改用 GitHub 中繼）'; });
  }).catch(function(e){ if(alive){ st2.className = 'note err'; st2.textContent = '無法開始：' + ((e && e.message) || e); } });
  return stop;
}

/* ============================================================
   接收：別人給的中繼連結，直接在 App 裡下載、解密、存進檔案庫
   ============================================================ */
function rlParse(url){
  var m = /^https?:\/\/[^#?]+\/get\.html#(g|p)\/(.+)$/.exec(String(url || '').trim());
  if(!m) return null;
  var H = m[2].split('/'), dec = function(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for(var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  try{
    if(m[1] === 'g' && H.length >= 3) return {mode: 'g', key: dec(H[2]), base: (H[3] ? new TextDecoder().decode(dec(H[3])) : 'https://raw.githubusercontent.com') + '/' + H[0] + '/' + RELAY.REPO + '/t-' + H[1] + '/'};
    if(m[1] === 'p' && H.length >= 2) return {mode: 'p', key: dec(H[1]), base: (H[2] ? new TextDecoder().decode(dec(H[2])) : RELAY.PIPE) + '/ws-' + H[0] + '-'};
  }catch(e){}
  return null;
}
/* 一邊解密一邊寫進檔案庫（APK 分段寫入，不把整個檔案放在記憶體） */
function rlWriter(name){
  var token = uid(), parts = [], app = isApp && NAT.has('libSaveChunk');
  return {
    write: async function(u8){
      if(!app){ parts.push(u8); return; }
      for(var o = 0; o < u8.length; o += 786432){
        var r = NAT.json('libSaveChunk', token, await rlBlobB64(u8.subarray(o, o + 786432)), false, name, 'application/octet-stream', '{}');
        if(!r || r.ok === false) throw new Error(r && r.err || '儲存失敗');
      }
    },
    end: async function(){
      if(!app) return await Lib.addBlob(new Blob(parts), name, {});
      var r = NAT.json('libSaveChunk', token, '', true, name, 'application/octet-stream', '{}');
      if(!r || r.ok === false) throw new Error(r && r.err || '儲存失敗');
      return r.item;
    }
  };
}
function relayReceive(url){
  var P = rlParse(url), body = h('div'), ctl = new AbortController(), alive = true;
  var sheet = openSheet({title: '接收檔案', icon: 'download', body: body, tall: true, onClose: function(){ alive = false; try{ ctl.abort(); }catch(e){} }});
  var st = h('div', {class: 'note', text: '連線中…'}); body.appendChild(st);
  var list = h('div', {class: 'list'}); body.appendChild(list);
  if(!P || !window.crypto || !crypto.subtle){ st.className = 'note err'; st.textContent = P ? '這支手機的系統元件不支援解密。' : '連結不完整，請對方重新分享。'; return; }
  (async function(){
    var key, man;
    async function dec(u8){ return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: u8.subarray(0, 12)}, key, u8.subarray(12))); }
    async function get(u, tries){
      for(var i = 0; ; i++){
        try{ var r = await fetch(u, {cache: 'no-store', signal: ctl.signal}); if(r.ok) return r; if(r.status !== 404 || i >= tries) throw new Error('伺服器回應 ' + r.status); }
        catch(e){ if(i >= tries || !alive) throw e; }
        await sleep(2500);
      }
    }
    try{
      key = await crypto.subtle.importKey('raw', P.key, 'AES-GCM', false, ['decrypt']);
      var r;
      try{ r = await get(P.base + 'm', P.mode === 'g' ? 4 : 0); }
      catch(e){ if(alive){ st.className = 'note err'; st.textContent = P.mode === 'g' ? '找不到這份檔案：可能已經被對方刪除，或超過保留時間。請對方重新分享。' : '連不上中繼站，或對方已經關掉分享畫面。請對方重新分享。'; } return; }
      try{ man = JSON.parse(new TextDecoder().decode(await dec(new Uint8Array(await r.arrayBuffer())))); }
      catch(e){ st.className = 'note err'; st.textContent = '解不開：連結裡的金鑰不對，請對方重新分享。'; return; }
      var tot = 0; man.files.forEach(function(f){ tot += f.s; });
      var rows = man.files.map(function(f){ var sub = h('div', {class: 'sub', text: fmtSize(f.s)}); list.appendChild(h('div', {class: 'lrow'}, h('div', {class: 'grow'}, h('b', {text: f.n}), sub))); return sub; });
      for(var i = 0; i < man.files.length; i++){
        var f = man.files[i], w = rlWriter(f.n), got = 0;
        var prog = function(n){ got += n; if(alive){ rows[i].textContent = fmtSize(got) + ' / ' + fmtSize(f.s); st.textContent = '下載中（' + (i + 1) + '/' + man.files.length + '）・' + Math.round(got / Math.max(1, f.s) * 100) + '%'; } };
        if(P.mode === 'g'){
          for(var c = 0; c < f.c; c++){ var p = await dec(new Uint8Array(await (await get(P.base + i + '/' + c, 3)).arrayBuffer())); await w.write(p); prog(p.length); }
        } else {
          var r2 = await fetch(P.base + i, {signal: ctl.signal}); if(!r2.ok) throw new Error('中繼站回應 ' + r2.status);
          var rd = r2.body.getReader(), buf = new Uint8Array(0);
          for(;;){
            var x = await rd.read();
            if(x.value){ var nb = new Uint8Array(buf.length + x.value.length); nb.set(buf); nb.set(x.value, buf.length); buf = nb; }
            while(buf.length >= 4){
              var len = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0);
              if(buf.length < 4 + len) break;
              var p2 = await dec(buf.slice(4, 4 + len)); await w.write(p2); prog(p2.length); buf = buf.slice(4 + len);
            }
            if(x.done) break;
          }
          if(buf.length) throw new Error('傳輸中斷，檔案不完整');
        }
        await w.end();
        rows[i].textContent = fmtSize(f.s) + '・✓ 已存到檔案庫';
      }
      await Lib.refresh(); if(typeof renderLib === 'function') renderLib();
      buzz(20); st.textContent = '✓ 完成：' + man.files.length + ' 個檔案（' + fmtSize(tot) + '）已存到檔案庫。';
      body.appendChild(h('div', {class: 'btn-row'}, h('button', {class: 'btn pri', html: icon('folder', 'sm') + '打開檔案庫', onclick: function(){ sheet.close(); showView('lib'); }})));
      paintIcons(body);
    }catch(e){ if(alive){ st.className = 'note err'; st.textContent = '接收失敗：' + ((e && e.message) || e) + (P.mode === 'p' ? '（公用中繼每個檔案只能傳一次，請對方重新分享）' : ''); } }
  })();
}

/* ============================================================
   掃 QR Code：相機即時掃描（或從相片選），掃到網址就用 App 打開；掃到傳檔連結就直接接收
   ============================================================ */
function qrOpenResult(text){
  text = String(text || '').trim();
  if(!text) return;
  buzz(20);
  if(rlParse(text)){ relayReceive(text); return; }
  if(/^https?:\/\//i.test(text) || (typeof looksLikeUrl === 'function' && looksLikeUrl(text) && !/\s/.test(text))){ toast('開啟：' + text.slice(0, 60)); navigate(toUrl(text)); return; }
  var body = h('div', null, h('div', {class: 'wifiUrl', style: {fontSize: '14px', userSelect: 'text'}, text: text}),
    h('div', {class: 'btn-row'}, h('button', {class: 'btn pri', html: icon('copy', 'sm') + '複製', onclick: function(){ copyText(text); }}),
      h('button', {class: 'btn', html: icon('search', 'sm') + '用這段文字搜尋', onclick: function(){ s.close(); navigate(toUrl(text)); }})));
  var s = openSheet({title: 'QR Code 的內容', icon: 'qr', body: body});
}
function qrDecodeCanvas(cv){
  try{ var c = cv.getContext('2d', {willReadFrequently: true}), d = c.getImageData(0, 0, cv.width, cv.height), r = jsQR(d.data, d.width, d.height, {inversionAttempts: 'attemptBoth'}); return r && r.data ? r.data : ''; }catch(e){ return ''; }
}
function qrScan(){
  if(isApp && NAT.has('camOk') && !NAT.call('camOk')){ NAT.call('camAsk'); toast('請允許使用相機，再按一次「掃 QR Code」'); return; }
  var video = h('video', {playsinline: '', muted: '', autoplay: ''}), stream = null, alive = true, tmr = 0, det = null, torch = false;
  var msg = h('div', {class: 'sub', style: {textAlign: 'center'}, text: '把 QR Code 放進框框裡'});
  var file = h('input', {type: 'file', accept: 'image/*', style: {display: 'none'}, onchange: async function(){
    var f = this.files && this.files[0]; if(!f) return;
    try{
      var bm = await createImageBitmap(f), sc = Math.min(1, 1600 / Math.max(bm.width, bm.height)), cv = document.createElement('canvas');
      cv.width = Math.round(bm.width * sc); cv.height = Math.round(bm.height * sc); cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
      var t = ''; if(det){ try{ var rs = await det.detect(cv); if(rs && rs[0]) t = rs[0].rawValue; }catch(e){} }
      if(!t) t = qrDecodeCanvas(cv);
      if(t) done(t); else toast('這張圖片裡找不到 QR Code', true);
    }catch(e){ toast('讀不到這張圖片', true); }
  }});
  var torchB = h('button', {class: 'btn', html: icon('torch', 'sm') + '手電筒', style: {display: 'none'}, onclick: function(){
    torch = !torch; try{ stream.getVideoTracks()[0].applyConstraints({advanced: [{torch: torch}]}); }catch(e){} this.classList.toggle('pri', torch); }});
  var swapB = h('button', {class: 'btn', html: icon('reload', 'sm') + '換鏡頭', style: {display: 'none'}, onclick: function(){ if(cams.length < 2) return; camIdx = (camIdx + 1) % cams.length; lsSet('ws.qrCam', cams[camIdx].deviceId); open(cams[camIdx].deviceId); }});
  var zoomIn = h('input', {type: 'range', min: 1, max: 4, step: 0.1, value: 1, oninput: function(){ setZoom(+this.value); }});
  var zoomRow = h('div', {class: 'qrZoom', style: {display: 'none'}}, h('span', {text: '縮小'}), zoomIn, h('span', {text: '放大'}));
  var body = h('div', null, h('div', {class: 'qrCam'}, video, h('i')), msg, zoomRow,
    h('div', {class: 'btn-row', style: {justifyContent: 'center', flexWrap: 'wrap'}}, swapB, torchB, h('button', {class: 'btn', html: icon('image', 'sm') + '從相片選', onclick: function(){ file.click(); }})), file);
  var sheet = openSheet({title: '掃 QR Code', icon: 'qr', body: body, tall: true, onClose: stop});
  var cams = [], camIdx = 0, hwZoom = false, cv = document.createElement('canvas'), busy = false;
  function halt(){ try{ if(stream) stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){} stream = null; }
  function stop(){ alive = false; clearInterval(tmr); halt(); }
  function done(t){ if(!alive) return; stop(); sheet.close(); setTimeout(function(){ qrOpenResult(t); }, 200); }
  /* 放大縮小：鏡頭本身支援就用鏡頭的變焦，不支援就把畫面放大（辨識用的還是整張畫面） */
  function setZoom(z){
    if(hwZoom){ try{ stream.getVideoTracks()[0].applyConstraints({advanced: [{zoom: z}]}); }catch(e){} }
    else video.style.transform = 'scale(' + z + ')';
  }
  /* 後鏡頭有好幾顆（廣角、主鏡頭、望遠）時，系統預設給的不一定是主鏡頭：優先用上次選的，否則挑編號最小的那顆後鏡頭 */
  function backCams(list){
    var v = list.filter(function(d){ return d.kind === 'videoinput'; });
    var b = v.filter(function(d){ return /back|rear|environment|後|背/i.test(d.label); });
    if(!b.length) b = v.filter(function(d){ return !/front|user|前/i.test(d.label); });
    var num = function(d){ var m = /(\d+)/.exec(d.label); return m ? +m[1] : 99; };
    return b.sort(function(x, y){ return num(x) - num(y); });
  }
  function open(id, first){
    halt(); torch = false; torchB.classList.remove('pri'); video.style.transform = '';
    var c = id ? {deviceId: {exact: id}} : {facingMode: {ideal: 'environment'}};
    c.width = {ideal: 1280}; c.height = {ideal: 720};
    return navigator.mediaDevices.getUserMedia({video: c, audio: false}).then(async function(s){
      if(!alive){ s.getTracks().forEach(function(t){ t.stop(); }); return; }
      stream = s; video.srcObject = s; video.play().catch(function(){});
      var tr = s.getVideoTracks()[0], cap = null;
      try{ cap = tr.getCapabilities && tr.getCapabilities(); }catch(e){}
      torchB.style.display = cap && cap.torch ? '' : 'none';
      hwZoom = !!(cap && cap.zoom && cap.zoom.max > cap.zoom.min);
      zoomIn.min = hwZoom ? cap.zoom.min : 1; zoomIn.max = hwZoom ? Math.min(cap.zoom.max, 8) : 4; zoomIn.step = hwZoom ? (cap.zoom.step || 0.1) : 0.1;
      var z0 = 1; try{ var st = tr.getSettings(); if(hwZoom && st.zoom) z0 = st.zoom; }catch(e){}
      if(hwZoom && cap.zoom.min < z0){ z0 = Math.max(cap.zoom.min, 1); setZoom(z0); }   /* 一開始盡量用 1 倍，不要預設就是放大的 */
      zoomIn.value = z0; zoomRow.style.display = '';
      if(first){
        try{
          cams = backCams(await navigator.mediaDevices.enumerateDevices());
          swapB.style.display = cams.length > 1 ? '' : 'none';
          var curId = ''; try{ curId = tr.getSettings().deviceId || ''; }catch(e){}
          var want = lsGet('ws.qrCam', ''), wi = cams.findIndex(function(d){ return d.deviceId === want; });
          if(wi < 0) wi = 0;
          camIdx = Math.max(0, cams.findIndex(function(d){ return d.deviceId === curId; }));
          if(cams.length && cams[wi].deviceId && cams[wi].deviceId !== curId){ camIdx = wi; return open(cams[wi].deviceId); }
        }catch(e){}
      }
    });
  }
  try{ if('BarcodeDetector' in window) det = new BarcodeDetector({formats: ['qr_code']}); }catch(e){ det = null; }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ msg.textContent = '這裡沒辦法開相機，請用「從相片選」。'; return; }
  tmr = setInterval(async function(){
    if(busy || !alive || !stream || video.readyState < 2 || !video.videoWidth) return;
    busy = true;
    try{
      var t = '';
      if(det){ try{ var rs = await det.detect(video); if(rs && rs[0]) t = rs[0].rawValue; }catch(e){ det = null; } }
      if(!t){
        var sc = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        cv.width = Math.round(video.videoWidth * sc); cv.height = Math.round(video.videoHeight * sc);
        cv.getContext('2d', {willReadFrequently: true}).drawImage(video, 0, 0, cv.width, cv.height);
        t = qrDecodeCanvas(cv);
      }
      if(t) done(t);
    }catch(e){}
    busy = false;
  }, 220);
  open('', true).catch(function(e){ msg.textContent = '無法開啟相機（' + ((e && e.name) || '') + '）。請到手機設定允許「網頁擷取」使用相機，或用「從相片選」。'; });
}
