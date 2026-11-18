/* ============================================================
   新聞：Google 新聞（台灣繁中）依類別、依日期看新聞，可收藏、有自己的閱讀記錄
   - 文章用「新聞分頁」打開：獨立的設定檔（Cookie、網站資料跟一般瀏覽分開），不寫進一般瀏覽記錄
   - 收藏與閱讀記錄存在手機裡（清除 Cookie、網站資料不會刪到），閱讀記錄可以單獨清除、可以選擇不記錄
   ============================================================ */
var NEWS_CATS = [
  {k: 'top', n: '焦點', topic: '', q: '頭條 OR 焦點', c: '#a85a32'},
  {k: 'tw', n: '台灣', topic: 'NATION', q: '台灣', c: '#5d7e45'},
  {k: 'world', n: '國際', topic: 'WORLD', q: '國際', c: '#3c6e91'},
  {k: 'biz', n: '財經', topic: 'BUSINESS', q: '財經 OR 股市', c: '#b4862a'},
  {k: 'tech', n: '科技', topic: 'TECHNOLOGY', q: '科技', c: '#5a5fa8'},
  {k: 'ent', n: '娛樂', topic: 'ENTERTAINMENT', q: '娛樂', c: '#b0487a'},
  {k: 'sport', n: '體育', topic: 'SPORTS', q: '體育 OR 運動', c: '#2f8a6e'},
  {k: 'sci', n: '科學', topic: 'SCIENCE', q: '科學', c: '#4f7f9c'},
  {k: 'health', n: '健康', topic: 'HEALTH', q: '健康 OR 醫療', c: '#c0573f'}
];
var NEWS = {
  cat: 'top', day: 0, tab: 'news',                /* tab：news 新聞／fav 收藏／hist 閱讀記錄 */
  favCat: '', cache: {}, loading: {},
  fav: lsGet('ws.newsFav', []), hist: lsGet('ws.newsHist', []),
  el: null
};
if(!Array.isArray(NEWS.fav)) NEWS.fav = [];
if(!Array.isArray(NEWS.hist)) NEWS.hist = [];
var NEWS_GL = 'hl=zh-TW&gl=TW&ceid=TW:zh-Hant';
function newsCat(k){ return NEWS_CATS.filter(function(c){ return c.k === k; })[0] || NEWS_CATS[0]; }
function newsHistOn(){ return !lsGet('ws.newsHistOff', false); }
function newsSaveFav(){ lsSet('ws.newsFav', NEWS.fav.slice(0, 2000)); }
function newsSaveHist(){ lsSet('ws.newsHist', NEWS.hist.slice(0, 3000)); }
function newsYmd(d){ var p = function(n){ return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function newsDayDate(off){ var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - off); return d; }
function newsAgo(t){
  var s = (Date.now() - t) / 1000;
  if(s < 60) return '剛剛';
  if(s < 3600) return Math.floor(s / 60) + ' 分鐘前';
  if(s < 86400) return Math.floor(s / 3600) + ' 小時前';
  var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
function newsDateHead(t){
  var d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  var wk = '日一二三四五六'.charAt(d.getDay()), md = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日（' + wk + '）';
  if(d.toDateString() === now.toDateString()) return '今天・' + md;
  if(d.toDateString() === y.toDateString()) return '昨天・' + md;
  return (d.getFullYear() !== now.getFullYear() ? d.getFullYear() + ' 年 ' : '') + md;
}

/* ---------- 抓新聞（Google 新聞 RSS） ---------- */
function newsUrl(cat, off){
  var c = newsCat(cat);
  if(!off) return c.topic ? 'https://news.google.com/rss/headlines/section/topic/' + c.topic + '?' + NEWS_GL : 'https://news.google.com/rss?' + NEWS_GL;
  /* 過去的日期：用搜尋的日期條件（after／before）找那一天的新聞 */
  var a = newsDayDate(off), b = newsDayDate(off - 1);
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(c.q + ' after:' + newsYmd(a) + ' before:' + newsYmd(b)) + '&' + NEWS_GL;
}
function newsParse(xml){
  var doc = new DOMParser().parseFromString(xml, 'text/xml'), out = [];
  [].forEach.call(doc.querySelectorAll('item'), function(it){
    var g = function(s){ var e = it.querySelector(s); return e ? e.textContent.trim() : ''; };
    var src = it.querySelector('source'), srcName = src ? src.textContent.trim() : '', srcUrl = src ? (src.getAttribute('url') || '') : '';
    var title = g('title');
    if(srcName && title.slice(-srcName.length - 3) === ' - ' + srcName) title = title.slice(0, -srcName.length - 3);
    var t = Date.parse(g('pubDate')) || 0;
    var link = g('link');
    if(title && link) out.push({title: title, link: link, src: srcName, srcUrl: srcUrl, t: t});
  });
  return out;
}
async function newsLoad(cat, off, force){
  var key = cat + '|' + off, c = NEWS.cache[key];
  if(c && !force && Date.now() - c.at < (off ? 3600e3 : 10 * 60e3)) return c.items;
  if(NEWS.loading[key]) return NEWS.loading[key];
  NEWS.loading[key] = (async function(){
    var r = isApp ? await natHttp('GET', newsUrl(cat, off), {'Accept-Language': 'zh-TW,zh;q=0.9'}, null, false) : await fetch(newsUrl(cat, off)).then(function(x){ return x.text().then(function(b){ return {status: x.status, body: b}; }); });
    if(r.status >= 400) throw new Error('Google 新聞回應 ' + r.status);
    var items = newsParse(r.body || '');
    if(off){
      var a = newsDayDate(off).getTime(), b = newsDayDate(off - 1).getTime();
      items = items.filter(function(x){ return !x.t || (x.t >= a && x.t < b); });
    }
    var seen = {};
    items = items.filter(function(x){ var k = x.title; if(seen[k]) return false; seen[k] = 1; return true; }).sort(function(p, q){ return q.t - p.t; });
    NEWS.cache[key] = {at: Date.now(), items: items};
    return items;
  })();
  try{ return await NEWS.loading[key]; } finally { delete NEWS.loading[key]; }
}

/* ---------- 收藏、閱讀記錄 ---------- */
function newsFavOf(n){ return NEWS.fav.filter(function(f){ return f.link === n.link || (f.title === n.title && f.src === n.src); })[0]; }
function newsToggleFav(n, cat){
  var f = newsFavOf(n);
  if(f){ NEWS.fav = NEWS.fav.filter(function(x){ return x !== f; }); newsSaveFav(); buzz(10); toast('已取消收藏'); return false; }
  NEWS.fav.unshift({title: n.title, link: n.link, src: n.src, srcUrl: n.srcUrl, t: n.t || Date.now(), cat: cat || n.cat || NEWS.cat, saved: Date.now()});
  newsSaveFav(); buzz(14); toast('已收藏到「' + newsCat(cat || n.cat || NEWS.cat).n + '」');
  return true;
}
function newsOpen(n, cat){
  buzz(10);
  if(newsHistOn()){
    NEWS.hist = NEWS.hist.filter(function(x){ return x.link !== n.link; });
    NEWS.hist.unshift({title: n.title, link: n.link, src: n.src, srcUrl: n.srcUrl, t: n.t, cat: cat || n.cat || NEWS.cat, read: Date.now()});
    newsSaveHist();
  }
  newsHide();
  if(!isApp){ window.open(n.link, '_blank'); return; }
  /* 新聞分頁：獨立的新聞設定檔；不寫進一般瀏覽記錄 */
  NAT.call(NAT.has('tabNewNews') ? 'tabNewNews' : 'tabNew', n.link);
  BR.url = ''; BR.loaded = true; BR.back = false; BR.fwd = false; BR.home = false;
  $('startPage').classList.add('hide'); BR.progress = 5;
  setTimeout(tabCount, 80); renderBr();
}

/* ---------- 介面 ---------- */
function newsFavicon(n){
  var host = hostOf(n.srcUrl || '') || '';
  var el = h('span', {class: 'nwFav'});
  if(host){ var im = h('img', {src: 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64', alt: ''}); im.onerror = function(){ im.remove(); el.textContent = (n.src || '?').slice(0, 1); }; el.appendChild(im); }
  else el.textContent = (n.src || '?').slice(0, 1);
  return el;
}
function newsCard(n, cat, opt){
  opt = opt || {};
  var c = newsCat(cat || n.cat || NEWS.cat), on = !!newsFavOf(n);
  var star = h('button', {class: 'nwStar' + (on ? ' on' : ''), title: '收藏', html: icon(on ? 'starOn' : 'star'), onclick: function(e){
    e.stopPropagation();
    var now = newsToggleFav(n, cat);
    star.classList.toggle('on', now); star.innerHTML = icon(now ? 'starOn' : 'star'); paintIcons(star);
    if(NEWS.tab === 'fav') setTimeout(newsRender, 150);
  }});
  var meta = h('div', {class: 'nwMeta'}, newsFavicon(n), h('span', {class: 'nwSrc', text: n.src || ''}), h('span', {class: 'nwDot', text: '・'}), h('span', {text: n.t ? newsAgo(n.t) : ''}),
    opt.showCat ? h('span', {class: 'nwTag', style: {color: c.c, borderColor: c.c}, text: c.n}) : null);
  return ncv(h('article', {class: 'nwCard' + (opt.hero ? ' hero' : ''), onclick: function(){ newsOpen(n, cat); }},
    opt.hero ? h('div', {class: 'nwHeroTag', text: c.n + (NEWS.day ? '' : '・最新')}) : null,
    h('div', {class: 'nwBody'}, h('h3', {class: 'nwTitle', text: n.title}), meta),
    star), opt.hero ? c.c : null);
}
/* CSS 變數要用 setProperty 設 */
function ncv(el, color){ if(color) el.style.setProperty('--nc', color); return el; }
function newsEl(){
  if(NEWS.el) return NEWS.el;
  var el = h('div', {id: 'newsPanel', class: 'hide'});
  el.innerHTML =
    '<div class="nwHead">' +
      '<button class="ib" id="nwBack" title="返回" data-ic="back"></button>' +
      '<div class="nwTtl"><b>新聞</b><span id="nwDate"></span></div>' +
      '<button class="ib" id="nwReload" title="重新整理" data-ic="reload"></button>' +
      '<button class="ib" id="nwMore" title="新聞設定" data-ic="more"></button>' +
    '</div>' +
    '<div class="nwTabs" id="nwTabs"></div>' +
    '<div class="nwDays" id="nwDays"></div>' +
    '<div class="nwCats" id="nwCats"></div>' +
    '<div class="nwList" id="nwList"></div>';
  ($('view-browse') || document.body).appendChild(el);
  NEWS.el = el;
  $('nwBack').onclick = function(){ buzz(10); newsHide(); };
  $('nwReload').onclick = function(){ buzz(10); if(NEWS.tab === 'news') newsRender(true); else newsRender(); };
  $('nwMore').onclick = function(){ buzz(10); newsSettings(); };
  paintIcons(el);
  return el;
}
function newsShow(){
  /* 網頁開著時（原生網頁畫面蓋在上面）先回首頁，新聞畫面才看得到；分頁不會被關掉 */
  if(curView !== 'browse') showView('browse');
  if(!BR.home) goHome();
  newsEl().classList.remove('hide');
  document.body.classList.add('newsOpen');
  newsRender();
}
function newsHide(){ if(NEWS.el) NEWS.el.classList.add('hide'); document.body.classList.remove('newsOpen'); }
function newsTabs(){
  var box = $('nwTabs'); box.textContent = '';
  [['news', 'news', '新聞'], ['fav', 'starOn', '收藏'], ['hist', 'history', '記錄']].forEach(function(t){
    var cnt = t[0] === 'fav' ? NEWS.fav.length : t[0] === 'hist' ? NEWS.hist.length : 0;
    box.appendChild(h('button', {class: 'nwTab' + (NEWS.tab === t[0] ? ' on' : ''), html: icon(t[1], 'sm') + t[2] + (cnt ? '<i>' + cnt + '</i>' : ''), onclick: function(){ buzz(10); NEWS.tab = t[0]; newsRender(); }}));
  });
}
function newsDays(){
  var box = $('nwDays'); box.textContent = '';
  box.classList.toggle('hide', NEWS.tab !== 'news');
  for(var i = 0; i < 7; i++) (function(off){
    var d = newsDayDate(off), wk = '日一二三四五六'.charAt(d.getDay());
    box.appendChild(h('button', {class: 'nwDay' + (NEWS.day === off ? ' on' : ''), onclick: function(){ buzz(10); NEWS.day = off; newsRender(); }},
      h('small', {text: off === 0 ? '今天' : off === 1 ? '昨天' : '週' + wk}), h('b', {text: (d.getMonth() + 1) + '/' + d.getDate()})));
  })(i);
}
function newsCats(list, cur, onPick, counts){
  var box = $('nwCats'); box.textContent = '';
  list.forEach(function(c){
    box.appendChild(ncv(h('button', {class: 'nwCat' + (cur === c.k ? ' on' : ''), onclick: function(){ buzz(10); onPick(c.k); }},
      c.n + (counts && counts[c.k] != null ? ' ' : ''), counts && counts[c.k] != null ? h('i', {text: counts[c.k]}) : null), c.c || 'var(--accent)'));
  });
  var on = box.querySelector('.on'); if(on) setTimeout(function(){ try{ on.scrollIntoView({inline: 'center', block: 'nearest'}); }catch(e){} }, 0);
}
async function newsRender(force){
  newsEl();
  var d = newsDayDate(NEWS.day);
  $('nwDate').textContent = NEWS.tab === 'news' ? (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日・' + newsCat(NEWS.cat).n : NEWS.tab === 'fav' ? '收藏的新聞' : '閱讀記錄';
  newsTabs(); newsDays();
  var list = $('nwList'); list.textContent = '';
  list.scrollTop = 0;
  if(NEWS.tab === 'fav') return newsRenderFav(list);
  if(NEWS.tab === 'hist') return newsRenderHist(list);
  newsCats(NEWS_CATS, NEWS.cat, function(k){ NEWS.cat = k; newsRender(); });
  var cat = NEWS.cat, day = NEWS.day;
  for(var i = 0; i < 5; i++) list.appendChild(h('div', {class: 'nwCard skel' + (i ? '' : ' hero')}, h('div', {class: 'nwBody'}, h('div', {class: 'sk sk1'}), h('div', {class: 'sk sk2'}), h('div', {class: 'sk sk3'}))));
  var items;
  try{ items = await newsLoad(cat, day, force); }
  catch(e){
    if(cat !== NEWS.cat || day !== NEWS.day || NEWS.tab !== 'news') return;
    list.textContent = '';
    list.appendChild(h('div', {class: 'empty', html: '<div class="big">📰</div>讀不到新聞<br><span class="sub">' + esc(String(e.message || e)) + '・請確認網路後按右上角重新整理</span>'}));
    return;
  }
  if(cat !== NEWS.cat || day !== NEWS.day || NEWS.tab !== 'news') return;
  list.textContent = '';
  if(!items.length){ list.appendChild(h('div', {class: 'empty', html: '<div class="big">📰</div>這一天沒有找到「' + esc(newsCat(cat).n) + '」的新聞<br><span class="sub">換一天或換個分類看看</span>'})); return; }
  items.slice(0, 60).forEach(function(n, i){ list.appendChild(newsCard(n, cat, {hero: i === 0})); });
  if(day) list.appendChild(h('div', {class: 'sub nwNote', text: '過去日期的新聞是用 Google 新聞的日期搜尋找出來的，數量會比當天少一些。'}));
  paintIcons(list);
}
/* 收藏：先依類別，再依日期分組（每天最上面列出日期） */
function newsRenderFav(list){
  var counts = {all: NEWS.fav.length};
  NEWS_CATS.forEach(function(c){ counts[c.k] = NEWS.fav.filter(function(f){ return f.cat === c.k; }).length; });
  var cats = [{k: '', n: '全部', c: 'var(--accent)'}].concat(NEWS_CATS.filter(function(c){ return counts[c.k]; }));
  if(NEWS.favCat && !counts[NEWS.favCat]) NEWS.favCat = '';
  newsCats(cats, NEWS.favCat, function(k){ NEWS.favCat = k; newsRender(); }, Object.assign({'': counts.all}, counts));
  if(!NEWS.fav.length){ list.appendChild(h('div', {class: 'empty', html: '<div class="big">☆</div>還沒有收藏的新聞<br><span class="sub">在新聞右邊按 ☆ 就會收進來，自動依類別和日期分好</span>'})); return; }
  var groups = NEWS.favCat ? [newsCat(NEWS.favCat)] : NEWS_CATS.filter(function(c){ return counts[c.k]; });
  groups.forEach(function(c){
    var L = NEWS.fav.filter(function(f){ return f.cat === c.k; }).sort(function(a, b){ return (b.t || b.saved) - (a.t || a.saved); });
    if(!L.length) return;
    if(!NEWS.favCat) list.appendChild(ncv(h('div', {class: 'nwGroup'}, h('b', {text: c.n}), h('span', {text: L.length + ' 則'})), c.c));
    var last = '';
    L.forEach(function(f){
      var day = new Date(f.t || f.saved).toDateString();
      if(day !== last){ last = day; list.appendChild(h('div', {class: 'nwDayHead', text: newsDateHead(f.t || f.saved)})); }
      list.appendChild(newsCard(f, f.cat));
    });
  });
  paintIcons(list);
}
/* 閱讀記錄：依閱讀日期分組，可以單獨清除、可以選擇不記錄 */
function newsRenderHist(list){
  $('nwCats').textContent = '';
  var bar = h('div', {class: 'nwHistBar'},
    h('label', {class: 'lab'}, h('span', null, '保留閱讀記錄', h('span', {class: 'sub', text: newsHistOn() ? '打開過的新聞會記在這裡' : '目前不記錄'})),
      h('span', {class: 'sw'}, h('input', {type: 'checkbox', checked: newsHistOn(), onchange: function(){ buzz(10); lsSet('ws.newsHistOff', !this.checked); toast(this.checked ? '開始記錄新聞閱讀記錄' : '之後不再記錄新聞閱讀記錄'); newsRender(); }}), h('span'))),
    NEWS.hist.length ? h('button', {class: 'btn dang sm', html: icon('trash', 'sm') + '清除新聞閱讀記錄', onclick: async function(){
      if(!(await confirmDlg('清除新聞閱讀記錄？', '全部 ' + NEWS.hist.length + ' 筆都會刪除（收藏的新聞不受影響），不能復原。', '清除', true))) return;
      buzz(16); NEWS.hist = []; newsSaveHist(); toast('已清除新聞閱讀記錄'); newsRender();
    }}) : null);
  list.appendChild(bar);
  if(!NEWS.hist.length){ list.appendChild(h('div', {class: 'empty', html: '<div class="big">🕘</div>還沒有閱讀記錄'})); paintIcons(list); return; }
  var last = '';
  NEWS.hist.forEach(function(r){
    var day = new Date(r.read).toDateString();
    if(day !== last){ last = day; list.appendChild(h('div', {class: 'nwDayHead', text: newsDateHead(r.read)})); }
    list.appendChild(newsCard(r, r.cat, {showCat: true}));
  });
  paintIcons(list);
}
function newsSettings(){
  var sep = isApp && NAT.has('newsSeparate') && NAT.call('newsSeparate');
  var body = h('div', null,
    h('div', {class: 'sub', style: {margin: '0 2px 10px', lineHeight: '1.6'}, text: '新聞文章會用獨立的「新聞分頁」打開' + (sep ? '：Cookie、網站資料跟一般瀏覽分開，' : '，') + '不會寫進一般瀏覽記錄；收藏和新聞閱讀記錄存在手機裡，清除 Cookie 或網站資料都不會刪到。按首頁的「關閉分頁」時新聞分頁也會一起關掉。'}),
    h('label', {class: 'lab'}, h('span', null, '保留新聞閱讀記錄'), h('span', {class: 'sw'}, h('input', {type: 'checkbox', checked: newsHistOn(), onchange: function(){ buzz(10); lsSet('ws.newsHistOff', !this.checked); }}), h('span'))),
    h('div', {class: 'btn-row', style: {marginTop: '12px'}},
      h('button', {class: 'btn', html: icon('history', 'sm') + '閱讀記錄', onclick: function(){ s.close(); NEWS.tab = 'hist'; newsRender(); }}),
      h('button', {class: 'btn dang', html: icon('trash', 'sm') + '清除閱讀記錄', onclick: async function(){
        if(!NEWS.hist.length){ toast('沒有新聞閱讀記錄'); return; }
        if(!(await confirmDlg('清除新聞閱讀記錄？', '全部 ' + NEWS.hist.length + ' 筆都會刪除（收藏的新聞不受影響）。', '清除', true))) return;
        NEWS.hist = []; newsSaveHist(); toast('已清除新聞閱讀記錄'); s.close(); newsRender();
      }})));
  var s = openSheet({title: '新聞設定', icon: 'news', body: body, buzz: true});
  paintIcons(body);
}
/* 新聞分頁的瀏覽不寫進一般瀏覽記錄（Hist 的 on('br') 會看這個） */
NEWS.isNewsTab = false;
on('br', function(d){ if(d && d.tab) NEWS.isNewsTab = !!d.news; });
/* 返回鍵：新聞畫面開著時先關掉新聞畫面 */
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && NEWS.el && !NEWS.el.classList.contains('hide')){ newsHide(); } });
