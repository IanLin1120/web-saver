/* ============================================================
   啟動、返回鍵、原生事件接線
   ============================================================ */
on('apk', function(d){ Upd.onApk(d); });
on('resume', function(){ Upd.onResume(); syncLayout(); });
on('popup', function(){});
on('tree', function(){});

/* Android 返回鍵：回傳 true 表示介面已處理 */
window.onNativeBack = function(){
  if(Sheets.stack.length){ Sheets.stack[Sheets.stack.length - 1].close(); return true; }
  if(Viewer.isOpen()){ Viewer.close(); return true; }
  if(LV.selMode){ LV.selMode = false; LV.sel.clear(); renderLib(); return true; }
  if(BR.zap){ $('bZap').click(); return true; }
  if(document.activeElement === urlIn){ urlIn.blur(); return true; }
  if(curView !== 'browse'){ showView('browse'); return true; }
  if(BR.home && BR.loaded){ leaveHome(); return true; }
  if(!BR.home && !BR.back && BR.loaded){ goHome(); return true; }
  return false;      /* 交給原生：瀏覽器上一頁，或把 App 退到背景 */
};
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && window.onNativeBack()) e.preventDefault();
  if((e.ctrlKey || e.metaKey) && e.key === 'l'){ e.preventDefault(); showView('browse'); urlIn.focus(); }
});

(async function boot(){
  try{ localStorage.removeItem('ws.otaFail'); }catch(e){}
  applyTheme();
  paintIcons(document);
  pushNativeCfg();
  await Lib.refresh();
  renderStart();
  renderBr();
  syncLayout();
  Dock.changed();
  /* 網頁版：網址列帶 ?url= 時直接開啟（可做成「分享到」書籤） */
  var qp = new URLSearchParams(location.search).get('url');
  if(qp) navigate(qp);
  var v = lsGet('ws.view', 'browse'); if(v !== 'browse') showView(v);
  $('bView').innerHTML = icon(CFG.lib.view === 'grid' ? 'list' : 'grid');
  Upd.boot();
  YT.loadCfg();
  if(navigator.storage && navigator.storage.persist && !isApp) try{ navigator.storage.persist(); }catch(e){}
})();
