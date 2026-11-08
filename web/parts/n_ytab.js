/* ============================================================
   YouTube 分頁：獨立的 YouTube 瀏覽器（固定手機版），沒有廣告、背景播放、
   Morphe 風格手勢播放器（頁面腳本 yt.js），右上角一鍵下載（Snaptube 風格下載面板）
   ============================================================ */
var YTB = {url: '', title: '', back: false, progress: 100, started: false, fs: false};
var YT_HOME = 'https://m.youtube.com/';

function ytSyncLayout(){
  if(!isApp) return;
  requestAnimationFrame(function(){
    var a = $('ytArea').getBoundingClientRect();
    NAT.call('ytRect', a.top, Math.max(0, innerHeight - a.bottom), a.left, Math.max(0, innerWidth - a.right));
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
  ytSyncLayout();
}
function ytOpen(url){
  if(curView !== 'yt') showView('yt');
  ytEnsure(url || YT_HOME);
}
function ytCurId(){ return YT.idOf(YTB.url); }
function renderYt(){
  var id = ytCurId();
  $('ytDlB').disabled = !id;
  $('ytBack').disabled = !YTB.back;
  $('ytT').textContent = id ? (YTB.title || 'YouTube').replace(/ - YouTube$/, '') : 'YouTube';
  $('ytSub').textContent = id ? '點畫面顯示控制列・兩側雙擊快轉・長按 2 倍速' : '無廣告・背景播放・手勢播放器';
  var bar = $('ytBar'), loading = YTB.progress < 100;
  bar.classList.toggle('on', loading); bar.firstChild.style.width = (loading ? Math.max(8, YTB.progress) : 100) + '%';
  $('ytReload').innerHTML = icon(loading ? 'stop' : 'reload');
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
  if(e.prev === 'yt' && e.v !== 'yt' && isApp) NAT.call('ytNav', 'fsOff');
});
on('layout', ytSyncLayout);
window.addEventListener('resize', function(){ clearTimeout(ytSyncLayout.t); ytSyncLayout.t = setTimeout(ytSyncLayout, 60); });
$('ytBack').addEventListener('click', function(){ NAT.call('ytNav', 'back'); });
$('ytHomeB').addEventListener('click', function(){ ytEnsure(YT_HOME); });
$('ytReload').addEventListener('click', function(){ NAT.call('ytNav', YTB.progress < 100 ? 'stop' : 'reload'); });
$('ytDlB').addEventListener('click', function(){ var id = ytCurId(); if(id) openYt(id); });
$('ytMore').addEventListener('click', function(){
  var id = ytCurId();
  menu('YouTube', [
    ['download', '下載這部影片', function(){ if(id) openYt(id); else toast('先打開一部影片', true); }, false, id ? '' : '目前不在影片頁'],
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
  if(CFG.fab){
    if(curView === 'yt') on = !!ytCurId() && !YTB.fs;
    else if(curView === 'browse'){ on = !BR.home && BR.loaded && !!BR.url && !/^(about|data):/.test(BR.url); label = on && BR.mediaN ? String(BR.mediaN > 99 ? '99+' : BR.mediaN) : ''; }
  }
  NAT.call('fab', on, label);
}
on('br', fabSync); on('mediaCount', fabSync); on('cfg', function(p){ if(p === 'fab') fabSync(); });
on('popup', function(d){ FAB.popup = !!(d && d.open); fabSync(); });
on('fab', function(where){
  var busy = Tasks.list().length;
  if(where === 'yt' || curView === 'yt'){ var id = ytCurId(); if(id && !busy){ openYt(id); return; } if(busy){ openFabMenu(id); return; } }
  if(curView !== 'browse'){ if(busy){ openFabMenu(); return; } showView('browse'); }
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
  if(ytId) big('download', 'var(--c-video)', '下載這部 YouTube 影片', '影片、音樂、字幕', function(){ openYt(ytId); });
  if(curView === 'browse'){
    big('film', 'var(--c-video)', '下載這個網頁的影片', BR.mediaN ? '偵測到 ' + BR.mediaN + ' 個媒體・正在播放的影片會排在最前面' : '先播放網頁裡的影片，比較容易抓到', function(){ openMedia(); }, !page);
    big('download', 'var(--accent)', '擷取網頁', '存成離線 HTML／PDF（可選無縫圖片 PDF）', function(){ openCapture(); }, !page);
    big('scissors', 'var(--olive)', '手動清理', '點選要移除的區塊（廣告、浮動視窗）', function(){ $('bZap').click(); }, !page);
  }
  body.appendChild(h('div', {class: 'sub', style: {fontSize: '12px', margin: '6px 2px 0'}, text: '同時下載數：' + (isApp && NAT.has('dlMaxGet') ? NAT.call('dlMaxGet') : 3) + ' 個（在「設定 → 下載」調整）'}));
  var s = openSheet({title: Tasks.list().length && curView !== 'browse' ? '進行中的工作' : '下載與擷取', icon: 'download', body: body, onClose: function(){ if(off) off(); }});
}
