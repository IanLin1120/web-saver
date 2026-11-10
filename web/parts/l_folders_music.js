/* ============================================================
   檔案庫資料夾（每個種類各自的資料夾樹，可新增／刪除／改名／排序／移到其他母資料夾）
   ＋ 音樂庫（播放清單、迷你播放器、全螢幕播放器）
   ============================================================ */
var LF = lsGet('ws.lf', null) || {folders: [], map: {}};
LF.save = function(){ lsSet('ws.lf', {folders: LF.folders, map: LF.map}); };
LF.get = function(id){ return LF.folders.filter(function(f){ return f.id === id; })[0] || null; };
LF.children = function(cat, parent){
  var L = LF.folders.filter(function(f){ return f.cat === cat && (f.parent || '') === (parent || ''); });
  var m = CFG.lib.fsort || 'manual';
  L.sort(function(a, b){ return m === 'name' ? a.name.localeCompare(b.name, 'zh-Hant', {numeric: true}) : (a.order || 0) - (b.order || 0); });
  return L;
};
LF.path = function(id){ var out = [], f = LF.get(id), g = 0; while(f && g++ < 50){ out.unshift(f); f = LF.get(f.parent); } return out; };
LF.isAncestor = function(a, b){ var f = LF.get(b), g = 0; while(f && g++ < 50){ if(f.id === a) return true; f = LF.get(f.parent); } return false; };
LF.folderOf = function(itemId){ var f = LF.map[itemId]; return f && LF.get(f) ? f : ''; };
LF.descendants = function(id){ var out = [id]; LF.folders.forEach(function(f){ if(f.parent === id) out = out.concat(LF.descendants(f.id)); }); return out; };
LF.count = function(id){ var ds = LF.descendants(id); return Lib.items.filter(function(it){ return ds.indexOf(LF.folderOf(it.id)) >= 0; }).length; };
LF.add = function(cat, parent, name){
  var sib = LF.children(cat, parent);
  var f = {id: 'd' + uid(), cat: cat, parent: parent || '', name: name.slice(0, 40), order: sib.length ? Math.max.apply(null, sib.map(function(x){ return x.order || 0; })) + 1 : 0, icon: '📁'};
  LF.folders.push(f); LF.save(); return f;
};
LF.remove = function(id){
  var f = LF.get(id); if(!f) return;
  LF.folders.forEach(function(x){ if(x.parent === id) x.parent = f.parent; });
  Object.keys(LF.map).forEach(function(k){ if(LF.map[k] === id) LF.map[k] = f.parent; });
  LF.folders = LF.folders.filter(function(x){ return x.id !== id; }); LF.save();
};
LF.move = function(id, parent){
  if(id === parent || LF.isAncestor(id, parent)) return false;
  var f = LF.get(id); f.parent = parent || '';
  var sib = LF.children(f.cat, f.parent).filter(function(x){ return x !== f; });
  f.order = sib.length ? Math.max.apply(null, sib.map(function(x){ return x.order || 0; })) + 1 : 0;
  LF.save(); return true;
};
LF.shift = function(id, dir){
  var f = LF.get(id), sib = LF.children(f.cat, f.parent);
  sib.forEach(function(x, i){ x.order = i; });
  var i = sib.indexOf(f), j = i + dir;
  if(j < 0 || j >= sib.length) return;
  sib[i].order = j; sib[j].order = i; LF.save();
};
LF.setItems = function(ids, fid){ ids.forEach(function(id){ if(fid) LF.map[id] = fid; else delete LF.map[id]; }); LF.save(); if(isApp) ids.forEach(function(id){ NAT.call('libMeta', id, JSON.stringify({folder: fid || ''})); }); };
LF.pickDefault = function(){ return ''; };
on('libChanged', function(){
  /* 清掉已刪除檔案的對應；原生紀錄的資料夾補回來 */
  var ids = {}; (Lib.all || Lib.items).forEach(function(it){ ids[it.id] = 1; if(it.folder && !LF.map[it.id] && LF.get(it.folder)) LF.map[it.id] = it.folder; });
  var ch = false; Object.keys(LF.map).forEach(function(k){ if(!ids[k]){ delete LF.map[k]; ch = true; } });
  if(ch) LF.save();
});
/* 資料夾樹選擇器 */
function folderPicker(cat, title, cb, opts){
  opts = opts || {};
  var box = h('div', {class: 'opts'});
  var s = openSheet({title: title, icon: 'folder', body: box, foot: h('button', {class: 'btn', html: icon('plus', 'sm') + '新增資料夾', onclick: async function(){
    var n = await promptDlg('新增資料夾', '', '資料夾名稱'); if(n){ LF.add(cat, '', n); draw(); }
  }})});
  function rowFor(f, depth){
    var bad = opts.exclude && (f.id === opts.exclude || LF.isAncestor(opts.exclude, f.id));
    box.appendChild(h('div', {class: 'opt' + (opts.cur === f.id ? ' on' : ''), style: {marginLeft: (depth * 18) + 'px', opacity: bad ? .4 : 1}, onclick: function(){ if(bad){ toast('不能移到自己或自己的子資料夾裡', true); return; } s.close(); cb(f.id); }},
      h('span', {class: 'oi', text: f.icon || '📁', style: {fontSize: '18px'}}), h('div', {class: 'grow'}, h('b', {text: f.name}), h('div', {class: 'sub', text: LF.count(f.id) + ' 個檔案'}))));
    LF.children(cat, f.id).forEach(function(c){ rowFor(c, depth + 1); });
  }
  function draw(){
    box.textContent = '';
    box.appendChild(h('div', {class: 'opt' + (opts.cur === '' ? ' on' : ''), onclick: function(){ s.close(); cb(''); }}, h('span', {class: 'oi', html: icon('home')}), h('div', {class: 'grow'}, h('b', {text: (CAT[cat] || CAT.other).name + '（最上層）'}))));
    LF.children(cat, '').forEach(function(f){ rowFor(f, 1); });
  }
  draw();
}
function folderMenu(f, redraw){
  if(f.sys){
    menu(f.icon + ' ' + f.name, [['key', '這是系統資料夾', function(){}, false, '固定上鎖、不能刪除；裡面的照片可以個別刪除']]);
    return;
  }
  var lockItem = ['key', f.lock ? '解除上鎖' : '上鎖', async function(){
    if(!SEC.has()){ dialog('還沒有設定密碼', '要先設定一組密碼，才能把資料夾鎖起來。', [['設定密碼', function(){ setPinFlow(); }], ['取消', null, '']]); return; }
    if(!(await (f.lock ? SEC.verify('解除「' + f.name + '」的上鎖') : SEC.need('上鎖「' + f.name + '」')))) return;
    f.lock = !f.lock; LF.save(); toast(f.lock ? '🔒 已上鎖「' + f.name + '」（離開 App 後要密碼才能打開）' : '已解除上鎖'); redraw();
  }, false, f.lock ? '' : '裡面的檔案和子資料夾都要密碼才能看'];
  menu(f.icon + ' ' + f.name, [lockItem,
    ['edit', '重新命名', async function(){ var n = await promptDlg('重新命名資料夾', f.name); if(n){ f.name = n.slice(0, 40); LF.save(); redraw(); } }],
    ['folder', '移到其他資料夾下', function(){ folderPicker(f.cat, '把「' + f.name + '」移到…', function(pid){ if(LF.move(f.id, pid)){ toast('已移動'); redraw(); } }, {exclude: f.id, cur: f.parent}); }, false, '可以變成某個資料夾的子資料夾'],
    ['back', '往前排', function(){ LF.shift(f.id, -1); setCfg('lib.fsort', 'manual'); redraw(); }],
    ['fwd', '往後排', function(){ LF.shift(f.id, 1); setCfg('lib.fsort', 'manual'); redraw(); }],
    ['palette', '換圖示', function(){ iconPicker('「' + f.name + '」的圖示', f.icon, function(ic){ f.icon = ic; LF.save(); redraw(); }); }],
    ['trash', '刪除資料夾', async function(){
      var n = LF.count(f.id);
      if(await confirmDlg('刪除「' + esc(f.name) + '」？', n ? '裡面的 ' + n + ' 個檔案與子資料夾會移到上一層，<b>檔案不會被刪除</b>。' : '這個資料夾是空的。', '刪除資料夾', true)){ if(LV.folder[f.cat] === f.id) LV.folder[f.cat] = f.parent; LF.remove(f.id); redraw(); }
    }, true]
  ]);
}

