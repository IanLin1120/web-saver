/* ============================================================
   上鎖：數字密碼（至少 6 碼）＋指紋解鎖
   可以鎖：帳號密碼、檔案庫的整個分類（網頁、影片…）、單一資料夾
   解鎖一次後，直到 App 被關掉前都不用再輸入；沒解鎖時其他功能照常使用
   連續輸錯 3 次：前鏡頭拍照，存進上鎖、不能刪除的「入侵者照片」資料夾，下次打開 App 時提醒
   ============================================================ */
var SEC = {
  cfg: Object.assign({cats: {}, vault: true, bm: false}, lsGet('ws.sec', {})),
  webOk: false,
  save: function(){ lsSet('ws.sec', this.cfg); },
  has: function(){ return isApp && NAT.has('lockHas') ? !!NAT.call('lockHas') : !!lsGet('ws.secPin', ''); },
  open: function(){ return !this.has() || (isApp && NAT.has('lockSession') ? !!NAT.call('lockSession') : this.webOk); },
  catLocked: function(cat){ return !!this.cfg.cats[cat]; },
  folderLocked: function(fid){
    if(fid === INTRUDER_F) return true;
    var g = 0;
    for(var f = LF.get(fid); f && g++ < 50; f = LF.get(f.parent)) if(f.lock || f.id === INTRUDER_F) return true;
    return false;
  },
  /* 這個檔案目前要不要藏起來（有鎖而且還沒解鎖） */
  hidden: function(it){
    if(!it || this.open()) return false;
    if(this.catLocked(typeof areaOf === 'function' ? areaOf(it) : it.cat)) return true;
    var f = LF.folderOf(it.id) || it.folder;
    return !!(f && this.folderLocked(f));
  }
};
var INTRUDER_F = 'f_intruder';
/* 這個檔案有沒有上鎖（不論現在是否已解鎖）：入侵者照片、上鎖的分類、上鎖的資料夾（含上層） */
SEC.itemLocked = function(it){
  if(!it) return false;
  if(it.sys === 'intruder' || it.folder === INTRUDER_F) return true;
  if(this.catLocked(typeof areaOf === 'function' ? areaOf(it) : it.cat)) return true;
  var f = (typeof LF !== 'undefined' && LF.folderOf(it.id)) || it.folder;
  return !!(f && this.folderLocked(f));
};
/* 刪除前檢查：只要有一個是上鎖的，就要先輸入密碼（或指紋）才能刪；回傳 Promise<可不可以刪> */
SEC.guardDel = function(ids, what){
  if(!SEC.has()) return Promise.resolve(true);
  var lk = (ids || []).some(function(id){ return SEC.itemLocked(typeof id === 'object' ? id : Lib.byId(id)); });
  if(!lk) return Promise.resolve(true);
  return SEC.verify(what || '刪除上鎖的檔案，請輸入密碼');
};
setTimeout(function(){ ensureIntruderFolder(); }, 0);

/* 需要解鎖時呼叫：回傳 Promise<是否解鎖> */
SEC.need = function(title){
  if(SEC.open()) return Promise.resolve(true);
  return new Promise(function(res){ pinPad({title: title || '輸入密碼解鎖', bio: true, onOk: function(){ res(true); fire('secChanged'); }, onCancel: function(){ res(false); }}); });
};

/* 每次都要驗證（帳號密碼專用）：就算這次已經解鎖過，也要再輸入密碼或指紋 */
SEC.verify = function(title){
  if(!SEC.has()) return new Promise(function(res){
    dialog('先設定密碼', '要保護帳號密碼，請先設定一組 6 位數密碼（之後每次查看、複製、修改都要輸入密碼或指紋）。', [['設定密碼', function(){ setPinFlow(); res(false); }], ['取消', function(){ res(false); }, '']]);
  });
  /* 只驗證這一次：不能因為看了一組密碼，就把檔案庫和收藏的鎖一起解開 */
  var wasOpen = SEC.open();
  return new Promise(function(res){ pinPad({title: title || '驗證身分', bio: true, onOk: function(){ if(!wasOpen){ if(isApp && NAT.has('lockRelock')) NAT.call('lockRelock'); else SEC.webOk = false; } res(true); }, onCancel: function(){ res(false); }}); });
};

