/* ============================================================
   YouTube／YouTube Music 收藏：YouTube 分頁切換列的第三個（★）
   ・兩個收藏區：YouTube 影片、YouTube Music 歌曲
   ・母資料夾預設用創作者（YouTube）或歌手（YouTube Music）的名字，自動歸類；可以改名
   ・資料夾裡可以再建子資料夾分類，影片／歌曲、子資料夾都能移到別的收藏夾
   ・所有動作都會震動
   ============================================================ */
var FAV = lsGet('ws.fav', null) || {yt: {folders: [], items: []}, ytm: {folders: [], items: []}};
['yt', 'ytm'].forEach(function(k){ FAV[k] = FAV[k] || {folders: [], items: []}; FAV[k].folders = FAV[k].folders || []; FAV[k].items = FAV[k].items || []; });
FAV.save = function(){ lsSet('ws.fav', {yt: FAV.yt, ytm: FAV.ytm}); };
var FAVV = {kind: lsGet('ws.favKind', 'yt'), cur: ''};
function favBuzz(){ buzz(12); }
function favF(k, id){ return FAV[k].folders.filter(function(f){ return f.id === id; })[0] || null; }
function favKids(k, pid){ return FAV[k].folders.filter(function(f){ return (f.parent || '') === (pid || ''); }).sort(function(a, b){ return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'zh-Hant'); }); }
function favItemsIn(k, fid){ return FAV[k].items.filter(function(x){ return (x.folder || '') === (fid || ''); }).sort(function(a, b){ return (b.t || 0) - (a.t || 0); }); }
function favIsAnc(k, anc, id){ for(var f = favF(k, id); f; f = favF(k, f.parent)) if(f.id === anc) return true; return false; }
function favCount(k, fid){
  var n = favItemsIn(k, fid).length;
  favKids(k, fid).forEach(function(c){ n += favCount(k, c.id); });
  return n;
}
function favPath(k, fid){ var out = []; for(var f = favF(k, fid); f; f = favF(k, f.parent)) out.unshift(f); return out; }
function favNewFolder(k, parent, name, key){
  var f = {id: 'v' + uid(), parent: parent || '', name: name, t: Date.now()};
  if(key) f.key = key;
  FAV[k].folders.push(f); FAV.save();
  return f;
}
/* 母資料夾：同一位創作者／歌手的都放進同一個（改過名字也認得） */
function favAuthorFolder(k, author, key){
  author = String(author || '').trim() || (k === 'ytm' ? '未知歌手' : '未知創作者');
  key = key || author;
  var f = FAV[k].folders.filter(function(x){ return !x.parent && x.key === key; })[0];
  return f || favNewFolder(k, '', author, key);
}
function favHas(k, id){ return FAV[k].items.filter(function(x){ return x.id === id; })[0] || null; }
function favKindName(k){ return k === 'ytm' ? 'YouTube Music' : 'YouTube'; }

