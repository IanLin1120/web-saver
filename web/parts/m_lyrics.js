/* ============================================================
   歌詞：依歌名／歌手上網找「有時間軸」的歌詞（LRCLIB、網易雲音樂），
   播放時同步捲動，可自訂大小與顏色，也能寫進 MP3（USLT＋SYLT）／FLAC（LYRICS）檔案裡
   ============================================================ */
var Lyrics = {cache: {}};
Lyrics.parse = function(lrc){
  var out = [], off = 0;
  String(lrc || '').split(/\r?\n/).forEach(function(line){
    var mo = line.match(/^\[offset:\s*([+-]?\d+)\]/i); if(mo){ off = +mo[1] / 1000; return; }
    var times = [], m, re = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g, last = 0;
    while((m = re.exec(line))){ times.push(+m[1] * 60 + parseFloat(m[2].replace(':', '.'))); last = re.lastIndex; }
    if(!times.length) return;
    var text = line.slice(last).trim();
    times.forEach(function(t){ out.push({t: Math.max(0, t - off), text: text}); });
  });
  out.sort(function(a, b){ return a.t - b.t; });
  return out;
};
Lyrics.isSynced = function(lrc){ return /\[\d{1,3}:\d{1,2}[.:]\d/.test(lrc || ''); };
function lyrFetch(url, headers){
  if(isApp) return natHttp('GET', url, headers || {}, '').then(function(r){ if(r.status >= 400) throw new Error('HTTP ' + r.status); return r.body; });
  return fetch(url).then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
}
function cleanSong(s){ return String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\(\[（【].*?(official|mv|lyric|audio|歌詞|官方|高音質|完整版|music video|4k|hd).*?[\)\]）】]/ig, '').replace(/\s*(official\s*(music\s*)?video|官方完整版|mv)\s*$/i, '').trim(); }
Lyrics.search = async function(title, artist, dur){
  var t = cleanSong(title), a = String(artist || '').replace(/\s*-\s*Topic$/i, '').trim(), out = [];
  var jobs = [];
  /* LRCLIB：開放的同步歌詞資料庫 */
  jobs.push(lyrFetch('https://lrclib.net/api/search?track_name=' + encodeURIComponent(t) + (a ? '&artist_name=' + encodeURIComponent(a) : ''), {'User-Agent': 'WebSaver/1.2 (https://github.com/IanLin1120/web-saver)'})
    .then(function(b){ JSON.parse(b).slice(0, 8).forEach(function(x){ if(x.syncedLyrics || x.plainLyrics) out.push({src: 'LRCLIB', name: x.trackName, artist: x.artistName, dur: x.duration, lrc: x.syncedLyrics || '', plain: x.plainLyrics || ''}); }); }).catch(function(){}));
  if(!a) jobs.push(lyrFetch('https://lrclib.net/api/search?q=' + encodeURIComponent(t), {'User-Agent': 'WebSaver/1.2'})
    .then(function(b){ JSON.parse(b).slice(0, 6).forEach(function(x){ if(x.syncedLyrics || x.plainLyrics) out.push({src: 'LRCLIB', name: x.trackName, artist: x.artistName, dur: x.duration, lrc: x.syncedLyrics || '', plain: x.plainLyrics || ''}); }); }).catch(function(){}));
  /* 網易雲音樂：中文歌曲收錄最多（只有 APK 可用） */
  if(isApp) jobs.push(lyrFetch('https://music.163.com/api/search/get/web?type=1&limit=6&s=' + encodeURIComponent((a ? a + ' ' : '') + t), {'Referer': 'https://music.163.com/', 'User-Agent': 'Mozilla/5.0'})
    .then(async function(b){
      var songs = ((JSON.parse(b).result || {}).songs || []).slice(0, 4);
      await Promise.all(songs.map(async function(sg){
        try{
          var lb = JSON.parse(await lyrFetch('https://music.163.com/api/song/lyric?lv=1&tv=-1&id=' + sg.id, {'Referer': 'https://music.163.com/', 'User-Agent': 'Mozilla/5.0'}));
          var l = (lb.lrc || {}).lyric || '';
          if(l) out.push({src: '網易雲', name: sg.name, artist: (sg.artists || []).map(function(x){ return x.name; }).join('/'), dur: (sg.duration || 0) / 1000, lrc: Lyrics.isSynced(l) ? l : '', plain: Lyrics.isSynced(l) ? '' : l, trans: (lb.tlyric || {}).lyric || ''});
        }catch(e){}
      }));
    }).catch(function(){}));
  await Promise.all(jobs);
  /* 排序：有時間軸、長度接近、歌名吻合的優先 */
  var tl = t.toLowerCase();
  out.forEach(function(x){
    x.score = (x.lrc ? 50 : 0) + (dur && x.dur ? Math.max(0, 30 - Math.abs(x.dur - dur) * 3) : 0) + (String(x.name).toLowerCase() === tl ? 20 : String(x.name).toLowerCase().indexOf(tl) >= 0 || tl.indexOf(String(x.name).toLowerCase()) >= 0 ? 10 : 0) + (a && String(x.artist).indexOf(a) >= 0 ? 10 : 0);
  });
  out.sort(function(x, y){ return y.score - x.score; });
  return out;
};
Lyrics.of = function(it){ return it && (it.lrc || it.lyrics) || ''; };
Lyrics.save = function(it, lrc, src){
  delete it.__lines; it.lrc = lrc; it.lrcSrc = src || '';
  /* YouTube Music 的歌：歌詞存在 App 自己的快取（不是檔案庫裡的檔案） */
  if(it.ytm){ var c = lsGet('ws.ytmLrc', {}); c[it.vid] = {lrc: lrc, src: src || '', off: it.lrcOff ? 1 : 0, t: Date.now()}; var ks = Object.keys(c); if(ks.length > 300){ ks.sort(function(a, b){ return c[a].t - c[b].t; }).slice(0, ks.length - 300).forEach(function(k){ delete c[k]; }); } lsSet('ws.ytmLrc', c); return; }
  if(isApp) NAT.call('libMeta', it.id, JSON.stringify({lrc: lrc, lrcSrc: src || ''}));
  else IDB.tx(['meta'], 'readwrite', function(t){ t.objectStore('meta').put(it); });
  var li = Lib.byId(it.id); if(li && li !== it){ li.lrc = lrc; li.lrcSrc = src; delete li.__lines; }
};
Lyrics.auto = async function(it, needSynced){
  /* needSynced：已經有純文字歌詞（例如 YouTube Music 內建的），還是要找有時間軸的來換 */
  if(Lyrics.of(it) && !(needSynced && !Lyrics.isSynced(Lyrics.of(it)))) return Lyrics.of(it);
  if(it.lrcOff) return '';
  var q = it.title && it.title !== it.name ? it.title : it.name;
  var L = await Lyrics.search(q, it.artist || '', it.dur || 0);
  /* 自動套用要嚴格：歌名要吻合、長度差 5 秒內，避免抓到別首歌（不確定的就不套用，讓你手動選） */
  var tl = cleanSong(q).toLowerCase();
  var ok = function(x){
    var n = cleanSong(String(x.name || '')).toLowerCase();
    var nameOk = n && (n === tl || (n.length >= 2 && tl.indexOf(n) >= 0) || (tl.length >= 2 && n.indexOf(tl) >= 0));
    var durOk = !(it.dur && x.dur) || Math.abs(x.dur - it.dur) <= 5;
    return nameOk && durOk;
  };
  var best = L.filter(function(x){ return x.lrc && ok(x); })[0] || (needSynced && Lyrics.of(it) ? null : L.filter(ok)[0]);
  if(needSynced && best && !Lyrics.isSynced(best.lrc || '')) best = null;
  if(best){ var l = best.lrc || best.plain; Lyrics.save(it, l, best.src + '：' + best.name + ' - ' + best.artist); return l; }
  return '';
};

