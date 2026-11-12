/* ============================================================
   設定頁：所有設定集中在這裡
   ============================================================ */
function card(ic, title, kids, id){
  return h('div', {class: 'card glass', id: id || null}, h('h3', {html: icon(ic) + esc(title)}), kids);
}
function renderSettings(){
  var P = $('setPage'); P.textContent = '';
  P.appendChild(h('h2', {class: 'pt', html: '<span class="logo">' + icon('gear') + '</span><span>設定<small>琥珀瀏覽器 v' + APP_VERSION + (isApp ? '・APK v' + (Upd.apk() || '?') : '・網頁版') + '</small></span>'}));

  /* 軟體使用說明書 */
  P.appendChild(card('books', '軟體使用說明書', [
    h('div', {class: 'setRow', style: {borderTop: 0}, onclick: function(){ openGuide(false); }}, h('span', {class: 'ic', html: icon('info')}),
      h('div', {class: 'grow'}, h('b', {text: '打開說明書'}), h('div', {class: 'sub', text: '所有功能怎麼用、要允許哪些權限、AI 金鑰怎麼申請和設定、其他 App 下載自動搬回'})), h('span', {class: 'chev', text: '›'}))
,
    h('div', {class: 'setRow', onclick: function(){ openLang(); }}, h('span', {class: 'ic', html: icon('globe')}),
      h('div', {class: 'grow'}, h('b', {'data-i18n-skip': '', text: '語言 Language'}), h('div', {class: 'sub', 'data-i18n-skip': '', text: I18N.label() + '・介面與說明書的語言'})), h('span', {class: 'chev', text: '›'}))
  ]));

  /* 外觀 */
  P.appendChild(card('palette', '外觀', [
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '主題'), segRow([['auto', '跟隨系統'], ['light', '淺色'], ['dark', '深色']], 'theme')),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '配色'), paletteRow()),
    rangeRow('App 介面大小', 'uiScale', 85, 125, 5, function(v){ return v + '%'; }),
    swRow('動畫效果', '關閉後切換畫面更直接（較舊的手機可關閉）', 'motion'),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, h('span', null, '震動強度'), h('span', {class: 'sub', text: '切換分頁、按鈕、拖動時'})),
      segRow([[0, '關閉'], [1, '輕'], [2, '中'], [3, '強']], 'haptic', function(){ setTimeout(function(){ buzz(20); }, 30); }))
  ]));

  /* 瀏覽器 */
  P.appendChild(card('globe', '瀏覽器', [
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '預設版面'), segRow(MODES.map(function(m){ return [m[0], m[1], m[2]]; }), 'mode', renderBr)),
    rangeRow('網頁文字大小', 'textZoom', 70, 200, 5, function(v){ return v + '%'; }),
    selRow('搜尋引擎', Object.keys(SEARCH).map(function(k){ return [k, SEARCH[k][0]]; }), 'search'),
    selRow('彈出視窗', [['smart', '聰明模式：允許你點擊開啟的（如登入視窗），阻擋自動彈出的'], ['all', '全部允許'], ['block', '全部阻擋']], 'popups'),
    isApp ? h('div', {class: 'btn-row'},
      h('button', {class: 'btn sm', text: '清除瀏覽快取', onclick: function(){ NAT.call('clearData', 'cache'); }}),
      h('button', {class: 'btn sm', text: '清除瀏覽紀錄', onclick: function(){ NAT.call('clearData', 'history'); lsSet('ws.recent', []); }}),
      h('button', {class: 'btn sm dang', text: '登出所有網站（清除 Cookie）', onclick: async function(){ if(await confirmDlg('清除所有 Cookie？', '所有網站都會被登出（已儲存的帳號密碼不受影響）。', '清除', true)) NAT.call('clearData', 'cookies'); }})) : null
  ]));

  /* 廣告阻擋 */
  var st = isApp ? (NAT.json('brState') || {}) : {};
  var hostsTa = h('textarea', {placeholder: '每行一個網域，例如：\nads.example.com\ntracker.example.net'}); hostsTa.value = CFG.adHosts || '';
  var cssTa = h('textarea', {placeholder: '每行一個 CSS 選擇器，例如：\n.sponsor-box\n#floating-banner'}); cssTa.value = CFG.adCss || '';
  var allowTa = h('textarea', {placeholder: '每行一個網域，這些網站不阻擋廣告', style: {minHeight: '60px'}}); allowTa.value = CFG.adAllow || '';
  P.appendChild(card('shield', '廣告阻擋', [
    swRow('啟用廣告阻擋', isApp ? '內建 ' + (st.rules || '200+') + ' 個廣告／追蹤網域規則，累計已阻擋 ' + (st.blockedTotal || 0) + ' 次' : '擷取時依規則移除廣告元素', 'ads'),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '自訂封鎖網域'), hostsTa),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '自訂隱藏元素（CSS 選擇器）'), cssTa),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '不阻擋的網站（白名單）'), allowTa),
    h('div', {class: 'btn-row'}, h('button', {class: 'btn pri sm', text: '儲存規則', onclick: function(){ CFG.adHosts = hostsTa.value; CFG.adCss = cssTa.value; CFG.adAllow = allowTa.value; saveCfg(); pushNativeCfg(); toast('已套用，重新整理網頁後生效'); }})),
    h('div', {class: 'note', text: '登入用的彈出視窗與網站本身的登入框不會被擋；只擋廣告網域、廣告轉址與「沒有點擊就自動彈出」的視窗。'})
  ]));

  /* 帳號密碼 */
  var credN = isApp ? ((NAT.json('credList') || {list: []}).list || []).length : 0;
  P.appendChild(card('lock', '隱私與安全', [
    h('div', {class: 'setRow', onclick: function(){ openSecurity(); }}, h('span', {class: 'ic', html: icon('lock')}), h('div', {class: 'grow'}, h('b', {text: '密碼鎖與指紋'}), h('div', {class: 'sub', text: SEC.has() ? '已設定・鎖住帳號密碼、檔案庫分類或資料夾' : '設定密碼，把帳號密碼、檔案庫的分類或資料夾鎖起來'})), h('span', {class: 'chev', text: '›'}))
  ]));
  P.appendChild(card('key', '帳號密碼', [
    swRow('登入時詢問是否儲存密碼', '密碼用手機 Android Keystore 的金鑰加密，只存在這支手機', 'pw'),
    h('div', {class: 'setRow', onclick: openCreds}, h('span', {class: 'ic', html: icon('key')}), h('div', {class: 'grow'}, h('b', {text: '管理已儲存的帳號'}), h('div', {class: 'sub', text: isApp ? credN + ' 組帳號・可查看、複製、刪除、手動新增' : '需 APK 版'})), h('span', {class: 'chev', text: '›'}))
  ]));

  /* 擷取 */
  P.appendChild(card('download', '琥珀瀏覽器（SingleFile）', [
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '預設輸出格式'), segRow([['html', 'HTML'], ['pdf', 'PDF'], ['both', 'HTML＋PDF']], 'cap.format')),
    swRow('移除廣告', null, 'cap.removeAds'),
    swRow('預設只擷取文章（閱讀模式）', '只保留主要內容與圖片，版面乾淨、檔案最小', 'cap.reader'),
    swRow('嵌入圖片', null, 'cap.embedImages'),
    swRow('嵌入字型', null, 'cap.embedFonts'),
    swRow('移除隱藏的元素', null, 'cap.removeHidden'),
    isApp ? swRow('擷取前先捲動載入所有圖片', null, 'cap.autoScroll') : null,
    swRow('頁首加上原網址與儲存時間', null, 'cap.banner'),
    selRow('圖片畫質', IMGQ.map(function(x){ return [x[0], x[1]]; }), 'cap.imgQ'),
    selRow('檔名格式', [['{title}', '網頁標題'], ['{title}_{date}', '網頁標題_日期'], ['{date}_{title}', '日期_網頁標題'], ['{host}_{title}', '網站_網頁標題'], ['{date}{time}_{host}', '日期時間_網站']], 'cap.nameTpl'),
    h('div', {class: 'two'}, selRow('PDF 紙張', [['a4', 'A4'], ['letter', 'Letter'], ['a3', 'A3']], 'cap.paper'), selRow('PDF 方向', [[false, '直式'], [true, '橫式']], 'cap.landscape', function(v){ CFG.cap.landscape = v === 'true'; saveCfg(); })),
    rangeRow('PDF 邊界', 'cap.margin', 0, 25, 1, function(v){ return v + ' mm'; })
  ]));

  /* 媒體下載 */
  P.appendChild(card('film', '圖片與影片下載', [
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '圖片格式'), segRow([['orig', '原始'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']], 'media.imgFmt')),
    selRow('圖片解析度', [[0, '原始大小'], [3840, '最長邊 3840px（4K）'], [2560, '2560px'], [1920, '1920px（Full HD）'], [1280, '1280px'], [800, '800px（省空間）']], 'media.imgMax'),
    rangeRow('圖片品質（JPG／WEBP）', 'media.imgQ', 50, 100, 5, function(v){ return v + '%'; }),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '影片輸出'), segRow([['mp4', 'MP4'], ['orig', '原始格式'], ['m4a', '只要音訊']], 'media.vidOut')),
    selRow('串流影片畫質', [['max', '最高畫質'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['min', '最低（省空間）']], 'media.vidQ'),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '音訊格式'), segRow([['orig', '原始'], ['mp3', 'MP3'], ['flac', 'FLAC'], ['wav', 'WAV']], 'media.audFmt')),
    swRow('多個檔案打包成 ZIP', null, 'media.zip'),
    h('div', {class: 'field'}, h('div', {class: 'lbl'}, '檔名用'), segRow([['orig', '原始檔名'], ['title', '網頁標題'], ['custom', '自訂']], 'media.nameMode')),
    swRow('檔名後面加流水號', '依網頁上的順序編號（第一張圖＝001）', 'media.seqOn'),
    h('div', {class: 'two'}, selRow('流水號位數', [[1, '1、2、3'], [2, '01、02'], [3, '001、002'], [4, '0001']], 'media.seqDigits'), selRow('編號方式', [['page', '依網頁位置'], ['sel', '依選取重新編號']], 'media.seqMode')),
    rangeRow('偵測時忽略小於這個尺寸的圖片', 'media.minPx', 0, 400, 20, function(v){ return v ? v + 'px' : '不忽略'; }),
    h('div', {class: 'note', html: '影片會原封不動下載，或在手機上「重新封裝」成 MP4／M4A（不重新壓縮，畫質不變）。可選的畫質取決於網站提供的版本。受 DRM 保護的串流（例如 Netflix）無法下載。'})
  ]));

  /* YouTube */
  P.appendChild(card('video', 'YouTube', [
    swRow('YouTube 去廣告', '移除影片前後與中間的廣告、首頁與搜尋結果的贊助內容；漏網的廣告會自動靜音快轉並略過（重新整理 YouTube 後生效）', 'ytAds'),
    h('div', {class: 'sect-h', style: {margin: '12px 0 2px'}}, h('span', {text: '播放器強化（Morphe 風格）'})),
    swRow('背景播放', '切到其他 App 或關閉螢幕，聲音繼續播放', 'yt.bg'),
    swRow('子母畫面', '影片播放中按 Home 鍵自動縮成小視窗；也可按播放器上的 ⧉', 'yt.pip'),
    swRow('SponsorBlock 自動跳過', '自動跳過業配、開場、片尾、提醒訂閱等片段（社群標記資料）', 'yt.sb'),
    swRow('手勢調整', '在影片右半邊上下滑調音量、左半邊調亮度', 'yt.gest'),
    swRow('Morphe 風格播放器', '換上自訂的播放控制：大按鈕、雙擊快轉 ±10 秒、長按 2 倍速、左右滑拖曳進度、上下滑調亮度／音量、進度條顯示 SponsorBlock 片段、畫質／速度選單、子母畫面、下載', 'yt.skin'),
    selRow('預設畫質', [['max', '最高畫質'], ['1080', '1080p'], ['720', '720p'], ['480', '480p（省流量）'], ['auto', '讓 YouTube 自動決定']], 'yt.q'),
    selRow('播放用的影片編碼（下載格式在下載面板選）', [['vp9', '高畫質優先：最高 4K（VP9）'], ['h264', '省電優先：最高 1080p（H.264）']], 'yt.codec', function(){ toast('重新整理 YouTube 頁面後生效'); }),
    swRow('顯示倒讚數', '在播放器標題下方顯示按讚／倒讚數（Return YouTube Dislike）', 'yt.ryd'),
    swRow('隱藏 Shorts', '首頁與搜尋結果不顯示 Shorts 短片區塊', 'yt.noShorts'),
    swRow('懸浮下載按鈕', '在網頁與 YouTube 影片上顯示可拖曳的 ⬇ 按鈕（彈出視窗裡也有），一點就開啟下載面板', 'fab'),
    h('div', {class: 'sub', style: {margin: '6px 0', lineHeight: '1.7'}, html: '在「YouTube」分頁（或瀏覽頁）開啟任何影片，按右上角「下載」、播放器上的 ⬇ 或懸浮按鈕就能選：<br>・影片：144p～4K，影像與聲音分開下載後在手機上合併（不重新壓縮）<br>・音樂：MP3 128／192／320kbps、M4A、OPUS 原始音軌、FLAC／WAV 無損格式（附歌名、歌手、封面）'}),
    h('div', {class: 'btn-row'}, h('button', {class: 'btn sm', html: icon('update', 'sm') + '更新解析設定', onclick: async function(){ await YT.loadCfg(); YT.cache = {}; toast('解析設定：' + YT.cfg.clients.map(function(c){ return c.name; }).join('、')); }})),
    h('div', {class: 'note', text: '下載的影片與音樂僅供個人離線觀看收聽，請尊重創作者著作權。會員專屬、付費或有 DRM 保護的內容無法下載。'})
  ]));

  /* 儲存與匯出 */
  P.appendChild(card('storage', '儲存與匯出', [
    isApp && NAT.has('watchDirs') ? h('div', {class: 'setRow', onclick: function(){ openWatchSettings(); }}, h('span', {class: 'ic', html: icon('download')}), h('div', {class: 'grow'}, h('b', {text: '其他 App 下載自動搬回'}), h('div', {class: 'sub', text: 'Snaptube、Quetta 等下載完自動搬進檔案庫、刪除原檔'})), h('span', {class: 'chev', text: '›'})) : null,
    isApp && NAT.has('dlMax') ? (function(){
      var cur = NAT.call('dlMaxGet') || 3;
      var sel = h('select', {onchange: function(){ NAT.call('dlMax', +this.value); toast('同時下載數：' + this.value + ' 個'); }});
      [1, 2, 3, 4, 5, 6].forEach(function(n){ var o = h('option', {value: n}, n + ' 個' + (n === 3 ? '（建議）' : '')); if(n === cur) o.selected = true; sel.appendChild(o); });
      return h('div', {class: 'setRow wrap'}, h('span', {class: 'ic', html: icon('download')}), h('div', {class: 'grow'}, h('b', {text: '同時下載數量'}), h('div', {class: 'sub', text: 'YouTube、一般影片、音樂可以同時下載、互不干擾；超過的自動排隊（背景錄製會依序進行）'})), sel);
    })() : null,
    isApp ? swRow('同時存一份到手機「下載/琥珀瀏覽器」', '每次擷取或下載完成，自動複製一份到手機公開的下載資料夾', 'autoExport') : null,
    isApp ? h('div', {class: 'setRow', onclick: function(){ openWifi(); }}, h('span', {class: 'ic', html: icon('wifi')}), h('div', {class: 'grow'}, h('b', {text: '無線傳到電腦／其他手機'}), h('div', {class: 'sub', text: '掃 QR Code 用瀏覽器下載；不同網路可以走 GitHub 或公用中繼'})), h('span', {class: 'chev', text: '›'})) : null,
    h('div', {class: 'setRow', onclick: function(){ showView('lib'); }}, h('span', {class: 'ic', html: icon('folder')}), h('div', {class: 'grow'}, h('b', {text: '開啟檔案庫'}), h('div', {class: 'sub', text: '查看空間使用、分類、匯出'})), h('span', {class: 'chev', text: '›'})),
    h('div', {class: 'setRow', onclick: bmBackup}, h('span', {class: 'ic', html: icon('books')}), h('div', {class: 'grow'}, h('b', {text: '收藏備份／還原'}), h('div', {class: 'sub', text: BM.items.length + ' 個收藏・' + BM.folders.length + ' 個收藏夾'})), h('span', {class: 'chev', text: '›'}))
  ]));

  /* 網頁版代理 */
  if(!isApp){
    var px = h('textarea', {style: {minHeight: '80px'}}); px.value = CFG.proxies;
    P.appendChild(card('cloud', '網頁版代理伺服器', [
      h('div', {class: 'sub', html: '網頁版透過下列代理讀取其他網站（依序嘗試，<b>{url}</b> 會換成網址）。代理由第三方提供，請勿用來開啟含個資的網頁。'}),
      h('div', {class: 'field'}, px),
      h('div', {class: 'btn-row'}, h('button', {class: 'btn pri sm', text: '儲存', onclick: function(){ CFG.proxies = px.value; saveCfg(); toast('已儲存'); }}),
        h('button', {class: 'btn sm', text: '還原預設', onclick: function(){ CFG.proxies = CFG_DEF.proxies; px.value = CFG.proxies; saveCfg(); }}))
    ]));
  }

  /* 版本與更新 */
  var um = h('div', {id: 'updMount'}); P.appendChild(um); renderUpdCard();

  /* 關於 */
  P.appendChild(card('info', '關於', [
    h('div', {class: 'sub', style: {lineHeight: '1.75'}, html: '琥珀瀏覽器：像瀏覽器一樣開網頁，去除廣告後把乾淨的內容存成單一離線 HTML（圖片、樣式、字型全部包在一個檔案裡，類似 SingleFile）或 PDF；也能偵測頁面上的圖片與影片，選擇格式與解析度另外下載或打包成 ZIP。所有檔案只存在你的手機，不會上傳。'}),
    h('div', {class: 'btn-row'}, h('button', {class: 'btn sm', html: icon('github', 'sm') + 'GitHub', onclick: function(){ openExternal(GH.web); }}),
      h('button', {class: 'btn sm', text: '重設所有設定', onclick: async function(){ if(await confirmDlg('重設所有設定？', '外觀、瀏覽、擷取、下載設定會恢復預設（收藏、檔案與密碼不受影響）。', '重設', true)){ CFG = deepMerge(CFG_DEF, {}); saveCfg(); applyTheme(); pushNativeCfg(); renderSettings(); toast('已重設'); } }}))
  ]));
  paintIcons(P);
}
on('view', function(e){ if(e.v === 'set') renderSettings(); });

