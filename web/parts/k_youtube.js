/* ============================================================
   YouTube：解析影片可用的畫質與音軌，下載影片（最高 4K）或音樂（MP3／M4A／OPUS／FLAC／WAV）
   做法同 Snaptube／影片下載工具：向 YouTube 取得「影像」「聲音」分開的原始串流，
   分段下載後在手機上合併（不重新壓縮），音樂再依需要轉成 MP3／FLAC／WAV。
   解析設定放在 GitHub（yt.json），YouTube 改版時只要更新設定，不用重裝 App。
   ============================================================ */
var YT_DEFAULT = {
  v: 2,
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
var YT = {cfg: lsGet('ws.ytcfg', null) || YT_DEFAULT, cache: {}};
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
async function ytProbe(url, ua){
  try{
    var r = await natHttp('GET', url, {'User-Agent': ua, 'Range': 'bytes=0-1'}, '');
    return r.status === 206 || r.status === 200 ? 0 : r.status;
  }catch(e){ return -1; }
}
YT.player = async function(id, skip){
  if(!skip && YT.cache[id] && Date.now() - YT.cache[id].t < 2 * 3600e3) return YT.cache[id].d;
  var errs = [], hlsOnly = null;
  for(var i = 0; i < YT.cfg.clients.length; i++){
    var c = YT.cfg.clients[i];
    if(skip && skip.indexOf(c.name + c.ver) >= 0) continue;
    var client = Object.assign({clientName: c.name, clientVersion: c.ver, hl: 'zh-TW', gl: 'TW', timeZone: 'Asia/Taipei', utcOffsetMinutes: 480}, c.ctx || {});
    var body = {context: {client: client}, videoId: id, contentCheckOk: true, racyCheckOk: true};
    if(c.embed) body.context.thirdParty = {embedUrl: 'https://www.youtube.com/watch?v=' + id};
    try{
      var r = await natHttp('POST', YT.cfg.endpoint, {'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': String(c.id), 'X-YouTube-Client-Version': c.ver, 'Origin': 'https://www.youtube.com'}, JSON.stringify(body));
      var j = JSON.parse(r.body);
      var st = j.playabilityStatus || {};
      if(st.status !== 'OK'){ errs.push(c.name + ' ' + c.ver + '：' + (st.reason || st.status || ('HTTP ' + r.status))); continue; }
      var sd = j.streamingData || {};
      var fm = (sd.adaptiveFormats || []).concat(sd.formats || []).filter(function(f){ return f.url; });
      var d = {id: id, client: c, details: j.videoDetails || {}, formats: fm, hls: sd.hlsManifestUrl || ''};
      if(fm.length){
        var test = fm.filter(function(f){ return /^audio/.test(f.mimeType); })[0] || fm[0];
        var code = await ytProbe(test.url, c.ua);
        if(!code){ YT.cache[id] = {t: Date.now(), d: d}; return d; }
        errs.push(c.name + ' ' + c.ver + '：串流被拒（HTTP ' + code + '）');
      } else errs.push(c.name + ' ' + c.ver + '：沒有可直接下載的串流');
      if(d.hls && !hlsOnly){ d.formats = []; hlsOnly = d; }
    }catch(e){ errs.push(c.name + ' ' + c.ver + '：' + e.message); }
  }
  if(hlsOnly){ hlsOnly.note = errs.join('\n'); YT.cache[id] = {t: Date.now(), d: hlsOnly}; return hlsOnly; }
  throw new Error(errs.join('\n'));
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

/* ---------- 下載面板 ---------- */
async function openYt(id){
  if(!isApp){ dialog('需要 APK 版', '網頁版受瀏覽器限制，無法讀取 YouTube 的影片串流。請在 APK 版的瀏覽頁開啟 YouTube 影片，再按「媒體」。', [['好', null]]); return; }
  var body = h('div', {html: '<div class="ringBox"><div class="spin"></div><div class="sub">正在解析 YouTube 影片…</div></div>'});
  var s = openSheet({title: 'YouTube 下載', icon: 'video', body: body, tall: true,
    headExtra: h('button', {class: 'btn sm ghost', text: '一般偵測', onclick: function(){ s.close(); openMedia(true); }})});
  var d;
  try{ d = await YT.player(id); }
  catch(e){
    body.innerHTML = '';
    body.appendChild(h('div', {class: 'empty', html: '<div class="big">⚠️</div>無法解析這部影片<br><span class="sub" style="white-space:pre-line">' + esc(e.message) + '</span>'}));
    body.appendChild(h('div', {class: 'note', html: '可能原因：影片有年齡限制、會員專屬、私人影片，或 YouTube 改版。可到「設定 → YouTube」按「更新解析設定」後再試。'}));
    return;
  }
  var meta = ytMeta(d), opt = ytOptions(d), tab = lsGet('ws.ytTab', 'video');
  var hlsMode = !d.formats.length && !!d.hls, hv = null;
  if(hlsMode){
    hv = await new Promise(function(res){
      var done = false, fn = function(x){ if(!done && x.url === d.hls){ done = true; res(x.variants || []); } };
      on('hlsInfo', fn); NAT.call('hlsInfo', d.hls, ''); setTimeout(function(){ if(!done){ done = true; res([]); } }, 15000);
    });
  }
  var name = h('input', {type: 'text', value: meta.title.replace(/[\\\/:*?"<>|]/g, '_').slice(0, 100)});
  function draw(){
    body.textContent = '';
    body.appendChild(h('div', {class: 'capHead'}, h('div', {class: 'snap', style: {width: '112px', height: '63px', backgroundImage: 'url("' + pxUrl(meta.thumb) + '")', backgroundSize: 'cover', backgroundPosition: 'center'}}),
      h('div', {class: 'grow'}, h('b', {text: meta.title, style: {display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '14px'}}),
        h('div', {class: 'sub', text: (d.details.author || '') + (meta.dur ? '・' + fmtDur(meta.dur) : '')}))));
    body.appendChild(h('div', {class: 'field'}, h('div', {class: 'lbl'}, '檔名'), name));
    var seg = h('div', {class: 'seg', style: {margin: '6px 0 10px'}});
    [['video', '影片', 'video'], ['music', '音樂', 'audio'], ['thumb', '縮圖', 'image']].forEach(function(t){
      seg.appendChild(h('button', {class: tab === t[0] ? 'on' : '', html: icon(t[2], 'sm') + t[1], onclick: function(){ tab = t[0]; lsSet('ws.ytTab', tab); draw(); }}));
    });
    body.appendChild(seg);
    var list = h('div', {class: 'opts'});
    function row(ic, t, sub, size, fn, color){
      list.appendChild(h('div', {class: 'opt', onclick: function(){ s.close(); fn(); }},
        h('span', {class: 'oi', html: icon(ic), style: color ? {background: color, color: '#fff'} : null}),
        h('div', {class: 'grow'}, h('b', {text: t}), h('div', {class: 'sub', html: sub})),
        size ? h('span', {class: 'badge', text: '約 ' + fmtSize(size)}) : null,
        h('span', {html: icon('download'), style: {color: 'var(--accent)'}})));
    }
    var nm = function(){ return (name.value.trim() || meta.title).replace(/[\\\/:*?"<>|]/g, '_'); };
    var base = {src: BR.url || ('https://www.youtube.com/watch?v=' + d.id), title: meta.title, thumbUrl: meta.thumb, ua: d.client.ua, noCookie: true, referer: ''};
    if(hlsMode){
      body.appendChild(h('div', {class: 'note', html: '⚠️ 這部影片的一般串流被 YouTube 拒絕，改用 <b>HLS 串流</b>下載（最高 1080p，下載後轉成 MP4）。'}));
      if(tab === 'video'){
        (hv.length ? hv : [{url: '', h: 0, name: '最高畫質'}]).forEach(function(v){
          row('video', v.h ? qLabel(v.h, {}) : (v.name || '最高畫質'), 'HLS 串流・下載後轉成 MP4', 0, function(){ ytDl([Object.assign({}, base, {kind: 'hls', url: d.hls, variant: v.url, name: nm() + (v.h ? '_' + v.h + 'p' : '')})], meta); }, 'var(--c-video)');
        });
        body.appendChild(list); paintIcons(body); return;
      }
      if(tab === 'music'){
        var hb = Object.assign({}, base, {kind: 'hls', url: d.hls, variant: (hv[hv.length - 1] || {}).url || '', name: nm(), artist: meta.artist, title: meta.song, audioOnly: true});
        [['mp3:320', 'MP3 320kbps'], ['mp3:192', 'MP3 192kbps'], ['flac', 'FLAC 無損格式'], ['wav', 'WAV 無損 PCM'], ['', 'M4A（AAC 原始音軌）']].forEach(function(k){
          row('audio', k[1], '從 HLS 串流取出音軌' + (k[0] ? '後轉檔' : '、不轉檔'), 0, function(){ ytDl([Object.assign({}, hb, k[0] ? {convert: k[0]} : {})], meta, 'm4a'); }, 'var(--c-audio)');
        });
        body.appendChild(list); paintIcons(body); return;
      }
    }
    if(tab === 'video'){
      if(!opt.video.length) list.appendChild(h('div', {class: 'empty', text: '沒有可下載的影片串流'}));
      opt.video.forEach(function(o){
        row('video', o.label, (o.cont === 'mp4' ? 'MP4' : 'WebM') + '・' + o.codec + (o.muxed ? '' : '＋' + (o.a ? (/opus/.test(ytCodec(o.a)) ? 'Opus' : 'AAC') : '') + ' 音訊，下載後合併') + (o.cont === 'webm' ? '<br>高畫質只有 VP9 編碼，存成 WebM' : ''),
          fSize(o.v) + fSize(o.a), function(){
            ytDl([Object.assign({}, base, {kind: 'merge', url: o.v.url, audioUrl: o.a ? o.a.url : '', container: o.cont, name: nm() + '_' + o.h + 'p', chunked: true})], meta);
          }, 'var(--c-video)');
      });
      if(d.hls) row('layers', 'HLS 串流（備用）', '若上面的選項下載失敗可試這個・最高 1080p', 0, function(){ ytDl([Object.assign({}, base, {kind: 'hls', url: d.hls, name: nm()})], meta); });
    } else if(tab === 'music'){
      var best = opt.opus || opt.m4a;
      if(!best) list.appendChild(h('div', {class: 'empty', text: '沒有可下載的音軌'}));
      else {
        var src = function(o){ return {kind: 'audio', url: o.url, ext: /webm/.test(o.mimeType) ? 'webm' : 'mp4'}; };
        var au = Object.assign({}, base, {artist: meta.artist, name: nm()});
        var ms = {title: meta.song, artist: meta.artist};
        [[320, '極高音質'], [192, '高音質'], [128, '標準']].forEach(function(k){
          row('audio', 'MP3 ' + k[0] + 'kbps', k[1] + '・相容所有播放器（下載後轉檔）', meta.dur * k[0] * 125, function(){ ytDl([Object.assign({}, au, src(best), {audioOut: 'orig', convert: 'mp3:' + k[0]}, ms)], meta); }, 'var(--c-audio)');
        });
        if(opt.m4a) row('audio', 'M4A（AAC 原始音軌）', '不轉檔、原音直出・約 ' + Math.round(opt.m4a.bitrate / 1000) + 'kbps', fSize(opt.m4a), function(){ ytDl([Object.assign({}, au, src(opt.m4a), {audioOut: 'm4a'}, ms)], meta); }, 'var(--c-audio)');
        if(opt.opus) row('sparkle', 'OPUS（原始最高音質）', 'YouTube 音質最好的音軌、不轉檔・約 ' + Math.round(opt.opus.bitrate / 1000) + 'kbps', fSize(opt.opus), function(){ ytDl([Object.assign({}, au, src(opt.opus), {audioOut: 'opus'}, ms)], meta); }, 'var(--c-audio)');
        row('sparkle', 'FLAC 無損格式', '完整保留原始音軌、不再有任何音質損失・附歌名與封面', meta.dur * 48000 * 4 * 0.6, function(){ ytDl([Object.assign({}, au, src(best), {audioOut: 'orig', convert: 'flac'}, ms)], meta); }, 'var(--olive)');
        row('sparkle', 'WAV 無損 PCM', '未壓縮，檔案最大，適合剪輯軟體', meta.dur * 48000 * 4, function(){ ytDl([Object.assign({}, au, src(best), {audioOut: 'orig', convert: 'wav'}, ms)], meta); }, 'var(--olive)');
        body.appendChild(list);
        body.appendChild(h('div', {class: 'note', html: '🎧 說明：YouTube 提供的原始音訊本身就是壓縮過的（Opus 約 160kbps、AAC 約 128kbps）。<b>FLAC／WAV</b> 會把這條音軌「一點不漏」地保存下來，之後怎麼轉、怎麼剪都不會再掉音質，但無法比 YouTube 的原始音軌更好。想要最小檔案又最好音質，選 <b>OPUS</b>。'}));
        paintIcons(body); return;
      }
    } else {
      row('image', '最高解析度縮圖（JPG）', 'maxresdefault・1280×720 以上（若影片有提供）', 0, function(){ ytDl([{kind: 'image', url: meta.thumbMax, name: nm() + '_縮圖', referer: base.referer}], meta); }, 'var(--c-image)');
      row('image', '標準縮圖（JPG）', 'hqdefault・480×360', 0, function(){ ytDl([{kind: 'image', url: meta.thumb, name: nm() + '_縮圖', referer: base.referer}], meta); }, 'var(--c-image)');
    }
    body.appendChild(list);
    paintIcons(body);
  }
  draw();
}
var PENDING_CONV = {};
function ytDl(items, meta, vidOut){
  var folder = LF.pickDefault && LF.pickDefault(items[0]);
  items.forEach(function(it){ if(folder) it.folder = folder; });
  dlCard(0, items.length, '準備下載…', 0);
  NAT.call('dlStart', JSON.stringify({page: BR.url, title: meta.title, items: items, opts: {zip: false, imgFmt: 'orig', imgMax: 0, imgQ: 92, vidOut: vidOut || 'mp4', vidQ: 'max'}}));
}
on('ytdl', function(id){ if(id) openYt(String(id)); });
/* 下載完成後，需要轉檔的音樂自動排入轉檔佇列 */
on('dl', function(d){
  if(d.state !== 'done' || !d.items) return;
  d.items.forEach(function(it){
    if(it.folder){ LF.map[it.id] = it.folder; LF.save(); }
    if(it.convert){ var p = String(it.convert).split(':'); Conv.add(it, p[0], {kbps: +p[1] || 320}); }
  });
});
