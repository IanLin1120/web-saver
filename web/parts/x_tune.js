/* ============================================================
   播放調校：
   1. 歌詞簡體 → 繁體（台灣用字）
   2. 音量一致：量每個離線音樂／影片的響度，播放時把比較大聲的檔案調小，讓每個檔案聽起來差不多大聲
   3. 補齊歌手與歌詞：用歌名＋長度到 YouTube Music 比對，找到是誰唱的、順便找歌詞
   ============================================================ */

/* ---------- 1. 簡體 → 繁體 ---------- */
var S2T = {c: null, p: null, memo: {}};
S2T.init = function(){
  if(this.c) return true;
  var d = window.S2T_DATA; if(!d) return false;
  var c = {}, s = d.c;
  for(var i = 0; i + 1 < s.length; i += 2) c[s[i]] = s[i + 1];
  var p = {};
  [2, 3, 4].forEach(function(n){ var k = d.p[n][0], v = d.p[n][1]; for(var j = 0; j + n <= k.length; j += n) p[k.substr(j, n)] = v.substr(j, n); });
  this.c = c; this.p = p;
  /* 反過來（繁→簡）的單字表：只用來比對歌名（頭髮／頭發、奇蹟／奇跡 都視為同一個） */
  var r = {};
  Object.keys(c).forEach(function(k){ if(!r[c[k]]) r[c[k]] = k; });
  Object.keys(p).forEach(function(k){ var v = p[k]; for(var j = 0; j < k.length; j++) if(k[j] !== v[j] && !r[v[j]]) r[v[j]] = k[j]; });
  this.r = r;
  return true;
};
S2T.simp = function(s){ if(!this.init()) return s; var r = this.r, o = ''; for(var i = 0; i < s.length; i++) o += r[s[i]] || s[i]; return o; };
S2T.line = function(s){
  var c = this.c, p = this.p, out = '', i = 0, n = s.length;
  while(i < n){
    var hit = null;
    if(c[s[i]] || s.charCodeAt(i) > 0x2e7f){
      for(var L = 4; L >= 2; L--){ if(i + L <= n){ var k = s.substr(i, L); if(p[k]){ hit = p[k]; i += L; break; } } }
    }
    if(hit) out += hit; else { out += c[s[i]] || s[i]; i++; }
  }
  return out;
};
/* 整份歌詞：日文歌（有假名）的漢字不能轉（国、学 在日文是正確寫法）；韓文也不動 */
S2T.text = function(t){
  t = String(t || '');
  if(!t || !this.init()) return t;
  var m = this.memo[t]; if(m != null) return m;
  var lines = t.split('\n'), kana = 0, han = 0;
  lines.forEach(function(l){ if(/[぀-ヿ]/.test(l)) kana++; else if(/[㐀-鿿]/.test(l)) han++; });
  var out = t;
  if(han && kana <= Math.max(1, (kana + han) * 0.1)){
    var self = this;
    out = lines.map(function(l){ return /[぀-ヿ가-힯]/.test(l) ? l : self.line(l); }).join('\n');
  }
  var ks = Object.keys(this.memo); if(ks.length > 60) this.memo = {};
  this.memo[t] = out;
  return out;
};
function lyrTrad(){ return !(CFG.lyr && CFG.lyr.trad === false); }
/* 歌詞一律經過這裡：顯示、同步捲動、寫進檔案的都是繁體 */
(function(){
  var of0 = Lyrics.of, save0 = Lyrics.save;
  Lyrics.of = function(it){ var l = of0.call(Lyrics, it); return l && lyrTrad() ? S2T.text(l) : l; };
  Lyrics.save = function(it, lrc, src){ return save0.call(Lyrics, it, lrc && lyrTrad() ? S2T.text(lrc) : lrc, src); };
})();

/* ---------- 2. 音量一致 ---------- */
/* 目標響度（LUFS，跟 YouTube／Spotify 的音量平衡同一種單位）。比這個大聲的檔案會調小；比較小聲的維持原本音量（網頁播放器不能把聲音放大超過 100%）。
   大部分流行歌在 -7～-12 LUFS，老歌、現場錄音約 -14～-20 */