function bmBackup(){
  menu('收藏備份／還原', [
    ['download', '匯出收藏（JSON 檔）', async function(){
      var blob = new Blob([JSON.stringify({app: 'web-saver', v: 1, folders: BM.folders, items: BM.items}, null, 1)], {type: 'application/json'});
      if(isApp){ var it = await Lib.addBlob(blob, '琥珀瀏覽器_收藏備份_' + new Date().toISOString().slice(0, 10) + '.json', {}); exportSheet([it]); }
      else downloadBlob(blob, '琥珀瀏覽器_收藏備份.json');
    }, false, '可存到下載資料夾或分享到雲端'],
    ['inbox', '從 JSON 檔還原（合併）', function(){
      var inp = h('input', {type: 'file', accept: '.json,application/json', style: {display: 'none'}});
      document.body.appendChild(inp);
      inp.onchange = async function(){
        try{
          var d = JSON.parse(await inp.files[0].text());
          var nF = 0, nI = 0;
          (d.folders || []).forEach(function(f){ if(!BM.folders.some(function(x){ return x.id === f.id; })){ BM.folders.push(f); nF++; } });
          (d.items || []).forEach(function(it){ if(!BM.find(it.url)){ if(!BM.folders.some(function(f){ return f.id === it.folder; })) it.folder = BM.folders[0].id; BM.items.push(it); nI++; } });
          BM.save(); toast('已匯入 ' + nI + ' 個收藏、' + nF + ' 個收藏夾'); renderSettings();
        }catch(e){ toast('檔案格式不正確', true); }
        inp.remove();
      };
      inp.click();
    }]
  ]);
}

