/* ============================================================
   瀏覽記錄：瀏覽分頁與 YouTube 分頁造訪過的網頁，依時間排序、可搜尋、可依時間範圍清除
   ============================================================ */
var Hist = {
  items: lsGet('ws.hist', []),
  save: function(){ lsSet('ws.hist', this.items.slice(0, 4000)); },
  add: function(url, title, src){
    if(!/^https?:/.test(url)) return;
    var now = Date.now(), top = this.items[0];
    /* 同一個網址 30 秒內重複（例如重新整理）只更新時間 */
    if(top && top.url === url && now - top.t < 30000){ top.t = now; if(title) top.title = title; this.save(); return; }
    this.items.unshift({url: url, title: title || '', t: now, src: src || 'br'});
    if(this.items.length > 4000) this.items.length = 4000;
    this.save();
  },
  title: function(url, title){
    for(var i = 0; i < Math.min(5, this.items.length); i++){ var it = this.items[i]; if(it.url === url){ if(it.title !== title){ it.title = title; this.save(); } return; } }
  },
  clear: function(from, to){
    var n0 = this.items.length;
    this.items = this.items.filter(function(it){ return it.t < from || it.t > to; });
    this.save();
    return n0 - this.items.length;
  }
};
on('br', function(d){
  if(!d || !d.url) return;
  if(d.url !== Hist._lastBr){ Hist._lastBr = d.url; Hist.add(d.url, d.title, 'br'); }
  else if(d.title) Hist.title(d.url, d.title);
});

