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
function natHttp(method, url, headers, body, cookies){
  return new Promise(function(res, rej){
    var id = 'h' + uid();
    HTTPW[id] = function(d){ if(d.status) res(d); else rej(new Error(d.err || '連線失敗')); };
    NAT.call('http', id, method, url, JSON.stringify(headers || {}), body || '', !!cookies);
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
  return {id: id, page: true, src: 'App 內播放器', details: inf.details || {}, formats: fm, hls: inf.hls || '', live: !!inf.live, sabr: !!inf.sabr, captions: inf.captions || [], visitor: inf.visitor || ''};
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
/* 手機能否把 4K 存成 MP4（AV1＋Android 14） */
var YT_AV1 = null;
function ytAv1(){ if(YT_AV1 == null) YT_AV1 = isApp && NAT.has('hasAv1') ? !!NAT.call('hasAv1') : false; return YT_AV1; }
function ytFmtMode(){ return lsGet('ws.ytFmt', CFG.yt.codec === 'vp9' ? 'mp4' : 'mp4'); }
function ytPageOptions(d, mode){
  mode = mode || ytFmtMode();
  var mp4 = mode === 'mp4', av1 = ytAv1();
  var vids = d.formats.filter(function(f){ return /^video/.test(f.mimeType) && !f.audioQuality && f.height; });
  var auds = d.formats.filter(function(f){ return /^audio/.test(f.mimeType); });
  var aOpus = auds.filter(function(f){ return /opus/.test(ytCodec(f)); }).sort(function(a, b){ return b.bitrate - a.bitrate; })[0];
  var aM4a = auds.filter(function(f){ return /mp4a/.test(ytCodec(f)); }).sort(function(a, b){ return b.bitrate - a.bitrate; })[0];
  var by = {};
  vids.forEach(function(f){
    var c = ytCodec(f);
    var ok = mp4 ? (/avc1/.test(c) || (av1 && /av01/.test(c))) : /vp0?9|vp8/.test(c);
    if(!ok) return;
    var cur = by[f.height];
    /* MP4：1080p 以下用 H.264（相容性最好），以上用 AV1 */
    var score = function(x){ var cc = ytCodec(x); return (mp4 ? (x.height <= 1080 ? (/avc1/.test(cc) ? 2 : 1) : (/av01/.test(cc) ? 2 : 1)) : 1) * 1e12 + (x.contentLength || 0); };
    if(!cur || score(f) > score(cur)) by[f.height] = f;
  });
  var out = Object.keys(by).map(Number).sort(function(a, b){ return b - a; }).map(function(hh){
    var f = by[hh], a = mp4 ? (aM4a || aOpus) : (aOpus || aM4a);
    return {h: hh, f: f, cont: mp4 ? 'mp4' : 'webm', codec: /av01/.test(ytCodec(f)) ? 'AV1' : /avc1/.test(ytCodec(f)) ? 'H.264' : 'VP9', fps: f.fps || 0, size: fSize(f) + fSize(a)};
  });
  var maxAll = Math.max.apply(null, vids.map(function(f){ return f.height; }).concat([0]));
  return {video: out, opus: aOpus, m4a: aM4a, best: mp4 ? (aM4a || aOpus) : (aOpus || aM4a), mode: mode, maxAll: maxAll, av1: av1};
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
  function setMode(m){ lsSet('ws.ytFmt', m); if(d.page) opt = ytPageOptions(d, m); draw(); }
  var name = h('input', {type: 'text', value: meta.title.replace(/[\\\/:*?"<>|]/g, '_').slice(0, 100)});
  var nm = function(){ return (name.value.trim() || meta.title).replace(/[\\\/:*?"<>|]/g, '_'); };
  var go = h('button', {class: 'btn pri block', html: icon('download', 'sm') + '下載', disabled: true});
  foot.appendChild(go);
  var subSel = {};
  function goLabel(){
    var ns = Object.keys(subSel).length;
    go.disabled = !pick && !ns;
    go.innerHTML = icon('download', 'sm') + (pick ? '下載　' + pick.label + (ns ? '＋字幕 ' + ns : '') : ns ? '下載字幕（' + ns + ' 個）' : '下載');
  }
  function choose(p, el){ pick = p; qsa('.ydRow:not(.ydChk)', body).forEach(function(x){ x.classList.remove('on'); }); if(el) el.classList.add('on'); goLabel(); }
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
      V.push({k: 'v' + hh, h: hh, label: nmQ + '（' + hh + 'p' + (o.fps > 30 ? o.fps : '') + '）', sub: desc + '・' + (o.cont === 'mp4' ? 'MP4' : 'WebM') + (o.codec ? '・' + o.codec : ''), tag: o.cont === 'mp4' ? 'MP4' : 'WebM', size: d.page ? o.size : fSize(o.v) + fSize(o.a),
        big: hh + 'p', small: qTag(hh), color: 'var(--c-video)',
        run: d.page ? function(){ ytStartPage(d, meta, {type: 'video', h: hh, codec: o.cont, name: nm() + '_' + hh + 'p'}); } : function(){ ytStart(d, meta, {type: 'video', h: hh, cont: o.cont, name: nm() + '_' + hh + 'p'}); }});
    });
    if(d.hls) V.push({k: 'hls', label: 'HLS 串流（備用）', sub: '上面的選項失敗時可試這個', size: 0, big: 'HLS', small: '', color: 'var(--c-video)', run: function(){ ytDl([{kind: 'hls', url: d.hls, name: nm(), src: 'https://www.youtube.com/watch?v=' + d.id, title: meta.title, thumbUrl: meta.thumb, noCookie: true}], meta); }});
    (d.captions || []).forEach(function(c){ C.push({k: 'cc' + c.lang + (c.kind || ''), cap: c, lang: c.lang, label: c.name || c.lang, sub: (c.kind === 'asr' ? '自動產生・' : '') + 'SRT 字幕', size: 0, big: 'CC', small: c.lang, color: 'var(--c-doc, #6b7d8c)'}); });
    if(d.captions && d.captions.length && !d.captions.some(function(c){ return /^zh/.test(c.lang); })) { var c0 = d.captions[0]; C.push({k: 'cczh', cap: c0, tr: 'zh-Hant', lang: 'zh-Hant', label: '自動翻譯成中文（繁體）', sub: '由 ' + (c0.name || c0.lang) + ' 翻譯・SRT', size: 0, big: 'CC', small: '翻譯', color: 'var(--c-doc, #6b7d8c)'}); }
    T.push({k: 'tmax', label: '最高解析度縮圖', sub: '1280×720 以上（若影片有提供）', size: 0, big: 'JPG', small: 'HD', color: 'var(--c-image)', run: function(){ ytDl([{kind: 'image', url: meta.thumbMax, name: nm() + '_縮圖'}], meta); }});
    return {M: M, V: V, C: C, T: T};
  }
  function draw(){
    body.textContent = ''; pick = null; goLabel();
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
      var chk = !!p.cap;
      var el = h('div', {class: 'ydRow' + (chk ? ' ydChk' + (subSel[p.k] ? ' on' : '') : ''), onclick: function(){
        if(chk){ if(subSel[p.k]) delete subSel[p.k]; else subSel[p.k] = p; el.classList.toggle('on', !!subSel[p.k]); goLabel(); return; }
        choose(p, el);
      }},
        h('span', {class: 'ydQ', style: p.color ? {background: p.color} : null}, h('b', {text: p.big}), p.small ? h('small', {text: p.small}) : null),
        h('div', {class: 'grow'}, h('b', null, p.label, p.tag ? h('span', {class: 'ydTag', text: p.tag}) : null), h('div', {class: 'sub', text: p.sub || ''})),
        h('div', {class: 'ydSz'}, h('b', {text: p.size ? fmtSize(p.size) : ''})),
        h('span', {class: 'ydRad'}));
      el.dataset.k = p.k;
      if(!chk) el.ondblclick = function(){ choose(p, el); go.click(); };
      return el;
    }
    function fmtSeg(){
      if(!d.page) return;
      var m = opt.mode, seg = h('div', {class: 'seg ydFmt'});
      [['mp4', 'MP4（所有播放器都能播）'], ['webm', 'WebM（VP9）']].forEach(function(x){ seg.appendChild(h('button', {class: m === x[0] ? 'on' : '', text: x[1], onclick: function(){ setMode(x[0]); }})); });
      body.appendChild(seg);
      if(m === 'mp4' && opt.maxAll > 1080 && !opt.av1) body.appendChild(h('div', {class: 'note', style: {fontSize: '12px'}, text: 'YouTube 的 1080p 以上只有 VP9／AV1 編碼。這支手機不支援 AV1（或 Android 版本低於 14），MP4 最高 1080p；要 ' + qTag(opt.maxAll) + ' 請切到 WebM。'}));
    }
    function methodSeg(){
      if(!d.page || d.live) return;
      var m = lsGet('ws.ytMethod', 'auto'), seg = h('div', {class: 'seg ydFmt'});
      [['auto', '自動'], ['direct', '直接下載'], ['grab', '背景錄製']].forEach(function(x){ seg.appendChild(h('button', {class: m === x[0] ? 'on' : '', text: x[1], onclick: function(){ lsSet('ws.ytMethod', x[0]); draw(); }})); });
      body.appendChild(h('div', {class: 'ydSect', text: '下載方式'}));
      body.appendChild(seg);
      body.appendChild(h('div', {class: 'sub', style: {fontSize: '11.5px', margin: '-2px 2px 8px', lineHeight: '1.6'}, text:
        m === 'direct' ? '像 Snaptube：直接向 YouTube 取得影片檔網址，全速下載後合併影像與聲音（所有畫質，最快）。被 YouTube 拒絕時會顯示失敗。'
        : m === 'grab' ? '用看不到的播放器在背景播放並錄下資料。最穩定、不受 403 影響，但需要約影片長度一半的時間。'
        : '先試直接下載（最快），不行再自動改用背景錄製。'}));
    }
    function sect(title, list){ if(!list.length) return; body.appendChild(h('div', {class: 'ydSect', text: title})); var box = h('div', {class: 'ydList'}); list.forEach(function(p){ box.appendChild(row(p)); }); body.appendChild(box); }
    if(more){
      sect('音樂', it.M); fmtSeg(); sect('影片', it.V); methodSeg();
      sect('字幕（可複選，會跟影片一起下載）', it.C.length ? it.C : []); if(!it.C.length) body.appendChild(h('div', {class: 'ydRow dis'}, h('span', {class: 'ydQ', style: {background: '#999'}}, h('b', {text: 'CC'})), h('div', {class: 'grow'}, h('b', {text: '字幕／CC'}), h('div', {class: 'sub', text: '這部影片沒有字幕'}))));
      sect('縮圖', it.T);
    } else {
      /* 精簡清單：像 Snaptube 一樣只列最常用的 */
      var vs = it.V.filter(function(x){ return x.h; });
      var fast = vs.filter(function(x){ return x.h <= 480; })[0] || vs[vs.length - 1];
      var hq = vs.filter(function(x){ return x.h <= 1080; })[0] || vs[0];
      var top = vs[0] && vs[0].h > 1080 ? vs[0] : null;
      sect('音樂', it.M.filter(function(x){ return x.k === 'fast' || x.k === 'mp3320'; }));
      fmtSeg();
      sect('影片', [fast, hq, top].filter(function(x, i, a){ return x && a.indexOf(x) === i; }).sort(function(a, b){ return a.h - b.h; }));
      sect('字幕（可複選，會跟影片一起下載）', it.C.filter(function(x){ return /^(zh|en)/.test(x.lang) || x.k === 'cczh'; }).slice(0, 4));
      methodSeg();
      body.appendChild(h('div', {class: 'ydMore', onclick: function(){ more = true; draw(); }}, h('span', {text: '更多格式（MP3 各音質、FLAC、所有畫質、字幕）'}), h('span', {html: icon('chevR', 'sm')})));
    }
    var nameRow = h('details', {class: 'ydName'}, h('summary', {text: '檔名：' + nm()}), h('div', {class: 'field', style: {marginTop: '8px'}}, name));
    name.oninput = function(){ nameRow.firstChild.textContent = '檔名：' + nm(); };
    body.appendChild(nameRow);
    if(!more && !d.page) body.appendChild(h('div', {class: 'sub', style: {fontSize: '11.5px', margin: '8px 2px', lineHeight: '1.6'}, html: '來源：' + esc(d.src)}));
    var hob = handOffButtons('https://youtu.be/' + d.id, function(){ s.close(); }); if(hob) body.appendChild(hob);
    var rows = qsa('.ydRow:not(.ydChk)', body), last = lsGet('ws.ytLastK', '');
    var pre = rows.filter(function(r){ return r.dataset.k === last; })[0] || rows.filter(function(r){ return /^v/.test(r.dataset.k || ''); }).pop() || rows[0];
    if(pre && pre.dataset.k) pre.click();
    paintIcons(body);
    var sc = body.parentElement; while(sc && sc.scrollHeight <= sc.clientHeight + 2 && sc !== document.body) sc = sc.parentElement; if(sc) sc.scrollTop = 0;
  }
  go.onclick = function(){
    var subs = Object.keys(subSel).map(function(k){ var p = subSel[k]; var pr = ytFetchSrt(p.cap, p.tr); pr.catch(function(){}); return {lang: p.lang, label: p.label, p: pr, base: nm(), src: 'https://www.youtube.com/watch?v=' + d.id, title: meta.title}; });
    if(!pick && !subs.length) return;
    s.close();
    if(!pick){ ytAttachSubs(null, subs); return; }
    lsSet('ws.ytLastK', pick.k);
    var isVid = /^(v\d|hls)/.test(pick.k);
    if(subs.length && !isVid) ytAttachSubs(null, subs);
    YT_NEXT_SUBS = isVid && subs.length ? subs : null;
    pick.run();
  };
  draw();
}

/* 用 App 內播放器的串流下載 */
/* ---------- 直接下載（不用錄製）：用 Safari 的身分向 YouTube 要 HLS 串流清單 ----------
   Safari 播 YouTube 用的是 HLS（m3u8），清單裡的每個片段網址都已經簽好，可以直接以全速下載。
   最高通常到 1080p；要更高畫質或這個方式被拒絕時，才改用背景錄製。 */
var YT_SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
var YT_HLS = {};
async function ytSafariHls(id){
  var c = YT_HLS[id];
  if(c && Date.now() - c.t < 4 * 3600e3) return c;
  var ver = (YT.cfg && YT.cfg.webVer) || '2.20251105.01.00';
  var body = {context: {client: {clientName: 'WEB', clientVersion: ver, userAgent: YT_SAFARI_UA, osName: 'Macintosh', osVersion: '10_15_7', platform: 'DESKTOP', browserName: 'Safari', browserVersion: '18.1', hl: 'zh-TW', gl: 'TW', utcOffsetMinutes: 480}}, videoId: id, contentCheckOk: true, racyCheckOk: true};
  var r = await natHttp('POST', 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {'Content-Type': 'application/json', 'User-Agent': YT_SAFARI_UA, 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': ver, 'Origin': 'https://www.youtube.com', 'Referer': 'https://www.youtube.com/watch?v=' + id}, JSON.stringify(body), true);
  var j = JSON.parse(r.body || '{}'), st = j.playabilityStatus || {};
  if(st.status !== 'OK') throw new Error(st.reason || st.status || ('HTTP ' + r.status));
  var m3u = (j.streamingData || {}).hlsManifestUrl;
  if(!m3u) throw new Error('YouTube 沒有提供 HLS');
  /* 讀清單：各畫質與音軌 */
  var mr = await natHttp('GET', m3u, {'User-Agent': YT_SAFARI_UA}, '', false);
  if(mr.status !== 200 || String(mr.body).indexOf('#EXTM3U') < 0) throw new Error('HLS 清單讀取失敗（HTTP ' + mr.status + '）');
  var lines = String(mr.body).split(/\r?\n/), vars = [];
  for(var i = 0; i < lines.length; i++){
    var l = lines[i];
    if(l.indexOf('#EXT-X-STREAM-INF:') === 0){
      var res = /RESOLUTION=(\d+)x(\d+)/.exec(l), bw = /BANDWIDTH=(\d+)/.exec(l), cd = /CODECS="([^"]+)"/.exec(l);
      var u = (lines[i + 1] || '').trim();
      if(u && res) vars.push({w: +res[1], h: +res[2], bw: bw ? +bw[1] : 0, codecs: cd ? cd[1] : '', url: u});
    }
  }
  if(!vars.length) throw new Error('HLS 清單沒有影片');
  /* 先試抓一個片段，確定真的能下載 */
  var best = vars.slice().sort(function(a, b){ return b.h - a.h || b.bw - a.bw; })[0];
  var pl = await natHttp('GET', best.url, {'User-Agent': YT_SAFARI_UA}, '', false);
  var seg = String(pl.body || '').split(/\r?\n/).filter(function(x){ return x && x[0] !== '#'; })[0];
  if(!seg) throw new Error('HLS 片段清單讀取失敗');
  var pr = await natHttp('GET', /^https?:/.test(seg) ? seg : new URL(seg, best.url).href, {'User-Agent': YT_SAFARI_UA, 'Range': 'bytes=0-1'}, '', false);
  if(pr.status >= 400) throw new Error('HLS 試抓被拒（HTTP ' + pr.status + '）');
  c = {t: Date.now(), master: m3u, vars: vars, maxH: best.h, details: j.videoDetails || {}};
  YT_HLS[id] = c;
  return c;
}

/* ---------- 直接下載（Snaptube 的原理）----------
   YouTube 網頁版的影片網址有加密簽章，要下載它的 JavaScript 來解；但 YouTube 自己某些 App（例如 Quest VR 版）
   拿到的是不用解密、可以直接下載的網址。這裡用那個 App 的身分向 YouTube 要影片資訊，影像與聲音分開下載再合併。 */
var YT_VR = {ver: '1.65.10', ua: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'};
var YT_VRC = {};
async function ytVrPlayer(id, visitor){
  var c = YT_VRC[id];
  if(c && Date.now() - c.t < 3 * 3600e3) return c;
  var cl = {clientName: 'ANDROID_VR', clientVersion: YT_VR.ver, deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, userAgent: YT_VR.ua, osName: 'Android', osVersion: '12L', hl: 'zh-TW', gl: 'TW', utcOffsetMinutes: 480};
  if(visitor) cl.visitorData = visitor;
  var hd = {'Content-Type': 'application/json', 'User-Agent': YT_VR.ua, 'X-YouTube-Client-Name': '28', 'X-YouTube-Client-Version': YT_VR.ver, 'Origin': 'https://www.youtube.com'};
  if(visitor) hd['X-Goog-Visitor-Id'] = visitor;
  var r = await natHttp('POST', 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false', hd, JSON.stringify({context: {client: cl}, videoId: id, contentCheckOk: true, racyCheckOk: true}), false);
  var j = JSON.parse(r.body || '{}'), st = j.playabilityStatus || {};
  if(st.status !== 'OK') throw new Error(st.reason || st.status || ('HTTP ' + r.status));
  var fm = ((j.streamingData || {}).adaptiveFormats || []).filter(function(f){ return f.url; });
  if(!fm.length) throw new Error('沒有可以直接下載的格式');
  c = {t: Date.now(), formats: fm};
  YT_VRC[id] = c;
  return c;
}
function ytVrPick(c, ch, mode, audioOnly, extra){
  var fm = c.formats, br = function(a, b){ return (b.bitrate || 0) - (a.bitrate || 0); };
  var auds = fm.filter(function(f){ return /^audio/.test(f.mimeType); });
  var opus = auds.filter(function(f){ return /opus/.test(f.mimeType); }).sort(br)[0];
  var m4a = auds.filter(function(f){ return /mp4a/.test(f.mimeType); }).sort(br)[0];
  if(audioOnly){
    var o = (extra || {}).audioOut;
    return {a: o === 'opus' ? (opus || m4a) : o === 'm4a' ? (m4a || opus) : (CFG.yt.codec === 'h264' ? (m4a || opus) : (opus || m4a))};
  }
  var mp4 = mode === 'mp4', av1 = ytAv1();
  var vids = fm.filter(function(f){
    if(!/^video/.test(f.mimeType) || f.height !== ch.h) return false;
    return mp4 ? (/avc1/.test(f.mimeType) || (av1 && /av01/.test(f.mimeType))) : /vp0?9/.test(f.mimeType);
  });
  var score = function(f){ return (mp4 ? ((f.height <= 1080) === /avc1/.test(f.mimeType) ? 2 : 1) : 1) * 1e12 + (f.bitrate || 0); };
  var v = vids.sort(function(a, b){ return score(b) - score(a); })[0];
  return {v: v, a: mp4 ? m4a : (opus || null), cont: mp4 ? 'mp4' : 'webm'};
}

async function ytStartPage(d, meta, ch, retry){
  var audioOnly = ch.type === 'audio';
  var base = {src: 'https://www.youtube.com/watch?v=' + d.id, title: meta.title, thumbUrl: meta.thumb, ua: '', noCookie: true, referer: 'https://m.youtube.com/'};
  var method = d.live ? 'auto' : lsGet('ws.ytMethod', 'auto');
  var J = {id: d.id, meta: meta, ch: ch, page: true, d: d, tries: retry || 0, skip: [], method: method, subs: ch.subs || YT_NEXT_SUBS};
  YT_NEXT_SUBS = null; ch.subs = J.subs;
  var extra = Object.assign({}, ch.extra || {});
  if(!audioOnly) lsSet('ws.ytLastH', ch.h);
  var mode = ch.codec || ytFmtMode();
  if(method === 'grab') retry = Math.max(1, retry || 0);
  /* 1. 播放器剛好用一般網址在播：直接下載（最快） */
  /* 音樂一律用錄製式下載（直接網址常被 YouTube 拒絕） */
  var r = (retry || audioOnly) ? {} : ytPickStreams(d, NAT.json('ytSniff', d.id), ch.h, audioOnly);
  if(r.a && (audioOnly || (r.v && r.cont === (ch.codec || ytFmtMode())))){
    if(audioOnly){
      var ext = /webm/.test(sMime(r.a)) ? 'webm' : 'mp4';
      if(extra.audioOut === 'opus' && ext !== 'webm') extra.audioOut = 'm4a';
      if(extra.audioOut === 'm4a' && ext !== 'mp4') extra.audioOut = 'opus';
      ytDl([Object.assign({}, base, {kind: 'audio', url: r.a.url, ext: ext, name: ch.name, artist: meta.artist}, extra, {title: meta.song})], meta, 'mp4', J);
    } else ytDl([Object.assign({}, base, {kind: 'merge', url: r.v.url, audioUrl: r.a.url, container: r.cont, name: ch.name, needAudio: true})], meta, 'mp4', J);
    return;
  }
  /* 2. 直接下載（像 Snaptube）：用 YouTube 自己 App 的身分（Quest VR 版）取得影片檔網址，不需要解密簽章，所有畫質都有 */
  if(!retry && !d.live){
    dlCard(0, 1, '取得影片檔網址…', 0);
    try{
      var vr = await ytVrPlayer(d.id, d.visitor);
      var pk = ytVrPick(vr, ch, mode, audioOnly, extra);
      if(pk && pk.a && (audioOnly || pk.v)){
        /* 試抓檔案中段：確定不會下載到一半被拒（403） */
        var bad = await ytProbe((pk.v || pk.a).url, YT_VR.ua, +(pk.v || pk.a).contentLength || 0);
        if(!bad && pk.v) bad = await ytProbe(pk.a.url, YT_VR.ua, +pk.a.contentLength || 0);
        if(bad) throw new Error('YouTube 拒絕直接下載（HTTP ' + bad + '）');
        var vb = Object.assign({}, base, {ua: YT_VR.ua, referer: '', noCookie: true});
        if(audioOnly){
          var ext2 = /webm/.test(pk.a.mimeType) ? 'webm' : 'mp4';
          if(extra.audioOut === 'opus' && ext2 !== 'webm') extra.audioOut = 'm4a';
          if(extra.audioOut === 'm4a' && ext2 !== 'mp4') extra.audioOut = 'opus';
          ytDl([Object.assign(vb, {kind: 'audio', url: pk.a.url, ext: ext2, name: ch.name, artist: meta.artist}, extra, {title: meta.song})], meta, 'mp4', J);
        } else ytDl([Object.assign(vb, {kind: 'merge', url: pk.v.url, audioUrl: pk.a.url, container: pk.cont, name: ch.name, needAudio: true})], meta, 'mp4', J);
        toast('直接下載中（全速，不用錄製）');
        return;
      }
      throw new Error('沒有 ' + (audioOnly ? '音軌' : ch.h + 'p ' + mode.toUpperCase()) + ' 的直接下載格式');
    }catch(e){ console.warn('vr', e); J.vrErr = e.message; }
  }
  /* 2. 直接下載 HLS（全速、不用錄製）：1080p 以下、而且 YouTube 有提供時 */
  if(!retry && (audioOnly || ch.h <= 1080) && !(ch.codec === 'webm' && !audioOnly)){
    dlCard(0, 1, '取得直接下載的串流…', 0);
    try{
      var hl = await ytSafariHls(d.id);
      if(audioOnly || hl.maxH >= Math.min(ch.h, 1080) * 0.9){
        var hb = Object.assign({}, base, {kind: 'hls', url: hl.master, ua: YT_SAFARI_UA, referer: 'https://www.youtube.com/', name: ch.name, variant: audioOnly ? 'min' : String(ch.h)});
        if(audioOnly) ytDl([Object.assign(hb, {vidOut: 'm4a', artist: meta.artist}, extra, {title: meta.song})], meta, 'mp4', J);
        else ytDl([Object.assign(hb, {needAudio: true})], meta, 'mp4', J);
        toast('直接下載中（不用錄製）');
        return;
      }
    }catch(e){ console.warn('safari hls', e); }
    dlPreClear();
  }
  dlPreClear();
  if(method === 'direct' && !retry){
    dialog('直接下載失敗', 'YouTube 這次不讓這部影片直接下載' + (J.vrErr ? '：<br><span class="sub">' + esc(J.vrErr) + '</span>' : '') + '<br><br>要改用「背景錄製」嗎？（最穩定，但需要約影片長度一半的時間）',
      [['改用背景錄製', function(){ ytStartPage(d, meta, ch, 1); }], ['取消', null, '']]);
    return;
  }
  /* 3. 錄製式下載：背景播放器（靜音、看不到）播放這部影片，把播放器收到的資料存下來。
        不需要下載網址，所以不會被 403／機器人驗證／SABR 擋住。 */
  var codec = audioOnly ? (extra.audioOut === 'm4a' ? 'mp4' : 'webm') : (ch.codec || ytFmtMode());
  var g = {kind: 'grab', codec: codec, vid: d.id, h: audioOnly ? 144 : ch.h, q: audioOnly ? 'tiny' : (QKEY[ch.h] || 'hd720'), audioOnly: audioOnly, len: +meta.dur || +(d.details.lengthSeconds || 0), name: ch.name};
  if(audioOnly) ytDl([Object.assign({}, base, g, {artist: meta.artist}, extra, {title: meta.song})], meta, 'mp4', J);
  else ytDl([Object.assign({}, base, g, {needAudio: true})], meta, 'mp4', J);
  toast('在背景下載中，可以繼續看影片或做其他事');
}
/* 舊的多來源解析（備用） */
async function ytLegacy(id, meta, ch){
  dlCard(0, 1, '尋找其他下載來源…', 0);
  try{
    var d = await YT.player(id, null, function(l){ dlCard(0, 1, '嘗試：' + l, 0); });
    ytStart(d, meta, ch.type === 'video' ? {type: 'video', h: ch.h, cont: 'mp4', name: ch.name} : {type: 'audio', pick: 'best', name: ch.name, extra: ch.extra});
  }catch(e){ dlPreClear(); dialog('下載失敗', '其他來源也無法下載：<br><span class="sub" style="white-space:pre-line">' + esc(e.message) + '</span>', [['好', null]]); }
}

var PENDING_CONV = {};
var YTJOBS = {}, YTSUBS = {}, YT_NEXT_SUBS = null;
function ytDl(items, meta, vidOut, J){
  var folder = LF.pickDefault && LF.pickDefault(items[0]);
  items.forEach(function(it){ if(folder) it.folder = folder; });
  var job = dlJobId(meta.title || items[0].name);
  var subs = (J && J.subs) || YT_NEXT_SUBS; YT_NEXT_SUBS = null;
  if(J){ J.subs = subs; YTJOBS[job] = J; }
  if(subs && subs.length) YTSUBS[job] = subs;
  dlCard(0, items.length, '準備下載…', 0);
  NAT.call('dlStart', JSON.stringify({job: job, page: BR.url, title: meta.title, items: items, opts: {zip: false, imgFmt: 'orig', imgMax: 0, imgQ: 92, vidOut: vidOut || 'mp4', vidQ: 'max'}}));
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
function ytStart(d, meta, ch){
  var b = ytBuild(d, meta, ch);
  if(!b){ toast('這個來源沒有對應的格式', true); return; }
  var J = {id: d.id, meta: meta, ch: ch, key: d.key, skip: [d.key], tries: 0, subs: YT_NEXT_SUBS};
  YT_NEXT_SUBS = null;
  ytDl(b[0], meta, b[1], J);
}
function ytWillRetry(d){ var J = d && YTJOBS[d.job]; return !!(J && d.state === 'done' && d.fail && !d.ok && !d.cancel && (J.method !== 'direct' || /沒有聲音/.test(d.msg || '')) && J.tries < (J.page ? 2 : 6)); }
on('dl', async function(d){
  if(d.state !== 'done') return;
  var subs = YTSUBS[d.job]; delete YTSUBS[d.job];
  var J = YTJOBS[d.job], will = ytWillRetry(d); delete YTJOBS[d.job];
  if(!will){
    if(subs){ var v = (d.items || []).filter(function(x){ return /^video\//.test(x.mime || '') || /\.(mp4|webm|mkv|mov)$/i.test(x.name || ''); })[0]; ytAttachSubs(v || null, subs); }
    return;
  }
  J.tries++;
  if(J.page){
    /* 串流網址可能過期：清掉記錄，請播放器重新載入後再試一次 */
    toast(/沒有聲音/.test(d.msg || '') ? '下載的影片沒有聲音，改用另一種方式重新下載…' : '下載失敗，改用另一種方式重新下載…');
    NAT.call('ytForget', J.id);
    J.ch.subs = J.subs;
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
    ytDl(b[0], J.meta, b[1], J);
  }catch(e){
    dlPreClear();
    if(J.subs) ytAttachSubs(null, J.subs);
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

/* 字幕：抓 YouTube 的字幕（WebVTT）轉成 SRT */
async function ytFetchSrt(c, tr){
  var u = c.url + (c.url.indexOf('?') < 0 ? '?' : '&') + 'fmt=vtt' + (tr ? '&tlang=' + tr : '');
  var r = await natHttp('GET', u, {'Referer': 'https://m.youtube.com/'});
  var vtt = String(r.body || '');
  if(r.status >= 400 || vtt.indexOf('-->') < 0) throw new Error('YouTube 沒有回傳字幕內容（HTTP ' + r.status + '）');
  var n = 0, last = '';
  return vtt.replace(/\r/g, '').split(/\n\n+/).filter(function(b){ return b.indexOf('-->') >= 0; }).map(function(b){
    var ls = b.split('\n'), i = ls.findIndex(function(x){ return x.indexOf('-->') >= 0; });
    var tm = ls[i].replace(/\s+(align|position|line|size):\S+/g, '').replace(/(\d\d:\d\d)\.(\d{3})/g, '$1,$2').replace(/(^|\s)(\d\d:\d\d,\d{3})/g, '$100:$2');
    var tx = ls.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    /* 自動字幕會重複上一行：去掉重複 */
    if(tx && last && tx.indexOf(last) === 0) tx = tx.slice(last.length).trim();
    if(tx) last = tx.split('\n').pop();
    return tx ? (++n) + '\n' + tm + '\n' + tx : '';
  }).filter(Boolean).join('\n\n') + '\n';
}
/* 下載完的影片附上字幕：存成同檔名的 .srt（外部播放器也會自動讀），並記在影片上讓 App 播放器可以切換 */
async function ytAttachSubs(video, subs){
  var stem = video ? String(video.name).replace(/\.[^.]+$/, '') : (subs[0] && subs[0].base) || '字幕';
  var list = [], fail = [];
  for(var i = 0; i < subs.length; i++){
    var x = subs[i];
    try{
      var srt = await x.p;
      var sv = await saveBigBlob(new Blob([srt], {type: 'application/x-subrip'}), stem + '.' + x.lang + '.srt', {src: x.src, title: x.title});
      list.push({id: sv.id, lang: x.lang, label: x.label});
    }catch(e){ fail.push(x.label + '：' + e.message); }
  }
  if(video && list.length){
    var cur = (Lib.byId(video.id) || video).subs || [];
    var all = cur.concat(list);
    if(isApp) NAT.call('libMeta', video.id, JSON.stringify({subs: all}));
    var lv = Lib.byId(video.id); if(lv) lv.subs = all;
  }
  await Lib.refresh(); flashLib();
  if(fail.length) toast('字幕下載失敗：' + fail.join('；'), true);
  else if(list.length) toast(video ? '✓ 影片已附上 ' + list.length + ' 個字幕（播放時按「字幕」開關）' : '✓ 已儲存字幕 ' + list.length + ' 個');
}
async function ytSubDl(d, meta, c, base, tr){
  var p = ytFetchSrt(c, tr); p.catch(function(){});
  ytAttachSubs(null, [{lang: tr || c.lang, label: c.name || c.lang, p: p, base: base, src: 'https://www.youtube.com/watch?v=' + d.id, title: meta.title}]);
}

