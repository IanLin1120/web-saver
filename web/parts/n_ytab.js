/* ============================================================
   YouTube 分頁：獨立的 YouTube 瀏覽器（固定手機版），沒有廣告、背景播放、
   Morphe 風格手勢播放器（頁面腳本 yt.js），右上角一鍵下載（Snaptube 風格下載面板）
   ============================================================ */
var YTB = {url: '', title: '', back: false, progress: 100, started: false, fs: false};
var YT_HOME = 'https://m.youtube.com/';
var YT_MUSIC = 'https://music.youtube.com/';
/* YouTube ⇄ YouTube Music：同一個分頁切換，各自記住上次看到的頁面 */
YTB.last = lsGet('ws.ytLast', {yt: '', music: ''});
function ytIsMusic(u){ return /^https?:\/\/music\.youtube\.com/i.test(u || ''); }
function ytModeUi(){
  var mu = YTB.modeMusic != null ? YTB.modeMusic : ytIsMusic(YTB.url);
  var b = $('ytModeB'); if(!b) return;
  b.classList.toggle('music', !!mu);
  b.title = mu ? '目前是 YouTube Music，點一下切回 YouTube' : '目前是 YouTube，點一下切換到 YouTube Music';
}

function ytSyncLayout(){
  if(!isApp) return;
  /* 換分頁時畫面有 6px 的滑入動畫：扣掉動畫位移，量到的才是最後的位置（之前會偏下、蓋到下方分頁列） */
  var vo = $('v-yt').getBoundingClientRect().top;
  var tb = $('ytTop').getBoundingClientRect();
  if(tb.height) document.documentElement.style.setProperty('--ytTop', Math.round((tb.bottom - vo) / uiZoom() + 6) + 'px');
  requestAnimationFrame(function(){
    var off = $('v-yt').getBoundingClientRect().top, a = $('ytArea').getBoundingClientRect();
    NAT.call('ytRect', a.top - off, Math.max(0, innerHeight - (a.bottom - off)), a.left, Math.max(0, innerWidth - a.right));
    ytUpdateVisible();
  });
}
function ytUpdateVisible(){
  if(!isApp) return;
  var on = curView === 'yt' && YTB.started && !Viewer.isOpen();
  NAT.call('ytShow', on);
}
function ytEnsure(url){
  if(!isApp){ renderYtStart(); return; }
  if(!YTB.started || url){ YTB.started = true; NAT.call('ytLoad', url || YT_HOME); YTB.progress = 5; renderYt(); }
  ytUpdateVisible();
  ytSyncLayout();
}
function ytOpen(url){
  if(curView !== 'yt') showView('yt');
  if(url) YTB.modeMusic = ytIsMusic(url);
  ytEnsure(url || YT_HOME);
  ytModeUi();
}
function ytCurId(){ return YT.idOf(YTB.url); }
function renderYt(){
  var id = ytCurId(), mu = ytIsMusic(YTB.url);
  $('ytBack').disabled = !YTB.back;
  if(mu){
    $('ytT').textContent = id && YTB.title ? YTB.title.replace(/ - YouTube Music$/, '') : 'YouTube Music';
    $('ytSub').textContent = '無廣告・背景播放・關螢幕也能聽';
  } else {
    $('ytT').textContent = id ? (YTB.title || 'YouTube').replace(/ - YouTube$/, '') : 'YouTube';
    $('ytSub').textContent = id ? '點畫面顯示控制列・兩側雙擊快轉・長按 2 倍速' : '無廣告・背景播放・手勢播放器';
  }
  ytModeUi();
  var bar = $('ytBar'), loading = YTB.progress < 100;
  bar.classList.toggle('on', loading); bar.firstChild.style.width = (loading ? Math.max(8, YTB.progress) : 100) + '%';
  $('ytReload').innerHTML = icon(loading ? 'stop' : 'reload');
  $('ytStart').classList.toggle('gone', isApp && YTB.started && !!YTB.url && YTB.progress >= 60);
}
function renderYtStart(){
  var st = $('ytStart'); st.textContent = '';
  if(isApp){
    st.appendChild(h('div', {class: 'ringBox'}, h('div', {class: 'spin'}), h('div', {class: 'sub', text: '正在開啟 YouTube…'})));
    return;
  }
  st.appendChild(h('div', {class: 'empty', html: '<div class="big">▶</div><b>YouTube 分頁需要 APK 版</b><br><span class="sub">網頁版受瀏覽器限制，無法嵌入 YouTube 網站。<br>APK 版提供：沒有廣告、背景播放、子母畫面、手勢播放器、SponsorBlock、一鍵下載影片與音樂。</span>'}));
  st.appendChild(h('div', {class: 'btn-row', style: {justifyContent: 'center'}}, h('button', {class: 'btn pri', html: icon('open', 'sm') + '在新分頁開啟 YouTube', onclick: function(){ openExternal(YT_HOME); }})));
  paintIcons(st);
}
on('ytbr', function(d){
  if(!d) return;
  var changed = d.url !== YTB.url;
  YTB.url = d.url || ''; YTB.title = d.title || ''; YTB.back = d.back; YTB.progress = d.progress; YTB.fs = !!d.fs;
  if(/^https?:\/\/[\w.]*youtube\.com/i.test(YTB.url)){
    var isMu = ytIsMusic(YTB.url); YTB.modeMusic = isMu;
    if(YTB.last[isMu ? 'music' : 'yt'] !== YTB.url){ YTB.last[isMu ? 'music' : 'yt'] = YTB.url; lsSet('ws.ytLast', YTB.last); }
  }
  if(changed && /^https?:/.test(YTB.url)) Hist.add(YTB.url, YTB.title, 'yt');
  else if(YTB.title) Hist.title(YTB.url, YTB.title);
  renderYt(); fabSync();
});
/* 離開網頁（回首頁）或切換分頁時，清空懸浮按鈕上殘留的偵測結果 */
function fabClear(){ if(isApp) NAT.call('brMediaClear'); BR.mediaN = 0; fabSync(); }
on('view', function(e){
  if(e.prev === 'browse' && e.v !== 'browse') fabClear();
  if(e.v === 'yt'){ ytEnsure(); if(!YTB.started) renderYtStart(); }
  ytSyncLayout(); ytUpdateVisible(); fabSync();
  clearTimeout(ytSyncLayout.v); ytSyncLayout.v = setTimeout(ytSyncLayout, 300);
  if(e.prev === 'yt' && e.v !== 'yt' && isApp) NAT.call('ytNav', 'fsOff');
});
on('layout', ytSyncLayout);
window.addEventListener('resize', function(){ clearTimeout(ytSyncLayout.t); ytSyncLayout.t = setTimeout(ytSyncLayout, 60); });
$('ytBack').addEventListener('click', function(){ NAT.call('ytNav', 'back'); });
$('ytHomeB').addEventListener('click', function(){ ytEnsure(ytIsMusic(YTB.url) ? YT_MUSIC : YT_HOME); });
$('ytReload').addEventListener('click', function(){ NAT.call('ytNav', YTB.progress < 100 ? 'stop' : 'reload'); });
$('ytModeB').addEventListener('click', function(){
  var toMusic = !ytIsMusic(YTB.url);
  YTB.modeMusic = toMusic; ytModeUi();
  ytEnsure(toMusic ? (YTB.last.music || YT_MUSIC) : (YTB.last.yt || YT_HOME));
  toast(toMusic ? '♪ YouTube Music' : '▶ YouTube');
});
$('ytMore').addEventListener('click', function(){
  var id = ytCurId();
  menu('YouTube', [
    ['download', '下載這部影片', function(){ if(id) openYt(id); else toast('先打開一部影片', true); }, false, id ? '' : '目前不在影片頁'],
    ['sparkle', 'AI 摘要這部影片', function(){ if(id){ NAT.call('ytNav', 'pause'); aiOpenVideo(id, {auto: true}); } else showView('ai'); }, false, id ? '摘要、章節、針對影片提問' : '目前不在影片頁'],
    ['gear', 'YouTube 播放器設定', function(){ openYtSettings(); }, false, '去廣告、背景播放、手勢、SponsorBlock、畫質…'],
    ['search', '貼上 YouTube 網址', async function(){
      var t = '';
      try{ t = (await navigator.clipboard.readText() || '').trim(); }catch(e){}
      if(!YT.idOf(t)) t = await promptDlg('貼上 YouTube 網址', t, 'https://youtu.be/…');
      if(t && YT.idOf(t)) ytOpen('https://m.youtube.com/watch?v=' + YT.idOf(t)); else if(t) toast('這不是 YouTube 影片網址', true);
    }],
    ['copy', '複製網址', function(){ copyText(YTB.url || YT_HOME); }],
    ['globe', '在「瀏覽」分頁開啟', function(){ if(YTB.url) navigate(YTB.url); }],
    ['history', '瀏覽記錄', function(){ openHistory('yt'); }]
  ]);
});
on('ytOpen', function(u){ ytOpen(String(u)); });