/* ---------- 把歌詞（與標籤）寫進檔案 ---------- */
function syncsafe(b, o){ return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f); }
Lyrics.embed = async function(it){
  var ext = (it.name.split('.').pop() || '').toLowerCase();
  if(ext !== 'mp3' && ext !== 'flac') throw new Error('只有 MP3 與 FLAC 可以把歌詞寫進檔案（其他格式在 App 內一樣會同步顯示）');
  var lrc = Lyrics.of(it); if(!lrc) throw new Error('這首歌還沒有歌詞');
  var u8 = new Uint8Array(await (await Lib.blob(it)).arrayBuffer());
  var tags = {title: songTitle(it), artist: it.artist || '', album: it.album || '', lrc: lrc};
  var th = Lib.thumb(it);
  if(th){ try{ tags.cover = new Uint8Array(await (await fetchAny(th)).arrayBuffer()); tags.coverMime = 'image/jpeg'; }catch(e){} }
  var out;
  if(ext === 'mp3'){
    var start = 0;
    if(u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) start = 10 + syncsafe(u8, 6) + (u8[5] & 0x10 ? 10 : 0);
    out = new Blob([AudioEnc.id3(tags), u8.subarray(start)], {type: 'audio/mpeg'});
  } else {
    if(!(u8[0] === 0x66 && u8[1] === 0x4c && u8[2] === 0x61 && u8[3] === 0x43)) throw new Error('不是有效的 FLAC 檔');
    var p = 4, blocks = [], last = false;
    while(!last && p < u8.length){
      last = !!(u8[p] & 0x80); var type = u8[p] & 0x7f, len = (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3];
      blocks.push({type: type, data: u8.subarray(p + 4, p + 4 + len)}); p += 4 + len;
    }
    blocks = blocks.filter(function(b){ return b.type !== 4 && b.type !== 1 && !(b.type === 6 && tags.cover); });
    var vc = AudioEnc.flacMeta(tags);
    vc.forEach(function(b){ blocks.push(b); });
    var parts = [new Uint8Array([0x66, 0x4c, 0x61, 0x43])];
    blocks.forEach(function(b, i){ var hb = new Uint8Array(4); hb[0] = (i === blocks.length - 1 ? 0x80 : 0) | b.type; hb[1] = (b.data.length >> 16) & 0xff; hb[2] = (b.data.length >> 8) & 0xff; hb[3] = b.data.length & 0xff; parts.push(hb, b.data); });
    parts.push(u8.subarray(p));
    out = new Blob(parts, {type: 'audio/flac'});
  }
  var meta = {src: it.src || '', title: it.title || '', artist: it.artist || '', album: it.album || '', thumbFrom: it.id, lrc: lrc, lrcSrc: it.lrcSrc || ''};
  if(LF.map[it.id]) meta.folder = LF.map[it.id];
  var nu = await saveBigBlob(out, it.name, meta);
  if(isApp) NAT.call('libMeta', nu.id, JSON.stringify({lrc: lrc, lrcSrc: it.lrcSrc || '', dur: it.dur || 0}));
  if(LF.map[it.id]){ LF.map[nu.id] = LF.map[it.id]; LF.save(); }
  var wasCur = Music.cur() && Music.cur().id === it.id;
  await Lib.del([it.id]);
  var fresh = Lib.byId(nu.id) || nu; fresh.lrc = lrc;
  if(wasCur){ Music.queue[Music.idx] = fresh; }
  return fresh;
};