/* 加入收藏（YouTube 播放器的 ★、YouTube Music 播放面板的「收藏」） */
function favAdd(k, info){
  if(!info || !info.id) { toast('找不到這部' + (k === 'ytm' ? '歌曲' : '影片') + '的資訊', true); return; }
  favBuzz();
  var ex = favHas(k, info.id);
  if(ex){
    var f0 = favF(k, ex.folder);
    menu('已經收藏過了', [
      ['folder', '移到其他收藏夾', function(){ favMoveItems(k, [ex]); }, false, '目前在「' + (f0 ? favPath(k, f0.id).map(function(x){ return x.name; }).join(' › ') : '收藏') + '」'],
      ['star', '打開收藏', function(){ favOpen(k, ex.folder || ''); }],
      ['trash', '取消收藏', function(){ favBuzz(); FAV[k].items = FAV[k].items.filter(function(x){ return x !== ex; }); FAV.save(); favRender(); toast('已取消收藏'); }]
    ]);
    return;
  }
  var par = favAuthorFolder(k, info.author, info.authorId);
  var it = {id: info.id, title: info.title || '', author: info.author || '', authorId: info.authorId || '', thumb: info.thumb || (k === 'yt' ? 'https://i.ytimg.com/vi/' + info.id + '/hqdefault.jpg' : ''), dur: +info.dur || 0, folder: par.id, t: Date.now()};
  FAV[k].items.push(it); FAV.save(); favRender();
  toast('★ 已收藏到「' + par.name + '」', false, ['改資料夾', function(){ favMoveItems(k, [it]); }]);
}
/* 選資料夾（移動用）：樹狀列出，可以當場新增 */
function favPick(k, title, cb, opts){
  opts = opts || {};
  var box = h('div', {class: 'opts'});
  var s = openSheet({title: title, icon: 'folder', body: box, foot: h('button', {class: 'btn', html: icon('plus', 'sm') + '新增母資料夾', onclick: async function(){
    var n = await promptDlg('新增資料夾', '', '資料夾名稱'); if(n){ favBuzz(); favNewFolder(k, '', n); draw(); }
  }})});
  function row(f, depth){
    var bad = opts.exclude && (f.id === opts.exclude || favIsAnc(k, opts.exclude, f.id));
    box.appendChild(h('div', {class: 'opt' + (opts.cur === f.id ? ' on' : ''), style: {marginLeft: (depth * 18) + 'px', opacity: bad ? .4 : 1}, onclick: function(){ if(bad){ toast('不能移到自己裡面', true); return; } favBuzz(); s.close(); cb(f.id); }},
      h('span', {class: 'oi', text: f.parent ? '📁' : (k === 'ytm' ? '🎤' : '👤'), style: {fontSize: '18px'}}),
      h('div', {class: 'grow'}, h('b', {text: f.name}), h('div', {class: 'sub', text: favCount(k, f.id) + ' 個'})),
      h('button', {class: 'ib', title: '在這裡面新增子資料夾', html: icon('plus', 'sm'), onclick: async function(e){ e.stopPropagation(); var n = await promptDlg('新增子資料夾（在「' + f.name + '」裡）', '', '資料夾名稱'); if(n){ favBuzz(); favNewFolder(k, f.id, n); draw(); } }})));
    favKids(k, f.id).forEach(function(c){ row(c, depth + 1); });
  }
  function draw(){
    box.textContent = '';
    if(opts.allowRoot) box.appendChild(h('div', {class: 'opt' + (opts.cur === '' ? ' on' : ''), onclick: function(){ favBuzz(); s.close(); cb(''); }}, h('span', {class: 'oi', html: icon('home')}), h('div', {class: 'grow'}, h('b', {text: '最上層'}))));
    favKids(k, '').forEach(function(f){ row(f, 0); });
    if(!FAV[k].folders.length) box.appendChild(h('div', {class: 'empty', text: '還沒有資料夾，按下方「新增母資料夾」'}));
    paintIcons(box);
  }
  draw();
}
function favMoveItems(k, items){
  favPick(k, '移到哪個收藏夾？', function(fid){
    items.forEach(function(x){ x.folder = fid; });
    FAV.save(); favRender();
    var f = favF(k, fid); toast('已移到「' + (f ? f.name : '收藏') + '」');
  }, {cur: items.length === 1 ? items[0].folder : null});
}
function favPlay(k, it){
  favBuzz();
  if(k === 'ytm'){
    YTB.fav = false; YTB.modeMusic = true; YTB.modeHold = Date.now(); ytModeUi(); favShow();
    var u = 'https://music.youtube.com/watch?v=' + it.id;
    if(isApp && NAT.has('ytSwitch')){ YTB.started = true; NAT.call('ytSwitch', true, u); NAT.call('ytLoad', u); ytUpdateVisible(); } else ytEnsure(u);
  } else {
    YTB.fav = false; YTB.modeMusic = false; YTB.modeHold = Date.now(); ytModeUi(); favShow();
    var w = 'https://m.youtube.com/watch?v=' + it.id;
    if(isApp && NAT.has('ytSwitch')){ YTB.started = true; NAT.call('ytSwitch', false, w); NAT.call('ytLoad', w); ytUpdateVisible(); } else ytEnsure(w);
  }
}
function favItemMenu(k, it){
  favBuzz();
  menu(it.title || '收藏', [
    ['play', '播放', function(){ favPlay(k, it); }],
    ['folder', '移到其他收藏夾', function(){ favMoveItems(k, [it]); }],
    ['download', k === 'ytm' ? '下載這首' : '下載這部影片', function(){ favBuzz(); openYt(it.id); }],
    ['sparkle', 'AI 摘要', function(){ favBuzz(); aiChoose(it.id, it.title); }],
    ['copy', '複製連結', function(){ favBuzz(); copyText((k === 'ytm' ? 'https://music.youtube.com/watch?v=' : 'https://youtu.be/') + it.id); }],
    ['trash', '取消收藏', function(){ favBuzz(); FAV[k].items = FAV[k].items.filter(function(x){ return x !== it; }); FAV.save(); favRender(); toast('已取消收藏'); }]
  ]);
}
function favFolderMenu(k, f){
  favBuzz();
  menu((f.parent ? '📁 ' : (k === 'ytm' ? '🎤 ' : '👤 ')) + f.name, [
    ['edit', '重新命名', async function(){ var n = await promptDlg('重新命名', f.name, '資料夾名稱'); if(n){ favBuzz(); f.name = n; FAV.save(); favRender(); } }],
    ['plus', '在裡面新增子資料夾', async function(){ var n = await promptDlg('新增子資料夾（在「' + f.name + '」裡）', '', '資料夾名稱'); if(n){ favBuzz(); favNewFolder(k, f.id, n); favRender(); } }],
    ['folder', '移到其他收藏夾', function(){
      favPick(k, '把「' + f.name + '」移到…', function(pid){ f.parent = pid; FAV.save(); favRender(); toast('已移動'); }, {exclude: f.id, cur: f.parent || '', allowRoot: true});
    }],
    ['trash', '刪除資料夾', async function(){
      var n = favCount(k, f.id);
      if(!(await confirmDlg('刪除「' + esc(f.name) + '」？', n ? '裡面的 ' + n + ' 個收藏會移到上一層，不會被刪掉。' : '這個資料夾是空的。', '刪除', true))) return;
      favBuzz();
      FAV[k].items.forEach(function(x){ if(x.folder === f.id) x.folder = f.parent || ''; });
      FAV[k].folders.forEach(function(x){ if(x.parent === f.id) x.parent = f.parent || ''; });
      FAV[k].folders = FAV[k].folders.filter(function(x){ return x !== f; });
      if(FAVV.cur === f.id) FAVV.cur = f.parent || '';
      FAV.save(); favRender();
    }]
  ]);
}