var Loud = {TARGET: -16, wait: {}, clipWait: {}, bad: {}, q: [], busy: false, err: ''};
/* 播放清單裡的歌曲物件可能是舊的（檔案庫重新整理後換了新物件）：量好的數值一律去檔案庫找最新的 */
Loud.val = function(it){
  if(!it) return null;
  if(typeof it.lufs === 'number') return it.lufs;
  var x = Lib.byId(it.id);
  return x && typeof x.lufs === 'number' ? x.lufs : null;
};
Loud.on = function(){ return CFG.norm !== false && isApp && NAT.has('loud'); };
Loud.gain = function(it){
  var v = Loud.val(it);
  if(CFG.norm === false || v == null) return 1;
  return Math.max(0.1, Math.min(1, Math.pow(10, (Loud.TARGET - v) / 20)));
};
/* 量好才繼續（最多等 ms 毫秒，等不到就先用原本音量播，量好再套用） */
Loud.ensure = function(it, ms){
  if(!Loud.on() || !it || it.web || it.ytm || Loud.val(it) != null || Loud.bad[it.id]) return Promise.resolve();
  return new Promise(function(res){
    var done = false, fin = function(){ if(!done){ done = true; res(); } };
    (Loud.wait[it.id] = Loud.wait[it.id] || []).push(fin);
    if(Loud.wait[it.id].length === 1) NAT.call('loud', it.id, false);
    setTimeout(fin, ms || 1500);
  });
};
/* 取一小段聲音（給聽歌辨識），同時也會量好音量 */
Loud.clip = function(it){
  return new Promise(function(res){
    if(!isApp || !NAT.has('loud')){ res(null); return; }
    var done = false, fin = function(b){ if(!done){ done = true; res(b || null); } };
    (Loud.clipWait[it.id] = Loud.clipWait[it.id] || []).push(fin);
    NAT.call('loud', it.id, true);
    setTimeout(fin, 25000);
  });
};
on('loud', function(d){
  if(!d || !d.id) return;
  var it = Lib.byId(d.id);
  if(d.ok && isFinite(d.lufs)){
    if(it && it.lufs !== d.lufs){ it.lufs = d.lufs; NAT.call('libMeta', d.id, JSON.stringify({lufs: d.lufs})); }
    /* 播放清單裡同一首歌的舊物件也一起更新 */
    try{ Music.queue.forEach(function(x){ if(x && x.id === d.id) x.lufs = d.lufs; }); }catch(e){}
    if(it && !it.dur && d.dur){ it.dur = Math.round(d.dur); NAT.call('libMeta', d.id, JSON.stringify({dur: it.dur})); }
  } else { Loud.bad[d.id] = 1; Loud.err = d.err || ''; }
  (Loud.wait[d.id] || []).forEach(function(f){ f(); }); delete Loud.wait[d.id];
  (Loud.clipWait[d.id] || []).forEach(function(f){ f(d.clip || null); }); delete Loud.clipWait[d.id];
  Loud.apply();
  Loud.busy = false;
  try{ var cu = Music.cur(); if(cu && cu.id === d.id){ var lb = document.querySelector('#mpBody .mpLoud'); if(lb) lb.textContent = Loud.label(cu); } }catch(e){}
});
/* 把目前正在播的音樂、影片調到該有的音量 */
Loud.apply = function(){
  try{
    var it = Music.cur();
    if(it && Music.el) Music.el.volume = Loud.gain(it);
    if(Loud.vEl && Loud.vEl.isConnected && Loud.vIt) Loud.vEl.volume = Loud.gain(Loud.vIt);
  }catch(e){}
};
/* 背景慢慢把音樂庫、影片都量過一遍（一次一個，App 在前景時才做），之後播放就不用等 */
Loud.sweep = function(){
  if(!Loud.on() || Loud.busy || document.hidden) return;
  var it = Lib.items.filter(function(x){ return (x.cat === 'audio' || x.cat === 'video') && typeof x.lufs !== 'number' && !Loud.bad[x.id] && !x.web; })[0];
  if(!it) return;
  Loud.busy = true;
  NAT.call('loud', it.id, false);
  setTimeout(function(){ if(Loud.busy){ Loud.busy = false; Loud.bad[it.id] = 1; } }, 20000);
};
setTimeout(function(){ setInterval(Loud.sweep, 2500); }, 8000);
/* 給播放畫面顯示：這首歌的音量平衡狀態 */
Loud.label = function(it){
  if(CFG.norm === false || !it || it.web || it.ytm) return '';
  var v = Loud.val(it);
  if(v == null) return Loud.bad[it.id] ? '音量平衡：無法量測' : '音量平衡：量測中…';
  var g = 20 * Math.log10(Loud.gain(it));
  return '響度 ' + v.toFixed(1) + ' LUFS・' + (g < -0.3 ? '已調小 ' + (-g).toFixed(1) + ' dB' : '原音量');
};
Loud.stats = function(){
  var L = Lib.items.filter(function(x){ return (x.cat === 'audio' || x.cat === 'video') && !x.web; });
  return {all: L.length, done: L.filter(function(x){ return typeof x.lufs === 'number'; }).length, bad: L.filter(function(x){ return Loud.bad[x.id]; }).length};
};
(function(){
  /* 音樂庫：換歌時先量好音量再播 */
  var load0 = Music.load;
  Music.load = async function(play){
    var it = this.cur();
    if(it && Loud.on()){ try{ await Loud.ensure(it, 1500); }catch(e){} }
    try{ this.el.volume = Loud.gain(it); }catch(e){}
    return load0.call(this, play);
  };
  /* 離線影片：播放器的 <video> 一開始播就套用 */
  document.addEventListener('loadedmetadata', function(e){
    var v = e.target;
    if(!v || v.tagName !== 'VIDEO' || !v.closest || !v.closest('.vwVideo')) return;
    var it = (typeof Viewer !== 'undefined' && Viewer.cur) || null;
    if(!it || it.web || it.cat !== 'video') return;
    Loud.vEl = v; Loud.vIt = it;
    v.volume = Loud.gain(it);
    Loud.ensure(it, 4000).then(function(){ if(Loud.vEl === v) v.volume = Loud.gain(it); });
  }, true);
})();

