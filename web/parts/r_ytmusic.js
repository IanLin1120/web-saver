/* ============================================================
   YouTube Music 播放介面：跟「離線音樂」同一套（下方小播放列＋正在播放面板＋同步歌詞）
   YouTube Music 網頁負責找歌、播放（沒有廣告）；播放控制、進度、佇列都在 App 介面，點擊立即反應。
   ============================================================ */
var YTMU = {st: null, t0: 0, sheet: null, queue: [], it: null, tmr: 0, own: lsGet('ws.ytmuOwn', true)};
function ytmuOn(){ return isApp && YTMU.own && NAT.has('muCmd'); }
YTMU.cmd = function(c, a){ if(isApp && NAT.has('muCmd')) NAT.call('muCmd', c, a == null ? '' : String(a)); };
/* 目前播放秒數：用最後一次回報的時間往前推算（不用一直問網頁，介面才順） */
YTMU.time = function(){
  var s = this.st; if(!s) return 0;
  var t = s.cur + (s.playing ? (Date.now() - this.t0) / 1000 : 0);
  return s.dur ? Math.min(t, s.dur) : t;
};
YTMU.syncTry = function(it, delay){
  if(it.__syncTried) return; 
  var n = 0;
  (function go(){
    setTimeout(function(){
      if(YTMU.it !== it || it.__syncTried) return;
      if(!it.dur && n++ < 6){ var s = YTMU.st; if(s && s.vid === it.vid && s.dur) it.dur = s.dur; else return go(); }
      it.__syncTried = true;
      Lyrics.auto(it, true).then(function(l){ if(l && Lyrics.isSynced(l) && YTMU.it === it){ CFG.lyr.ytView = CFG.lyr.ytView || 'lyrics'; YTMU.draw(true); } }).catch(function(){});
    }, delay);
  })();
};
YTMU.sysMeta = function(){
  if(!isApp || !NAT.has('mediaMeta')) return;
  var s = this.st;
  if(!this.active()){ if(!Music.queue.length) NAT.call('mediaMeta', '{}'); return; }
  var k = [s.vid, s.title, s.artist, s.art, s.dur, s.playing, Math.round(this.time() / 5)].join('|');
  if(k === this.metaK) return; this.metaK = k;
  NAT.call('mediaMeta', JSON.stringify({title: s.title, artist: s.artist || 'YouTube Music', art: s.art || '', dur: s.dur || 0, pos: this.time(), playing: !!s.playing}));
};
YTMU.active = function(){ var s = this.st; return !!(s && !s.off && s.title); };
/* 給歌詞用的「假檔案」：同一首歌（影片 ID）共用，歌詞存在快取 */
YTMU.item = function(){
  var s = this.st; if(!s || !s.vid) return null;
  if(this.it && this.it.vid === s.vid){ this.it.title = s.title; this.it.name = s.title; this.it.artist = s.artist; if(s.dur) this.it.dur = s.dur; return this.it; }
  var c = lsGet('ws.ytmLrc', {})[s.vid] || {};
  this.it = {ytm: true, vid: s.vid, id: 'ytm_' + s.vid, name: s.title, title: s.title, artist: s.artist, dur: s.dur, lrc: c.lrc || '', lrcSrc: c.src || '', lrcOff: !!c.off, lrcOffset: c.offset || 0};
  var it = this.it;
  /* 先拿 YouTube Music 自己的歌詞；同時找有時間軸的同步歌詞（找到就用同步的，歌詞會跟著捲動） */
  if(!it.lrc && !it.lrcOff) this.cmd('lyrics', s.vid);
  /* 沒有歌詞，或只有不會動的純文字歌詞（YouTube Music 內建的）：找有時間軸的同步歌詞來換，找到就會跟著唱到哪句移動 */
  if(!it.lrcOff && !Lyrics.isSynced(it.lrc || '') && (!it.lrc || /^YouTube Music/.test(it.lrcSrc || ''))) YTMU.syncTry(it, 1500);
  return it;
};