function dayLabel(t){
  var d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  var wk = '日一二三四五六'.charAt(d.getDay());
  if(d.toDateString() === now.toDateString()) return '今天';
  if(d.toDateString() === y.toDateString()) return '昨天';
  return (d.getFullYear() !== now.getFullYear() ? d.getFullYear() + ' 年 ' : '') + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日（' + wk + '）';
}
function openHistory(src){
  var q = '', filt = src || 'all', shown = 150;
  var list = h('div');
  var search = h('input', {type: 'search', placeholder: '搜尋標題或網址…', style: {width: '100%', marginBottom: '10px'}});
  search.oninput = function(){ q = search.value.trim().toLowerCase(); shown = 150; draw(); };
  var seg = h('div', {class: 'seg', style: {marginBottom: '10px'}});
  [['all', '全部'], ['br', '瀏覽'], ['yt', 'YouTube']].forEach(function(x){
    seg.appendChild(h('button', {class: filt === x[0] ? 'on' : '', text: x[1], onclick: function(){ filt = x[0]; qsa('button', seg).forEach(function(b){ b.classList.remove('on'); }); this.classList.add('on'); shown = 150; draw(); }}));
  });
  var body = h('div', null, search, seg, list);
  var clr = h('button', {class: 'btn sm dang', html: icon('trash', 'sm') + '清除', onclick: function(){ clearHistoryDlg(draw); }});
  var s = openSheet({title: '瀏覽記錄', icon: 'history', body: body, tall: true, headExtra: clr});
  function draw(){
    list.textContent = '';
    var items = Hist.items.filter(function(it){ return (filt === 'all' || (it.src || 'br') === filt) && (!q || ((it.title || '') + ' ' + it.url).toLowerCase().indexOf(q) >= 0); });
    if(!items.length){ list.appendChild(h('div', {class: 'empty', html: '<div class="big">🕘</div>' + (Hist.items.length ? '沒有符合的記錄' : '還沒有瀏覽記錄')})); return; }
    var lastDay = '';
    items.slice(0, shown).forEach(function(it){
      var dl = dayLabel(it.t);
      if(dl !== lastDay){ lastDay = dl; list.appendChild(h('div', {class: 'histDay', text: dl})); }
      var yid = it.src === 'yt' || YT.idOf(it.url) ? YT.idOf(it.url) : null;
      var p = function(n){ return (n < 10 ? '0' : '') + n; }, d = new Date(it.t);
      list.appendChild(h('div', {class: 'bmItem', onclick: function(){ s.close(); if(it.src === 'yt') ytOpen(it.url); else navigate(it.url); }},
        yid ? h('div', {class: 'fav sm', style: {backgroundImage: 'url("' + pxUrl('https://i.ytimg.com/vi/' + yid + '/default.jpg') + '")', backgroundSize: 'cover', backgroundPosition: 'center'}}) : favEl({url: it.url, title: it.title}, true),
        h('div', {class: 't'}, h('b', {text: it.title || it.url}), h('div', {class: 'sub', text: p(d.getHours()) + ':' + p(d.getMinutes()) + '・' + (it.src === 'yt' ? 'YouTube 分頁・' : '') + hostOf(it.url)})),
        h('button', {class: 'ib', html: icon('more'), onclick: function(e){
          e.stopPropagation();
          menu(it.title || it.url, [
            ['open', '開啟', function(){ s.close(); if(it.src === 'yt') ytOpen(it.url); else navigate(it.url); }],
            ['star', '加入收藏', function(){ BM.items.unshift({id: 'b' + uid(), url: it.url, title: it.title || hostOf(it.url), folder: lsGet('ws.lastFolder', BM.folders[0].id), time: Date.now()}); BM.save(); toast('已加入收藏'); }],
            ['copy', '複製網址', function(){ copyText(it.url); }],
            ['trash', '刪除這筆記錄', function(){ Hist.items = Hist.items.filter(function(x){ return x !== it; }); Hist.save(); draw(); }, true]
          ]);
        }})));
    });
    if(items.length > shown) list.appendChild(h('button', {class: 'btn block', text: '顯示更多（還有 ' + (items.length - shown) + ' 筆）', onclick: function(){ shown += 300; draw(); }}));
    paintIcons(list);
  }
  draw();
}
/* 清除瀏覽記錄：選時間範圍（像 Chrome） */
function clearHistoryDlg(after){
  var now = Date.now(), H = 3600e3, D = 24 * H;
  var p = function(n){ return (n < 10 ? '0' : '') + n; };
  var ymd = function(t){ var d = new Date(t); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  var sel = 'h1';
  var ranges = [['h1', '過去 1 小時', now - H, now], ['d1', '過去 24 小時', now - D, now], ['d7', '過去 7 天', now - 7 * D, now], ['d28', '過去 4 週', now - 28 * D, now], ['all', '所有時間', 0, now + D], ['custom', '自訂日期範圍…', 0, 0]];
  var from = h('input', {type: 'date', value: ymd(now - 7 * D)}), to = h('input', {type: 'date', value: ymd(now)});
  var custom = h('div', {class: 'two hide', style: {marginTop: '8px'}}, h('div', {class: 'field'}, h('div', {class: 'lbl'}, '從'), from), h('div', {class: 'field'}, h('div', {class: 'lbl'}, '到'), to));
  var cnt = h('div', {class: 'sub', style: {margin: '8px 2px'}});
  var opts = h('div', {class: 'opts'});
  function range(){
    if(sel === 'custom'){ var a = new Date(from.value + 'T00:00:00').getTime(), b = new Date(to.value + 'T23:59:59.999').getTime(); return [isNaN(a) ? 0 : a, isNaN(b) ? now : b]; }
    var r = ranges.filter(function(x){ return x[0] === sel; })[0]; return [r[2], r[3]];
  }
  function count(){ var r = range(); var n = Hist.items.filter(function(it){ return it.t >= r[0] && it.t <= r[1]; }).length; cnt.textContent = '這個範圍內有 ' + n + ' 筆記錄'; }
  ranges.forEach(function(r){
    opts.appendChild(h('label', {class: 'opt radio'}, h('input', {type: 'radio', name: 'hclr', checked: r[0] === sel, onchange: function(){ sel = r[0]; custom.classList.toggle('hide', sel !== 'custom'); count(); }}), h('div', {class: 'grow'}, h('b', {text: r[1]}))));
  });
  from.onchange = count; to.onchange = count;
  var cookies = h('input', {type: 'checkbox'});
  var body = h('div', null, opts, custom, cnt, isApp ? h('label', {class: 'opt'}, cookies, h('div', {class: 'grow'}, h('b', {text: '同時清除 Cookie 與網站資料'}), h('div', {class: 'sub', text: '會登出所有網站（包含 YouTube）'}))) : null);
  var go = h('button', {class: 'btn dang', html: icon('trash', 'sm') + '清除記錄'});
  var s = openSheet({title: '清除瀏覽記錄', icon: 'trash', body: body, foot: go});
  go.onclick = function(){
    var r = range(), n = Hist.clear(r[0], r[1]);
    if(isApp){ NAT.call('clearData', 'history' + (cookies.checked ? ',cookies' : '')); }
    s.close(); toast('已清除 ' + n + ' 筆記錄'); if(after) after();
  };
  count();
}