/* ---------- 歌詞樣式 ---------- */
CFG.lyr = Object.assign({size: 19, cur: '', other: '', align: 'center', bold: true, auto: true, trans: false}, CFG.lyr || {});
function lyrStyle(){
  var c = CFG.lyr;
  return '--lyr-size:' + c.size + 'px;--lyr-cur:' + (c.cur || 'var(--accent)') + ';--lyr-other:' + (c.other || 'var(--text-muted)') + ';text-align:' + c.align + ';--lyr-w:' + (c.bold ? 800 : 500);
}
function lyricsStyleSheet(after){
  var c = CFG.lyr, body = h('div');
  body.appendChild(h('div', {class: 'card glass', style: {padding: '4px 12px', marginBottom: '12px'}},
    swRow('播放時顯示歌詞', '關閉時只顯示封面（每首歌也可以在播放畫面切換）', 'lyr.show', function(){ c.view = c.show === false ? 'cover' : 'lyrics'; saveCfg(); if(after) after(); if(Music.sheet) Music.drawPlayer(); }),
    swRow('自動搜尋歌詞', '下載、轉檔、播放時自動找歌詞（只套用歌名與長度都吻合的）', 'lyr.auto')));
  var prev = h('div', {class: 'lyrView', style: 'height:150px;' + lyrStyle()}, h('div', {class: 'lyrLine', text: '上一句歌詞'}), h('div', {class: 'lyrLine on', text: '正在唱的這一句'}), h('div', {class: 'lyrLine', text: '下一句歌詞'}));
  function upd(){ prev.setAttribute('style', 'height:150px;' + lyrStyle()); saveCfg(); if(after) after(); }
  body.appendChild(prev);
  var sz = holdRange(h('input', {type: 'range', min: 13, max: 40, step: 1, value: c.size})); var szv = h('span', {text: c.size + 'px'});
  sz.oninput = function(){ c.size = +sz.value; szv.textContent = c.size + 'px'; upd(); };
  body.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, h('span', null, '字體大小'), szv), sz));
  function colorRow(label, key, def){
    var inp = h('input', {type: 'color', value: c[key] || def, style: {width: '64px', height: '38px'}});
    inp.oninput = function(){ c[key] = inp.value; upd(); };
    var sw = h('div', {class: 'chips'});
    ['#e0a066', '#a2613a', '#ffffff', '#ffd27f', '#7fd1c7', '#ff7aa2', '#9cc27a', '#3a2e22'].forEach(function(col){ sw.appendChild(h('button', {class: 'fchip', style: {background: col, width: '30px', height: '30px', padding: 0, borderRadius: '50%'}, onclick: function(){ c[key] = col; inp.value = col; upd(); }})); });
    return h('div', {class: 'field'}, h('div', {class: 'lbl'}, h('span', null, label), h('button', {class: 'btn sm ghost', text: '預設', onclick: function(){ c[key] = ''; upd(); }})), h('div', {class: 'row'}, inp, sw));
  }
  body.appendChild(colorRow('正在唱的歌詞顏色', 'cur', '#e0a066'));
  body.appendChild(colorRow('其他歌詞顏色', 'other', '#9b8b76'));
  body.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '對齊'), segRow([['left', '靠左'], ['center', '置中'], ['right', '靠右']], 'lyr.align', upd)));
  body.appendChild(swRow('正在唱的歌詞加粗', null, 'lyr.bold', upd));
  body.appendChild(swRow('顯示翻譯（有提供時）', null, 'lyr.trans', upd));
  body.appendChild(swRow('下載音樂時自動找歌詞並寫入', 'MP3／FLAC 會把有時間軸的歌詞寫進檔案，其他格式存在 App 裡', 'lyr.auto'));
  openSheet({title: '歌詞樣式', icon: 'type', body: body});
}