/* ---------- 3. 補齊歌手與歌詞（YouTube Music 比對） ---------- */
var YTM_API = 'https://music.youtube.com/youtubei/v1/';
var YTM_HD = {'Content-Type': 'application/json', 'Origin': 'https://music.youtube.com', 'Referer': 'https://music.youtube.com/', 'X-YouTube-Client-Name': '67', 'X-YouTube-Client-Version': '1.20250101.01.00',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'};
function ytmApi(ep, body){
  body.context = {client: {clientName: 'WEB_REMIX', clientVersion: '1.20250101.01.00', hl: 'zh-TW', gl: 'TW'}};
  return natHttp('POST', YTM_API + ep + '?prettyPrint=false', YTM_HD, JSON.stringify(body), false).then(function(r){
    if(r.status >= 400) throw new Error('YouTube Music 回應 ' + r.status);
    return JSON.parse(r.body || '{}');
  });
}
function ytmRuns(o){ return ((o && o.runs) || []); }
function ytmDurSec(s){ var p = String(s || '').trim().split(':').map(Number); if(p.some(isNaN) || p.length < 2) return 0; return p.reduce(function(a, b){ return a * 60 + b; }, 0); }
/* 走訪整個回應，把每一列歌曲抓出來（不依賴外層的版面結構，YouTube 改版比較不會壞） */
function ytmCollect(node, out, depth){
  if(!node || typeof node !== 'object' || depth > 14) return;
  if(Array.isArray(node)){ node.forEach(function(x){ ytmCollect(x, out, depth + 1); }); return; }
  var r = node.musicResponsiveListItemRenderer;
  if(r){
    var cols = (r.flexColumns || []).map(function(c){ return (c.musicResponsiveListItemFlexColumnRenderer || {}).text; });
    var t0 = ytmRuns(cols[0])[0] || {}, vid = '';
    try{ vid = (r.playlistItemData || {}).videoId || t0.navigationEndpoint.watchEndpoint.videoId || ''; }catch(e){}
    var artists = [], album = '', dur = 0, plain = [], kind = '';
    cols.slice(1).forEach(function(c){
      ytmRuns(c).forEach(function(run){
        var tx = String(run.text || '');
        var be = run.navigationEndpoint && run.navigationEndpoint.browseEndpoint;
        var pt = be && ((be.browseEndpointContextSupportedConfigs || {}).browseEndpointContextMusicConfig || {}).pageType || '';
        if(be && (/ARTIST|USER_CHANNEL/.test(pt) || /^UC/.test(be.browseId || ''))) artists.push(tx);
        else if(be && (/ALBUM/.test(pt) || /^MPRE/.test(be.browseId || ''))) album = tx;
        else if(/^\d{1,2}(:\d{2}){1,2}$/.test(tx.trim())) dur = ytmDurSec(tx);
        else if(tx.trim() && !/^[\s•·・&,、]+$/.test(tx)) plain.push(tx.trim());
      });
    });
    (r.fixedColumns || []).forEach(function(c){ ytmRuns((c.musicResponsiveListItemFixedColumnRenderer || {}).text).forEach(function(run){ if(/^\d{1,2}(:\d{2}){1,2}$/.test(String(run.text || '').trim())) dur = ytmDurSec(run.text); }); });
    /* 沒有連結的歌手（沒有歌手頁）：第一段文字，但要跳過「歌曲／影片」這種類型標示和觀看次數 */
    if(plain.length && /^(歌曲|影片|Song|Video|單曲|專輯|EP)$/i.test(plain[0])) kind = plain.shift();
    if(!artists.length && plain.length && !/(次觀看|次播放|views|plays|觀看次數)/i.test(plain[0])) artists.push(plain[0]);
    var th = '';
    try{ var ts = r.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails; th = ts[0].url; }catch(e){}
    if(vid && t0.text) out.push({vid: vid, name: String(t0.text), artist: artists.join('、'), album: album, dur: dur, kind: kind, thumb: th});
    return;
  }
  Object.keys(node).forEach(function(k){ ytmCollect(node[k], out, depth + 1); });
}
/* 檔名後面常見的下載標記：(MP3_320K)、[320kbps]、_128K、(高音質) … 都去掉才拿去比對 */
function songStrip(s){
  return String(s || '')
    .replace(/[\(\[（【]\s*(?:mp3|m4a|aac|flac|wav|opus|ogg)?[\s_\-]*\d{2,4}\s*k(?:bps)?\s*[\)\]）】]/ig, ' ')
    .replace(/[\(\[（【]\s*(?:mp3|m4a|aac|flac|wav|opus|ogg|hq|hd|高音質|無損|320k)\s*[\)\]）】]/ig, ' ')
    .replace(/[\s_\-]+(?:mp3|m4a|aac|flac)?[\s_\-]*\d{3}\s*k(?:bps)?\s*$/i, '')
    .replace(/\s+/g, ' ').trim();
}
/* 封面比對：把圖縮成 9×8 灰階算「差異雜湊」（dHash），兩張圖的位元差 ≤ 12 就視為同一張封面 */
function imgHash(url){
  return new Promise(function(res){
    if(!url){ res(null); return; }
    var im = new Image(), done = false, fin = function(v){ if(!done){ done = true; res(v); } };
    if(!/^file:|^data:/.test(url)) im.crossOrigin = 'anonymous';
    im.onload = function(){
      try{
        var w = im.naturalWidth, hh = im.naturalHeight, s = Math.min(w, hh), cv = document.createElement('canvas');
        cv.width = 9; cv.height = 8;
        var g = cv.getContext('2d');
        g.drawImage(im, (w - s) / 2, (hh - s) / 2, s, s, 0, 0, 9, 8);
        var d = g.getImageData(0, 0, 9, 8).data, bits = [];
        for(var y = 0; y < 8; y++) for(var x = 0; x < 8; x++){
          var i = (y * 9 + x) * 4, j = i + 4;
          bits.push((d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) > (d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11) ? 1 : 0);
        }
        fin(bits);
      }catch(e){ fin(null); }
    };
    im.onerror = function(){ fin(null); };
    setTimeout(function(){ fin(null); }, 6000);
    im.src = url;
  });
}
function hashDist(a, b){ if(!a || !b) return 99; var n = 0; for(var i = 0; i < 64; i++) if(a[i] !== b[i]) n++; return n; }
/* YouTube Music 搜尋：歌曲＋全部結果（影片的「歌手」就是上傳的頻道） */
async function ytmSearchAll(q){
  var out = [], seen = {};
  try{ (await ytmSearchSongs(q)).forEach(function(x){ if(!seen[x.vid]){ seen[x.vid] = 1; out.push(x); } }); }catch(e){}
  try{ var j = await ytmApi('search', {query: q}), L = []; ytmCollect(j, L, 0); L.forEach(function(x){ if(!seen[x.vid]){ seen[x.vid] = 1; out.push(x); } }); }catch(e){}
  return out;
}
/* 找歌詞、比對歌名時都先去掉下載標記 */
(function(){ var cs0 = cleanSong; cleanSong = function(x){ return songStrip(cs0(x)); }; })();
/* 只搜尋「歌曲」 */
async function ytmSearchSongs(q){
  var j = await ytmApi('search', {query: q, params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'});
  var out = []; ytmCollect(j, out, 0);
  if(!out.length){ j = await ytmApi('search', {query: q}); ytmCollect(j, out, 0); }
  var seen = {};
  return out.filter(function(x){ if(seen[x.vid]) return false; seen[x.vid] = 1; return true; });
}
/* YouTube Music 內建的歌詞（純文字，沒有時間軸） */
async function ytmLyrics(vid){
  var j = await ytmApi('next', {videoId: vid, isAudioOnly: true});
  var id = '';
  (function walk(n, d){
    if(!n || typeof n !== 'object' || d > 14 || id) return;
    if(Array.isArray(n)){ n.forEach(function(x){ walk(x, d + 1); }); return; }
    if(n.browseEndpoint && /^MPLY/.test(n.browseEndpoint.browseId || '')){ id = n.browseEndpoint.browseId; return; }
    Object.keys(n).forEach(function(k){ walk(n[k], d + 1); });
  })(j, 0);
  if(!id) return '';
  var b = await ytmApi('browse', {browseId: id}), txt = '';
  (function walk(n, d){
    if(!n || typeof n !== 'object' || d > 14 || txt) return;
    if(Array.isArray(n)){ n.forEach(function(x){ walk(x, d + 1); }); return; }
    if(n.musicDescriptionShelfRenderer){ txt = ytmRuns(n.musicDescriptionShelfRenderer.description).map(function(r){ return r.text; }).join(''); return; }
    Object.keys(n).forEach(function(k){ walk(n[k], d + 1); });
  })(b, 0);
  return txt.replace(/\r/g, '').trim();
}
/* 比對用：去掉括號裡的說明、空白、標點，簡繁視為相同，不分大小寫 */
function songKey(s){
  s = cleanSong(String(s || '')).replace(/[\(\[（【][^\)\]）】]*[\)\]）】]/g, ' ');
  s = S2T.simp(s);
  return s.toLowerCase().replace(/[\s\-_.,!?'"`~:;／\/\\|·・、，。！？「」『』《》〈〉]+/g, '');
}
function songSame(a, b){
  var x = songKey(a), y = songKey(b);
  if(!x || !y) return false;
  return x === y || (x.length >= 2 && y.indexOf(x) >= 0) || (y.length >= 2 && x.indexOf(y) >= 0);
}
/* 找出這個檔案是哪一首歌：回傳 {vid, name, artist, album, dur, how}；找不到回傳 null
   how：'title'＝歌名＋長度吻合，'listen'＝聽歌辨識後歌名＋長度吻合 */
async function songIdentify(it, useListen){
  var title = songStrip(cleanSong(songTitle(it))), dur = it.dur || 0, known = String(it.artist || '').replace(/\s*-\s*Topic$/i, '').trim();
  /* 這首歌自己的封面（從 YouTube Music 下載的歌，封面就是 YouTube Music 上那張） */
  var myHash = await imgHash(Lib.thumb(it));
  var durOk = function(x, tol){ return dur && x.dur && Math.abs(x.dur - dur) <= (tol || 2); };
  var pick = async function(L, name){
    /* 三項裡至少兩項吻合才算：歌名、長度（差 2 秒內）、封面（看起來同一張） */
    var best = null, bestScore = 0;
    for(var i = 0; i < L.length && i < 12; i++){
      var x = L[i], T = songSame(x.name, name), D = durOk(x), C = false;
      if(myHash && x.thumb && (T || D)){ var hx = await imgHash(x.thumb); C = hashDist(myHash, hx) <= 12; x.coverOk = C; }
      var sc = (T ? 1 : 0) + (D ? 1 : 0) + (C ? 1 : 0);
      if(sc < 2 && !(T && !dur && songKey(x.name) === songKey(name))) continue;
      sc += (x.kind && /歌曲|Song/i.test(x.kind) ? 0.3 : 0) + (C ? 0.2 : 0) - (dur && x.dur ? Math.abs(x.dur - dur) / 100 : 0);
      if(sc > bestScore){ best = x; bestScore = sc; }
    }
    return best;
  };
  /* 檔名常見「歌手 - 歌名」或「歌名 - 歌手」：兩邊都試 */
  var names = [title], m = title.split(/\s+[-–—]\s+/);
  if(m.length === 2){ names.push(m[1].trim(), m[0].trim()); }
  var qs = [];
  if(known) qs.push([title + ' ' + known, title]);
  names.forEach(function(n){ qs.push([n, n]); });
  if(m.length === 2) qs.unshift([title.replace(/\s+[-–—]\s+/, ' '), m[1].trim()], [title.replace(/\s+[-–—]\s+/, ' '), m[0].trim()]);
  var tried = {};
  for(var i = 0; i < qs.length; i++){
    var key = qs[i][0] + '|' + qs[i][1]; if(tried[key]) continue; tried[key] = 1;
    var L = await ytmSearchAll(qs[i][0]);
    var hit = await pick(L, qs[i][1]);
    if(hit){ hit.how = hit.coverOk ? 'cover' : 'title'; return hit; }
  }
  if(!useListen || !AICFG.gkey) return null;
  /* 聽歌辨識：剪這個檔案中間 12 秒給 Gemini 聽，再拿辨識出來的歌名＋歌手去比對長度 */
  var b64 = await Loud.clip(it);
  if(!b64) return null;
  var r = await aiAskGemini(lsnPrompt('tap'), {audio: {mime: 'audio/wav', b64: b64}});
  var D = lsnDecide(r || {});
  if(!D.sure || !D.title) return null;
  var L2 = await ytmSearchSongs((D.title + ' ' + (D.artist || '')).trim());
  var ok2 = L2.filter(function(x){ return songSame(x.name, D.title) && (!dur || !x.dur || Math.abs(x.dur - dur) <= 3); });
  var h2 = ok2[0];
  if(!h2 && D.artist) h2 = {vid: '', name: D.title, artist: D.artist, album: '', dur: 0};
  if(h2){ h2.how = 'listen'; return h2; }
  return null;
}
/* 補齊一首歌：回傳 {artist: 補上的歌手, lrc: '同步'|'純文字'|'', note} */
async function songFix(it, opt){
  opt = opt || {};
  var res = {artist: '', lrc: '', note: ''};
  var needArtist = opt.artist !== false && !String(it.artist || '').trim();
  var needLrc = opt.lrc !== false && !Lyrics.of(it) && !it.lrcOff;
  var hit = null;
  if(needArtist || (needLrc && !it.ytmVid)){
    try{ hit = await songIdentify(it, !!opt.listen); }catch(e){ res.note = String(e.message || e); }
    if(hit){
      var meta = {};
      /* 歌手名字是簡體的也轉成繁體（日文、韓文名字不動） */
      if(hit.artist && lyrTrad() && !/[\u3040-\u30ff\uac00-\ud7af]/.test(hit.artist) && S2T.init()) hit.artist = S2T.line(hit.artist);
      if(needArtist && hit.artist){ it.artist = meta.artist = hit.artist; res.artist = hit.artist; res.how = hit.how; }
      if(!it.album && hit.album){ it.album = meta.album = hit.album; }
      if(hit.vid){ it.ytmVid = meta.ytmVid = hit.vid; }
      if(!it.dur && hit.dur){ it.dur = meta.dur = hit.dur; }
      if(Object.keys(meta).length && isApp) NAT.call('libMeta', it.id, JSON.stringify(meta));
    } else if(needArtist && !res.note) res.note = '找不到歌名、長度、封面有兩項吻合的歌';
  }
  if(needLrc){
    /* 先找有時間軸的同步歌詞（會跟著唱到哪句移動）；沒有才用 YouTube Music 內建的純文字歌詞 */
    var l = '';
    try{ l = await Lyrics.auto(it); }catch(e){}
    if(l) res.lrc = Lyrics.isSynced(l) ? '同步' : '純文字';
    else if(it.ytmVid){
      try{ var pl = await ytmLyrics(it.ytmVid); if(pl && pl.length > 20){ Lyrics.save(it, pl, 'YouTube Music'); res.lrc = '純文字'; } }catch(e){}
    }
  }
  return res;
}
/* 批次補齊（音樂庫上方的按鈕） */
function songFixSheet(list){
  var L = (list || musicItems()).filter(function(it){ return !it.ytm; });
  var noArtist = L.filter(function(it){ return !String(it.artist || '').trim(); });
  var noLrc = L.filter(function(it){ return !Lyrics.of(it) && !it.lrcOff; });
  var simp = L.filter(function(it){ var raw = it.lrc || it.lyrics || ''; return raw && S2T.text(raw) !== raw; });
  var st = lsGet('ws.fixOpt', {artist: true, lrc: true, listen: false});
  var body = h('div', {class: 'fixBox'}), running = false, stop = false;
  var chk = function(key, label, sub){
    var inp = h('input', {type: 'checkbox'}); inp.checked = !!st[key];
    inp.onchange = function(){ buzz(10); st[key] = inp.checked; lsSet('ws.fixOpt', st); };
    return h('label', {class: 'lab'}, h('span', null, label, sub ? h('span', {class: 'sub', text: sub}) : null), h('span', {class: 'sw'}, inp, h('span')));
  };
  var log = h('div', {class: 'fixLog'}), bar = h('div', {class: 'fixBar'}, h('i')), stat = h('div', {class: 'sub', style: {margin: '8px 2px'}});
  var go = h('button', {class: 'btn pri', style: {width: '100%', marginTop: '10px'}});
  var sheet = openSheet({title: '補齊歌手與歌詞', icon: 'audio', body: body, tall: true, buzz: true, onClose: function(){ stop = true; }});
  function intro(){
    body.textContent = '';
    body.appendChild(h('div', {class: 'sub', style: {marginBottom: '8px', lineHeight: '1.6'}, text: '音樂庫共 ' + L.length + ' 首：缺歌手 ' + noArtist.length + ' 首、缺歌詞 ' + noLrc.length + ' 首。用歌名、歌曲長度和封面到 YouTube Music 比對，至少兩項吻合才會寫入；是影片的就用上傳的頻道當歌手。不確定的不會亂填。'}));
    body.appendChild(chk('artist', '補上歌手', '同時記下專輯名稱'));
    body.appendChild(chk('lrc', '補上歌詞', '先找會跟著唱的同步歌詞，沒有才用 YouTube Music 的純文字歌詞；中文一律轉成繁體'));
    body.appendChild(chk('listen', '找不到時用聽歌辨識確認', '讓 Gemini 聽這首歌的片段再比對（每首會用一次 Gemini 額度，比較慢）'));
    if(simp.length) body.appendChild(h('div', {class: 'sub', style: {margin: '8px 2px'}, text: '另外有 ' + simp.length + ' 首的歌詞是簡體，播放時已經自動顯示成繁體。'}));
    go.innerHTML = icon('search', 'sm') + '開始補齊';
    go.onclick = run;
    body.appendChild(go);
    paintIcons(body);
  }
  async function run(){
    if(running) { stop = true; go.disabled = true; go.textContent = '停止中…'; return; }
    var todo = L.filter(function(it){ return (st.artist && !String(it.artist || '').trim()) || (st.lrc && !Lyrics.of(it) && !it.lrcOff); });
    if(!todo.length){ toast('沒有需要補的歌'); return; }
    running = true; stop = false;
    body.textContent = ''; body.appendChild(bar); body.appendChild(stat); body.appendChild(go); body.appendChild(log);
    go.innerHTML = '停止'; go.className = 'btn';
    if(isApp) NAT.call('keep', 'fix', '補齊歌手與歌詞');
    var nA = 0, nL = 0, nF = 0;
    for(var i = 0; i < todo.length && !stop; i++){
      var it = todo[i];
      stat.textContent = '（' + (i + 1) + ' / ' + todo.length + '）' + songTitle(it);
      bar.firstChild.style.width = Math.round(i / todo.length * 100) + '%';
      var r = {};
      try{ r = await songFix(it, st); }catch(e){ r = {note: String(e.message || e)}; }
      var parts = [];
      if(r.artist){ nA++; parts.push('歌手：' + r.artist + (r.how === 'listen' ? '（聽歌辨識）' : r.how === 'cover' ? '（封面相符）' : '')); }
      if(r.lrc){ nL++; parts.push(r.lrc + '歌詞'); }
      if(!parts.length){ nF++; parts.push(r.note || '沒有找到'); }
      log.insertBefore(h('div', {class: 'fixRow' + (r.artist || r.lrc ? ' ok' : '')}, h('b', {text: songTitle(it)}), h('span', {text: parts.join('・')})), log.firstChild);
      /* 慢慢來，避免被 YouTube Music 當成機器人 */
      await new Promise(function(res){ setTimeout(res, 700); });
    }
    bar.firstChild.style.width = '100%';
    running = false;
    if(isApp) NAT.call('keep', 'fix', '');
    stat.textContent = (stop ? '已停止。' : '完成。') + '補上歌手 ' + nA + ' 首、歌詞 ' + nL + ' 首' + (nF ? '，' + nF + ' 首沒有找到' : '');
    go.disabled = false; go.className = 'btn pri'; go.innerHTML = '關閉'; go.onclick = function(){ sheet.close(); };
    buzz(20);
    fire('lib');
  }
  intro();
}
/* 音樂庫上方加一顆「補齊歌手與歌詞」 */
(function(){
  var head0 = renderMusicHead;
  renderMusicHead = function(box, L){
    head0(box, L);
    if(!isApp || !L.length) return;
    var nA = L.filter(function(it){ return !String(it.artist || '').trim(); }).length, nL = L.filter(function(it){ return !Lyrics.of(it) && !it.lrcOff; }).length;
    box.appendChild(h('button', {class: 'btn ghost sm fixBtn', html: icon('user', 'sm') + '補齊歌手與歌詞' + (nA || nL ? '<span class="c">缺歌手 ' + nA + '・缺歌詞 ' + nL + '</span>' : ''), onclick: function(){ buzz(10); songFixSheet(L); }}));
    paintIcons(box);
  };
})();