on('muState', function(d){
  if(typeof d === 'string') try{ d = JSON.parse(d); }catch(e){ return; }
  if(!d) return;
  if(d.lyrics){
    var L = d.lyrics, it = YTMU.it;
    if(it && it.vid === L.vid && L.text && !Lyrics.isSynced(it.lrc) && !it.lrcOff){ Lyrics.save(it, L.text, 'YouTube Music' + (L.src ? '：' + L.src.replace(/^(資料來源|Source)\s*[:：]\s*/i, '') : '')); YTMU.draw(true); }
    return;
  }
  if(d.diag){ var ta = h('textarea', {readOnly: true, class: 'sel-text', style: {width: '100%', minHeight: '50vh', font: '11px/1.4 ui-monospace,monospace'}}); ta.value = d.diag;
    openSheet({title: 'YouTube Music 診斷資訊', icon: 'info', body: h('div', null, h('div', {class: 'sub', style: {marginBottom: '8px'}, text: '請截圖或按「複製」傳給 Claude'}), ta, h('div', {class: 'btn-row'}, h('button', {class: 'btn pri sm', html: icon('copy', 'sm') + '複製', onclick: function(){ copyText(d.diag); }}))), tall: true}); return; }
  /* 在 YouTube Music 點了一首歌：馬上打開播放面板（先用清單上的歌名、封面），等真的開始播再更新 */
  if(d.tap){
    if(!ytmuOn()) return;
    var base = YTMU.st || {};
    YTMU.st = Object.assign({}, base, {off: false, vid: base.vid || '', title: d.title || base.title || '載入中…', artist: d.artist || '', art: d.art || base.art || '', cur: 0, dur: 0, playing: true, pend: Date.now()});
    YTMU.t0 = Date.now();
    if((Music.queue || []).length) Music.stop();
    YTMU.mini();
    if(curView === 'yt' && !Sheets.stack.length) YTMU.openPlayer(); else YTMU.draw();
    return;
  }
  var prev = YTMU.st || {};
  /* 剛點歌還在載入：舊歌的回報不要蓋掉新歌的畫面 */
  if(prev.pend && Date.now() - prev.pend < 6000 && d.vid === prev.vid && !d.open && d.title !== prev.title){ if(d.queue) YTMU.queue = d.queue; return; }
  if(d.queue) YTMU.queue = d.queue;
  YTMU.st = d; YTMU.t0 = Date.now();
  /* YouTube Music 開始播放：離線音樂整個關掉（不留兩個播放列） */
  if(d.playing && (Music.queue || []).length) Music.stop();
  var big = !prev.title || prev.vid !== d.vid || prev.playing !== d.playing || prev.off !== d.off || prev.like !== d.like || prev.repeat !== d.repeat || prev.shuffle !== d.shuffle || prev.art !== d.art || !!d.queue;
  YTMU.sysMeta();
  if(big){ YTMU.mini(); YTMU.draw(prev.like !== d.like || prev.repeat !== d.repeat || prev.shuffle !== d.shuffle); } else YTMU.progress();
  if(d.vid !== prev.vid && typeof fabSync === 'function'){ fabSync.k = null; fabSync(); }
});
/* 離線音樂開始播放：YouTube Music 暫停 */
Music.el.addEventListener('play', function(){ if(YTMU.active()) YTMU.stop(); });
/* 之前 YouTube Music 面板切到「封面」時會連帶改到離線音樂：恢復一次 */
if(!lsGet('ws.lyrMig1', false)){ CFG.lyr.view = 'lyrics'; saveCfg(); lsSet('ws.lyrMig1', true); }

/* 按下去立刻更新畫面（不等網頁回報），網頁回報後再校正 */
YTMU.toggle = function(){
  var s = this.st; if(!s) return;
  s.cur = this.time(); this.t0 = Date.now(); s.playing = !s.playing;
  this.cmd(s.playing ? 'play' : 'pause'); buzz(8);
  this.mini(); this.soft(); this.sysMeta();
};
YTMU.next = function(){ this.cmd('next'); buzz(8); };
YTMU.prev = function(){ this.cmd('prev'); buzz(8); };
YTMU.seek = function(t){ var s = this.st; if(!s) return; s.cur = t; this.t0 = Date.now(); this.cmd('seek', t); this.progress(); };
YTMU.stop = function(){
  this.cmd('stop'); buzz(12);
  if(this.st){ this.st.off = true; this.st.playing = false; }
  Dock.remove('ytmu'); document.body.classList.remove('ytmuDock');
  if(this.sheet && !this.sheet.closed) this.sheet.close();
  this.metaK = ''; this.sysMeta();
};

