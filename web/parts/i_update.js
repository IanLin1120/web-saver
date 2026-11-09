/* ============================================================
   版本與更新（與 AI 全能翻譯相同的機制）
   - version.json：最新介面版本（線上更新，不用重裝）與 APK 版本
   - apks.json：所有 APK 版本清單，可下載任一版
   ============================================================ */
/* ---------- 版本與更新（GitHub：IanLin1120/web-saver） ---------- */
var Upd = {
  gt: function(a, b){ var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for(var i = 0; i < Math.max(x.length, y.length); i++){ var p = x[i] || 0, q = y[i] || 0; if(p !== q) return p > q; } return false; },
  apk: function(){ return (isApp && NAT.call('version')) || ''; },
  autoOn: function(){ return lsGet('ws.autoUpd', true) !== false; },
  boot: function(){
    var self = this;
    try{ localStorage.removeItem('ws.otaFail'); }catch(e){}
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) self.onResume(); });
    if(!this.autoOn()) return;
    setTimeout(function(){ self.auto(); }, 4000);
  },
  auto: function(){ if(!this.autoOn() || this.isOpen()) return; lsSet('ws.updAt', Date.now()); this.check(false); },
  manifest: async function(){
    var r = await fetch(GH.pages + 'version.json?t=' + Date.now(), {cache: 'no-store'});
    if(!r.ok) throw new Error(r.status === 404 ? 'GitHub 上還沒有發布版本（請確認已開啟 GitHub Pages）' : 'HTTP ' + r.status);
    return r.json();
  },
  idb: function(){ return new Promise(function(res, rej){ var q = indexedDB.open('ws-ota', 1); q.onupgradeneeded = function(){ q.result.createObjectStore('f'); }; q.onsuccess = function(){ res(q.result); }; q.onerror = function(){ rej(q.error); }; }); },
  store: async function(html){
    var db = await this.idb();
    await new Promise(function(res, rej){ var t = db.transaction('f', 'readwrite'); t.objectStore('f').put(html, 'html'); t.oncomplete = res; t.onerror = function(){ rej(t.error); }; });
    db.close();
  },
  check: async function(manual){
    var self = this;
    function say(t){ var st = $('updSt'); if(st) st.textContent = t; }
    try{
      say('檢查中…');
      var v = await this.manifest(); lsSet('ws.updLast', {v: v, t: Date.now()});
      var apk = this.apk();
      var apkNew = isApp && apk && v.apkName && this.gt(v.apkName, apk);
      var must = isApp && v.minApk && apk && this.gt(v.minApk, apk);
      function apkDlg(must){
        say('有新版 APK v' + (v.apkName || v.app) + (must ? '（需要重新安裝）' : ''));
        self.dialog('🎉 有新版 APK v' + esc(v.apkName || v.app),
          (v.notes ? esc(v.notes) + '<br><br>' : '') + (must ? '這次是大改版（手機端程式有更新），需要安裝新的 APK。' : '手機端程式有更新，建議安裝新的 APK。') +
          (self.native() ? '按「下載並安裝」會直接在 App 裡下載，完成後跳出系統的「更新」確認；' : '') + '會直接覆蓋舊版，設定、收藏與檔案都會保留。',
          [[self.native() ? '⬇ 下載並安裝' : '⬇ 下載最新版 APK', function(){ self.installLatest(); }],
           ['稍後', function(){ if(!must) lsSet('ws.apkSnooze', {v: v.apkName, t: Date.now()}); }]]);
      }
      if(must){ apkDlg(true); return; }
      var snz = lsGet('ws.apkSnooze', null), snoozed = !manual && snz && snz.v === v.apkName && Date.now() - snz.t < 12 * 3600e3;
      if(apkNew && !this.gt(v.app, APP_VERSION)){ if(!snoozed) apkDlg(false); else say('有新版 APK v' + v.apkName); return; }
      if(!this.gt(v.app, APP_VERSION)){ say('已經是最新版本 v' + APP_VERSION); if(manual) toast('已經是最新版本 v' + APP_VERSION); return; }
      if(!isApp){
        say('有新版本 v' + v.app);
        if(manual) this.dialog('有新版本 v' + esc(v.app), '網頁版請重新整理，或開啟 GitHub 上的最新網頁版。', [['🌐 開啟網頁版', function(){ self.open(GH.pages); }], ['稍後', null]]);
        return;
      }
      say('下載新版本 v' + v.app + '…');
      var r = await fetch(GH.pages + 'index.html?t=' + Date.now(), {cache: 'no-store'});
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var html = await r.text();
      if(html.indexOf("const APP_VERSION = '" + v.app + "'") < 0 || html.length < 200000) throw new Error('下載不完整，稍後再試');
      await this.store(html); lsSet('ws.ota', {ver: v.app, minApk: v.minApk || ''});
      try{ localStorage.removeItem('ws.otaFail'); }catch(e){}
      say('已下載 v' + v.app + '，重新開啟後套用');
      this.dialog('已下載新版本 v' + esc(v.app), v.notes ? esc(v.notes) : '介面與功能更新', [['🔄 立即套用', function(){ location.reload(); }], ['下次開啟時套用', null]]);
    }catch(e){ say('無法檢查更新：' + e.message); if(manual) toast('無法檢查更新：' + e.message, true); }
  },
  releases: async function(){
    var self = this;
    this.dialog('⬇ 下載 APK', '<div id="relL" class="sub">讀取 GitHub 版本清單中…</div>', [['關閉', null]]);
    try{
      var r = await fetch(GH.pages + 'apks.json?t=' + Date.now(), {cache: 'no-store'});
      if(!r.ok) throw new Error(r.status === 404 ? '找不到版本清單（請確認已開啟 GitHub Pages）' : 'HTTP ' + r.status);
      var L = await r.json(), apk = this.apk();
      $('relL').innerHTML = L.length ? L.map(function(x, i){
        return '<div class="relR"><div class="grow"><b>v' + esc(x.v) + '</b>' + (i === 0 ? ' <span class="tyTag" style="background:#5f9a5a">最新</span>' : '') +
          (apk && x.v === apk ? ' <span class="tyTag" style="background:#a2613a">目前安裝</span>' : '') +
          '<div class="sub">' + esc(x.date || '') + (x.size ? '・' + (x.size / 1048576).toFixed(1) + ' MB' : '') + '</div>' +
          (x.notes ? '<div class="sub relN">' + esc(x.notes).replace(/\n/g, '<br>') + '</div>' : '') + '</div>' +
          '<button class="btn sm ' + (i === 0 ? 'pri' : '') + '" data-v="' + esc(x.v) + '" data-u="' + esc(GH.pages + 'apk/' + encodeURIComponent(x.file)) + '">⬇</button></div>';
      }).join('') : '<div class="sub">GitHub 上還沒有可下載的 APK</div>';
      Array.prototype.forEach.call(document.querySelectorAll('#relL [data-u]'), function(b){ b.onclick = function(){ self.install(b.dataset.u, b.dataset.v); }; });
    }catch(e){ $('relL').textContent = '⚠️ 無法讀取版本清單：' + e.message; }
  },
  open: function(u){ openExternal(u); },
  native: function(){ return !!(isApp && NAT.has('installApk')); },
  installLatest: async function(){
    try{
      var r = await fetch(GH.pages + 'apks.json?t=' + Date.now(), {cache: 'no-store'}); var L = await r.json();
      if(!L.length) throw new Error('沒有可下載的 APK');
      this.install(GH.pages + 'apk/' + encodeURIComponent(L[0].file), L[0].v);
    }catch(e){ toast('無法取得版本清單：' + e.message, true); this.releases(); }
  },
  install: function(url, v){
    var self = this;
    if(!this.native()){ this.open(url); toast('已用瀏覽器開始下載，完成後點通知安裝（直接覆蓋安裝，資料會保留）'); return; }
    if(!NAT.call('canInstall')){
      this.pend = {url: url, v: v};
      this.dialog('需要允許安裝', '第一次在 App 內更新，需要允許「網頁擷取」安裝應用程式。按「前往設定」打開「允許來自這個來源的應用程式」，回到 App 後會自動繼續下載安裝。',
        [['前往設定', function(){ NAT.call('askInstall'); }], ['改用瀏覽器下載', function(){ self.pend = null; self.open(url); }], ['取消', function(){ self.pend = null; }]]);
      return;
    }
    this.pend = null; this.instUrl = url;
    this.dialog('⬇ 更新到 v' + esc(v || ''), '<div id="apkTx" class="sub">準備下載…</div><div class="prog" style="margin-top:8px"><i id="apkBar" style="width:0%"></i></div>', [['在背景繼續', null]]);
    NAT.call('installApk', url);
  },
  onResume: function(){
    var self = this;
    if(this.autoOn() && Date.now() - lsGet('ws.updAt', 0) > 30 * 60e3) setTimeout(function(){ self.auto(); }, 1500);
    if(this.pend && this.native() && NAT.call('canInstall')){ var p = this.pend; this.pend = null; setTimeout(function(){ self.install(p.url, p.v); }, 400); }
    
  },
  onApk: function(d){
    try{ d = typeof d === 'string' ? JSON.parse(d) : d; }catch(e){ return; }
    var tx = $('apkTx'), bar = $('apkBar');
    function set(t, p){ if(tx) tx.textContent = t; if(bar && p != null) bar.style.width = Math.round(p * 100) + '%'; }
    var self = this;
    if(d.state === 'download') set(d.pct >= 0 ? '下載中 ' + Math.round(d.pct * 100) + '%' : '下載中…', d.pct >= 0 ? d.pct : null);
    else if(d.state === 'installing') set('下載完成，準備安裝…', 1);
    else if(d.state === 'confirm') set('請在系統視窗按「更新」；安裝完成後重新開啟 App 就是新版本（設定、收藏與檔案都保留）', 1);
    else if(d.state === 'done'){ set('✓ 安裝完成', 1); toast('✓ 已更新完成'); }
    else if(d.state === 'error'){
      var u = this.instUrl;
      this.dialog('更新沒有完成', esc(d.msg || '未知錯誤') + '<br><br>可以改用瀏覽器下載 APK，再點通知安裝（直接覆蓋舊版）。', [['改用瀏覽器下載', function(){ if(u) self.open(u); }], ['關閉', null]]);
    }
  },
  dialog: function(title, html, btns){
    if(this.dlg) this.dlg.close();
    this.dlg = dialog(title, html, btns.map(function(b){ return [b[0], b[1]]; }));
    return this.dlg;
  },
  isOpen: function(){ return !!(this.dlg && !this.dlg.closed); },
  closeDlg: function(){ if(this.dlg) this.dlg.close(); }
};
function renderUpdCard(){
  var self = Upd, mount = $('updMount'); if(!mount) return; mount.textContent = '';
  var last = lsGet('ws.updLast', null), apk = self.apk(), ota = window.__OTA || (lsGet('ws.ota', null) || {}).ver;
  function row(ic, t, s, fn, id){
    ic = h('span', {html: icon({'🔄': 'update', '⬇': 'download', '↩️': 'undo', '🌐': 'globe', '📦': 'github'}[ic] || 'info')});
    var sub2 = null;
    if(id){
      sub2 = h('div', {class: 'sub', id: id}, last ? '上次檢查 ' + new Date(last.t).toLocaleString('zh-TW', {hour12: false}).slice(0, -3) + (last.v && self.gt(last.v.app, APP_VERSION) ? '・有新版本 v' + last.v.app : '') : '');
    }
    return h('div', {class: 'setRow', onclick: fn}, h('span', {class: 'ic'}, ic), h('div', {class: 'grow'}, h('b', null, t), h('div', {class: 'sub'}, s), sub2), h('span', {class: 'chev'}, '›'));
  }
  var sw = h('input', {type: 'checkbox'}); sw.checked = self.autoOn(); sw.onchange = function(){ lsSet('ws.autoUpd', sw.checked); };
  var card = h('div', {class: 'card glass'},
    h('h3', {html: icon('update') + '版本與更新'}),
    h('label', {class: 'lab'}, h('span', null, '自動更新', h('span', {class: 'sub'}, '開啟 App 時從 GitHub 下載最新版介面與功能（不用重新安裝 APK）；大改版才需要下載新 APK')), h('span', {class: 'sw'}, sw, h('span'))),
    row('🔄', '檢查更新', '目前版本 v' + APP_VERSION + (isApp ? '・APK v' + (apk || '?') : '・網頁版') + (window.__OTA ? '（已線上更新）' : ''), function(){ self.check(true); }, 'updSt'),
    isApp ? row('⬇', '下載 APK 到手機', '可選最新版或任一舊版本', function(){ self.releases(); }) : null,
    isApp && (window.__OTA || ota) ? row('↩️', '還原為 APK 內建版本', '線上更新後有問題時使用（v' + (window.APP_BUILTIN || '') + '）', function(){
      self.dialog('還原為 APK 內建版本？', '會刪除線上下載的新版介面，改回這支 APK 內建的版本。設定、收藏與檔案不受影響。', [['還原', function(){ try{ localStorage.removeItem('ws.ota'); }catch(e){} location.replace(location.pathname + '#builtin'); location.reload(); }], ['取消', null]]);
    }) : null,
    row('📤', '分享這個 App', '傳下載網址給朋友：網址固定不變，打開永遠是最新版 APK', function(){
      /* 只分享網址本身 */
      var url = GH.pages + 'download.html';
      if(isApp && NAT.has('share')) NAT.call('share', '', url);
      else if(navigator.share) navigator.share({url: url}).catch(function(){});
      else { copyText(url); }
    }),
    row('🌐', '網頁版', GH.pages.replace('https://', ''), function(){ self.open(GH.pages); }),
    row('📦', 'GitHub 儲存庫', '所有版本的 APK、更新說明', function(){ self.open(GH.web); }));
  mount.appendChild(card);
}