/* 手機轉橫向時自動全螢幕播放，轉回直向自動離開（像 YouTube App） */
var YT_AUTOFS = false;
function ytOrient(){
  if(!isApp) return;
  var land = innerWidth > innerHeight * 1.1;
  if(land && curView === 'yt' && ytCurId() && !YTB.fs && !Sheets.stack.length){ YT_AUTOFS = true; NAT.call('ytNav', 'fsOn'); }
  else if(!land && YTB.fs && YT_AUTOFS){ YT_AUTOFS = false; NAT.call('ytNav', 'fsOff'); }
  if(!YTB.fs && !land) YT_AUTOFS = false;
}
window.addEventListener('resize', function(){ clearTimeout(ytOrient.t); ytOrient.t = setTimeout(ytOrient, 250); });

/* ---------- 從其他 App 分享進來 ---------- */
/* 「用網頁擷取下載」：YouTube 連結 → 在 YouTube 分頁打開並直接跳出下載面板；其他網址 → 打開並偵測媒體 */
on('shareDl', function(u){
  u = String(u || '');
  var id = YT.idOf(u);
  if(id){ ytOpen('https://m.youtube.com/watch?v=' + id); openYt(id); return; }
  navigate(u);
  toast('網頁載入後會自動偵測可下載的影片…');
  setTimeout(function(){ openMedia(true); }, 4500);
});