/* ============================================================
   音樂庫
   ============================================================ */
var Music = {el: new Audio(), queue: [], idx: -1, shuffle: lsGet('ws.mShuffle', false), repeat: lsGet('ws.mRepeat', 'all'), sheet: null};
Music.el.preload = 'auto';
Music.cur = function(){ return this.queue[this.idx] || null; };
Music.playList = async function(items, start){
  this.queue = items.slice(); this.idx = Math.max(0, start || 0);
  if(this.shuffle){ var first = this.queue.splice(this.idx, 1)[0]; this.queue.sort(function(){ return Math.random() - .5; }); this.queue.unshift(first); this.idx = 0; }
  await this.load(true);
};
Music.playItem = function(it){
  var L = musicItems();
  var i = L.findIndex(function(x){ return x.id === it.id; });
  if(i < 0){ L = [it]; i = 0; }
  this.playList(L, i);
  /* 等這次點擊結束再開，避免同一下點擊落在面板背景上把它關掉（看起來像閃退） */
  var self = this; setTimeout(function(){ self.openPlayer(); }, 60);
};
Music.load = async function(play){
  var it = this.cur(); if(!it) return;
  try{ this.el.src = await Lib.src(it); if(play) await this.el.play(); }catch(e){ if(play) toast('無法播放：' + it.name, true); }
  this.mini();
  if(CFG.lyr && CFG.lyr.auto && !Lyrics.of(it) && !it.lrcOff){ var self0 = this; Lyrics.auto(it).then(function(l){ if(l && self0.cur() === it) self0.drawPlayer(); }).catch(function(){}); }
  if('mediaSession' in navigator) try{
    navigator.mediaSession.metadata = new MediaMetadata({title: songTitle(it), artist: it.artist || '', artwork: Lib.thumb(it) ? [{src: Lib.thumb(it), sizes: '360x360', type: 'image/jpeg'}] : []});
    navigator.mediaSession.setActionHandler('nexttrack', function(){ Music.next(); });
    navigator.mediaSession.setActionHandler('previoustrack', function(){ Music.prev(); });
  }catch(e){}
  this.drawPlayer();
};
Music.toggle = function(){ if(!this.cur()) return; if(this.el.paused) this.el.play(); else this.el.pause(); };
Music.next = function(auto){
  if(!this.queue.length) return;
  if(auto && this.repeat === 'one'){ this.el.currentTime = 0; this.el.play(); return; }
  if(this.idx < this.queue.length - 1) this.idx++;
  else if(this.repeat === 'all' || !auto) this.idx = 0;
  else { this.el.pause(); this.mini(); return; }
  this.load(true);
};
Music.prev = function(){ if(this.el.currentTime > 4){ this.el.currentTime = 0; return; } this.idx = (this.idx - 1 + this.queue.length) % this.queue.length; this.load(true); };
Music.stop = function(){ this.el.pause(); this.el.removeAttribute('src'); this.queue = []; this.idx = -1; Dock.remove('music'); if(this.sheet) this.sheet.close(); };
Music.el.addEventListener('ended', function(){ Music.next(true); });
/* 播放中讓 App 在背景繼續執行（切到主畫面、關螢幕也不會停） */
Music.el.addEventListener('play', function(){ var it = Music.queue[Music.idx]; if(isApp) NAT.call('keep', 'music', '正在播放：' + (it ? (it.title || it.name) : '音樂')); });
Music.el.addEventListener('pause', function(){ if(isApp && !Music.el.ended) NAT.call('keep', 'music', ''); });
on('mediaCmd', function(c){
  if(!Music.queue.length) return;
  if(c === 'toggle'){ if(Music.el.paused) Music.el.play(); else Music.el.pause(); }
  else if(c === 'next') Music.next();
});
if('mediaSession' in navigator){
  try{
    navigator.mediaSession.setActionHandler('play', function(){ Music.el.play(); });
    navigator.mediaSession.setActionHandler('pause', function(){ Music.el.pause(); });
    navigator.mediaSession.setActionHandler('nexttrack', function(){ Music.next(); });
    navigator.mediaSession.setActionHandler('previoustrack', function(){ if(Music.prev) Music.prev(); });
  }catch(e){}
}
['play', 'pause'].forEach(function(ev){ Music.el.addEventListener(ev, function(){ Music.mini(); Music.drawPlayer(); }); });
Music.el.addEventListener('timeupdate', function(){
  var t = Music.el.currentTime, d = Music.el.duration || 0;
  var pb = $('mpProg'); if(pb && !pb.__drag){ pb.max = d || 1; pb.value = t; }
  var a = $('mpT1'), b = $('mpT2'); if(a){ a.textContent = fmtDur(t); b.textContent = fmtDur(d); }
  var mb = $('miniBar'); if(mb) mb.style.width = (d ? 100 * t / d : 0) + '%';
  var ml = $('miniLyr'); if(ml){ var cl = currentLyric(); var cur = Music.cur(); ml.textContent = cl || (cur && cur.artist) || '音樂庫'; }
});
function songTitle(it){ return (it.title && it.title !== it.name ? it.title : it.name.replace(/\.[^.]+$/, '')); }
function musicItems(){ return Lib.items.filter(function(it){ return it.cat === 'audio' && areaOf(it) === 'audio' && !SEC.hidden(it); }).sort(function(a, b){ return b.time - a.time; }); }
Music.mini = function(){
  var it = this.cur(); if(!it){ Dock.remove('music'); return; }
  var th = Lib.thumb(it), playing = !this.el.paused;
  Dock.set('music', h('div', {class: 'dockCard glass', style: {padding: '6px 8px', position: 'relative', overflow: 'hidden'}, onclick: function(){ Music.openPlayer(); }},
    h('div', {class: 'lrow', style: {padding: 0, border: 0, background: 'none', flex: 1, minWidth: 0}},
      h('div', {class: 'th', style: Object.assign({width: '40px', height: '40px', borderRadius: '10px'}, th ? {backgroundImage: 'url("' + th + '")'} : {background: 'var(--c-audio)'}), html: th ? '' : icon('audio')}),
      h('div', {class: 't'}, h('b', {text: songTitle(it)}), h('div', {class: 'sub ell', id: 'miniLyr', text: it.artist || '音樂庫'}))),
    h('button', {class: 'ib', html: '<svg class="i fill" viewBox="0 0 24 24">' + (playing ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : IC.play) + '</svg>', onclick: function(e){ e.stopPropagation(); Music.toggle(); }}),
    h('button', {class: 'ib', html: icon('fwd'), onclick: function(e){ e.stopPropagation(); Music.next(); }}),
    h('button', {class: 'ib', html: icon('x', 'sm'), onclick: function(e){ e.stopPropagation(); Music.stop(); }}),
    h('div', {style: {position: 'absolute', left: 0, bottom: 0, height: '3px', background: 'var(--accent)', width: '0%'}, id: 'miniBar'})));
};
Music.openPlayer = function(){
  if(this.sheet && !this.sheet.closed) return;
  var body = h('div', {id: 'mpBody'});
  this.sheet = openSheet({title: '正在播放', icon: 'audio', body: body, tall: true, onClose: function(){ Music.sheet = null; }});
  this.drawPlayer();
};
Music.drawPlayer = function(){
  var body = $('mpBody'); if(!body || !this.sheet || this.sheet.closed) return;
  var it = this.cur(); body.textContent = '';
  if(!it){ body.appendChild(h('div', {class: 'empty', text: '沒有播放中的歌曲'})); return; }
  var th = Lib.thumb(it), playing = !this.el.paused, self = this;
  var showLyr = CFG.lyr.show !== false && CFG.lyr.view !== 'cover' && !it.lrcOff;
  var stage = h('div', {class: 'mpStage'});
  if(showLyr) LyrView.mount(stage, it);
  else stage.appendChild(h('div', {class: 'art', style: th ? {backgroundImage: 'url("' + th + '")'} : null, html: th ? '' : icon('audio', 'lg'), onclick: function(){ CFG.lyr.view = 'lyrics'; CFG.lyr.show = true; saveCfg(); self.drawPlayer(); }}));
  body.appendChild(stage);
  body.appendChild(h('div', {class: 'row', style: {gap: '10px', marginTop: '10px'}},
    h('div', {class: 'th', style: Object.assign({width: '46px', height: '46px', borderRadius: '12px', flex: 'none', backgroundSize: 'cover'}, th ? {backgroundImage: 'url("' + th + '")'} : {background: 'var(--c-audio)'})}),
    h('div', {class: 'grow'}, h('b', {text: songTitle(it), style: {fontSize: '17px', display: 'block'}, class: 'ell'}), h('div', {class: 'sub ell', text: (it.artist || '') + '・' + (it.name.split('.').pop() || '').toUpperCase() + '・' + fmtSize(it.size) + (it.lrcSrc ? '・歌詞：' + it.lrcSrc.split('：')[0] : '')}))));
  var tb = h('div', {class: 'mpTools'});
  var tbtn = function(ic, label, fn, on){ tb.appendChild(h('button', {class: 'chip' + (on ? ' pri' : ''), style: on ? null : {background: 'var(--surface-3)', color: 'var(--text)', border: '1px solid var(--border-soft)'}, html: icon(ic, 'sm') + label, onclick: fn})); };
  tbtn(showLyr ? 'image' : 'type', showLyr ? '封面' : '歌詞', function(){ CFG.lyr.view = showLyr ? 'cover' : 'lyrics'; if(!showLyr) CFG.lyr.show = true; saveCfg(); self.drawPlayer(); });
  tbtn('search', '找歌詞', function(){ delete it.lrcOff; if(isApp) NAT.call('libMeta', it.id, JSON.stringify({lrcOff: false})); lyricsSearchSheet(it, function(){ self.drawPlayer(); }); });
  if(Lyrics.of(it)) tbtn('trash', '移除歌詞', async function(){
    if(!await confirmDlg('移除這首歌的歌詞？', '歌詞抓錯時用：移除後這首歌不會再自動找歌詞，之後可以按「找歌詞」手動選正確的。', '移除', true)) return;
    Lyrics.save(it, '', ''); it.lrcOff = true;
    var li = Lib.byId(it.id); if(li) li.lrcOff = true;
    if(isApp) NAT.call('libMeta', it.id, JSON.stringify({lrcOff: true}));
    toast('已移除歌詞'); self.drawPlayer();
  });
  tbtn('palette', '樣式', function(){ lyricsStyleSheet(function(){ if(LyrView.el) LyrView.el.setAttribute('style', lyrStyle()); }); });
  if(Lyrics.isSynced(Lyrics.of(it))){
    tbtn('back', '早 0.5 秒', function(){ it.lrcOffset = Math.round(((it.lrcOffset || 0) - 0.5) * 10) / 10; if(isApp) NAT.call('libMeta', it.id, JSON.stringify({lrcOffset: it.lrcOffset})); toast('歌詞時間 ' + (it.lrcOffset > 0 ? '+' : '') + it.lrcOffset + ' 秒'); LyrView.idx = -2; });
    tbtn('fwd', '晚 0.5 秒', function(){ it.lrcOffset = Math.round(((it.lrcOffset || 0) + 0.5) * 10) / 10; if(isApp) NAT.call('libMeta', it.id, JSON.stringify({lrcOffset: it.lrcOffset})); toast('歌詞時間 ' + (it.lrcOffset > 0 ? '+' : '') + it.lrcOffset + ' 秒'); LyrView.idx = -2; });
  }
  if(Lyrics.of(it) && /\.(mp3|flac)$/i.test(it.name)) tbtn('download', '寫入檔案', async function(){ try{ toast('寫入歌詞中…'); await Lyrics.embed(it); toast('✓ 歌詞已寫進檔案，換到其他播放器也看得到'); self.drawPlayer(); }catch(e){ toast(e.message, true); } });
  body.appendChild(tb);
  var prog = h('input', {type: 'range', id: 'mpProg', min: 0, max: this.el.duration || 1, step: .1, value: this.el.currentTime});
  prog.addEventListener('input', function(){ prog.__drag = true; $('mpT1').textContent = fmtDur(prog.value); });
  prog.addEventListener('change', function(){ self.el.currentTime = +prog.value; prog.__drag = false; });
  body.appendChild(h('div', {style: {margin: '14px 6px 0'}}, prog, h('div', {class: 'row', style: {justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)'}}, h('span', {id: 'mpT1', text: fmtDur(this.el.currentTime)}), h('span', {id: 'mpT2', text: fmtDur(this.el.duration || it.dur || 0)}))));
  var big = function(svg, fn, on, size){ return h('button', {class: 'ib' + (on ? ' on' : ''), html: svg, style: size ? {width: size, height: size} : null, onclick: fn}); };
  body.appendChild(h('div', {class: 'row', style: {justifyContent: 'center', gap: '14px', margin: '6px 0 14px'}},
    big('<svg class="i" viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>', function(){ self.shuffle = !self.shuffle; lsSet('ws.mShuffle', self.shuffle); toast(self.shuffle ? '隨機播放' : '依序播放'); self.drawPlayer(); }, this.shuffle),
    big(icon('back', 'lg'), function(){ self.prev(); }),
    h('button', {class: 'btn pri', style: {width: '64px', height: '64px', borderRadius: '50%', padding: 0}, html: '<svg class="i fill lg" viewBox="0 0 24 24">' + (playing ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : IC.play) + '</svg>', onclick: function(){ self.toggle(); }}),
    big(icon('fwd', 'lg'), function(){ self.next(); }),
    big('<svg class="i" viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>' + (this.repeat === 'one' ? '<text x="10" y="15" font-size="8" fill="currentColor" stroke="none">1</text>' : '') + '</svg>', function(){
      self.repeat = self.repeat === 'all' ? 'one' : self.repeat === 'one' ? 'off' : 'all'; lsSet('ws.mRepeat', self.repeat);
      toast({all: '全部循環', one: '單曲循環', off: '不循環'}[self.repeat]); self.drawPlayer(); }, this.repeat !== 'off')));
  body.appendChild(h('div', {class: 'sect-h', style: {margin: '6px 2px'}}, h('span', {text: '播放清單 ' + this.queue.length + ' 首'})));
  var list = h('div', {class: 'list'});
  this.queue.forEach(function(q, i){
    var t2 = Lib.thumb(q);
    list.appendChild(h('div', {class: 'lrow' + (i === self.idx ? ' on' : ''), onclick: function(){ self.idx = i; self.load(true); }},
      h('div', {class: 'th', style: t2 ? {backgroundImage: 'url("' + t2 + '")', width: '42px', height: '42px'} : {background: 'var(--c-audio)', width: '42px', height: '42px'}, html: t2 ? '' : icon('audio')}),
      h('div', {class: 't'}, h('b', {text: songTitle(q), style: i === self.idx ? {color: 'var(--accent)'} : null}), h('div', {class: 'sub', text: (q.artist || '') + (q.dur ? '・' + fmtDur(q.dur) : '')}))));
  });
  body.appendChild(list);
  paintIcons(body);
};

/* 音樂庫畫面（檔案庫 → 音樂） */
function renderMusicHead(box, L){
  var total = L.reduce(function(s, x){ return s + (x.dur || 0); }, 0);
  box.appendChild(h('div', {class: 'card glass', style: {display: 'flex', alignItems: 'center', gap: '12px'}},
    h('div', {class: 'fav', html: icon('audio', 'lg'), style: {width: '58px', height: '58px', background: 'linear-gradient(140deg,var(--c-audio),var(--accent))', color: '#fff'}}),
    h('div', {class: 'grow'}, h('b', {text: '音樂庫', style: {fontSize: '17px'}}), h('div', {class: 'sub', text: L.length + ' 首' + (total ? '・' + fmtDur(total) : '')})),
    h('button', {class: 'btn pri sm', html: '<svg class="i sm fill" viewBox="0 0 24 24">' + IC.play + '</svg>播放', disabled: !L.length, onclick: function(){ Music.shuffle = false; Music.playList(L, 0); Music.openPlayer(); }}),
    h('button', {class: 'btn sm', text: '隨機', disabled: !L.length, onclick: function(){ Music.shuffle = true; lsSet('ws.mShuffle', true); Music.playList(L, Math.floor(Math.random() * L.length)); Music.openPlayer(); }})));
}