/* YouTube 分頁右上角「⋯ → 播放器設定」 */
function openYtSettings(){
  var body = h('div', {class: 'card glass', style: {padding: '6px 12px'}},
    swRow('YouTube 去廣告', '重新整理 YouTube 後生效', 'ytAds'),
    swRow('Morphe 風格播放器', '手勢播放控制（關閉則使用 YouTube 原本的播放器）', 'yt.skin'),
    swRow('背景播放', '切到其他 App 或關閉螢幕，聲音繼續播放', 'yt.bg'),
    swRow('子母畫面', '播放中按 Home 鍵自動縮成小視窗', 'yt.pip'),
    swRow('SponsorBlock 自動跳過', '跳過業配、開場、片尾、提醒訂閱等片段', 'yt.sb'),
    swRow('顯示倒讚數', 'Return YouTube Dislike', 'yt.ryd'),
    swRow('隱藏 Shorts', '首頁與搜尋結果不顯示 Shorts', 'yt.noShorts'),
    selRow('預設畫質', [['max', '最高畫質'], ['1080', '1080p'], ['720', '720p'], ['480', '480p（省流量）'], ['auto', '讓 YouTube 自動決定']], 'yt.q'),
    selRow('影片編碼', [['vp9', '高畫質優先（最高 4K、WebM）'], ['h264', '相容優先（最高 1080p、MP4）']], 'yt.codec'),
    swRow('懸浮下載按鈕', '可拖曳的 ⬇ 按鈕', 'fab'),
    (function(){ var inp = h('input', {type: 'checkbox'}); inp.checked = typeof YTMU === 'undefined' || YTMU.own; inp.onchange = function(){ if(typeof YTMU !== 'undefined') YTMU.setOwn(inp.checked); };
      return h('label', {class: 'lab'}, h('span', null, 'YouTube Music 使用 App 的播放介面', h('span', {class: 'sub', text: '跟離線音樂一樣的播放列、正在播放面板與同步歌詞；關閉則使用 YouTube Music 原本的播放器'})), h('span', {class: 'sw'}, inp, h('span'))); })(),
    h('div', {class: 'setRow', onclick: function(){ if(isApp && NAT.has('muCmd')){ NAT.call('muCmd', 'diag', ''); } else toast('只有 App 版可以用', true); }}, h('div', {class: 'grow'}, h('b', {text: 'YouTube Music 診斷資訊'}), h('div', {class: 'sub', text: '有問題時打開，截圖傳給 Claude 幫忙修正'})), h('span', {class: 'chev', text: '›'})),
    h('div', {class: 'setRow', onclick: function(){ openYtAppSettings(); }}, h('div', {class: 'grow'}, h('b', {text: '「開啟應用程式」用哪個 App'}), h('div', {class: 'sub', text: '指定或修改 YouTube／YouTube Music 要開的 App'})), h('span', {class: 'chev', text: '›'})));
  openSheet({title: 'YouTube 播放器設定', icon: 'gear', body: body, tall: true, onClose: function(){ if(isApp) NAT.call('ytNav', 'reload'); },
    foot: h('div', {class: 'sub', text: '關閉這個面板後會重新整理 YouTube 讓設定生效'})});
}