/* ---------- 搜尋歌詞面板 ---------- */
async function lyricsSearchSheet(it, after){
  var q = h('input', {type: 'search', value: cleanSong(songTitle(it)), placeholder: '歌名'});
  var ar = h('input', {type: 'search', value: it.artist || '', placeholder: '歌手（可空白）'});
  var list = h('div', {class: 'opts', style: {marginTop: '10px'}});
  var body = h('div', null, h('div', {class: 'two'}, q, ar), h('div', {class: 'btn-row'}, h('button', {class: 'btn pri sm', html: icon('search', 'sm') + '搜尋', onclick: go}),
    h('button', {class: 'btn sm', html: icon('edit', 'sm') + '貼上 LRC 歌詞', onclick: async function(){
      var ta = h('textarea', {placeholder: '[00:12.30]第一句歌詞\n[00:16.80]第二句歌詞', style: {minHeight: '180px'}}); ta.value = Lyrics.of(it);
      var d = dialog('貼上歌詞', '可以貼 LRC（有時間軸）或一般文字', [['儲存', function(){ Lyrics.save(it, ta.value.trim(), '手動'); s.close(); if(after) after(); }], ['取消', null, '']]);
      d.el.insertBefore(ta, d.el.querySelector('.acts'));
    }})), list);
  var s = openSheet({title: '搜尋歌詞', icon: 'search', body: body, tall: true});
  async function go(){
    list.innerHTML = '<div class="ringBox"><div class="spin"></div><div class="sub">搜尋 LRCLIB' + (isApp ? '、網易雲音樂' : '') + '…</div></div>';
    var L = await Lyrics.search(q.value, ar.value, it.dur || 0);
    list.textContent = '';
    if(!L.length){ list.appendChild(h('div', {class: 'empty', html: '<div class="big">🎤</div>找不到歌詞<br><span class="sub">試試只輸入歌名，或改成原文歌名</span>'})); return; }
    L.slice(0, 12).forEach(function(x){
      var lines = Lyrics.parse(x.lrc).slice(0, 3).map(function(l){ return l.text; }).filter(Boolean).join(' / ') || (x.plain || '').split('\n').slice(0, 2).join(' / ');
      list.appendChild(h('div', {class: 'opt', onclick: function(){ Lyrics.save(it, x.lrc || x.plain, x.src + '：' + x.name + ' - ' + x.artist); if(x.trans) it.lrcTrans = x.trans; s.close(); toast('✓ 已套用歌詞'); if(it.ytm) CFG.lyr.ytView = 'lyrics'; else CFG.lyr.view = 'lyrics'; CFG.lyr.show = true; saveCfg(); if(after) after(); }},
        h('span', {class: 'oi', html: icon(x.lrc ? 'audio' : 'type')}),
        h('div', {class: 'grow'}, h('b', {text: x.name + '－' + x.artist}), h('div', {class: 'sub', text: x.src + (x.lrc ? '・有時間軸（同步捲動）' : '・純文字') + (x.dur ? '・' + fmtDur(x.dur) : '')}), h('div', {class: 'sub ell', text: lines}))));
    });
    paintIcons(list);
  }
  q.addEventListener('keydown', function(e){ if(e.key === 'Enter') go(); });
  go();
}