/* 數字鍵盤（像手機鎖屏） */
function pinPad(o){
  var pin = '', done = false;
  var dots = h('div', {class: 'pinDots'});
  var msg = h('div', {class: 'pinMsg', text: o.msg || (o.mode === 'new' ? '至少 6 位數字' : '')});
  var keys = h('div', {class: 'pinKeys'});
  function paint(){ dots.textContent = ''; for(var i = 0; i < Math.max(6, pin.length); i++) dots.appendChild(h('i', {class: i < pin.length ? 'on' : ''})); }
  /* 輸入到密碼長度就自動確認（新密碼固定 6 位） */
  var target = o.mode === 'new' ? 6 : (isApp && NAT.has('lockLen') ? (NAT.call('lockLen') || 0) : (lsGet('ws.secLen', 0) || 0));
  function press(k){
    buzz(12);
    if(k === 'del'){ pin = pin.slice(0, -1); paint(); return; }
    if(k === 'ok'){ submit(); return; }
    if(k === 'bio'){ bio(); return; }
    if(pin.length >= 16) return;
    pin += k; paint();
    if(target && pin.length === target) setTimeout(submit, 120);
  }
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].forEach(function(k){
    var lab = k === 'del' ? icon('back') : k === 'bio' ? (o.bio && bioOk() ? icon('fingerprint') : '') : k;
    keys.appendChild(h('button', {class: 'pinKey' + (k === 'bio' && !(o.bio && bioOk()) ? ' ghost' : ''), html: lab, onclick: function(){ press(k); }}));
  });
  var okB = h('button', {class: 'btn pri block', text: o.okText || '確定', onclick: submit});
  if(target) okB.style.display = 'none';
  var body = h('div', {class: 'pinBox'}, h('div', {class: 'pinLock', html: icon('key', 'lg')}), dots, msg, keys);
  var s = openSheet({title: o.title || '輸入密碼', icon: 'key', body: body, foot: target ? null : okB, onClose: function(){ if(!done && o.onCancel) o.onCancel(); }});
  paint(); paintIcons(body);
  function fail(t){ buzz(260); msg.textContent = t; msg.classList.add('err'); body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); pin = ''; paint(); if(navigator.vibrate) navigator.vibrate(60); }
  function finish(v){ done = true; if(o.mode !== 'new') buzz(-1); else buzz(25); s.close(); if(o.onOk) o.onOk(v); }
  async function submit(){
    if(pin.length < 6){ fail('至少要 6 位數字'); return; }
    if(o.mode === 'new'){ finish(pin); return; }
    if(isApp && NAT.has('lockCheck')){
      var r = NAT.json('lockCheck', pin) || {};
      if(r.ok){ finish(pin); return; }
      if(r.wait){ var sec = Math.ceil(r.wait / 1000); fail('輸錯太多次，請 ' + (sec >= 60 ? Math.ceil(sec / 60) + ' 分鐘' : sec + ' 秒') + '後再試'); return; }
      fail('密碼錯誤' + (r.fails ? '（已錯 ' + r.fails + ' 次）' : ''));
    } else {
      if(await sha(pin) === lsGet('ws.secPin', '')){ SEC.webOk = true; finish(pin); } else fail('密碼錯誤');
    }
  }
  function bio(){
    if(!(o.bio && bioOk())) return;
    var off = function(d){ BUS.lockBio = (BUS.lockBio || []).filter(function(f){ return f !== off; }); if(d && d.ok) finish(''); };
    on('lockBio', off);
    NAT.call('lockBio', o.title || '解鎖');
  }
  if(o.bio && bioOk() && o.mode !== 'new' && SEC.cfg.bio !== false) setTimeout(bio, 250);
}
/* 震動：依設定的強度（關／輕／中／強）放大時間與力道 */
function buzz(ms){
  try{
    var lv = typeof CFG !== 'undefined' && CFG.haptic != null ? +CFG.haptic : 2;
    if(lv <= 0) return;
    if(ms >= 0){
      var k = [0, 1, 1.7, 2.6][lv], amp = [0, 80, 170, 255][lv];
      ms = Math.round(Math.max(8, ms * k));
      if(isApp && NAT.has('buzzAmp')){ NAT.call('buzzAmp', ms, amp); return; }
    }
    if(isApp && NAT.has('buzz')) NAT.call('buzz', ms); else if(navigator.vibrate) navigator.vibrate(ms < 0 ? [40, 70, 60] : ms);
  }catch(e){}
}
function bioOk(){ return isApp && NAT.has('lockBioOk') && !!NAT.call('lockBioOk'); }
async function sha(t){ var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ws:' + t)); return Array.from(new Uint8Array(b)).map(function(x){ return ('0' + x.toString(16)).slice(-2); }).join(''); }

/* 設定密碼：輸入兩次；已經有密碼要先輸入舊密碼 */
function setPinFlow(){
  var had = SEC.has();
  function ask(old){
    pinPad({title: '設定新密碼', mode: 'new', msg: '輸入 6 位數字', okText: '下一步', onOk: function(p1){
      pinPad({title: '再輸入一次新密碼', mode: 'new', okText: '完成', onOk: async function(p2){
        if(p1 !== p2){ toast('兩次輸入的密碼不一樣，請重新設定', true); return; }
        if(isApp && NAT.has('lockSet')){ var e = NAT.call('lockSet', old || '', p1); if(e){ toast(e, true); return; } }
        else { lsSet('ws.secPin', await sha(p1)); lsSet('ws.secLen', p1.length); SEC.webOk = true; }
        toast(had ? '✓ 已更改密碼' : '✓ 已設定密碼'); ensureIntruderFolder(); fire('secChanged');
        if(!had && isApp && NAT.has('camAsk') && !NAT.call('camOk')) setTimeout(function(){
          dialog('入侵者拍照', '有人連續輸錯 3 次密碼時，要用前鏡頭拍下他嗎？需要允許相機權限（只在輸錯時拍一張，照片存在上鎖的資料夾）。', [['允許', function(){ NAT.call('camAsk'); }], ['不用', function(){ NAT.call('intruderCam', false); }, '']]);
        }, 400);
      }});
    }});
  }
  if(!had){ ask(''); return; }
  /* 修改前先輸入正確的舊密碼（不能用指紋） */
  pinPad({title: '先輸入目前的密碼', okText: '下一步', onOk: function(old){ ask(old); }});
}

/* 入侵者照片資料夾：固定存在、上鎖、不能刪除 */
function ensureIntruderFolder(){
  if(LF.get(INTRUDER_F)) return;
  LF.folders.push({id: INTRUDER_F, cat: 'image', parent: '', name: '入侵者照片', order: -1, icon: '📷', lock: true, sys: true});
  LF.save();
}

/* 設定頁的「隱私與安全」 */
/* 取消打勾（解除上鎖、關掉保護）一定要再驗證一次密碼或指紋；打勾（加鎖）不用 */
function lockToggle(on, apply){
  return function(){
    var cb = this;
    if(cb.checked){ apply(true); return; }
    cb.checked = true;
    SEC.verify('解除上鎖要先驗證').then(function(ok){ if(ok){ cb.checked = false; apply(false); toast('已解除'); } });
  };
}
function openSecurity(){
  var body = h('div');
  var s = openSheet({title: '隱私與安全', icon: 'key', body: body, tall: true});
  function draw(){
    body.textContent = '';
    var has = SEC.has();
    body.appendChild(h('div', {class: 'setRow', onclick: function(){ setPinFlow(); }}, h('span', {class: 'ic', html: icon('key')}),
      h('div', {class: 'grow'}, h('b', {text: has ? '更改密碼' : '設定密碼'}), h('div', {class: 'sub', text: has ? '要先輸入目前的密碼' : '6 位數字，所有上鎖的地方共用同一組密碼'})), h('span', {class: 'chev', text: '›'})));
    if(!has){ body.appendChild(h('div', {class: 'note', text: '先設定密碼，才能鎖住帳號密碼、檔案庫的分類或資料夾。'})); paintIcons(body); return; }
    if(isApp) body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: SEC.cfg.bio !== false, disabled: !bioOk(), onchange: lockToggle(0, function(v){ SEC.cfg.bio = v; SEC.save(); })}),
      h('div', {class: 'grow'}, h('b', {text: '可以用指紋／臉部解鎖'}), h('div', {class: 'sub', text: bioOk() ? '解鎖時自動跳出指紋，也可以改用密碼' : '這支手機沒有設定指紋或臉部辨識'}))));
    body.appendChild(h('div', {class: 'ydSect', text: '要上鎖的地方'}));
    body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: true, disabled: true}),
      h('div', {class: 'grow'}, h('b', {text: '帳號密碼（每一組都要單獨驗證）'}), h('div', {class: 'sub', text: '固定開啟：每次查看、複製、修改任何一組密碼，都要重新輸入密碼或指紋；離開畫面就馬上鎖回去'}))));
    body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: !!SEC.cfg.trash, onchange: lockToggle(0, function(v){ SEC.cfg.trash = v; SEC.save(); })}),
      h('div', {class: 'grow'}, h('b', {text: '垃圾桶'}), h('div', {class: 'sub', text: '打開檔案庫或收藏的垃圾桶（還原、永久刪除）前要解鎖'}))));
    body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: !!SEC.cfg.bm, onchange: lockToggle(0, function(v){ SEC.cfg.bm = v; SEC.save(); fire('secChanged'); })}),
      h('div', {class: 'grow'}, h('b', {text: '整個我的收藏'}), h('div', {class: 'sub', text: '打開收藏清單前要解鎖。只想鎖某個收藏夾（例如「社交」）：在「我的收藏 → 右上角鉛筆（管理收藏夾）」按那個收藏夾的鎖頭'}))));
    Object.keys(CAT).forEach(function(k){
      body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: !!SEC.cfg.cats[k], onchange: lockToggle(0, function(v){ if(v) SEC.cfg.cats[k] = true; else delete SEC.cfg.cats[k]; SEC.save(); fire('secChanged'); })}),
        h('div', {class: 'grow'}, h('b', {text: '檔案庫：' + (k === 'audio' ? '音樂庫' : CAT[k].name)}), h('div', {class: 'sub', text: '整個分類（包含裡面的資料夾）'}))));
    });
    var lockedF = LF.folders.filter(function(f){ return f.lock && !f.sys; });
    body.appendChild(h('div', {class: 'sub', style: {margin: '8px 2px', lineHeight: '1.6'}, text: '只鎖某個資料夾：在檔案庫的資料夾按「⋯」→「上鎖」。' + (lockedF.length ? '目前上鎖的資料夾：' + lockedF.map(function(f){ return f.name; }).join('、') : '')}));
    if(isApp && NAT.has('intruderCam')){
      body.appendChild(h('div', {class: 'ydSect', text: '入侵者拍照'}));
      body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: !!NAT.call('intruderCamGet'), onchange: lockToggle(0, function(v){ NAT.call('intruderCam', v); if(v && !NAT.call('camOk')) NAT.call('camAsk'); })}),
        h('div', {class: 'grow'}, h('b', {text: '連續輸錯 3 次時用前鏡頭拍照'}), h('div', {class: 'sub', text: NAT.call('camOk') ? '照片存在上鎖的「圖片 → 入侵者照片」資料夾' : '需要相機權限（勾選後會詢問）'}))));
    }
    body.appendChild(h('div', {class: 'btn-row', style: {marginTop: '10px'}},
      h('button', {class: 'btn', html: icon('key', 'sm') + '立即上鎖', onclick: function(){ if(isApp) NAT.call('lockRelock'); SEC.webOk = false; fire('secChanged'); toast('已上鎖'); }}),
      h('button', {class: 'btn ghost', text: '移除密碼', onclick: function(){
        pinPad({title: '輸入密碼以移除', onOk: function(p){
          if(isApp && NAT.has('lockClear')){ if(!NAT.call('lockClear', p)){ toast('密碼錯誤', true); return; } } else localStorage.removeItem('ws.secPin');
          toast('已移除密碼，所有上鎖都已解除'); fire('secChanged'); draw();
        }});
      }})));
    paintIcons(body);
  }
  draw();
  on('secChanged', function(){ if(!s.closed) draw(); });
}