var YM_PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
YTMU.mini = function(){
  if(!ytmuOn() || !this.active()){ if(Dock.cards.ytmu){ Dock.remove('ytmu'); document.body.classList.remove('ytmuDock'); } this.miniEl = null; return; }
  var s = this.st, self = this, m = this.miniEl;
  /* 已經有播放列：只更新內容，不重建（重建會閃一下，也會讓 YouTube 畫面重新排版） */
  if(m && Dock.cards.ytmu === m){
    if(m.__art !== s.art){ m.__art = s.art; m.__th.style.backgroundImage = s.art ? 'url("' + s.art + '")' : ''; m.__th.innerHTML = s.art ? '' : icon('audio'); }
    if(m.__title.textContent !== s.title) m.__title.textContent = s.title;
    var pi = '<svg class="i fill" viewBox="0 0 24 24">' + (s.playing ? YM_PAUSE : IC.play) + '</svg>';
    if(m.__pi !== pi){ m.__pi = pi; m.__play.innerHTML = pi; }
    this.progress(); return;
  }
  var th = h('div', {class: 'th', style: Object.assign({width: '40px', height: '40px', borderRadius: '10px'}, s.art ? {backgroundImage: 'url("' + s.art + '")'} : {background: 'var(--c-audio)'}), html: s.art ? '' : icon('audio')});
  var title = h('b', {text: s.title});
  var play = h('button', {class: 'ib', html: '<svg class="i fill" viewBox="0 0 24 24">' + (s.playing ? YM_PAUSE : IC.play) + '</svg>', onclick: function(e){ e.stopPropagation(); self.toggle(); }});
  m = h('div', {class: 'dockCard glass ytmuCard', style: {padding: '6px 8px', position: 'relative', overflow: 'hidden'}, onclick: function(){ self.openPlayer(); }},
    h('div', {class: 'lrow', style: {padding: 0, border: 0, background: 'none', flex: 1, minWidth: 0}}, th, h('div', {class: 't'}, title, h('div', {class: 'sub ell', id: 'ymMiniSub', text: s.artist || 'YouTube Music'}))),
    play,
    h('button', {class: 'ib', html: icon('fwd'), onclick: function(e){ e.stopPropagation(); self.next(); }}),
    h('button', {class: 'ib', title: '停止播放', html: icon('x', 'sm'), onclick: function(e){ e.stopPropagation(); self.stop(); }}),
    h('div', {style: {position: 'absolute', left: 0, bottom: 0, height: '3px', background: 'var(--accent)', width: '0%'}, id: 'ymMiniBar'}));
  m.__th = th; m.__title = title; m.__play = play; m.__art = s.art; m.__pi = play.innerHTML;
  this.miniEl = m;
  Dock.set('ytmu', m);
  document.body.classList.add('ytmuDock');
  this.progress();
};
YTMU.progress = function(){
  var s = this.st; if(!s) return;
  var t = this.time(), d = s.dur || 0;
  var mb = $('ymMiniBar'); if(mb) mb.style.width = (d ? 100 * t / d : 0) + '%';
  var pb = $('ymProg'); if(pb && !pb.__drag){ pb.max = d || 1; pb.value = t; }
  var a = $('ymT1'), b = $('ymT2'); if(a && !(pb && pb.__drag)) a.textContent = fmtDur(t); if(b) b.textContent = fmtDur(d);
  var ms = $('ymMiniSub'); if(ms && this.it && this.it.vid === s.vid){ var cl = ytmuLyricNow(this.it); ms.textContent = cl || s.artist || 'YouTube Music'; }
};
function ytmuLyricNow(it){
  var lrc = Lyrics.of(it); if(!Lyrics.isSynced(lrc)) return '';
  if(!it.__lines) it.__lines = Lyrics.parse(lrc);
  var t = YTMU.time() - (it.lrcOffset || 0), out = '';
  for(var k = 0; k < it.__lines.length; k++){ if(it.__lines[k].t <= t + 0.15) out = it.__lines[k].text; else break; }
  return out;
}
/* 播放中每 0.5 秒更新進度條（只改數字，不重畫） */
setInterval(function(){ if(YTMU.st && YTMU.st.playing && !document.hidden) YTMU.progress(); }, 500);

