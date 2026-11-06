/* ============================================================
   音訊轉檔：MP3（LAME）、FLAC（無損壓縮）、WAV（無損 PCM），附歌名／歌手／封面標籤
   輸入：{sampleRate, channels: [Float32Array, …]}
   ============================================================ */
var AudioEnc = (function(){
  function tick(){ return new Promise(function(r){ setTimeout(r, 0); }); }
  function clamp16(x){ x = x < -1 ? -1 : x > 1 ? 1 : x; return x < 0 ? Math.round(x * 32768) : Math.round(x * 32767); }
  function utf8(s){ return new TextEncoder().encode(String(s || '')); }

  /* ---------- WAV ---------- */
  async function wav(pcm, onp){
    var ch = Math.min(2, pcm.channels.length), n = pcm.channels[0].length, sr = pcm.sampleRate;
    var buf = new ArrayBuffer(44 + n * ch * 2), dv = new DataView(buf);
    function str(o, s){ for(var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
    var o = 44, step = 1 << 18;
    for(var i = 0; i < n; i++){
      for(var c = 0; c < ch; c++){ dv.setInt16(o, clamp16(pcm.channels[c][i]), true); o += 2; }
      if(i % step === 0){ if(onp) onp(i / n); await tick(); }
    }
    return new Blob([buf], {type: 'audio/wav'});
  }

  /* ---------- 位元寫入器 ---------- */
  function BW(cap){ this.b = new Uint8Array(cap || 65536); this.p = 0; this.acc = 0; this.n = 0; }
  BW.prototype.grow = function(){ var nb = new Uint8Array(this.b.length * 2); nb.set(this.b); this.b = nb; };
  BW.prototype.byte = function(v){ if(this.p >= this.b.length) this.grow(); this.b[this.p++] = v; };
  BW.prototype.bits = function(v, k){       /* 寫入 v 的低 k 位（k ≤ 32） */
    while(k > 0){
      var take = Math.min(k, 8 - this.n);
      var sh = k - take;
      var part = Math.floor(v / Math.pow(2, sh)) & ((1 << take) - 1);
      this.acc = (this.acc << take) | part; this.n += take; k -= take;
      if(this.n === 8){ this.byte(this.acc); this.acc = 0; this.n = 0; }
    }
  };
  BW.prototype.unary = function(q){ while(q >= 8 && this.n === 0){ this.byte(0); q -= 8; } while(q > 0){ this.bits(0, 1); q--; } this.bits(1, 1); };
  BW.prototype.align = function(){ if(this.n) this.bits(0, 8 - this.n); };
  BW.prototype.out = function(){ return this.b.subarray(0, this.p); };

  var CRC8 = new Uint8Array(256), CRC16 = new Uint16Array(256);
  (function(){
    for(var i = 0; i < 256; i++){
      var c = i; for(var j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; CRC8[i] = c;
      var d = i << 8; for(var k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff; CRC16[i] = d;
    }
  })();
  function crc8(a, s, e){ var c = 0; for(var i = s; i < e; i++) c = CRC8[c ^ a[i]]; return c; }
  function crc16(a, s, e){ var c = 0; for(var i = s; i < e; i++) c = ((c << 8) ^ CRC16[(c >> 8) ^ a[i]]) & 0xffff; return c; }

  /* FLAC 標籤區塊：VORBIS_COMMENT（歌名、歌手、歌詞）＋ PICTURE（封面） */
  function flacMeta(tags){
    tags = tags || {};
    var blocks = [], vendor = utf8('網頁擷取 FLAC'), cm = [];
    if(tags.title) cm.push(utf8('TITLE=' + tags.title));
    if(tags.artist) cm.push(utf8('ARTIST=' + tags.artist));
    if(tags.album) cm.push(utf8('ALBUM=' + tags.album));
    if(tags.lrc){ cm.push(utf8('LYRICS=' + tags.lrc)); cm.push(utf8('UNSYNCEDLYRICS=' + String(tags.lrc).replace(/\[[^\]]*\]/g, '').replace(/\n{2,}/g, '\n').trim())); }
    var vlen = 8 + vendor.length + cm.reduce(function(s, x){ return s + 4 + x.length; }, 0), vb = new Uint8Array(vlen), vdv = new DataView(vb.buffer), o = 0;
    vdv.setUint32(o, vendor.length, true); o += 4; vb.set(vendor, o); o += vendor.length;
    vdv.setUint32(o, cm.length, true); o += 4;
    cm.forEach(function(x){ vdv.setUint32(o, x.length, true); o += 4; vb.set(x, o); o += x.length; });
    blocks.push({type: 4, data: vb});
    if(tags.cover){
      var mime = utf8(tags.coverMime || 'image/jpeg'), pic = tags.cover;
      var pb = new Uint8Array(32 + mime.length + pic.length), pdv = new DataView(pb.buffer), q2 = 0;
      pdv.setUint32(q2, 3); q2 += 4; pdv.setUint32(q2, mime.length); q2 += 4; pb.set(mime, q2); q2 += mime.length;
      pdv.setUint32(q2, 0); q2 += 4; q2 += 16; pdv.setUint32(q2, pic.length); q2 += 4; pb.set(pic, q2);
      blocks.push({type: 6, data: pb});
    }
    return blocks;
  }

  /* ---------- FLAC（固定預測＋Rice 編碼，完全無損） ---------- */
  function residual(x, order, out){
    var n = x.length;
    for(var i = order; i < n; i++){
      var r;
      switch(order){
        case 0: r = x[i]; break;
        case 1: r = x[i] - x[i - 1]; break;
        case 2: r = x[i] - 2 * x[i - 1] + x[i - 2]; break;
        case 3: r = x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3]; break;
        default: r = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
      }
      out[i - order] = r;
    }
    return n - order;
  }
  function riceBits(sum, cnt, k){ return cnt * (k + 1) + Math.floor(sum / Math.pow(2, k)); }
  function bestK(sum, cnt){
    var best = 0, bb = Infinity;
    for(var k = 0; k <= 14; k++){ var b = riceBits(sum, cnt, k); if(b < bb){ bb = b; best = k; } }
    return [best, bb];
  }
  function encodeSubframe(w, x, tmp, zig){
    var n = x.length;
    var allSame = true; for(var i = 1; i < n; i++) if(x[i] !== x[0]){ allSame = false; break; }
    if(allSame){ w.bits(0, 8); w.bits(x[0] & 0xffff, 16); return; }
    var bestOrder = 0, bestCost = Infinity, bestPlan = null;
    for(var ord = 0; ord <= 4 && ord < n; ord++){
      var m = residual(x, ord, tmp);
      for(var j = 0; j < m; j++){ var r = tmp[j]; zig[j] = r >= 0 ? r * 2 : -r * 2 - 1; }
      /* 試不同的分割層級 */
      for(var po = 0; po <= 6; po++){
        if(n % (1 << po) !== 0 || (n >> po) <= ord) break;
        var part = n >> po, cost = 6, ks = [], s = 0;
        for(var p = 0; p < (1 << po); p++){
          var start = p === 0 ? 0 : p * part - ord, cnt = p === 0 ? part - ord : part, sum = 0;
          for(var q = 0; q < cnt; q++) sum += zig[start + q];
          var bk = bestK(sum, cnt); ks.push(bk[0]); cost += 4 + bk[1];
        }
        cost += ord * 16;
        if(cost < bestCost){ bestCost = cost; bestOrder = ord; bestPlan = {po: po, ks: ks}; }
      }
    }
    if(bestCost >= n * 16){       /* 直接存原始樣本 */
      w.bits(2, 8); for(var v = 0; v < n; v++) w.bits(x[v] & 0xffff, 16); return;
    }
    w.bits((8 | bestOrder) << 1, 8);
    for(var a = 0; a < bestOrder; a++) w.bits(x[a] & 0xffff, 16);
    var m2 = residual(x, bestOrder, tmp);
    for(var b = 0; b < m2; b++){ var r2 = tmp[b]; zig[b] = r2 >= 0 ? r2 * 2 : -r2 * 2 - 1; }
    w.bits(0, 2); w.bits(bestPlan.po, 4);
    var part2 = n >> bestPlan.po, idx = 0;
    for(var p2 = 0; p2 < (1 << bestPlan.po); p2++){
      var k = bestPlan.ks[p2], cnt2 = p2 === 0 ? part2 - bestOrder : part2;
      w.bits(k, 4);
      var div = 1 << k;
      for(var z = 0; z < cnt2; z++){
        var u = zig[idx++];
        w.unary(Math.floor(u / div));
        if(k) w.bits(u & (div - 1), k);
      }
    }
  }
  function utf8num(w, v){
    if(v < 0x80){ w.bits(v, 8); return; }
    var bytes = [], n = v, len = v < 0x800 ? 2 : v < 0x10000 ? 3 : v < 0x200000 ? 4 : v < 0x4000000 ? 5 : 6;
    for(var i = len - 1; i > 0; i--){ bytes.unshift(0x80 | (n & 0x3f)); n = Math.floor(n / 64); }
    bytes.unshift((0xff << (8 - len)) & 0xff | n);
    bytes.forEach(function(b){ w.bits(b, 8); });
  }
  async function flac(pcm, tags, onp){
    var ch = Math.min(2, pcm.channels.length), N = pcm.channels[0].length, sr = pcm.sampleRate, BS = 4096;
    var parts = [], w = new BW(1 << 20);
    var ints = [], tmp = new Int32Array(BS), zig = new Float64Array(BS);
    for(var c = 0; c < ch; c++) ints.push(new Int32Array(BS));
    var frame = 0;
    for(var pos = 0; pos < N; pos += BS, frame++){
      var bs = Math.min(BS, N - pos);
      for(var c2 = 0; c2 < ch; c2++){ var src = pcm.channels[c2]; for(var i = 0; i < bs; i++) ints[c2][i] = clamp16(src[pos + i]); }
      var start = w.p;
      w.bits(0xfff8, 16);
      w.bits(7, 4); w.bits(0, 4);                       /* 區塊大小在後面（16 位元），取樣率看 STREAMINFO */
      w.bits(ch === 2 ? 1 : 0, 4); w.bits(4, 3); w.bits(0, 1); /* 獨立聲道、16 bit */
      utf8num(w, frame);
      w.bits(bs - 1, 16);
      w.bits(crc8(w.b, start, w.p), 8);
      for(var c3 = 0; c3 < ch; c3++) encodeSubframe(w, ints[c3].subarray(0, bs), tmp, zig);
      w.align();
      var crc = crc16(w.b, start, w.p); w.bits(crc, 16);
      if(w.p > 8 << 20){ parts.push(w.out().slice()); w = new BW(1 << 20); }
      if(frame % 24 === 0){ if(onp) onp(pos / N); await tick(); }
    }
    parts.push(w.out().slice());
    /* 檔頭：fLaC＋STREAMINFO＋VORBIS_COMMENT（＋PICTURE） */
    var meta = [];
    var si = new BW(64);
    si.bits(BS, 16); si.bits(BS, 16); si.bits(0, 24); si.bits(0, 24);
    si.bits(sr, 20); si.bits(ch - 1, 3); si.bits(15, 5);
    si.bits(Math.floor(N / 4294967296), 4); si.bits(N >>> 0, 32);
    for(var m = 0; m < 16; m++) si.bits(0, 8);
    meta.push([0, si.out().slice()]);
    flacMeta(tags).forEach(function(b){ meta.push([b.type, b.data]); });
    var head = [new Uint8Array([0x66, 0x4c, 0x61, 0x43])];
    meta.forEach(function(mm, i){
      var hb = new Uint8Array(4); hb[0] = (i === meta.length - 1 ? 0x80 : 0) | mm[0];
      hb[1] = (mm[1].length >> 16) & 0xff; hb[2] = (mm[1].length >> 8) & 0xff; hb[3] = mm[1].length & 0xff;
      head.push(hb, mm[1]);
    });
    if(onp) onp(1);
    return new Blob(head.concat(parts), {type: 'audio/flac'});
  }

  /* ---------- MP3（LAME）＋ ID3v2.3 標籤 ---------- */
  function id3(tags){
    if(!tags) return null;
    var frames = [];
    function textFrame(id, txt){
      if(!txt) return;
      var s = String(txt), body = new Uint8Array(3 + s.length * 2 + 2);
      body[0] = 1; body[1] = 0xff; body[2] = 0xfe;
      for(var i = 0; i < s.length; i++){ var c = s.charCodeAt(i); body[3 + i * 2] = c & 0xff; body[4 + i * 2] = c >> 8; }
      frames.push([id, body]);
    }
    textFrame('TIT2', tags.title); textFrame('TPE1', tags.artist); textFrame('TALB', tags.album);
    function u16(str, term){ var a = [0xff, 0xfe]; for(var i = 0; i < str.length; i++){ var c = str.charCodeAt(i); a.push(c & 0xff, c >> 8); } if(term) a.push(0, 0); return a; }
    if(tags.lrc){
      /* USLT：完整歌詞（含時間軸文字，多數播放器可顯示）；SYLT：逐句同步歌詞 */
      var us = [1, 0x7a, 0x68, 0x6f].concat(u16('', true), u16(String(tags.lrc), false));
      frames.push(['USLT', new Uint8Array(us)]);
      if(typeof Lyrics !== 'undefined' && Lyrics.isSynced(tags.lrc)){
        var sy = [1, 0x7a, 0x68, 0x6f, 2, 1].concat(u16('', true));
        Lyrics.parse(tags.lrc).forEach(function(l){ var ms = Math.round(l.t * 1000); sy = sy.concat(u16(l.text || ' ', true), [(ms >>> 24) & 0xff, (ms >> 16) & 0xff, (ms >> 8) & 0xff, ms & 0xff]); });
        frames.push(['SYLT', new Uint8Array(sy)]);
      }
    }
    if(tags.cover){
      var mime = utf8(tags.coverMime || 'image/jpeg'), b = new Uint8Array(1 + mime.length + 1 + 1 + 1 + tags.cover.length), o = 0;
      b[o++] = 0; b.set(mime, o); o += mime.length; b[o++] = 0; b[o++] = 3; b[o++] = 0; b.set(tags.cover, o);
      frames.push(['APIC', b]);
    }
    if(!frames.length) return null;
    var size = frames.reduce(function(s, f){ return s + 10 + f[1].length; }, 0), out = new Uint8Array(10 + size), dv = new DataView(out.buffer);
    out.set([0x49, 0x44, 0x33, 3, 0, 0]);
    out[6] = (size >> 21) & 0x7f; out[7] = (size >> 14) & 0x7f; out[8] = (size >> 7) & 0x7f; out[9] = size & 0x7f;
    var p = 10;
    frames.forEach(function(f){ for(var i = 0; i < 4; i++) out[p + i] = f[0].charCodeAt(i); dv.setUint32(p + 4, f[1].length); p += 10; out.set(f[1], p); p += f[1].length; });
    return out;
  }
  async function mp3(pcm, kbps, tags, onp){
    if(!window.lamejs) throw new Error('MP3 編碼元件沒有載入');
    var ch = Math.min(2, pcm.channels.length), N = pcm.channels[0].length, sr = pcm.sampleRate;
    if([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].indexOf(sr) < 0) throw new Error('不支援的取樣率 ' + sr);
    var enc = new lamejs.Mp3Encoder(ch, sr, kbps || 192), out = [], tg = id3(tags);
    if(tg) out.push(tg);
    var B = 1152 * 20, L = new Int16Array(B), R = new Int16Array(B);
    for(var pos = 0; pos < N; pos += B){
      var n = Math.min(B, N - pos);
      for(var i = 0; i < n; i++){ L[i] = clamp16(pcm.channels[0][pos + i]); if(ch > 1) R[i] = clamp16(pcm.channels[1][pos + i]); }
      var d = ch > 1 ? enc.encodeBuffer(L.subarray(0, n), R.subarray(0, n)) : enc.encodeBuffer(L.subarray(0, n));
      if(d.length) out.push(new Uint8Array(d));
      if((pos / B) % 8 === 0){ if(onp) onp(pos / N); await tick(); }
    }
    var f = enc.flush(); if(f.length) out.push(new Uint8Array(f));
    if(onp) onp(1);
    return new Blob(out, {type: 'audio/mpeg'});
  }
  return {wav: wav, flac: flac, mp3: mp3, id3: id3, flacMeta: flacMeta};
})();

/* ---------- 轉檔佇列：把檔案庫裡的音訊轉成 MP3／FLAC／WAV ---------- */
var Conv = {q: [], busy: false};
var AUDIO_FMTS = {
  mp3: {name: 'MP3', ext: 'mp3', mime: 'audio/mpeg'},
  flac: {name: 'FLAC（無損格式）', ext: 'flac', mime: 'audio/flac'},
  wav: {name: 'WAV（無損 PCM）', ext: 'wav', mime: 'audio/wav'}
};
Conv.add = function(item, fmt, opts){ this.q.push({item: item, fmt: fmt, opts: opts || {}}); this.next(); };
Conv.card = function(job, pct, msg){
  Dock.set('conv', h('div', {class: 'dockCard glass'}, h('span', {html: ring(pct)}),
    h('div', {class: 't'}, h('b', {text: '轉成 ' + AUDIO_FMTS[job.fmt].name + ' ' + Math.round(pct * 100) + '%' + (this.q.length ? '（還有 ' + this.q.length + ' 個）' : '')}), h('div', {class: 'sub', text: msg || job.item.name}))));
};
Conv.next = async function(){
  if(this.busy || !this.q.length) return;
  this.busy = true;
  var job = this.q.shift(), it = job.item, f = AUDIO_FMTS[job.fmt];
  try{
    this.card(job, 0, '解碼音訊…');
    var blob = await Lib.blob(it);
    var ab = await blob.arrayBuffer();
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC();
    var buf = await new Promise(function(res, rej){ ctx.decodeAudioData(ab, res, rej); });
    try{ ctx.close(); }catch(e){}
    var pcm = {sampleRate: buf.sampleRate, channels: []};
    for(var c = 0; c < Math.min(2, buf.numberOfChannels); c++) pcm.channels.push(buf.getChannelData(c));
    var tags = {title: it.title || it.name.replace(/\.[^.]+$/, ''), artist: it.artist || '', album: it.album || ''};
    if(CFG.lyr && CFG.lyr.auto){ this.card(job, 0, '尋找歌詞…'); it.dur = it.dur || Math.round(buf.duration); try{ var lr = await Lyrics.auto(it); if(lr) tags.lrc = lr; }catch(e){} }
    var th = Lib.thumb(it);
    if(th){ try{ var tb = await (await fetchAny(th)).arrayBuffer(); tags.cover = new Uint8Array(tb); tags.coverMime = 'image/jpeg'; }catch(e){} }
    var self = this, onp = function(p){ self.card(job, p, '編碼中…'); };
    var out = job.fmt === 'mp3' ? await AudioEnc.mp3(pcm, job.opts.kbps || 320, tags, onp) : job.fmt === 'flac' ? await AudioEnc.flac(pcm, tags, onp) : await AudioEnc.wav(pcm, onp);
    this.card(job, 1, '儲存中…');
    var name = it.name.replace(/\.[^.]+$/, '') + '.' + f.ext;
    var meta = {src: it.src || '', title: it.title || '', artist: it.artist || '', album: it.album || '', thumbFrom: it.id};
    if(tags.lrc){ meta.lrc = tags.lrc; meta.lrcSrc = it.lrcSrc || ''; }
    if(it.folder) meta.folder = it.folder;
    var nu = await saveBigBlob(out, name, meta);
    if(LF.map[it.id]){ LF.map[nu.id] = LF.map[it.id]; LF.save(); }
    if(!job.opts.keep) await Lib.del([it.id]); else await Lib.refresh();
    toast('✓ 已轉成 ' + f.name + '（' + fmtSize(out.size) + '）', false, ['播放', function(){ Music.playItem(Lib.byId(nu.id) || nu); }]);
  }catch(e){
    toast('轉檔失敗：' + (e && e.message || e), true);
  }finally{
    Dock.remove('conv'); this.busy = false; this.next();
  }
};
async function fetchAny(u){
  if(/^file:/.test(u)) return await new Promise(function(res, rej){ var x = new XMLHttpRequest(); x.open('GET', u); x.responseType = 'blob'; x.onload = function(){ res(x.response); }; x.onerror = rej; x.send(); });
  return await (await fetch(u)).blob();
}
/* 大檔分段寫入（APK），網頁版直接存 IndexedDB */
async function saveBigBlob(blob, name, meta){
  if(!isApp) return await Lib.addBlob(blob, name, meta);
  var token = uid(), CH = 1 << 20, r = null;
  for(var o = 0; o < blob.size || o === 0; o += CH){
    var last = o + CH >= blob.size;
    var b64 = await blobToB64(blob.slice(o, o + CH));
    r = NAT.json('libSaveChunk', token, b64, last, name, blob.type, JSON.stringify(meta || {}));
    if(!r || r.ok === false) throw new Error(r && r.err || '儲存失敗');
    if(last) break;
  }
  await Lib.refresh();
  return r.item;
}