/* ---------- 收藏畫面（蓋在 YouTube 分頁的內容區上） ---------- */
function favEl(){
  var el = $('ytFav');
  if(!el){ el = h('div', {id: 'ytFav', class: 'hide'}); $('ytArea').appendChild(el); }
  return el;
}
function favShow(){
  var on = !!YTB.fav && curView === 'yt';
  favEl().classList.toggle('hide', !on);
  if(on) favRender();
  ytUpdateVisible();
}
function favOpen(k, fid){
  FAVV.kind = k; FAVV.cur = fid || ''; lsSet('ws.favKind', k);
  if(curView !== 'yt') showView('yt');
  YTB.fav = true; ytModeUi(); favShow();
}
function favRender(){
  var el = favEl(); if(el.classList.contains('hide')) return;
  var k = FAVV.kind === 'ytm' ? 'ytm' : 'yt';
  if(FAVV.cur && !favF(k, FAVV.cur)) FAVV.cur = '';
  var keep = el.querySelector('.favList'), sc = keep ? keep.scrollTop : 0;
  el.textContent = '';
  /* YouTube ⇄ YouTube Music 收藏切換 */
  var seg = h('div', {class: 'favSeg'},
    h('button', {class: k === 'yt' ? 'on yt' : '', html: icon('ytplay', 'sm') + 'YouTube 影片 <i>' + FAV.yt.items.length + '</i>', onclick: function(){ favBuzz(); FAVV.kind = 'yt'; FAVV.cur = ''; lsSet('ws.favKind', 'yt'); favRender(); }}),
    h('button', {class: k === 'ytm' ? 'on mu' : '', html: icon('audio', 'sm') + 'YouTube Music <i>' + FAV.ytm.items.length + '</i>', onclick: function(){ favBuzz(); FAVV.kind = 'ytm'; FAVV.cur = ''; lsSet('ws.favKind', 'ytm'); favRender(); }}));
  el.appendChild(seg);
  /* 路徑＋新增資料夾 */
  var path = favPath(k, FAVV.cur);
  var crumb = h('div', {class: 'favCrumb'});
  crumb.appendChild(h('button', {class: 'chip' + (FAVV.cur ? '' : ' on'), html: icon('star', 'sm') + '全部', onclick: function(){ favBuzz(); FAVV.cur = ''; favRender(); }}));
  path.forEach(function(f){ crumb.appendChild(h('span', {class: 'sep', text: '›'})); crumb.appendChild(h('button', {class: 'chip' + (f.id === FAVV.cur ? ' on' : ''), text: f.name, onclick: function(){ favBuzz(); FAVV.cur = f.id; favRender(); }})); });
  crumb.appendChild(h('span', {class: 'grow'}));
  crumb.appendChild(h('button', {class: 'ib', title: FAVV.cur ? '新增子資料夾' : '新增母資料夾', html: icon('plus'), onclick: async function(){
    var n = await promptDlg(FAVV.cur ? '新增子資料夾' : '新增母資料夾', '', '資料夾名稱'); if(n){ favBuzz(); favNewFolder(k, FAVV.cur, n); favRender(); }
  }}));
  el.appendChild(crumb);
  var list = h('div', {class: 'favList'});
  var kids = favKids(k, FAVV.cur), items = favItemsIn(k, FAVV.cur);
  if(!kids.length && !items.length){
    list.appendChild(h('div', {class: 'empty', html: '<div class="big">★</div>' + (FAVV.cur ? '這個資料夾是空的' : '還沒有收藏') + '<br><span class="sub">' +
      (k === 'ytm' ? '在 YouTube Music 播放面板按「收藏」，會自動放進以歌手命名的資料夾' : '在 YouTube 播放器按全螢幕左邊的 ★，會自動放進以創作者命名的資料夾') + '</span>'}));
  }
  kids.forEach(function(f){
    var n = favCount(k, f.id), sub = favKids(k, f.id).length;
    var cov = FAV[k].items.filter(function(x){ return x.folder === f.id || favIsAnc(k, f.id, x.folder); }).sort(function(a, b){ return (b.t || 0) - (a.t || 0); })[0];
    list.appendChild(h('div', {class: 'favRow fold', onclick: function(){ favBuzz(); FAVV.cur = f.id; favRender(); list.scrollTop = 0; }},
      h('div', {class: 'th', style: cov && cov.thumb ? {backgroundImage: 'url("' + cov.thumb + '")'} : null}, h('span', {class: 'fi', text: f.parent ? '📁' : (k === 'ytm' ? '🎤' : '👤')})),
      h('div', {class: 'grow'}, h('b', {class: 'ell', text: f.name}), h('div', {class: 'sub', text: n + ' 個收藏' + (sub ? '・' + sub + ' 個子資料夾' : '')})),
      h('button', {class: 'ib', title: '更多', html: icon('more'), onclick: function(e){ e.stopPropagation(); favFolderMenu(k, f); }})));
  });
  items.forEach(function(it){
    list.appendChild(h('div', {class: 'favRow', onclick: function(){ favPlay(k, it); }},
      h('div', {class: 'th' + (k === 'ytm' ? ' sq' : ''), style: it.thumb ? {backgroundImage: 'url("' + it.thumb + '")'} : null}, it.dur ? h('i', {class: 'du', text: fmtDur(it.dur)}) : null),
      h('div', {class: 'grow'}, h('b', {class: 'ell2', text: it.title || it.id}), h('div', {class: 'sub ell', text: it.author || ''})),
      h('button', {class: 'ib', title: '更多', html: icon('more'), onclick: function(e){ e.stopPropagation(); favItemMenu(k, it); }})));
  });
  el.appendChild(list);
  list.scrollTop = sc;
  paintIcons(el);
}
function fmtDur(s){ s = Math.round(+s || 0); var m = Math.floor(s / 60), x = s % 60, hh = Math.floor(m / 60); if(hh) m = m % 60; return (hh ? hh + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
/* YouTube 播放器的 ★ 收藏鈕 */
on('ytFav', function(d){ if(d && d.id) favAdd('yt', d); });
on('view', function(e){ if(e.v === 'yt' || e.prev === 'yt') favShow(); });
