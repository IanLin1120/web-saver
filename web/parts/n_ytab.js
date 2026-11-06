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
on('view', function(e){
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
    else if(curView === 'browse'){ on = (!BR.home && BR.loaded && !!BR.url && !/^(about|data):/.test(BR.url)) || FAB.popup; label = BR.mediaN ? String(BR.mediaN > 99 ? '99+' : BR.mediaN) : ''; }
  }
  NAT.call('fab', on, label);
}
on('br', fabSync); on('mediaCount', fabSync); on('cfg', function(p){ if(p === 'fab') fabSync(); });
on('popup', function(d){ FAB.popup = !!(d && d.open); fabSync(); });
on('fab', function(where){
  if(where === 'yt' || curView === 'yt'){ var id = ytCurId(); if(id){ openYt(id); return; } }
  if(curView !== 'browse') showView('browse');
  openMedia();
});