/* ---------- 同步顯示 ---------- */
var LyrView = {el: null, lines: [], idx: -1, raf: 0};
LyrView.mount = function(container, it, opt){
  var lrc = Lyrics.of(it), self = this;
  opt = opt || {};
  /* 時間來源：離線音樂用 Music.el；YouTube Music 由 App 介面提供 */
  this.time = opt.time || function(){ return Music.el.currentTime; };
  var seek = opt.seek || function(t){ Music.el.currentTime = t; if(Music.el.paused) Music.el.play(); };
  var redraw = opt.redraw || function(){ Music.drawPlayer(); };
  this.lines = Lyrics.isSynced(lrc) ? Lyrics.parse(lrc) : [];
  this.idx = -1;
  var v = h('div', {class: 'lyrView', style: lyrStyle()});
  if(this.lines.length){
    v.appendChild(h('div', {class: 'lyrPad'}));
    this.lines.forEach(function(l, i){ v.appendChild(h('div', {class: 'lyrLine', text: l.text || '♪', onclick: function(){ seek(l.t + (it.lrcOffset || 0)); }})); });
    v.appendChild(h('div', {class: 'lyrPad'}));
  } else if(lrc){
    String(lrc).replace(/\[[^\]]*\]/g, '').split(/\n/).forEach(function(t){ v.appendChild(h('div', {class: 'lyrLine', text: t || ' '})); });
  } else {
    v.appendChild(h('div', {class: 'empty', html: '<div class="big">🎤</div>還沒有歌詞'}, h('div', {class: 'btn-row', style: {justifyContent: 'center'}}, h('button', {class: 'btn pri sm', html: icon('search', 'sm') + '自動尋找歌詞', onclick: async function(){
      this.disabled = true; this.textContent = '搜尋中…';
      var l = await Lyrics.auto(it); if(l){ toast('✓ 找到歌詞'); redraw(); } else { toast('找不到相符的歌詞，可以手動搜尋', true); lyricsSearchSheet(it, function(){ redraw(); }); }
    }}))));
  }
  container.appendChild(v);
  this.el = v; this.it = it;
  cancelAnimationFrame(this.raf);
  var loop = function(){ self.tick(); self.raf = requestAnimationFrame(loop); };
  if(this.lines.length) loop();
};
LyrView.tick = function(){
  if(!this.el || !this.el.isConnected){ cancelAnimationFrame(this.raf); return; }
  var t = (this.time ? this.time() : Music.el.currentTime) - ((this.it && this.it.lrcOffset) || 0), L = this.lines, i = -1;
  for(var k = 0; k < L.length; k++){ if(L[k].t <= t + 0.15) i = k; else break; }
  if(i === this.idx) return;
  this.idx = i;
  var nodes = this.el.querySelectorAll('.lyrLine');
  nodes.forEach(function(n, j){ n.classList.toggle('on', j === i); n.classList.toggle('past', j < i); });
  if(i >= 0 && nodes[i]){ var n = nodes[i]; this.el.scrollTo({top: n.offsetTop - this.el.clientHeight / 2 + n.offsetHeight / 2, behavior: CFG.motion ? 'smooth' : 'auto'}); }
};
function currentLyric(){
  var it = Music.cur(); if(!it) return '';
  var lrc = Lyrics.of(it); if(!Lyrics.isSynced(lrc)) return '';
  if(!it.__lines) it.__lines = Lyrics.parse(lrc);
  var t = Music.el.currentTime - (it.lrcOffset || 0), out = '';
  for(var k = 0; k < it.__lines.length; k++){ if(it.__lines[k].t <= t + 0.15) out = it.__lines[k].text; else break; }
  return out;
}