/* 檔案庫有變化（上鎖／解鎖）時重畫 */
on('secChanged', function(){ if(typeof renderLib === 'function'){ renderLib(); } });
/* 新的入侵者照片 */
on('intruder', function(){ ensureIntruderFolder(); });

/* 打開 App 時：有人輸錯密碼就提醒 */
setTimeout(function(){
  ensureIntruderFolder();
  if(!isApp || !NAT.has('intruderPending')) return;
  var n = NAT.call('intruderPending');
  if(n > 0){
    NAT.call('intruderNotify');
    dialog('⚠️ 有人在動你的軟體', '有人連續輸錯密碼，已用前鏡頭拍下 ' + n + ' 張照片。請確認照片（要先輸入密碼）。<br><span class="sub">確認過後就不會再提醒；有新的照片才會再通知。</span>', [
      ['查看照片', async function(){ if(await SEC.need('查看入侵者照片')){ NAT.call('intruderSeen'); showView('lib'); LV.open = true; setCfg('lib.cat', 'image'); LV.folder.image = INTRUDER_F; renderLib(); } }],
      ['我知道了', function(){ NAT.call('intruderSeen'); }, ''],
      ['稍後再看', null, '']]);
  }
}, 1500);

/* 打開「入侵者照片」資料夾就算已經確認，不再提醒 */
on('secChanged', function(){});
function intruderOpened(){ if(isApp && NAT.has('intruderSeen') && NAT.call('intruderPending') > 0) NAT.call('intruderSeen'); }
