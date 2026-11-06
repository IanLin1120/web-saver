/* ============================================================
   YouTube：解析影片可用的畫質與音軌，下載影片（最高 4K）或音樂（MP3／M4A／OPUS／FLAC／WAV）
   做法同 Snaptube／影片下載工具：向 YouTube 取得「影像」「聲音」分開的原始串流，
   分段下載後在手機上合併（不重新壓縮），音樂再依需要轉成 MP3／FLAC／WAV。
   解析設定放在 GitHub（yt.json），YouTube 改版時只要更新設定，不用重裝 App。
   ============================================================ */
var YT_DEFAULT = {
  v: 3,
  piped: ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee', 'https://pipedapi.reallyaweso.me'],
  invidious: ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be', 'https://invidious.f5.si'],
  endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
  clients: [
    {name: 'ANDROID_VR', id: 28, ver: '1.65.10', ua: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      ctx: {deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L'}},
    {name: 'ANDROID_VR', id: 28, ver: '1.62.27', ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      ctx: {deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L'}},
    {name: 'ANDROID_VR', id: 28, ver: '1.60.19', ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      ctx: {deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L'}},
    {name: 'IOS', id: 5, ver: '20.10.4', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
      ctx: {deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82'}},
    {name: 'ANDROID', id: 3, ver: '20.10.38', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
      ctx: {androidSdkVersion: 34, osName: 'Android', osVersion: '14'}},
    {name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', id: 85, ver: '2.0', ua: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      ctx: {}, embed: true}
  ]
};
var YT = {cfg: (function(c){ return c && (c.v || 0) >= YT_DEFAULT.v ? c : YT_DEFAULT; })(lsGet('ws.ytcfg', null)), cache: {}};
YT.loadCfg = async function(){
  try{
    var r = await fetch(GH.pages + 'yt.json?t=' + Math.floor(Date.now() / 3600e3), {cache: 'no-store'});
    if(r.ok){ var c = await r.json(); if(c && c.clients && c.clients.length && (c.v || 0) >= (YT_DEFAULT.v || 0)){ YT.cfg = c; lsSet('ws.ytcfg', c); } }
  }catch(e){}
};
YT.idOf = function(u){
  try{
    var x = new URL(u), hst = x.hostname.replace(/^(www|m|music)\./, '');
    if(hst === 'youtu.be') return x.pathname.slice(1, 12) || null;
    if(!/youtube(-nocookie)?\.com$/.test(hst)) return null;
    if(x.searchParams.get('v')) return x.searchParams.get('v').slice(0, 11);
    var m = x.pathname.match(/^\/(shorts|live|embed|v)\/([\w-]{11})/);
    return m ? m[2] : null;
  }catch(e){ return null; }
};
var HTTPW = {};
on('http', function(d){ var w = HTTPW[d.id]; if(w){ delete HTTPW[d.id]; w(d); } });
function natHttp(method, url, headers, body){
  return new Promise(function(res, rej){
    var id = 'h' + uid();
    HTTPW[id] = function(d){ if(d.status) res(d); else rej(new Error(d.err || '連線失敗')); };
    NAT.call('http', id, method, url, JSON.stringify(headers || {}), body || '', false);
    setTimeout(function(){ if(HTTPW[id]){ delete HTTPW[id]; rej(new Error('逾時')); } }, 30000);
  });
}
/* 先用 2 個位元組試抓，確認這個用戶端給的網址真的能下載（避免 HTTP 403），不行就換下一個 */
/* 試抓：在檔案中段抓 2 個位元組（YouTube 常常開頭給抓、後面才拒絕），確認真的能完整下載 */
async function ytProbe(url, ua, len){
  len = +len || 0;
  var off = len > 6e6 ? Math.min(len - 2, 5e6 + Math.floor(Math.random() * 1e6)) : len > 4 ? Math.floor(len / 2) : 0;
  try{
    var hd = {'Range': 'bytes=' + off + '-' + (off + 1)}; if(ua) hd['User-Agent'] = ua;
    var r = await natHttp('GET', url, hd, '');
    return r.status === 206 || r.status === 200 ? 0 : r.status;
  }catch(e){ return -1; }
}
async function ytCheck(d){
  var fm = d.formats;
  var vids = fm.filter(function(f){ return /^video/.test(f.mimeType) && !f.audioQuality && (f.height || 0) >= 480; }).sort(function(a, b){ return (b.contentLength || 0) - (a.contentLength || 0); });
  var auds = fm.filter(function(f){ return /^audio/.test(f.mimeType); });
  var tests = [vids[0], auds[0]].filter(Boolean);
  if(!tests.length) tests = [fm[0]];
  for(var i = 0; i < tests.length; i++){ var c = await ytProbe(tests[i].url, d.ua, tests[i].contentLength); if(c) return c; }
  return 0;
}
/* 來源一：YouTube 官方 API（模擬各種用戶端） */
async function ytInner(id, c){
  var client = Object.assign({clientName: c.name, clientVersion: c.ver, hl: 'zh-TW', gl: 'TW', timeZone: 'Asia/Taipei', utcOffsetMinutes: 480}, c.ctx || {});
  var body = {context: {client: client}, videoId: id, contentCheckOk: true, racyCheckOk: true};
  if(c.embed) body.context.thirdParty = {embedUrl: 'https://www.youtube.com/watch?v=' + id};
  var r = await natHttp('POST', YT.cfg.endpoint, {'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': String(c.id), 'X-YouTube-Client-Version': c.ver, 'Origin': 'https://www.youtube.com'}, JSON.stringify(body));
  var j = JSON.parse(r.body), st = j.playabilityStatus || {};
  if(st.status !== 'OK') throw new Error(st.reason || st.status || ('HTTP ' + r.status));
  var sd = j.streamingData || {};
  return {id: id, src: c.name + ' ' + c.ver, ua: c.ua, details: j.videoDetails || {}, formats: (sd.adaptiveFormats || []).concat(sd.formats || []).filter(function(f){ return f.url; }), hls: sd.hlsManifestUrl || ''};
}
/* 來源二：Piped（開源的 YouTube 前端，影片經由它的伺服器轉送，不受 YouTube 的下載限制） */
async function ytPiped(id, base){
  var r = await natHttp('GET', base.replace(/\/$/, '') + '/streams/' + id, {'Accept': 'application/json'}, '');
  if(r.status !== 200) throw new Error('HTTP ' + r.status);
  var j = JSON.parse(r.body); if(j.error) throw new Error(j.error);
  var fm = [];
  (j.videoStreams || []).forEach(function(v){ if(!v.url) return; fm.push({url: v.url, mimeType: (v.mimeType || 'video/mp4') + '; codecs="' + (v.codec || '') + '"', height: v.height || parseInt(v.quality) || 0, width: v.width, fps: v.fps, bitrate: v.bitrate, contentLength: v.contentLength > 0 ? v.contentLength : 0, audioQuality: v.videoOnly ? undefined : 'AUDIO', approxDurationMs: (j.duration || 0) * 1000}); });
  (j.audioStreams || []).forEach(function(a){ if(!a.url) return; fm.push({url: a.url, mimeType: (a.mimeType || 'audio/mp4') + '; codecs="' + (a.codec || '') + '"', bitrate: a.bitrate, contentLength: a.contentLength > 0 ? a.contentLength : 0, audioQuality: 'AUDIO', approxDurationMs: (j.duration || 0) * 1000}); });
  return {id: id, src: 'Piped（' + base.replace(/^https?:\/\//, '') + '）', ua: '', details: {title: j.title, author: j.uploader, lengthSeconds: j.duration}, formats: fm, hls: j.hls || ''};
}
/* 來源三：Invidious（local=true 讓影片經由該伺服器轉送） */
async function ytInvidious(id, base){
  base = base.replace(/\/$/, '');
  var r = await natHttp('GET', base + '/api/v1/videos/' + id + '?local=true', {'Accept': 'application/json'}, '');
  if(r.status !== 200) throw new Error('HTTP ' + r.status);
  var j = JSON.parse(r.body); if(j.error) throw new Error(j.error);
  var abs = function(u){ return /^https?:/.test(u) ? u : base + u; };
  var fm = [];
  (j.adaptiveFormats || []).forEach(function(f){
    if(!f.url) return;
    var wh = String(f.size || '').split('x');
    fm.push({url: abs(f.url), mimeType: f.type, height: +wh[1] || parseInt(f.resolution) || 0, width: +wh[0] || 0, fps: f.fps, bitrate: +f.bitrate || 0, contentLength: +f.clen || 0, audioQuality: /^audio/.test(f.type) ? 'AUDIO' : undefined, approxDurationMs: (j.lengthSeconds || 0) * 1000});
  });
  (j.formatStreams || []).forEach(function(f){ var wh = String(f.size || '').split('x'); fm.push({url: abs(f.url), mimeType: f.type, height: +wh[1] || parseInt(f.resolution) || 0, bitrate: +f.bitrate || 0, contentLength: +f.clen || 0, audioQuality: 'AUDIO', approxDurationMs: (j.lengthSeconds || 0) * 1000}); });
  return {id: id, src: 'Invidious（' + base.replace(/^https?:\/\//, '') + '）', ua: '', details: {title: j.title, author: j.author, lengthSeconds: j.lengthSeconds}, formats: fm, hls: j.hlsUrl ? abs(j.hlsUrl) : ''};
}
YT.sources = function(){
  var L = [];
  (YT.cfg.clients || []).forEach(function(c){ L.push({key: 'yt:' + c.name + c.ver, label: c.name + ' ' + c.ver, run: function(id){ return ytInner(id, c); }}); });
  (YT.cfg.piped || YT_DEFAULT.piped).forEach(function(b){ L.push({key: 'piped:' + b, label: 'Piped ' + b, run: function(id){ return ytPiped(id, b); }}); });
  (YT.cfg.invidious || YT_DEFAULT.invidious).forEach(function(b){ L.push({key: 'inv:' + b, label: 'Invidious ' + b, run: function(id){ return ytInvidious(id, b); }}); });
  return L;
};
YT.bad = lsGet('ws.ytBad', {});     /* 最近失敗的來源，30 分鐘內先跳過 */
YT.markBad = function(key){ YT.bad[key] = Date.now(); lsSet('ws.ytBad', YT.bad); };
YT.player = async function(id, skip, onStep){
  if(!skip && YT.cache[id] && Date.now() - YT.cache[id].t < 2 * 3600e3) return YT.cache[id].d;
  skip = skip || [];
  var errs = [], hlsOnly = null, now = Date.now();
  var srcs = YT.sources().sort(function(a, b){ return (YT.bad[a.key] && now - YT.bad[a.key] < 1800e3 ? 1 : 0) - (YT.bad[b.key] && now - YT.bad[b.key] < 1800e3 ? 1 : 0); });
  for(var i = 0; i < srcs.length; i++){
    var sc = srcs[i];
    if(skip.indexOf(sc.key) >= 0) continue;
    if(onStep) onStep(sc.label, i + 1, srcs.length);
    try{
      var d = await sc.run(id);
      d.key = sc.key;
      if(d.formats.length){
        var code = await ytCheck(d);
        if(!code){ YT.cache[id] = {t: Date.now(), d: d}; return d; }
        errs.push(sc.label + '：試抓被拒（' + (code > 0 ? 'HTTP ' + code : '連線失敗') + '）');
        YT.markBad(sc.key);
      } else errs.push(sc.label + '：沒有可直接下載的串流');
      if(d.hls && !hlsOnly){ hlsOnly = Object.assign({}, d, {formats: []}); }
    }catch(e){ errs.push(sc.label + '：' + e.message); }
  }
  if(hlsOnly){ hlsOnly.note = errs.join('\n'); YT.cache[id] = {t: Date.now(), d: hlsOnly}; return hlsOnly; }
  var err = new Error(errs.join('\n')); err.list = errs; throw err;
};
function ytCodec(f){ var m = (f.mimeType || '').match(/codecs="([^"]+)"/); return m ? m[1] : ''; }
function ytOptions(d){
  var vids = d.formats.filter(function(f){ return /^video\//.test(f.mimeType) && !f.audioQuality; });
  var muxed = d.formats.filter(function(f){ return /^video\//.test(f.mimeType) && f.audioQuality; });
  var auds = d.formats.filter(function(f){ return /^audio\//.test(f.mimeType); });
  var aM4a = auds.filter(function(f){ return /mp4a/.test(ytCodec(f)); }).sort(function(a, b){ return b.bitrate - a.bitrate; })[0];
  var aOpus = auds.filter(function(f){ return /opus/.test(ytCodec(f)); }).sort(function(a, b){ return b.bitrate - a.bitrate; })[0];
  var heights = {}, out = [];
  vids.forEach(function(f){ if(f.height) (heights[f.height] = heights[f.height] || []).push(f); });
  Object.keys(heights).map(Number).sort(function(a, b){ return b - a; }).forEach(function(hh){
    var L = heights[hh];
    var avc = L.filter(function(f){ return /avc1/.test(ytCodec(f)); }).sort(function(a, b){ return b.bitrate - a.bitrate; })[0];
    var vp9 = L.filter(function(f){ return /vp0?9/.test(ytCodec(f)); }).sort(function(a, b){ return b.bitrate - a.bitrate; })[0];
    if(avc && aM4a) out.push({h: hh, label: qLabel(hh, avc), cont: 'mp4', codec: 'H.264', v: avc, a: aM4a});
    else if(vp9 && (aOpus || aM4a)) out.push({h: hh, label: qLabel(hh, vp9), cont: 'webm', codec: 'VP9', v: vp9, a: aOpus || null});
  });
  muxed.sort(function(a, b){ return (b.height || 0) - (a.height || 0); }).forEach(function(f){
    if(!out.some(function(o){ return o.h === f.height; })) out.push({h: f.height, label: qLabel(f.height, f) + '（含聲音）', cont: 'mp4', codec: 'H.264', v: f, a: null, muxed: true});
  });
  return {video: out, m4a: aM4a, opus: aOpus};
}
function qLabel(hh, f){
  var fps = f.fps && f.fps > 30 ? ' ' + f.fps + 'fps' : '';
  var tag = hh >= 2160 ? ' 4K' : hh >= 1440 ? ' 2K' : hh >= 1080 ? ' Full HD' : hh >= 720 ? ' HD' : '';
  return hh + 'p' + fps + tag;
}
function fSize(f){ return f && f.contentLength ? +f.contentLength : (f && f.bitrate && f.approxDurationMs ? f.bitrate / 8 * f.approxDurationMs / 1000 : 0); }
function ytMeta(d){
  var t = d.details.title || 'YouTube', au = (d.details.author || '').replace(/\s*-\s*Topic$/i, '');
  var m = t.match(/^(.{1,60}?)\s+[-–—]\s+(.+)$/);
  var song = t, artist = au;
  if(m && !/Topic$/i.test(d.details.author || '')){ artist = m[1].trim(); song = m[2].replace(/\s*[\(\[【（](official|mv|music video|lyrics?|audio|官方|歌詞|完整版|高音質)[^\)\]】）]*[\)\]】）]\s*/ig, '').trim() || m[2]; }
  var br = t.match(/[【《\[]([^】》\]]{1,60})[】》\]]/);
  if(br && song === t){ song = br[1].replace(/\s+(official|mv|music video|lyrics?|audio).*$/i, '').trim(); }
  return {title: t, song: song, artist: artist, thumb: 'https://i.ytimg.com/vi/' + d.id + '/hqdefault.jpg', thumbMax: 'https://i.ytimg.com/vi/' + d.id + '/maxresdefault.jpg', dur: +d.details.lengthSeconds || 0};
}

/* ---------- 下載面板（Snaptube 風格：大縮圖、影片／音樂分頁、選畫質、一鍵下載） ----------
   主要來源：App 內 YouTube 播放器實際在播的串流（已帶 YouTube 算好的簽章與驗證，不會被 403 拒絕）。
   找不到時才改用舊的多來源解析。 */
var ITAG_H = {160: 144, 133: 240, 134: 360, 135: 480, 136: 720, 137: 1080, 298: 720, 299: 1080, 264: 1440, 266: 2160, 278: 144, 242: 240, 243: 360, 244: 480, 247: 720, 248: 1080,
  271: 1440, 313: 2160, 302: 720, 303: 1080, 308: 1440, 315: 2160, 330: 144, 331: 240, 332: 360, 333: 480, 334: 720, 335: 1080, 336: 1440, 337: 2160,
  394: 144, 395: 240, 396: 360, 397: 480, 398: 720, 399: 1080, 400: 1440, 401: 2160, 18: 360, 22: 720};
var QKEY = {144: 'tiny', 240: 'small', 360: 'medium', 480: 'large', 720: 'hd720', 1080: 'hd1080', 1440: 'hd1440', 2160: 'hd2160', 4320: 'highres'};
var QKEY_H = {tiny: 144, small: 240, medium: 360, large: 480, hd720: 720, hd1080: 1080, hd1440: 1440, hd2160: 2160, highres: 4320};
function sMime(s){ try{ return decodeURIComponent(s.mime || ''); }catch(e){ return s.mime || ''; } }

/* 讓 App 內的播放器載入這部影片並回報資訊；影片沒開著就先在 YouTube 分頁打開 */
async function ytPageData(id, onStep){
  if(!isApp || !NAT.has('ytInfoReq')) return null;
  var where = NAT.call('ytInfoReq', id);
  if(!where){
    if(onStep) onStep('在 YouTube 分頁開啟影片…');
    YTB.started = true; NAT.call('ytLoad', 'https://m.youtube.com/watch?v=' + id);
    for(var k = 0; k < 40 && !where; k++){ await sleep(500); where = NAT.call('ytInfoReq', id); }
    if(!where) return null;
  }
  if(onStep) onStep('讀取影片資訊…');
  for(var i = 0; i < 24; i++){
    var pd = NAT.json('ytSniff', id);
    if(pd && pd.info && (pd.info.formats.length || pd.info.levels.length)) return pd;
    await sleep(400);
    if(i % 4 === 3) NAT.call('ytInfoReq', id);
  }
  return NAT.json('ytSniff', id);
}
function ytFromPage(id, pd){
  var inf = pd.info || {details: {}, formats: [], levels: []};
  var fm = (inf.formats || []).slice();
  if(!fm.some(function(f){ return /^video/.test(f.mimeType); })){
    (inf.levels || []).forEach(function(q){ var hh = QKEY_H[q]; if(hh && hh < 4320) fm.push({itag: 0, mimeType: 'video/webm', height: hh}); });
    if(!fm.length) [1080, 720, 480, 360].forEach(function(hh){ fm.push({itag: 0, mimeType: 'video/webm', height: hh}); });
  }
  return {id: id, page: true, src: 'App 內播放器', details: inf.details || {}, formats: fm, hls: inf.hls || '', live: !!inf.live, sabr: !!inf.sabr, captions: inf.captions || []};
}
function ytHeightOf(itag, d){
  var f = (d.formats || []).filter(function(x){ return x.itag === itag; })[0];
  return f && f.height ? f.height : (ITAG_H[itag] || 0);
}
/* 從攔截到的串流中挑出指定畫質的影像＋最搭的聲音 */
function ytPickStreams(d, pd, wantH, audioOnly){
  var len = +(d.details.lengthSeconds || 0);
  var S = (pd && pd.streams || []).filter(function(s){ return !s.sabr && (!len || !+s.dur || Math.abs(+s.dur - len) < 4); });
  var aud = S.filter(function(s){ return /^audio/.test(sMime(s)); });
  var vids = S.filter(function(s){ return /^video/.test(sMime(s)) && (audioOnly || ytHeightOf(s.itag, d) === wantH); });
  var v = vids.sort(function(a, b){ return (+b.clen || 0) - (+a.clen || 0); })[0] || null;
  var cont = v && /webm/.test(sMime(v)) ? 'webm' : 'mp4';
  var a = aud.filter(function(s){ return (cont === 'webm') === /webm/.test(sMime(s)); }).sort(function(x, y){ return (+y.clen || 0) - (+x.clen || 0); })[0] || aud[0] || null;
  return {v: v, a: a, cont: cont, sabrOnly: !S.length && (pd && pd.streams || []).some(function(s){ return s.sabr; })};
}
async function ytPageStreams(d, wantH, audioOnly, onStep){
  var pd = NAT.json('ytSniff', d.id), r = ytPickStreams(d, pd, wantH, audioOnly);
  if(r.a && (audioOnly || r.v)) return r;
  if(onStep) onStep(audioOnly ? '取得音軌…' : '切換到 ' + wantH + 'p，取得串流…');
  var tag = NAT.call('ytPrep', d.id, audioOnly ? 'tiny' : (QKEY[wantH] || 'hd720'));
  if(!tag){ var pd2 = await ytPageData(d.id, onStep); if(!pd2) return r; tag = NAT.call('ytPrep', d.id, audioOnly ? 'tiny' : (QKEY[wantH] || 'hd720')); }
  for(var i = 0; i < 36; i++){
    await sleep(500);
    pd = NAT.json('ytSniff', d.id); r = ytPickStreams(d, pd, wantH, audioOnly);
    if(r.a && (audioOnly || r.v)) break;
    if(i === 14) NAT.call('ytPrep', d.id, audioOnly ? 'tiny' : (QKEY[wantH] || 'hd720'));
  }
  NAT.call('ytPrep', d.id, '__done');
  return r;
}
/* 每個畫質的選項（大小、容器） */
function ytPageOptions(d){
  var h264 = CFG.yt.codec === 'h264';
  var vids = d.formats.filter(function(f){ return /^video/.test(f.mimeType) && !f.audioQuality && f.height; });
  var auds = d.formats.filter(function(f){ return /^audio/.test(f.mimeType); });
  var aOpus = auds.filter(function(f){ return /opus/.test(ytCodec(f)); }).sort(function(a, b){ return b.bitrate - a.bitrate; })[0];
  var aM4a = auds.filter(function(f){ return /mp4a/.test(ytCodec(f)); }).sort(function(a, b){ return b.bitrate - a.bitrate; })[0];
  var by = {};
  vids.forEach(function(f){
    var c = ytCodec(f), ok = h264 ? (/avc1/.test(c) || !c) : !/av01/.test(c);
    if(!ok) return;
    var cur = by[f.height];
    var score = function(x){ var cc = ytCodec(x); return (h264 ? 0 : /vp0?9/.test(cc) ? 2 : 1) * 1e12 + (x.contentLength || 0); };
    if(!cur || score(f) > score(cur)) by[f.height] = f;
  });
  if(h264) Object.keys(by).forEach(function(k){ if(+k > 1080) delete by[k]; });
  var out = Object.keys(by).map(Number).sort(function(a, b){ return b - a; }).map(function(hh){
    var f = by[hh], webm = /webm/.test(f.mimeType), a = webm ? (aOpus || aM4a) : (aM4a || aOpus);
    return {h: hh, f: f, cont: webm ? 'webm' : 'mp4', fps: f.fps || 0, size: fSize(f) + fSize(a)};
  });
  return {video: out, opus: aOpus, m4a: aM4a, best: h264 ? (aM4a || aOpus) : (aOpus || aM4a)};
}
function qTag(hh){ return hh >= 2160 ? '4K' : hh >= 1440 ? '2K' : hh >= 1080 ? 'Full HD' : hh >= 720 ? 'HD' : hh >= 480 ? '標準' : '省流量'; }

async function openYt(id){
  if(!isApp){ dialog('需要 APK 版', '網頁版受瀏覽器限制，無法讀取 YouTube 的影片串流。請使用 APK 版的「YouTube」分頁。', [['好', null]]); return; }
  var body = h('div', {html: '<div class="ringBox"><div class="spin"></div><div class="sub">正在讀取影片…</div></div>'});
  var foot = h('div', {style: {display: 'contents'}});
  var s = openSheet({title: '下載', icon: 'download', body: body, tall: true, cls: 'ytdl', foot: foot,
    headExtra: h('button', {class: 'btn sm ghost', text: '一般偵測', onclick: function(){ s.close(); openMedia(true); }})});
  var step = function(t){ var st = body.querySelector('.sub'); if(st) st.textContent = t; };
  var d = null, pd = await ytPageData(id, step);
  if(s.closed) return;
  if(pd && (pd.info || (pd.streams && pd.streams.length))) d = ytFromPage(id, pd);
  if(!d){
    try{ d = await YT.player(id, null, function(label, i, n){ step('尋找下載來源（' + i + '/' + n + '）：' + label); }); }
    catch(e){
      body.innerHTML = '';
      body.appendChild(h('div', {class: 'empty', html: '<div class="big">⚠️</div>無法讀取這部影片<br><span class="sub" style="white-space:pre-line">' + esc(e.message) + '</span>'}));
      body.appendChild(h('div', {class: 'note', html: '請先在「YouTube」分頁打開這部影片並播放幾秒，再按下載。會員專屬、私人或有年齡限制（未登入）的影片無法下載。'}));
      return;
    }
  }
  if(s.closed) return;
  var meta = ytMeta(d), tab = lsGet('ws.ytTab', 'video'), pick = null;
  var opt = d.page ? ytPageOptions(d) : null, old = d.page ? null : ytOptions(d);
  var name = h('input', {type: 'text', value: meta.title.replace(/[\\\/:*?"<>|]/g, '_').slice(0, 100)});
  var nm = function(){ return (name.value.trim() || meta.title).replace(/[\\\/:*?"<>|]/g, '_'); };
  var go = h('button', {class: 'btn pri block', html: icon('download', 'sm') + '下載', disabled: true});
  foot.appendChild(go);
  function choose(p, el){ pick = p; qsa('.ydRow', body).forEach(function(x){ x.classList.remove('on'); }); if(el) el.classList.add('on'); go.disabled = !p; go.innerHTML = icon('download', 'sm') + (p ? '下載　' + p.label : '下載'); }
  var more = false;
  /* 所有可下載的選項 */
  function items(){
    var M = [], V = [], C = [], T = [];
    var dur = meta.dur, best = d.page ? opt.best : (old.opus || old.m4a);
    var m4a = d.page ? opt.m4a : old.m4a, opus = d.page ? opt.opus : old.opus;
    var au = function(pk, extra){ return function(){ if(d.page) ytStartPage(d, meta, {type: 'audio', name: nm(), extra: extra}); else ytStart(d, meta, {type: 'audio', pick: pk, name: nm(), extra: extra}); }; };
    var orig = (CFG.yt.codec === 'h264' ? (m4a || opus) : (opus || m4a));
    M.push({k: 'fast', label: '快速下載', sub: (orig && /mp4a/.test(ytCodec(orig)) ? 'M4A' : 'OPUS') + '（原始音軌）・最快、不轉檔', size: fSize(orig), big: '♪', small: '原檔', color: 'var(--c-audio)', run: au('best', {audioOut: 'orig'})});
    [[320, '經典 MP3 下載（320K）', '高品質・支援藍牙音箱、手機、汽車'], [192, 'MP3（192K）', '一般品質'], [128, 'MP3（128K）', '檔案小・適合手機'], [70, 'MP3（70K）', '低品質・最省空間']].forEach(function(k, i){
      M.push({k: 'mp3' + k[0], label: k[1], sub: k[2] + '・附歌名封面', size: dur * k[0] * 125, big: 'MP3', small: k[0] + 'K', color: 'var(--c-audio)', tag: k[0] >= 320 ? '下載慢' : k[0] < 100 ? '低品質' : '', run: au('best', {audioOut: 'orig', convert: 'mp3:' + k[0]})});
    });
    if(m4a) M.push({k: 'm4a', label: 'M4A（AAC 原始）', sub: '不轉檔・原音直出', size: fSize(m4a), big: 'M4A', small: 'AAC', color: 'var(--c-audio)', run: au('m4a', {audioOut: 'm4a'})});
    if(opus) M.push({k: 'opus', label: 'OPUS（原始最高音質）', sub: 'YouTube 音質最好的音軌・不轉檔', size: fSize(opus), big: 'OPUS', small: '原始', color: 'var(--c-audio)', run: au('opus', {audioOut: 'opus'})});
    M.push({k: 'flac', label: 'FLAC 無損', sub: '完整保留原始音軌・附歌名封面', size: dur * 48000 * 4 * 0.6, big: 'FLAC', small: '無損', color: 'var(--olive)', run: au('best', {audioOut: 'orig', convert: 'flac'})});
    M.push({k: 'wav', label: 'WAV 無損 PCM', sub: '未壓縮，適合剪輯軟體', size: dur * 48000 * 4, big: 'WAV', small: '無損', color: 'var(--olive)', run: au('best', {audioOut: 'orig', convert: 'wav'})});
    var vl = d.page ? opt.video : old.video;
    vl.forEach(function(o){
      var hh = o.h, nmQ = hh >= 2160 ? '超高畫質' : hh >= 1080 ? '高品質' : hh >= 720 ? '高品質' : '快速下載';
      var desc = hh >= 1080 ? '細節豐富，適合全螢幕播放' : hh >= 720 ? '高解析度，適合手機播放' : hh >= 360 ? '一般品質，下載快' : '畫質較差';
      V.push({k: 'v' + hh, h: hh, label: nmQ + '（' + hh + 'p' + (o.fps > 30 ? o.fps : '') + '）', sub: desc + '・' + (o.cont === 'mp4' ? 'MP4' : 'WebM'), size: d.page ? o.size : fSize(o.v) + fSize(o.a),
        big: hh + 'p', small: qTag(hh), color: 'var(--c-video)', tag: hh <= 240 ? '低品質' : '',
        run: d.page ? function(){ ytStartPage(d, meta, {type: 'video', h: hh, name: nm() + '_' + hh + 'p'}); } : function(){ ytStart(d, meta, {type: 'video', h: hh, cont: o.cont, name: nm() + '_' + hh + 'p'}); }});
    });
    if(d.hls) V.push({k: 'hls', label: 'HLS 串流（備用）', sub: '上面的選項失敗時可試這個', size: 0, big: 'HLS', small: '', color: 'var(--c-video)', run: function(){ ytDl([{kind: 'hls', url: d.hls, name: nm(), src: 'https://www.youtube.com/watch?v=' + d.id, title: meta.title, thumbUrl: meta.thumb, noCookie: true}], meta); }});
    (d.captions || []).forEach(function(c){ C.push({k: 'cc' + c.lang + (c.kind || ''), label: c.name || c.lang, sub: (c.kind === 'asr' ? '自動產生・' : '') + 'SRT 字幕檔', size: 0, big: 'CC', small: c.lang, color: 'var(--c-doc, #6b7d8c)', run: function(){ ytSubDl(d, meta, c, nm()); }}); });
    if(d.captions && d.captions.length && !d.captions.some(function(c){ return /^zh/.test(c.lang); })) { var c0 = d.captions[0]; C.push({k: 'cczh', label: '自動翻譯成中文（繁體）', sub: '由 ' + (c0.name || c0.lang) + ' 翻譯・SRT', size: 0, big: 'CC', small: '翻譯', color: 'var(--c-doc, #6b7d8c)', run: function(){ ytSubDl(d, meta, c0, nm(), 'zh-Hant'); }}); }
    T.push({k: 'tmax', label: '最高解析度縮圖', sub: '1280×720 以上（若影片有提供）', size: 0, big: 'JPG', small: 'HD', color: 'var(--c-image)', run: function(){ ytDl([{kind: 'image', url: meta.thumbMax, name: nm() + '_縮圖'}], meta); }});
    return {M: M, V: V, C: C, T: T};
  }
  function draw(){
    body.textContent = ''; pick = null; go.disabled = true; go.innerHTML = icon('download', 'sm') + '下載';
    var it = items();
    if(more){
      body.appendChild(h('div', {class: 'ydMoreHead'}, h('button', {class: 'ib', html: icon('back'), onclick: function(){ more = false; draw(); }}), h('b', {text: '更多格式'})));
    } else {
      body.appendChild(h('div', {class: 'ydHead'},
        h('div', {class: 'ydThumb', style: {backgroundImage: 'url("' + pxUrl(meta.thumb) + '")'}}, meta.dur ? h('span', {text: fmtDur(meta.dur)}) : null),
        h('div', {class: 'ydInfo'}, h('b', {text: meta.title}), h('div', {class: 'sub', text: (d.details.author || '') + (d.page ? '' : '・來源：' + d.src)}))));
      body.appendChild(h('div', {class: 'ydTitle', text: '下載為'}));
    }
    if(d.live) body.appendChild(h('div', {class: 'note', text: '這是直播，只能下載已經播出的部分（HLS）。'}));
    function row(p){
      var el = h('div', {class: 'ydRow', onclick: function(){ choose(p, el); }},
        h('span', {class: 'ydQ', style: p.color ? {background: p.color} : null}, h('b', {text: p.big}), p.small ? h('small', {text: p.small}) : null),
        h('div', {class: 'grow'}, h('b', null, p.label, p.tag ? h('span', {class: 'ydTag', text: p.tag}) : null), h('div', {class: 'sub', text: p.sub || ''})),
        h('div', {class: 'ydSz'}, h('b', {text: p.size ? fmtSize(p.size) : ''})),
        h('span', {class: 'ydRad'}));
      el.dataset.k = p.k;
      el.ondblclick = function(){ choose(p, el); go.click(); };
      return el;
    }
    function sect(title, list){ if(!list.length) return; body.appendChild(h('div', {class: 'ydSect', text: title})); var box = h('div', {class: 'ydList'}); list.forEach(function(p){ box.appendChild(row(p)); }); body.appendChild(box); }
    if(more){
      sect('音樂', it.M); sect('影片', it.V);
      sect('字幕／CC', it.C.length ? it.C : []); if(!it.C.length) body.appendChild(h('div', {class: 'ydRow dis'}, h('span', {class: 'ydQ', style: {background: '#999'}}, h('b', {text: 'CC'})), h('div', {class: 'grow'}, h('b', {text: '字幕／CC'}), h('div', {class: 'sub', text: '這部影片沒有字幕'}))));
      sect('縮圖', it.T);
    } else {
      /* 精簡清單：像 Snaptube 一樣只列最常用的 */
      var vs = it.V.filter(function(x){ return x.h; });
      var fast = vs.filter(function(x){ return x.h <= 480; })[0] || vs[vs.length - 1];
      var hq = vs.filter(function(x){ return x.h <= 1080; })[0] || vs[0];
      var top = vs[0] && vs[0].h > 1080 ? vs[0] : null;
      sect('音樂', it.M.filter(function(x){ return x.k === 'fast' || x.k === 'mp3320'; }));
      sect('影片', [fast, hq, top].filter(function(x, i, a){ return x && a.indexOf(x) === i; }).sort(function(a, b){ return a.h - b.h; }));
      body.appendChild(h('div', {class: 'ydMore', onclick: function(){ more = true; draw(); }}, h('span', {text: '更多格式（MP3 各音質、FLAC、所有畫質、字幕）'}), h('span', {html: icon('chevR', 'sm')})));
    }
    var nameRow = h('details', {class: 'ydName'}, h('summary', {text: '檔名：' + nm()}), h('div', {class: 'field', style: {marginTop: '8px'}}, name));
    name.oninput = function(){ nameRow.firstChild.textContent = '檔名：' + nm(); };
    body.appendChild(nameRow);
    if(!more) body.appendChild(h('div', {class: 'sub', style: {fontSize: '11.5px', margin: '8px 2px', lineHeight: '1.6'}, html: d.page ? '✓ 使用 App 內 YouTube 播放器的串流下載。下載時播放器會靜音切換畫質幾秒。' : '來源：' + esc(d.src)}));
    var rows = qsa('.ydRow', body), last = lsGet('ws.ytLastK', '');
    var pre = rows.filter(function(r){ return r.dataset.k === last; })[0] || rows.filter(function(r){ return /^v/.test(r.dataset.k || ''); }).pop() || rows[0];
    if(pre && pre.dataset.k) pre.click();
    paintIcons(body);
    var sc = body.parentElement; while(sc && sc.scrollHeight <= sc.clientHeight + 2 && sc !== document.body) sc = sc.parentElement; if(sc) sc.scrollTop = 0;
  }
  go.onclick = function(){ if(!pick) return; lsSet('ws.ytLastK', pick.k); s.close(); pick.run(); };
  draw();
}

/* 用 App 內播放器的串流下載 */
async function ytStartPage(d, meta, ch, retry){
  var audioOnly = ch.type === 'audio';
  dlCard(0, 1, '準備下載：' + (audioOnly ? '取得音軌…' : ch.h + 'p…'), 0);
  var r = await ytPageStreams(d, ch.h, audioOnly, function(t){ dlCard(0, 1, t, 0); });
  if(!r.a || (!audioOnly && !r.v)){
    Dock.remove('dl');
    var why = r.sabrOnly ? 'YouTube 對這部影片使用新的「SABR」串流格式，目前無法直接取得完整檔案。' : '播放器沒有載入' + (audioOnly ? '音軌' : ' ' + ch.h + 'p 的畫面') + '。';
    dialog('無法取得串流', why + '<br><br>請在「YouTube」分頁讓影片<b>播放幾秒</b>（不要停在廣告），再按一次下載；或改選其他畫質。', [['用其他來源試試', function(){ ytLegacy(d.id, meta, ch); }], ['好', null]]);
    return;
  }
  var base = {src: 'https://www.youtube.com/watch?v=' + d.id, title: meta.title, thumbUrl: meta.thumb, ua: '', noCookie: true, referer: 'https://m.youtube.com/'};
  YTJOB = {id: d.id, meta: meta, ch: ch, page: true, d: d, tries: retry || 0, skip: []};
  if(audioOnly){
    var ext = /webm/.test(sMime(r.a)) ? 'webm' : 'mp4', extra = Object.assign({}, ch.extra || {});
    if(extra.audioOut === 'opus' && ext !== 'webm') extra.audioOut = 'm4a';
    if(extra.audioOut === 'm4a' && ext !== 'mp4') extra.audioOut = 'opus';
    ytDl([Object.assign({}, base, {kind: 'audio', url: r.a.url, ext: ext, name: ch.name, artist: meta.artist}, extra, {title: meta.song})], meta, 'mp4');
  } else {
    lsSet('ws.ytLastH', ch.h);
    ytDl([Object.assign({}, base, {kind: 'merge', url: r.v.url, audioUrl: r.a.url, container: r.cont, name: ch.name})], meta, 'mp4');
  }
}
/* 舊的多來源解析（備用） */
async function ytLegacy(id, meta, ch){
  dlCard(0, 1, '尋找其他下載來源…', 0);
  try{
    var d = await YT.player(id, null, function(l){ dlCard(0, 1, '嘗試：' + l, 0); });
    ytStart(d, meta, ch.type === 'video' ? {type: 'video', h: ch.h, cont: 'mp4', name: ch.name} : {type: 'audio', pick: 'best', name: ch.name, extra: ch.extra});
  }catch(e){ Dock.remove('dl'); dialog('下載失敗', '其他來源也無法下載：<br><span class="sub" style="white-space:pre-line">' + esc(e.message) + '</span>', [['好', null]]); }
}

var PENDING_CONV = {};
function ytDl(items, meta, vidOut){
  var folder = LF.pickDefault && LF.pickDefault(items[0]);
  items.forEach(function(it){ if(folder) it.folder = folder; });
  dlCard(0, items.length, '準備下載…', 0);
  NAT.call('dlStart', JSON.stringify({page: BR.url, title: meta.title, items: items, opts: {zip: false, imgFmt: 'orig', imgMax: 0, imgQ: 92, vidOut: vidOut || 'mp4', vidQ: 'max'}}));
}
on('ytdl', function(id){ if(id) openYt(String(id)); });

/* 依「使用者選的畫質／格式」從某個來源組出下載項目（換來源重試時也用這個） */
function ytBuild(d, meta, ch){
  var base = {src: 'https://www.youtube.com/watch?v=' + d.id, title: meta.title, thumbUrl: meta.thumb, ua: d.ua || '', noCookie: true, referer: ''};
  if(!d.formats.length && d.hls){
    if(ch.type === 'video') return [[Object.assign({}, base, {kind: 'hls', url: d.hls, variant: ch.h ? String(ch.h) : 'max', name: ch.name})], 'mp4'];
    return [[Object.assign({}, base, {kind: 'hls', url: d.hls, variant: 'min', name: ch.name, artist: meta.artist, title: meta.song}, ch.extra && ch.extra.convert ? {convert: ch.extra.convert} : {})], 'm4a'];
  }
  var opt = ytOptions(d);
  if(ch.type === 'video'){
    var o = opt.video.filter(function(x){ return x.h === ch.h && x.cont === ch.cont; })[0] || opt.video.filter(function(x){ return x.h === ch.h; })[0] || opt.video.filter(function(x){ return x.h <= ch.h; })[0] || opt.video[0];
    if(!o) return null;
    return [[Object.assign({}, base, {kind: 'merge', url: o.v.url, audioUrl: o.a ? o.a.url : '', container: o.cont, name: ch.name})], 'mp4'];
  }
  var f = ch.pick === 'opus' ? opt.opus : ch.pick === 'm4a' ? opt.m4a : (opt.opus || opt.m4a);
  f = f || opt.opus || opt.m4a; if(!f) return null;
  var ext = /webm/.test(f.mimeType) ? 'webm' : 'mp4', extra = Object.assign({}, ch.extra || {});
  if(extra.audioOut === 'opus' && ext !== 'webm') extra.audioOut = 'm4a';
  if(extra.audioOut === 'm4a' && ext !== 'mp4') extra.audioOut = 'opus';
  return [[Object.assign({}, base, {kind: 'audio', url: f.url, ext: ext, name: ch.name, artist: meta.artist}, extra, {title: meta.song})], 'mp4'];
}
var YTJOB = null;
function ytStart(d, meta, ch){
  var b = ytBuild(d, meta, ch);
  if(!b){ toast('這個來源沒有對應的格式', true); return; }
  YTJOB = {id: d.id, meta: meta, ch: ch, key: d.key, skip: [d.key], tries: 0};
  ytDl(b[0], meta, b[1]);
}
function ytWillRetry(d){ return !!(YTJOB && d && d.state === 'done' && d.fail && !d.ok && !d.cancel && YTJOB.tries < (YTJOB.page ? 2 : 6)); }
on('dl', async function(d){
  if(d.state !== 'done' || !YTJOB) return;
  if(!ytWillRetry(d)){ YTJOB = null; return; }
  var J = YTJOB; J.tries++;
  if(J.page){
    /* 串流網址可能過期：清掉記錄，請播放器重新載入後再試一次 */
    toast('下載被中斷，重新取得串流後再試一次…');
    NAT.call('ytForget', J.id);
    ytStartPage(J.d, J.meta, J.ch, J.tries);
    return;
  }
  if(J.key) YT.markBad(J.key);
  toast('這個來源下載被拒，自動改用其他來源重試（第 ' + J.tries + ' 次）…');
  dlCard(0, 1, '尋找其他下載來源…', 0);
  try{
    var nd = await YT.player(J.id, J.skip, function(l){ dlCard(0, 1, '嘗試：' + l, 0); });
    J.key = nd.key; J.skip.push(nd.key);
    var b = ytBuild(nd, J.meta, J.ch); if(!b) throw new Error('新的來源沒有對應的格式');
    toast('改用：' + nd.src);
    ytDl(b[0], J.meta, b[1]);
  }catch(e){
    YTJOB = null; Dock.remove('dl');
    dialog('下載失敗', '試過所有來源都無法下載這部影片：<br><span class="sub" style="white-space:pre-line">' + esc(e.message) + '</span><br><br>可以稍後再試，或到「設定 → YouTube → 更新解析設定」。', [['好', null]]);
  }
});
/* 下載完成後，需要轉檔的音樂自動排入轉檔佇列 */
on('dl', function(d){
  if(d.state !== 'done' || !d.items) return;
  d.items.forEach(function(it){
    if(it.folder){ LF.map[it.id] = it.folder; LF.save(); }
    if(it.convert){ var p = String(it.convert).split(':'); Conv.add(it, p[0], {kbps: +p[1] || 320}); }
  });
});

/* 字幕下載：抓 YouTube 的字幕（WebVTT）轉成 SRT 存進檔案庫 */
async function ytSubDl(d, meta, c, base, tr){
  toast('下載字幕中…');
  try{
    var u = c.url + (c.url.indexOf('?') < 0 ? '?' : '&') + 'fmt=vtt' + (tr ? '&tlang=' + tr : '');
    var r = await natHttp('GET', u, {'Referer': 'https://m.youtube.com/'});
    var vtt = String(r.body || '');
    if(r.status >= 400 || vtt.indexOf('-->') < 0) throw new Error('YouTube 沒有回傳字幕內容（HTTP ' + r.status + '）');
    var n = 0, srt = vtt.replace(/\r/g, '').split(/\n\n+/).filter(function(b){ return b.indexOf('-->') >= 0; }).map(function(b){
      var ls = b.split('\n'), i = ls.findIndex(function(x){ return x.indexOf('-->') >= 0; });
      var tm = ls[i].replace(/\s+(align|position|line|size):\S+/g, '').replace(/(\d\d:\d\d)\.(\d{3})/g, '$1,$2').replace(/(^|\s)(\d\d:\d\d,\d{3})/g, '$100:$2');
      var tx = ls.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
      return tx ? (++n) + '\n' + tm + '\n' + tx : '';
    }).filter(Boolean).join('\n\n') + '\n';
    var name = base + '.' + (tr || c.lang) + '.srt';
    await saveBigBlob(new Blob([srt], {type: 'application/x-subrip'}), name, {src: 'https://www.youtube.com/watch?v=' + d.id, title: meta.title});
    Lib.refresh(); flashLib(); toast('✓ 已儲存字幕：' + name);
  }catch(e){ dialog('字幕下載失敗', esc(e.message) + '<br><br>可以在播放器按「CC」直接看字幕。', [['好', null]]); }
}