/* ---------- 懸浮下載按鈕（浮在所有畫面與彈出視窗上，可拖曳） ---------- */
var FAB = {popup: false};
function fabSync(){
  if(!isApp) return;
  var on = false, label = '';
  if(CFG.fab && !SREC.on){
    if(curView === 'yt') on = !!ytCurId() && !YTB.fs;
    else if(curView === 'browse'){ on = (!BR.home && BR.loaded && !!BR.url && !/^(about|data):/.test(BR.url)) || document.body.classList.contains('brFull'); label = on && BR.mediaN ? String(BR.mediaN > 99 ? '99+' : BR.mediaN) : ''; }
  }
  NAT.call('fab', on, label);
}
on('br', fabSync); on('mediaCount', fabSync); on('cfg', function(p){ if(p === 'fab') fabSync(); });
on('popup', function(d){ FAB.popup = !!(d && d.open); fabSync(); });
on('fab', function(where){
  var busy = Tasks.list().length;
  if(where === 'yt' || curView === 'yt'){ var id = ytCurId(); if(id && !busy){ openYt(id); return; } if(busy){ openFabMenu(id); return; } }
  if(curView !== 'browse'){ if(busy){ openFabMenu(); return; } showView('browse'); }
  if(document.body.classList.contains('brFull')){ openFabMenu(); return; }
  if(YT.idOf(BR.url)){ openYt(YT.idOf(BR.url)); return; }
  openFabMenu();
});
/* 懸浮按鈕的選單：所有進行中的工作（可各自取消）＋下載影片、擷取網頁 */
function openFabMenu(ytId){
  var body = h('div'), tasks = h('div');
  function drawTasks(){
    tasks.textContent = '';
    var L = Tasks.list();
    if(!L.length) return;
    tasks.appendChild(h('div', {class: 'ydSect', text: '進行中（' + L.length + '）'}));
    L.forEach(function(x){
      tasks.appendChild(h('div', {class: 'card glass', style: {padding: '10px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px'}},
        x.pct == null || x.pct < 0 ? h('div', {class: 'spin'}) : h('span', {html: ring(x.pct)}),
        h('div', {class: 'grow', style: {minWidth: 0}}, h('b', {class: 'ell', style: {display: 'block'}, text: x.title}), h('div', {class: 'sub ell', text: x.sub || ''})),
        x.cancel ? h('button', {class: 'btn sm ghost', text: '取消', onclick: function(){ x.cancel(); toast('正在取消…'); }}) : null));
    });
  }
  drawTasks();
  on('tasks', drawTasks);
  var off = function(){ BUS.tasks = (BUS.tasks || []).filter(function(f){ return f !== drawTasks; }); };
  body.appendChild(tasks);
  function big(ic, color, title, sub, fn, dis){
    body.appendChild(h('button', {class: 'fabBig', disabled: !!dis, onclick: function(){ s.close(); setTimeout(fn, 80); }},
      h('span', {class: 'oi', style: {background: color}, html: icon(ic)}), h('div', {class: 'grow'}, h('b', {text: title}), h('div', {class: 'sub', text: sub}))));
  }
  var page = curView === 'browse' && !BR.home && BR.loaded;
  if(document.body.classList.contains('brFull')) big('shrink', 'var(--ink-2, #6b5a48)', '離開滿版瀏覽', '回到一般版面（顯示網址列與下方分頁）', function(){ setBrFull(false); });
  if(ytId) big('download', 'var(--c-video)', '下載這部 YouTube 影片', '影片、音樂、字幕', function(){ openYt(ytId); });
  if(curView === 'browse'){
    big('film', 'var(--c-video)', '下載這個網頁的影片', BR.mediaN ? '偵測到 ' + BR.mediaN + ' 個媒體・正在播放的影片會排在最前面' : '先播放網頁裡的影片，比較容易抓到', function(){ openMedia(); }, !page);
    big('download', 'var(--accent)', '擷取網頁', '存成離線 HTML／PDF（可選無縫圖片 PDF）', function(){ openCapture(); }, !page);
    big('scissors', 'var(--olive)', '手動清理', '點選要移除的區塊（廣告、浮動視窗）', function(){ $('bZap').click(); }, !page);
  }
  body.appendChild(h('div', {class: 'sub', style: {fontSize: '12px', margin: '6px 2px 0'}, text: '同時下載數：' + (isApp && NAT.has('dlMaxGet') ? NAT.call('dlMaxGet') : 3) + ' 個（在「設定 → 下載」調整）'}));
  var s = openSheet({title: Tasks.list().length && curView !== 'browse' ? '進行中的工作' : '下載與擷取', icon: 'download', body: body, onClose: function(){ if(off) off(); }});
}

