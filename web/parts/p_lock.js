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
    if(this.catLocked(it.cat)) return true;
    var f = LF.folderOf(it.id) || it.folder;
    return !!(f && this.folderLocked(f));
  }
};
var INTRUDER_F = 'f_intruder';
setTimeout(function(){ ensureIntruderFolder(); }, 0);

/* 需要解鎖時呼叫：回傳 Promise<是否解鎖> */
SEC.need = function(title){
  if(SEC.open()) return Promise.resolve(true);
  return new Promise(function(res){ pinPad({title: title || '輸入密碼解鎖', bio: true, onOk: function(){ res(true); fire('secChanged'); }, onCancel: function(){ res(false); }}); });
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
function buzz(ms){ try{ if(isApp && NAT.has('buzz')) NAT.call('buzz', ms); else if(navigator.vibrate) navigator.vibrate(ms < 0 ? [40, 70, 60] : ms); }catch(e){} }
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
function openSecurity(){
  var body = h('div');
  var s = openSheet({title: '隱私與安全', icon: 'key', body: body, tall: true});
  function draw(){
    body.textContent = '';
    var has = SEC.has();
    body.appendChild(h('div', {class: 'setRow', onclick: function(){ setPinFlow(); }}, h('span', {class: 'ic', html: icon('key')}),
      h('div', {class: 'grow'}, h('b', {text: has ? '更改密碼' : '設定密碼'}), h('div', {class: 'sub', text: has ? '要先輸入目前的密碼' : '6 位數字，所有上鎖的地方共用同一組密碼'})), h('span', {class: 'chev', text: '›'})));
    if(!has){ body.appendChild(h('div', {class: 'note', text: '先設定密碼，才能鎖住帳號密碼、檔案庫的分類或資料夾。'})); paintIcons(body); return; }
    if(isApp) body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: SEC.cfg.bio !== false, disabled: !bioOk(), onchange: function(){ SEC.cfg.bio = this.checked; SEC.save(); }}),
      h('div', {class: 'grow'}, h('b', {text: '可以用指紋／臉部解鎖'}), h('div', {class: 'sub', text: bioOk() ? '解鎖時自動跳出指紋，也可以改用密碼' : '這支手機沒有設定指紋或臉部辨識'}))));
    body.appendChild(h('div', {class: 'ydSect', text: '要上鎖的地方'}));
    body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: !!SEC.cfg.vault, onchange: function(){ SEC.cfg.vault = this.checked; SEC.save(); }}),
      h('div', {class: 'grow'}, h('b', {text: '帳號密碼'}), h('div', {class: 'sub', text: '查看、複製、修改已儲存的帳號密碼前要解鎖'}))));
    body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: !!SEC.cfg.bm, onchange: function(){ SEC.cfg.bm = this.checked; SEC.save(); }}),
      h('div', {class: 'grow'}, h('b', {text: '我的收藏'}), h('div', {class: 'sub', text: '打開收藏清單前要解鎖'}))));
    Object.keys(CAT).forEach(function(k){
      body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: !!SEC.cfg.cats[k], onchange: function(){ if(this.checked) SEC.cfg.cats[k] = true; else delete SEC.cfg.cats[k]; SEC.save(); fire('secChanged'); }}),
        h('div', {class: 'grow'}, h('b', {text: '檔案庫：' + (k === 'audio' ? '音樂庫' : CAT[k].name)}), h('div', {class: 'sub', text: '整個分類（包含裡面的資料夾）'}))));
    });
    var lockedF = LF.folders.filter(function(f){ return f.lock && !f.sys; });
    body.appendChild(h('div', {class: 'sub', style: {margin: '8px 2px', lineHeight: '1.6'}, text: '只鎖某個資料夾：在檔案庫的資料夾按「⋯」→「上鎖」。' + (lockedF.length ? '目前上鎖的資料夾：' + lockedF.map(function(f){ return f.name; }).join('、') : '')}));
    if(isApp && NAT.has('intruderCam')){
      body.appendChild(h('div', {class: 'ydSect', text: '入侵者拍照'}));
      body.appendChild(h('label', {class: 'opt'}, h('input', {type: 'checkbox', checked: !!NAT.call('intruderCamGet'), onchange: function(){ NAT.call('intruderCam', this.checked); if(this.checked && !NAT.call('camOk')) NAT.call('camAsk'); }}),
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
