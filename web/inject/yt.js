/* YouTube 去廣告（概念同 Morphe／ReVanced 的「隱藏廣告」：把播放資料裡的廣告欄位拿掉，畫面上的廣告元素隱藏，漏網的影片廣告自動跳過）
   由 App 插在 YouTube 網頁 <head> 最前面，比 YouTube 自己的程式更早執行。 */
(function () {
  'use strict';
  if (window.__wsYT) return;
  window.__wsYT = 1;
  var KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adBreakParams'];
  function prune(o, depth) {
    if (!o || typeof o !== 'object' || (depth || 0) > 6) return o;
    for (var i = 0; i < KEYS.length; i++) if (KEYS[i] in o) { try { delete o[KEYS[i]]; } catch (e) {} }
    if (o.playerResponse) prune(o.playerResponse, (depth || 0) + 1);
    if (o.response && o.response.playerResponse) prune(o.response.playerResponse, (depth || 0) + 1);
    if (Array.isArray(o)) for (var j = 0; j < o.length && j < 20; j++) prune(o[j], (depth || 0) + 1);
    /* 首頁／搜尋結果裡的贊助內容 */
    if (o.contents && o.contents.sectionListRenderer) cleanList(o.contents.sectionListRenderer.contents);
    return o;
  }
  function cleanList(arr) {
    if (!Array.isArray(arr)) return;
    for (var i = arr.length - 1; i >= 0; i--) {
      var it = arr[i], s = it ? JSON.stringify(Object.keys(it)) : '';
      if (/adSlotRenderer|promotedSparklesWebRenderer|promotedVideoRenderer|compactPromotedVideoRenderer|displayAdRenderer|statementBannerRenderer|inFeedAdLayoutRenderer/.test(s)) arr.splice(i, 1);
    }
  }
  var JP = JSON.parse;
  JSON.parse = function (t, r) {
    var o = JP.call(this, t, r);
    try { if (o && typeof o === 'object' && (o.adPlacements || o.playerAds || o.adSlots || o.playerResponse || o.contents)) prune(o); } catch (e) {}
    return o;
  };
  try {
    var RJ = Response.prototype.json;
    Response.prototype.json = function () { return RJ.call(this).then(function (o) { try { prune(o); } catch (e) {} return o; }); };
  } catch (e) {}
  ['ytInitialPlayerResponse', 'ytInitialData'].forEach(function (name) {
    var v = window[name];
    try {
      Object.defineProperty(window, name, {configurable: true, get: function () { return v; }, set: function (x) { v = prune(x); }});
      if (v) prune(v);
    } catch (e) {}
  });

  /* 畫面上的廣告元素 */
  var CSS = [
    'ytd-ad-slot-renderer', 'ytm-promoted-sparkles-web-renderer', 'ytd-promoted-sparkles-web-renderer', 'ytm-companion-ad-renderer', 'ytd-companion-slot-renderer',
    'ad-slot-renderer', 'ytm-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', 'ytd-banner-promo-renderer', 'ytm-promoted-video-renderer', 'ytd-promoted-video-renderer',
    'ytd-display-ad-renderer', 'ytm-display-ad-renderer', 'ytd-statement-banner-renderer', 'ytm-statement-banner-renderer', 'ytd-video-masthead-ad-v3-renderer',
    'ytd-primetime-promo-renderer', 'ytd-player-legacy-desktop-watch-ads-renderer', '#player-ads', '#masthead-ad', '.ytp-ad-module', '.video-ads', '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay', 'ytm-item-section-renderer:has(> lazy-list > ad-slot-renderer)', 'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)', 'ytd-merch-shelf-renderer',
    'ytm-merch-shelf-renderer', 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]', 'tp-yt-paper-dialog:has(ytd-mealbar-promo-renderer)', 'ytm-mealbar-promo-renderer'
  ].join(',') + '{display:none!important}';
  function addCss() {
    if (document.getElementById('__ws_ytcss')) return;
    var st = document.createElement('style'); st.id = '__ws_ytcss'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  if (document.documentElement) addCss(); else document.addEventListener('readystatechange', addCss);
  document.addEventListener('DOMContentLoaded', addCss);

  /* 漏網的影片廣告：靜音、快轉到結尾、按「略過」 */
  var skipped = 0;
  setInterval(function () {
    addCss();
    var p = document.querySelector('.ad-showing, .ad-interrupting');
    if (!p) {
      if (window.__wsYTmuted) { var mv = document.querySelector('video'); if (mv) { mv.muted = false; mv.playbackRate = 1; } window.__wsYTmuted = 0; }
      return;
    }
    var v = p.querySelector('video') || document.querySelector('video');
    if (v && isFinite(v.duration) && v.duration > 0) { if (!v.muted) window.__wsYTmuted = 1; v.muted = true; try { v.currentTime = Math.max(0, v.duration - 0.05); } catch (e) {} v.playbackRate = 16; }
    var b = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytm-skip-ad-button, button[class*="skip-ad"], .ytp-ad-skip-button-container button');
    if (b) b.click();
    skipped++;
  }, 250);
  window.__wsYTskipped = function () { return skipped; };
})();