/* ---------- 交給外部下載 App（Snaptube、Quetta、影片下載工具…），下載完自動搬回檔案庫並刪掉原檔 ---------- */
function watchDirs(){ try{ return isApp && NAT.has('watchDirs') ? JSON.parse(NAT.call('watchDirs') || '[]') : []; }catch(e){ return []; } }
var SHARE_APPS = null;
function shareApps(){ if(!SHARE_APPS){ try{ SHARE_APPS = JSON.parse(NAT.call('shareApps') || '[]'); }catch(e){ SHARE_APPS = []; } } return SHARE_APPS; }
var DL_APPS = [['com.snaptube.premium', 'Snaptube'], ['com.snaptube.premium.lite', 'Snaptube'], ['com.quetta.browser', 'Quetta']];
function appDir(pkg){ return watchDirs().filter(function(d){ return d.pkg === pkg; })[0] || null; }
/* 下載面板上的「交給 App」按鈕：已設定資料夾的 App、已安裝的常見下載工具各自一顆，最後是「其他 App…」 */
function handOffButtons(url, before){
  if(!isApp || !NAT.has('shareApps')) return null;
  var apps = shareApps(), list = [], seen = {};
  watchDirs().forEach(function(d){ if(d.pkg && !seen[d.pkg]){ var a = apps.filter(function(x){ return x.pkg === d.pkg; })[0]; if(a){ seen[d.pkg] = 1; list.push(a); } } });
  DL_APPS.forEach(function(k){ var a = apps.filter(function(x){ return x.pkg === k[0] || x.label === k[1]; })[0]; if(a && !seen[a.pkg]){ seen[a.pkg] = 1; list.push(a); } });
  var row = h('div', {class: 'hoRow'});
  list.forEach(function(a){
    row.appendChild(h('button', {class: 'hoBtn', onclick: function(){ if(before) before(); handOff(url, a.pkg, a.label); }},
      a.icon ? h('img', {src: a.icon, alt: ''}) : h('span', {html: icon('download')}), h('span', {class: 'ell', text: a.label})));
  });
  /* 沒裝 Snaptube：提供 Snaptube 官方放在 OneDrive 的安裝檔連結 */
  var SNAPTUBE_DL = 'https://1drv.ms/u/c/bbba28619ef92f91/IQBFJF1V6wAhR6rHaAh_t_npAdQPGLvLd9SI3AagEVw1qC0';
  if(!list.some(function(a){ return /snaptube/i.test(a.pkg + ' ' + a.label); }))
    row.appendChild(h('button', {class: 'hoBtn', onclick: function(){
      dialog('還沒安裝 Snaptube', '要用 Snaptube 下載，請先下載安裝 Snaptube（Google Play 沒有上架）。下載完打開安裝檔，Android 會詢問是否允許安裝未知來源的 App，選允許。<br><br>裝好後回來，這裡就會出現 Snaptube 按鈕。', [['下載 Snaptube', function(){ openExternal(SNAPTUBE_DL); }], ['取消', null, '']]);
    }}, h('span', {class: 'more', html: icon('download')}), h('span', {class: 'ell', text: '取得 Snaptube'})));
  row.appendChild(h('button', {class: 'hoBtn', onclick: function(){ if(before) before(); pickShareApp(url); }}, h('span', {class: 'more', html: icon('more')}), h('span', {text: '其他 App…'})));
  return h('div', null, h('div', {class: 'ydSect', text: '交給其他 App 下載（下載完自動搬回、刪除原檔）'}), row);
}
function pickShareApp(url, then){
  var apps = shareApps(), body = h('div');
  var s = openSheet({title: '交給哪個 App？', icon: 'share', body: body, tall: true});
  apps.forEach(function(a){
    var d = appDir(a.pkg);
    body.appendChild(h('div', {class: 'setRow', onclick: function(){ s.close(); if(then) then(a); else handOff(url, a.pkg, a.label); }},
      a.icon ? h('img', {src: a.icon, style: {width: '36px', height: '36px', borderRadius: '9px', flex: 'none'}}) : h('span', {class: 'ic', html: icon('download')}),
      h('div', {class: 'grow'}, h('b', {text: a.label}), h('div', {class: 'sub ell', text: d ? '下載資料夾：' + d.name : a.pkg})), h('span', {class: 'chev', text: '›'})));
  });
  if(!apps.length) body.appendChild(h('div', {class: 'empty', text: '找不到可以接收網址的 App'}));
}
function handOff(url, pkg, label){
  if(!isApp || !NAT.has('shareDl')){ toast('需要 APK 版', true); return; }
  label = label || pkg;
  function go(){ if(!NAT.call('sendTo', pkg, url)) toast('沒有安裝 ' + label, true); }
  if(!appDir(pkg)){
    dialog('設定「' + esc(label) + '」的下載資料夾', '要讓 ' + esc(label) + ' 下載完的影片自動回到這裡，請選一次它存放下載檔案的資料夾（每個 App 各設定一次）。<br><br>' +
      (/snaptube/i.test(pkg + label) ? '・Snaptube：內部儲存空間 → <b>snaptube</b> → <b>download</b><br>' : '・不知道在哪：打開 ' + esc(label) + ' 的設定，找「下載位置／儲存路徑」<br>') +
      '<br>之後 App 回到前景時會自動把下載完的影片、音樂、字幕搬進檔案庫，並刪掉原檔。',
      [['選擇資料夾', function(){ NAT.call('watchAddFor', pkg, label); waitEv('watchDirs', null, 120000).then(function(){ if(appDir(pkg)) go(); }); }], ['先不要，直接傳過去', go], ['取消', null, '']]);
    return;
  }
  go();
}
on('imported', function(d){
  var items = (d && d.items) || [];
  Lib.refresh(); flashLib();
  if(items.length){
    var vids = items.filter(function(x){ return !/\.(srt|vtt|ass)$/i.test(x.name); });
    toast('✓ 已從其他 App 搬回 ' + vids.length + ' 個檔案' + (items.length > vids.length ? '（含字幕 ' + (items.length - vids.length) + ' 個）' : ''), false,
      ['查看', function(){ if(vids.length === 1) Viewer.open(Lib.byId(vids[0].id) || vids[0]); else showView('lib'); }]);
  }
  if(d && d.err) toast('匯入時有問題：' + d.err.split('\n')[0], true);
});
function openWatchSettings(){
  var body = h('div');
  var s = openSheet({title: '其他 App 下載自動搬回', icon: 'download', body: body, tall: true});
  function draw(){
    body.textContent = '';
    body.appendChild(h('div', {class: 'sub', style: {lineHeight: '1.7', marginBottom: '10px'}, text: '每個下載 App 可以設定一個或好幾個下載資料夾（例如影片、音樂分開的資料夾都加進來）。用它們下載完的影片、音樂、字幕會自動搬進檔案庫（字幕接在影片上），搬完刪掉原檔。App 回到前景時會檢查，交給其他 App 下載後的 3 小時內也會每 15 秒檢查一次。'}));
    var apps = shareApps(), ds = watchDirs();
    if(!ds.length) body.appendChild(h('div', {class: 'empty', html: '還沒有設定任何 App'}));
    /* 依 App 分組：同一個 App 可以設定好幾個資料夾（例如 Snaptube 的影片、音樂分開存） */
    var groups = [], byPkg = {};
    ds.forEach(function(d){ var k = d.pkg || ''; if(!byPkg[k]){ byPkg[k] = {pkg: k, label: d.label, dirs: []}; groups.push(byPkg[k]); } byPkg[k].dirs.push(d); });
    groups.forEach(function(g){
      var a = apps.filter(function(x){ return x.pkg === g.pkg; })[0];
      var card = h('div', {class: 'card glass', style: {padding: '10px 12px', marginBottom: '10px'}});
      card.appendChild(h('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px'}},
        a && a.icon ? h('img', {src: a.icon, style: {width: '34px', height: '34px', borderRadius: '9px', flex: 'none'}}) : h('span', {class: 'ic', html: icon('folder')}),
        h('b', {class: 'grow', text: g.label || (a && a.label) || '（不指定 App）'}),
        h('button', {class: 'btn sm', html: icon('plus', 'sm') + '加資料夾', onclick: function(){ NAT.call('watchAddFor', g.pkg, g.label || (a && a.label) || ''); }})));
      g.dirs.forEach(function(d){
        card.appendChild(h('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderTop: '1px solid var(--line)'}},
          h('span', {html: icon('folder', 'sm')}), h('div', {class: 'grow sub ell', style: {minWidth: 0}, text: d.name}),
          h('button', {class: 'btn sm ghost', text: '移除', onclick: function(){ NAT.call('watchRemoveFor', d.uri, d.pkg || ''); }})));
      });
      body.appendChild(card);
    });
    var del = h('input', {type: 'checkbox', checked: NAT.call('importDelGet'), onchange: function(){ NAT.call('importDel', this.checked); }});
    body.appendChild(h('label', {class: 'opt'}, del, h('div', {class: 'grow'}, h('b', {text: '搬回後刪除原檔'}), h('div', {class: 'sub', text: '避免手機裡存兩份'}))));
    body.appendChild(h('div', {class: 'btn-row'},
      h('button', {class: 'btn pri', html: icon('plus', 'sm') + '新增 App', onclick: function(){ pickShareApp('', function(a){ NAT.call('watchAddFor', a.pkg, a.label); }); }}),
      h('button', {class: 'btn', html: icon('reload', 'sm') + '立即檢查', onclick: function(){ NAT.call('watchScan'); toast('檢查中…'); }})));
    paintIcons(body);
  }
  draw();
  on('watchDirs', function(){ if(!s.closed) draw(); });
}

/* 瀏覽分頁裡點到 YouTube 連結：不開新視窗、不播切換動畫，直接到 YouTube 分頁打開 */
on('brToYt', function(u){
  u = String(u || '');
  var id = ytIsMusic(u) ? '' : YT.idOf(u);
  var url = ytIsMusic(u) ? u : id ? 'https://m.youtube.com/watch?v=' + id + ((u.match(/[?&#]t=(\d+)/) || [])[1] ? '&t=' + u.match(/[?&#]t=(\d+)/)[1] + 's' : '') : u.replace(/^https?:\/\/(www\.)?youtube\.com/, 'https://m.youtube.com');
  var de = document.documentElement;
  de.classList.add('no-motion');
  showView('yt');
  YTB.modeMusic = ytIsMusic(url); ytModeUi();
  ytEnsure(url);
  setTimeout(function(){ de.classList.remove('no-motion'); }, 400);
});