YTMU.openPlayer = function(){
  if(!this.active()) return;
  if(this.sheet && !this.sheet.closed) return;
  var body = h('div', {id: 'ymBody'});
  this.sheet = openSheet({title: 'YouTube Music', icon: 'audio', body: body, tall: true, onClose: function(){ YTMU.sheet = null; }});
  this.draw();
};
YTMU.draw = function(force){
  var body = $('ymBody'); if(!body || !this.sheet || this.sheet.closed) return;
  var s = this.st, self = this;
  /* 只有換歌、換封面、佇列或歌詞改變才整個重畫；播放／暫停等只更新按鈕（畫面不閃） */
  var Q0 = this.queue || [], it0 = this.active() ? this.item() : null;
  var key = [this.active(), s && s.vid, s && s.title, s && s.art, Q0.length, Q0.length && Q0[0].t, Q0.map(function(q){ return q.on ? 1 : 0; }).join(''), it0 && Lyrics.of(it0).length, it0 && it0.lrcOff, CFG.lyr.ytView].join('|');
  if(!force && key === this.drawKey && body.firstChild){ this.soft(); return; }
  this.drawKey = key;
  var keep = body.querySelector('.list'), sc = keep ? keep.scrollTop : 0;
  body.textContent = '';
  if(!this.active()){ body.appendChild(h('div', {class: 'empty', text: '沒有播放中的歌曲'})); return; }
  var it = this.item();
  var showLyr = CFG.lyr.show !== false && CFG.lyr.ytView !== 'cover' && !(it && it.lrcOff);
  var stage = h('div', {class: 'mpStage'});
  if(showLyr && it) LyrView.mount(stage, it, {time: function(){ return YTMU.time(); }, seek: function(t){ YTMU.seek(t); if(!YTMU.st.playing) YTMU.toggle(); }, redraw: function(){ YTMU.draw(true); }});
  else stage.appendChild(h('div', {class: 'art', style: s.art ? {backgroundImage: 'url("' + s.art + '")'} : null, html: s.art ? '' : icon('audio', 'lg'), onclick: function(){ CFG.lyr.ytView = 'lyrics'; CFG.lyr.show = true; saveCfg(); self.draw(true); }}));
  body.appendChild(stage);
  body.appendChild(h('div', {class: 'row', style: {gap: '10px', marginTop: '10px'}},
    h('div', {class: 'th', style: Object.assign({width: '46px', height: '46px', borderRadius: '12px', flex: 'none', backgroundSize: 'cover'}, s.art ? {backgroundImage: 'url("' + s.art + '")'} : {background: 'var(--c-audio)'})}),
    h('div', {class: 'grow'}, h('b', {text: s.title, style: {fontSize: '17px', display: 'block'}, class: 'ell'}),
      h('div', {class: 'sub ell', text: [s.artist, s.album].filter(Boolean).join('・') + (it && it.lrcSrc ? '・歌詞：' + it.lrcSrc.split('：')[0] : '')})),
    h('button', {class: 'ib' + (s.like === 'LIKE' ? ' on' : ''), title: '喜歡', style: s.like === 'LIKE' ? {color: 'var(--accent)'} : null,
      html: '<svg class="i' + (s.like === 'LIKE' ? ' fill' : '') + '" viewBox="0 0 24 24"><path d="M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7"/></svg>',
      onclick: function(){ self.cmd('like'); s.like = s.like === 'LIKE' ? 'INDIFFERENT' : 'LIKE'; buzz(10); self.draw(true); }})));
  var tb = h('div', {class: 'mpTools'});
  var tbtn = function(ic, label, fn){ tb.appendChild(h('button', {class: 'chip', style: {background: 'var(--surface-3)', color: 'var(--text)', border: '1px solid var(--border-soft)'}, html: icon(ic, 'sm') + label, onclick: fn})); };
  tbtn(showLyr ? 'image' : 'type', showLyr ? '封面' : '歌詞', function(){ CFG.lyr.ytView = showLyr ? 'cover' : 'lyrics'; if(!showLyr) CFG.lyr.show = true; saveCfg(); self.draw(true); });
  if(it) tbtn('search', '找歌詞', function(){ it.lrcOff = false; lyricsSearchSheet(it, function(){ self.draw(true); }); });
  if(it && Lyrics.of(it)) tbtn('trash', '移除歌詞', function(){ it.lrcOff = true; Lyrics.save(it, '', ''); toast('已移除歌詞'); self.draw(true); });
  tbtn('palette', '樣式', function(){ lyricsStyleSheet(function(){ if(LyrView.el) LyrView.el.setAttribute('style', lyrStyle()); }); });
  if(it && Lyrics.isSynced(Lyrics.of(it))){
    var shift = function(d){ it.lrcOffset = Math.round(((it.lrcOffset || 0) + d) * 10) / 10; var c = lsGet('ws.ytmLrc', {}); if(c[it.vid]){ c[it.vid].offset = it.lrcOffset; lsSet('ws.ytmLrc', c); } toast('歌詞時間 ' + (it.lrcOffset > 0 ? '+' : '') + it.lrcOffset + ' 秒'); LyrView.idx = -2; };
    tbtn('back', '早 0.5 秒', function(){ shift(-0.5); });
    tbtn('fwd', '晚 0.5 秒', function(){ shift(0.5); });
  }
  if(s.vid) tbtn('download', '下載', function(){ self.sheet.close(); openYt(s.vid); });
  body.appendChild(tb);
  var prog = h('input', {type: 'range', id: 'ymProg', min: 0, max: s.dur || 1, step: .1, value: this.time()});
  prog.addEventListener('input', function(){ prog.__drag = true; $('ymT1').textContent = fmtDur(prog.value); });
  prog.addEventListener('change', function(){ prog.__drag = false; self.seek(+prog.value); });
  body.appendChild(h('div', {style: {margin: '14px 6px 0'}}, prog, h('div', {class: 'row', style: {justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)'}}, h('span', {id: 'ymT1', text: fmtDur(this.time())}), h('span', {id: 'ymT2', text: fmtDur(s.dur || 0)}))));
  var big = function(svg, fn, on){ return h('button', {class: 'ib' + (on ? ' on' : ''), html: svg, onclick: fn}); };
  body.appendChild(h('div', {class: 'row', style: {justifyContent: 'center', gap: '14px', margin: '6px 0 14px'}},
    big('<svg class="i" viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>', function(){ s.shuffle = !s.shuffle; self.cmd('shuffle'); toast(s.shuffle ? '隨機播放' : '依序播放'); self.draw(true); }, s.shuffle),
    big(icon('back', 'lg'), function(){ self.prev(); }),
    h('button', {class: 'btn pri', id: 'ymPlay', style: {width: '64px', height: '64px', borderRadius: '50%', padding: 0}, html: '<svg class="i fill lg" viewBox="0 0 24 24">' + (s.playing ? YM_PAUSE : IC.play) + '</svg>', onclick: function(){ self.toggle(); }}),
    big(icon('fwd', 'lg'), function(){ self.next(); }),
    big('<svg class="i" viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>' + (s.repeat === 'one' ? '<text x="10" y="15" font-size="8" fill="currentColor" stroke="none">1</text>' : '') + '</svg>', function(){
      s.repeat = s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off'; self.cmd('repeat');
      toast({all: '全部循環', one: '單曲循環', off: '不循環'}[s.repeat]); self.draw(true); }, s.repeat !== 'off')));
  var Q = this.queue || [];
  body.appendChild(h('div', {class: 'sect-h', style: {margin: '6px 2px'}}, h('span', {text: Q.length ? '播放佇列 ' + Q.length + ' 首' : '播放佇列'})));
  var list = h('div', {class: 'list'});
  if(!Q.length) list.appendChild(h('div', {class: 'sub', style: {padding: '8px 4px'}, text: '佇列載入中…（YouTube Music 會自動接著播放相關歌曲）'}));
  Q.forEach(function(q){
    var on = q.on || (q.t === s.title);
    list.appendChild(h('div', {class: 'lrow' + (on ? ' on' : ''), onclick: function(){ self.cmd('q', q.i); buzz(8); }},
      h('div', {class: 'th', style: q.img ? {backgroundImage: 'url("' + q.img + '")', width: '42px', height: '42px'} : {background: 'var(--c-audio)', width: '42px', height: '42px'}, html: q.img ? '' : icon('audio')}),
      h('div', {class: 't'}, h('b', {text: q.t, style: on ? {color: 'var(--accent)'} : null}), h('div', {class: 'sub', text: (q.a || '') + (q.d ? '・' + q.d : '')}))));
  });
  body.appendChild(list);
  paintIcons(body);
  if(sc) list.scrollTop = sc;
};
/* 設定：切換「App 的播放介面」與 YouTube Music 原本的介面 */
YTMU.soft = function(){
  var s = this.st; if(!s) return;
  var p = $('ymPlay'); if(p){ var html = '<svg class="i fill lg" viewBox="0 0 24 24">' + (s.playing ? YM_PAUSE : IC.play) + '</svg>'; if(p.__h !== html){ p.__h = html; p.innerHTML = html; } }
  this.progress();
};
YTMU.setOwn = function(on){ YTMU.own = !!on; lsSet('ws.ytmuOwn', YTMU.own); YTMU.cmd('own', on ? '1' : '0'); YTMU.mini(); };

/* ============================================================
   聽歌辨識：聽 10 秒，交給 Gemini 聽出歌名（聽不出歌名就用聽到的歌詞），再到 YouTube Music／YouTube 搜尋
   ============================================================ */
function ytmuSearch(q){
  var u = 'https://music.youtube.com/search?q=' + encodeURIComponent(q);
  showView('yt'); YTB.modeMusic = true; YTB.modeHold = Date.now(); ytModeUi();
  if(isApp && NAT.has('ytSwitch') && NAT.call('ytHas', true)){ YTB.started = true; NAT.call('ytSwitch', true, u); NAT.call('ytLoad', u); }
  else ytEnsure(u);
  ytUpdateVisible();
}
/* 聽歌辨識
   來源兩種：'tap' 直接旁聽 App 裡 YouTube／YouTube Music 正在播的聲音（不經麥克風）；'mic' 用麥克風聽周圍。
   兩種都不會暫停正在播的影片或音樂。 */
var LSN = {cb: null};
on('tapAudio', function(d){ if(LSN.cb) LSN.cb(d || {}); });
function ytmuListen(force){
  if(!isApp || !NAT.has('micStart')){ toast('聽歌辨識需要新版 App（請安裝最新的 APK）', true); return; }
  if(!AICFG.gkey){ toast('聽歌辨識要用 Gemini：請先到「AI 摘要」設定 Gemini 金鑰', true, ['去設定', function(){ showView('ai'); if(typeof aiSettings === 'function') aiSettings(); }]); return; }
  var inMusic = YTB.modeMusic != null ? YTB.modeMusic : ytIsMusic(YTB.url);
  var canTap = NAT.has('ytTap') && YTB.started;
  var mode = force || (canTap ? 'tap' : 'mic');
  if(mode === 'mic' && !NAT.call('audioOk')){ NAT.call('audioAsk'); toast('請允許使用麥克風，再按一次'); return; }
  var SEC_N = 10, body = h('div', {class: 'lsnBox'}), ctl = new AbortController(), done = false, tmr = 0, t0 = 0, recOn = false, tapOn = false;
  var sheet = openSheet({title: '聽歌辨識', icon: 'listen', body: body, onClose: function(){
    done = true; clearInterval(tmr); LSN.cb = null; try{ ctl.abort(); }catch(e){}
    if(recOn){ recOn = false; NAT.call('micStop'); }
    if(tapOn){ tapOn = false; NAT.call('ytTap', 'cancel'); }
  }});
  var again = function(m){ sheet.close(); setTimeout(function(){ ytmuListen(m); }, 250); };
  var swapB = function(){ return mode === 'tap'
    ? h('button', {class: 'btn', html: icon('mic', 'sm') + '改聽周圍的聲音', onclick: function(){ again('mic'); }})
    : canTap ? h('button', {class: 'btn', html: icon('listen', 'sm') + '改聽手機正在播的', onclick: function(){ again('tap'); }}) : null; };
  function view(big, sub, extra){
    body.textContent = '';
    body.appendChild(h('div', {class: 'lsnOrb' + (recOn || tapOn ? ' on' : ''), html: icon(mode === 'tap' ? 'listen' : 'mic', 'lg')}));
    body.appendChild(h('b', {class: 'lsnBig', text: big}));
    if(sub) body.appendChild(h('div', {class: 'sub', style: {textAlign: 'center'}, text: sub}));
    if(extra) body.appendChild(extra);
    paintIcons(body);
  }
  function fail(msg){ view('沒有辨識出來', msg, h('div', {class: 'btn-row', style: {justifyContent: 'center', flexWrap: 'wrap'}}, h('button', {class: 'btn pri', html: icon('listen', 'sm') + '再聽一次', onclick: function(){ again(mode); }}), swapB())); }
  async function ask(audio){
    if(done) return;
    view('辨識中…', '交給 Gemini 聽這段音樂');
    try{
      var r = await aiAskGemini((mode === 'tap' ? '這是一段從影片或音樂直接錄下的聲音（可能同時有人講話、音效或背景音樂）。請辨識裡面的音樂是哪一首歌。\n' : '這是一段用手機麥克風錄下的音樂（可能有環境雜音，也可能是有人在哼唱）。請辨識這是哪一首歌。\n') +
        '只回傳 JSON：{"found": true 或 false, "title": "歌名（原文）", "artist": "歌手／演出者（原文）", "lyrics": "你實際聽到的一兩句歌詞（原文照寫，沒有聽到人聲就留空）", "confidence": 0 到 1 的數字, "note": "一句話說明（繁體中文）"}\n' +
        '規則：不確定是哪首歌時 found 填 false，不要亂猜歌名；但只要聽得到歌詞，lyrics 一定要照實寫下來（我會用歌詞去搜尋）。',
        {audio: audio, signal: ctl.signal});
      if(done) return;
      r = r || {};
      var title = String(r.title || '').trim(), artist = String(r.artist || '').trim(), ly = String(r.lyrics || '').trim();
      var sure = r.found && title && (r.confidence == null || r.confidence >= 0.5);
      var q = sure ? (title + ' ' + artist).trim() : ly ? ly.split(/[\n。！？!?]/)[0].slice(0, 40) : '';
      if(!q){ fail(r.note || '聽不出是哪首歌，也沒有聽到歌詞。等唱到人聲時再試一次。'); return; }
      buzz(15);
      var goMu = function(){ if(!done) sheet.close(); ytmuSearch(q); };
      var goYt = function(){ if(!done) sheet.close(); showView('yt'); ytEnsure('https://m.youtube.com/results?search_query=' + encodeURIComponent(q)); };
      /* 在 YouTube Music 裡：自動去搜尋（不會中斷正在播的歌）。在 YouTube 看影片時：只顯示結果，不自動跳頁，影片繼續播 */
      view(sure ? title : '用聽到的歌詞搜尋', sure ? (artist || '') : '「' + q + '」',
        h('div', null,
          r.note ? h('div', {class: 'sub', style: {textAlign: 'center', margin: '6px 0'}, text: r.note}) : null,
          h('div', {class: 'btn-row', style: {justifyContent: 'center', flexWrap: 'wrap'}},
            h('button', {class: 'btn pri', html: icon('audio', 'sm') + '在 YouTube Music 搜尋', onclick: goMu}),
            inMusic ? null : h('button', {class: 'btn', html: icon('video', 'sm') + '在 YouTube 搜尋', onclick: goYt}),
            h('button', {class: 'btn', html: icon('copy', 'sm') + '複製', onclick: function(){ copyText(q); }}),
            h('button', {class: 'btn', html: icon('listen', 'sm') + '再聽一次', onclick: function(){ again(mode); }})),
          inMusic ? null : h('div', {class: 'sub', style: {textAlign: 'center', marginTop: '8px'}, text: '影片會繼續播放；按上面的按鈕才會跳去搜尋'})));
      if(inMusic) setTimeout(function(){ if(!done) goMu(); }, sure ? 1400 : 2200);
    }catch(e){ if(!done) fail((e && e.message) || '辨識失敗'); }
  }
  function countdown(label){
    t0 = Date.now();
    var stopB = h('div', {class: 'btn-row', style: {justifyContent: 'center', flexWrap: 'wrap'}},
      h('button', {class: 'btn', text: '聽夠了，開始辨識', onclick: function(){ if(Date.now() - t0 > 3000) finish(); else toast('再多聽幾秒'); }}), swapB());
    view('正在聽…', label + '，還有 ' + SEC_N + ' 秒', stopB);
    clearInterval(tmr);
    tmr = setInterval(function(){
      var left = SEC_N - Math.floor((Date.now() - t0) / 1000);
      if(left <= 0){ if(mode === 'mic') finish(); else { var s0 = body.querySelector('.sub'); if(s0) s0.textContent = '整理聲音中…'; if(left < -4){ clearInterval(tmr); LSN.cb && LSN.cb({err: 'timeout'}); } } return; }
      var s = body.querySelector('.sub'); if(s) s.textContent = label + '，還有 ' + left + ' 秒';
    }, 300);
  }
  function finish(){
    if(done) return;
    if(mode === 'tap'){ NAT.call('ytTap', 'finish'); return; }
    clearInterval(tmr); recOn = false;
    var b64 = NAT.call('micStop');
    if(!b64){ fail('沒有錄到聲音，請確認麥克風權限'); return; }
    ask({mime: 'audio/aac', b64: b64});
  }
  function toMic(why){
    /* 旁聽不到（沒有東西在播、或這支手機的瀏覽器元件不支援）：改用麥克風，不用使用者再按一次 */
    tapOn = false; LSN.cb = null; clearInterval(tmr);
    if(!NAT.call('audioOk')){ view(why, '可以改用麥克風聽周圍的聲音', h('div', {class: 'btn-row', style: {justifyContent: 'center'}}, h('button', {class: 'btn pri', html: icon('mic', 'sm') + '用麥克風聽', onclick: function(){ again('mic'); }}))); return; }
    toast(why + '，改用麥克風聽周圍的聲音'); again('mic');
  }
  if(mode === 'tap'){
    tapOn = true;
    view('準備中…', '正在接上手機裡播放的聲音');
    var guard = setTimeout(function(){ if(!done && tapOn && !t0) toMic('接不上正在播的聲音'); }, 2500);
    LSN.cb = function(d){
      if(done) return;
      if(d.started){ clearTimeout(guard); countdown('直接聽 App 裡正在播的聲音（不用麥克風，播放不會中斷）'); return; }
      clearTimeout(guard); clearInterval(tmr);
      if(d.ok && d.b64){ tapOn = false; LSN.cb = null; ask({mime: d.mime || 'audio/wav', b64: d.b64}); return; }
      if(d.err === 'noplay'){ toMic('App 裡現在沒有影片或音樂在播'); return; }
      if(d.err === 'silent'){ tapOn = false; fail('錄到的是靜音。請確認影片有聲音、沒有被靜音，再試一次；或改聽周圍的聲音。'); return; }
      if(d.err === 'short' || d.err === 'timeout'){ tapOn = false; fail('沒有錄到足夠的聲音，再試一次；或改聽周圍的聲音。'); return; }
      toMic('這個畫面沒辦法直接旁聽');
    };
    NAT.call('ytTap', 'start:' + SEC_N);
    return;
  }
  if(!NAT.call('micStart')){ view('無法使用麥克風', '請到手機設定允許「網頁擷取」使用麥克風'); return; }
  recOn = true;
  countdown('用麥克風聽周圍的聲音（正在播的不會暫停）');
}
