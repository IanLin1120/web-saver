/* ============================================================
   軟體使用說明書：設定頁最上面可以隨時打開；第一次使用 App 時自動顯示，滑到最下面按確認才開始使用
   ============================================================ */
var GUIDE_VER = 1;
/* 示意圖：用 App 自己的圖示和配色畫的小畫面，標出要按的地方（.gHit = 重點） */
function gI(n, sz){ return icon(n, sz || 'sm'); }
function gNav(on){
  var T = [['globe', '瀏覽'], ['video', 'YouTube'], ['sparkle', 'AI 摘要'], ['folder', '檔案庫'], ['gear', '設定']];
  return '<div class="gFig"><div class="gNav">' + T.map(function(t, i){ return '<span class="' + (i === on ? 'on' : '') + '">' + gI(t[0]) + '<i>' + t[1] + '</i></span>'; }).join('') + '</div><em>App 最下面的五個分頁' + (on != null && on >= 0 ? '，點「' + T[on][1] + '」' : '') + '</em></div>';
}
function gBar(items, cap){ return '<div class="gFig"><div class="gBar">' + items.map(function(x){ return typeof x === 'string' ? x : '<span class="gB' + (x.hit ? ' gHit' : '') + (x.wide ? ' wide' : '') + '">' + (x.ic ? gI(x.ic) : '') + (x.t ? '<i>' + x.t + '</i>' : '') + (x.n ? '<u>' + x.n + '</u>' : '') + '</span>'; }).join('') + '</div><em>' + cap + '</em></div>'; }
function gRows(rows, cap){ return '<div class="gFig"><div class="gRows">' + rows.map(function(r){ return '<div class="gRow' + (r.hit ? ' gHit' : '') + '">' + gI(r.ic) + '<span><b>' + r.t + '</b>' + (r.s ? '<small>' + r.s + '</small>' : '') + '</span>' + (r.n ? '<u>' + r.n + '</u>' : '<s>›</s>') + '</div>'; }).join('') + '</div><em>' + cap + '</em></div>'; }
function gMini(title, sub, cap){ return '<div class="gFig"><div class="gMini"><span class="gArt">' + gI('audio') + '</span><span class="gT"><b>' + title + '</b><small>' + sub + '</small></span>' + gI('pause') + gI('fwd') + '<span class="gHit gX">' + gI('x') + '</span></div><em>' + cap + '</em></div>'; }
var G_FIG = {
  intro: function(){ return gNav(-1); },
  perm: function(){ return '<div class="gFig"><div class="gDlg"><b>要允許「Terra 瀏覽器」傳送通知嗎？</b><div><span>不允許</span><span class="gHit">允許</span></div></div><em>手機跳出這種詢問時，選「允許」</em></div>'; },
  browse: function(){ return gBar([{ic: 'back'}, {ic: 'home'}, {t: '輸入網址或關鍵字', wide: 1}, {ic: 'grid', hit: 1, n: '1'}], '① 右上角的「功能選單」：擷取網頁、下載影片、收藏、無痕模式都在裡面'); },
  yt: function(){ return gNav(1) + '<div class="gFig"><div class="gStage"><span class="gPlay">' + gI('play', '') + '</span><span class="gFab gHit" style="position:absolute;right:14px;bottom:14px;top:auto;width:36px;height:36px;border-radius:10px;background:rgba(0,0,0,.45);color:#fff">' + gI('download') + '</span></div><em>看影片時，點一下畫面，播放器控制列上的「⬇」就是下載</em></div>'; },
  music: function(){ return gBar([{ic: 'back'}, {ic: 'home'}, {ic: 'reload'}, {ic: 'listen', hit: 1, n: '2'}, '<span class="gSeg"><i>' + gI('video') + '</i><i class="on gHit">' + gI('audio') + '</i><u>1</u></span>', {ic: 'more'}], '① 切到音符就是 YouTube Music　② 圓形聲波按鈕是「聽歌辨識」（YouTube 和 YouTube Music 都有）') +
    gMini('歌名', '歌手（有同步歌詞時顯示正在唱的那句）', '播放時下方的小播放列：點一下打開播放面板，最右邊 ✕ 停止播放'); },
  ai: function(){ return gBar([{ic: 'back'}, {t: 'AI 摘要', wide: 1}, {t: '● Gemini', hit: 1, n: '1'}, {ic: 'more'}], '① 在「AI 摘要」分頁，點右上角顯示 AI 名稱的按鈕，打開「AI 設定」') +
    '<div class="gFig"><div class="gForm"><label>AI 引擎</label><div class="gSeg2"><i>Claude</i><i class="on">Gemini</i></div><label>Gemini API 金鑰</label><div class="gInp gHit">AIzaSy･･････････････<u>2</u></div></div><em>② 引擎選「Gemini」，把複製的金鑰貼到這一格</em></div>'; },
  lib: function(){ return gBar([{ic: 'reload', n: '1'}, {ic: 'plus', hit: 1, n: '2'}, {t: '搜尋檔名、網址', wide: 1}, {ic: 'sort'}, {ic: 'check', n: '3'}], '① 重新整理　② 匯入手機裡的檔案　③ 多選（也可以長按檔案）'); },
  watch: function(){ return gRows([{ic: 'film', t: '圖片與影片下載', s: '設定頁裡的這一區'}, {ic: 'download', t: '其他 App 下載自動搬回', s: 'Snaptube、Quetta 等下載完自動搬進檔案庫', hit: 1, n: '1'}], '① 設定 → 圖片與影片下載 → 其他 App 下載自動搬回') +
    '<div class="gFig"><div class="gFlow"><span>' + gI('video') + '<i>YouTube<br>下載面板</i></span><b>→</b><span>' + gI('download') + '<i>交給其他<br>App 下載</i></span><b>→</b><span class="gHit">' + gI('folder') + '<i>自動搬回<br>檔案庫</i></span></div><em>設定好之後的流程</em></div>'; },
  lock: function(){ return gRows([{ic: 'lock', t: '密碼鎖與指紋', s: '設定 → 隱私與安全', hit: 1}], '在這裡設定 6 位數解鎖密碼') + '<div class="gFig"><div class="gPin"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i><i></i></div><em>解鎖時輸入 6 位數，或用指紋</em></div>'; },
  relay: function(){ return '<div class="gFig"><div class="gFlow"><span>' + gI('folder') + '<i>你的手機<br>加密</i></span><b>→</b><span class="gHit">' + gI('globe') + '<i>中繼站<br>GitHub／公用</i></span><b>→</b><span>' + gI('download') + '<i>對方用瀏覽器<br>解密下載</i></span></div><em>兩邊不用在同一個網路</em></div>' +
    '<div class="gFig"><div class="gBar"><span class="gB"><i>同一個網路</i></span><span class="gB gHit"><i>GitHub 中繼</i><u>1</u></span><span class="gB gHit"><i>公用中繼</i><u>2</u></span></div><em>傳檔面板最上面選要用哪一種</em></div>'; },
  upd: function(){ return gRows([{ic: 'reload', t: '版本與更新', s: '檢查新版本、分享 App 下載連結', hit: 1}], '設定 → 版本與更新'); }
};
var GUIDE = [
  {ic: 'info', fig: 'intro', t: '這套 App 可以做什麼', open: true, html:
    '<p>「Terra 瀏覽器」把常用的幾件事放在同一個 App，下面五個分頁各管一件事：</p>' +
    '<ul>' +
    '<li><b>瀏覽</b>：內建瀏覽器，擋廣告，可以把整個網頁存成離線檔、下載網頁裡的圖片和影片。</li>' +
    '<li><b>YouTube</b>：沒有廣告的 YouTube 和 YouTube Music，可以背景播放、下載影片和音樂。</li>' +
    '<li><b>AI 摘要</b>：把 YouTube 影片交給 AI，整理出逐字稿、摘要、章節，還能針對影片內容發問。</li>' +
    '<li><b>檔案庫</b>：所有存下來的東西都在這裡，可以播放影片和音樂、看 PDF 和圖片、開啟並編輯 Word／Excel／PPT／文字檔。</li>' +
    '<li><b>設定</b>：外觀、擋廣告、密碼鎖、下載、更新，以及這份說明書。</li>' +
    '</ul>' +
    '<p class="gTip">下面每一段點一下標題就能展開。之後想再看，到「設定」最上面的「軟體使用說明書」。</p>'},

  {ic: 'shield', fig: 'perm', t: '第一次使用：會問你的權限', open: true, html:
    '<p>用到某個功能時，手機才會跳出詢問，選「允許」就好。不用的功能可以不允許，其他功能不受影響。</p>' +
    '<table class="gTbl">' +
    '<tr><th>權限</th><th>用在哪裡</th></tr>' +
    '<tr><td>通知</td><td>下載進度、下載完成、背景播放音樂時的播放控制。<b>建議允許</b>，不然關掉螢幕後下載和音樂可能會停。</td></tr>' +
    '<tr><td>安裝未知的應用程式</td><td>App 自己更新到新版本時需要（「設定 → 版本與更新」）。</td></tr>' +
    '<tr><td>麥克風</td><td>聽歌辨識要聽「周圍的聲音」時才需要；辨識 App 裡正在播的影片或音樂不需要。</td></tr>' +
    '<tr><td>相機</td><td>「掃 QR Code」，以及「入侵者拍照」（有人連續輸錯 3 次解鎖密碼時拍一張）。</td></tr>' +
    '<tr><td>螢幕錄製、勿擾模式</td><td>用螢幕錄影錄下抓不到的影片時需要；每次開始錄影系統會再問一次。</td></tr>' +
    '<tr><td>資料夾存取</td><td>「其他 App 下載自動搬回」要你自己選一次那個 App 的下載資料夾。</td></tr>' +
    '<tr><td>指紋</td><td>用指紋代替輸入解鎖密碼。</td></tr>' +
    '</table>' +
    '<p class="gTip">省電設定：有些手機會把背景的 App 關掉。如果關螢幕後音樂或下載會中斷，請到手機的「設定 → 應用程式 → Terra 瀏覽器 → 電池」選「不限制」。</p>'},

  {ic: 'globe', fig: 'browse', t: '瀏覽：上網、存網頁、下載圖片影片', html:
    '<p><b>翻譯網頁（AI）</b>：看外文網頁時，右上角功能選單 →「翻譯網頁」，App 會用 Gemini 把整頁文字翻成你的介面語言（預設繁體中文），版面不變。往下捲出現新內容時再按一次可以「翻譯新載入的內容」，也可以「顯示原文」。要先設定 Gemini 金鑰（見「AI 摘要」）。</p>' +
    '<p><b>http／https 自動切換</b>：網頁打不開時（連不上或伺服器錯誤），App 會自動換另一種再試一次：https 壞掉的網站改用 http，只有 https 能用的網站改用 https。</p>' +
    '<p><b>掃 QR Code</b>：首頁「瀏覽記錄」旁邊的「掃 QR Code」。用相機掃（可以拉桿放大縮小、有多顆後鏡頭時按「換鏡頭」切換，也可以從相片選、開手電筒），掃到網址就直接用 App 打開；掃到別人用這套 App 分享的傳檔 QR Code，會直接把檔案收進檔案庫。第一次會問相機權限。</p>' +
    '<p>在上方輸入網址或關鍵字就能上網，廣告會自動擋掉。右上角的「功能選單」（格子圖示）裡有這些功能：</p>' +
    '<ul>' +
    '<li><b>擷取網頁</b>：把整個網頁連同圖片存成一個離線檔，放進檔案庫的「網頁」，沒網路也能看。</li>' +
    '<li><b>下載影片</b>：自動偵測這一頁的圖片和影片，可以選格式和畫質下載。抓不到的影片，可以改用「錄製」：在背景錄，或滿版播放後用手機螢幕錄影（會自動開勿擾，播完自動停）。</li>' +
    '<li><b>收藏此頁／收藏清單</b>：把常去的網站加到「我的收藏」，可以分收藏夾。</li>' +
    '<li><b>瀏覽記錄</b>、<b>無痕模式</b>（不留記錄、不儲存密碼）、<b>滿版瀏覽</b>。</li>' +
    '<li><b>手動清理</b>：點掉網頁上擋不掉的廣告或不想看到的區塊。</li>' +
    '</ul>' +
    '<p><b>記住帳號密碼</b>：登入網站時，下方會問要不要儲存密碼，下次自動填入。第一次儲存前要先設定 6 位數的解鎖密碼。</p>' +
    '<p class="gTip">在瀏覽器點到 YouTube 或 YouTube Music 的連結，會自動交給「YouTube」分頁打開。</p>'},

  {ic: 'video', fig: 'yt', t: 'YouTube：無廣告、背景播放、下載', html:
    '<ol>' +
    '<li>點下方的「YouTube」分頁，就是沒有廣告的 YouTube。可以登入自己的 Google 帳號看訂閱內容。</li>' +
    '<li><b>背景播放</b>：切到別的 App 或關螢幕，聲音會繼續播；回到主畫面時會變成小視窗（子母畫面）。</li>' +
    '<li><b>下載</b>：點一下影片，播放器控制列上有「⬇」下載按鈕，按下去選畫質，或只下載音樂（MP3）。看 <b>Shorts</b> 時，下載按鈕在畫面右上角、放大鏡的右邊。下載好的檔案在檔案庫。（YouTube 這一頁不再顯示懸浮下載按鈕；一般網頁的「瀏覽」分頁仍然有。）</li>' +
    '<li><b>交給其他下載 App</b>：下載面板裡也可以把影片交給 Snaptube 等 App 下載，下載完會自動搬回檔案庫（見「其他 App 下載自動搬回」）。</li>' +
    '<li><b>聽歌辨識</b>：上方的圓形聲波按鈕。想知道影片裡在放哪首歌時按一下，App 會直接聽影片的聲音 10 秒（不用麥克風、影片不會暫停），再告訴你歌名（詳見「YouTube Music」那一節）。</li>' +
    '<li>右上角「⋮」可以調整播放器設定：預設畫質、播放速度、自動跳過贊助片段等。</li>' +
    '</ol>'},

  {ic: 'audio', fig: 'music', t: 'YouTube Music：聽音樂、歌詞、聽歌辨識', html:
    '<ol>' +
    '<li>在 YouTube 分頁上方，有一個「影片／音符」的切換鈕，切到音符就是 YouTube Music。</li>' +
    '<li>點任何一首歌就會播放，並打開播放面板：封面、進度條、上一首／下一首、隨機、循環、播放佇列。歌名右邊的「⬇」可以把這首歌下載下來。</li>' +
    '<li><b>歌詞</b>：播放面板按「歌詞」。App 會自動找會跟著唱的同步歌詞，找不到就顯示 YouTube Music 內建的歌詞；也可以按「找歌詞」自己挑。</li>' +
    '<li>把面板關掉後，下方會留一條小播放列，可以暫停、下一首，最右邊的 ✕ 是停止播放。</li>' +
    '<li><b>聽歌辨識</b>：切換鈕旁邊的圓形聲波按鈕（YouTube 和 YouTube Music 兩邊都有）。聽 10 秒後辨識出歌名。<br>・App 裡有影片或音樂在播：直接聽那個聲音，不用麥克風，<b>播放不會暫停</b>。<br>・沒有東西在播，或按「改聽周圍的聲音」：用麥克風聽外面的音樂（其他 App 或喇叭播的也可以）。<br>・在 YouTube Music 會自動去搜尋那首歌；在 YouTube 看影片時只顯示歌名，影片繼續播，要搜尋再自己按。<br>這個功能要先設定 Gemini 金鑰（見「AI 摘要」）。</li>' +
    '<li>手機的通知列和快速面板也會顯示正在播的歌，可以直接在那裡控制。</li>' +
    '</ol>'},

  {ic: 'sparkle', fig: 'ai', t: 'AI 摘要：影片逐字稿、摘要、章節、發問（要申請金鑰）', html:
    '<p>把 YouTube 影片交給 AI 看，幫你整理重點。<b>要先申請一組免費的 Gemini 金鑰（API Key）</b>，只要做一次：</p>' +
    '<ol>' +
    '<li>用瀏覽器打開 <b>aistudio.google.com</b>，登入你的 Google 帳號。</li>' +
    '<li>點「Get API key」（取得 API 金鑰）→「Create API key」（建立金鑰）。</li>' +
    '<li>畫面會出現一長串英文和數字，按「複製」。</li>' +
    '<li>回到這個 App，點下方「AI 摘要」分頁，再點右上角顯示 AI 名稱的按鈕，打開「AI 設定」。</li>' +
    '<li>AI 引擎選「Gemini」，把剛剛複製的金鑰貼到「Gemini API 金鑰」欄位。</li>' +
    '</ol>' +
    '<p>設定好之後的用法：</p>' +
    '<ul>' +
    '<li>在「AI 摘要」貼上 YouTube 網址，或在 YouTube App／這個 App 的 YouTube 分頁按「分享」→ 選「AI 摘要（Terra 瀏覽器）」。</li>' +
    '<li>AI 會產生逐字稿、摘要、章節；「對話」可以針對影片內容發問。沒有字幕的影片，AI 會直接看影片聽寫。</li>' +
    '<li>分析可以在背景進行，完成會通知；分析過的影片會依頻道分資料夾保存。</li>' +
    '</ul>' +
    '<p class="gTip">金鑰只存在你的手機裡。Gemini 免費額度每天有上限，用完隔天會恢復；模型清單裡標「需付費」的不要選就不會被收費。「AI 設定」裡也可以改用 Claude（需要自己的 Claude 訂閱或 API 金鑰），不設定也沒關係。</p>'},

  {ic: 'folder', fig: 'lib', t: '檔案庫：播放、閱讀、編輯、整理', html:
    '<ul>' +
    '<li><b>分類</b>：檔案依種類自動分到網頁、PDF、圖片、影片、音樂庫、Word、Excel、APK、EXE…等分類。按分類列最右邊的「分類」可以改名、排序、新增自己的分類；自己新增的分類可以指定副檔名（例如 apk），之後那種檔案會自動收進去。要把檔案換到別的分類：長按選取 → 工具列的「移到其他分類」（三層方塊圖示）；旁邊的資料夾圖示是在<b>同一個分類裡面</b>搬到資料夾。</li>' +
    '<li><b>分類</b>：影片、音樂庫、網頁、圖片、PDF、Word、Excel、PPT、文字檔、字幕、壓縮檔。點上方的分類就會打開。</li>' +
    '<li><b>匯入手機裡的檔案</b>：按「＋」，可以一次選很多個，App 會依副檔名自動分到對的分類。</li>' +
    '<li><b>音樂庫</b>：離線音樂播放器，有播放清單、隨機、循環、同步歌詞。</li>' +
    '<li><b>影片</b>：內建播放器，可以掛字幕、調速度、快轉倒退。</li>' +
    '<li><b>Word／Excel／PPT／文字檔</b>：點開就能看，按「編輯」可以改文字或儲存格再存檔；PPT 可以「投影播放」。啟用巨集的 Excel 可以看巨集程式碼，巨集會完整保留，但手機上不能執行。</li>' +
    '<li><b>整理</b>：長按檔案可以多選，再移到資料夾、改檔名、刪除。刪除的檔案會先進垃圾桶。</li>' +
    '<li><b>重複檔案提醒</b>：新加入的檔案跟已有的檔名一樣或大小一樣時，會問你要都保留、改檔名還是刪除。</li>' +
    '<li><b>傳到電腦或其他手機</b>：「設定 → 儲存與匯出 → 無線傳到電腦／其他手機」。對方掃畫面上的 QR Code（或輸入網址）就能用瀏覽器下載。兩邊要在同一台分享器底下（Wi-Fi 或網路線都可以）；沒有共同的網路時，打開這支手機的「個人熱點」讓對方連進來，或用 USB 網路共用。對方在完全不同的網路時，改用中繼站（見「跨網路傳檔」）。</li>' +
    '</ul>'},

  {ic: 'share', fig: 'relay', t: '跨網路傳檔：GitHub 中繼、公用中繼', html:
    '<p>對方和你不在同一個網路（例如人在別的地方、你只有行動網路）時，檔案可以先經過一台「中繼站」再到對方。有兩種可以選：</p>' +
    '<table class="gTbl"><tr><th></th><th>GitHub 中繼</th><th>公用中繼</th></tr>' +
    '<tr><td>檔案經過哪裡</td><td>你自己的 GitHub 帳號</td><td>別人架設的公開中繼站（預設 ppng.io）</td></tr>' +
    '<tr><td>會不會存下來</td><td>暫存，傳完刪除</td><td>不會，只是即時經過</td></tr>' +
    '<tr><td>對方什麼時候下載</td><td>隨時（刪除之前）</td><td>要和你同時在線，你的畫面要開著</td></tr>' +
    '<tr><td>事前準備</td><td>要有 GitHub 帳號和權杖</td><td>不用</td></tr></table>' +
    '<p>兩種都會先在手機把檔案<b>加密</b>，解密用的金鑰只在你給對方的連結裡，中繼站和其他人都打不開。</p>' +
    '<p><b>怎麼用</b></p><ol>' +
    '<li>到<b>檔案庫</b>長按勾選要傳的檔案 → 按「匯出／分享」→「無線傳到電腦／其他手機」。</li>' +
    '<li>在最上面選「<b>GitHub 中繼</b>」或「<b>公用中繼</b>」。</li>' +
    '<li>把畫面上的 QR Code 給對方掃，或按「傳給對方」把連結用 LINE 等傳過去。對方用瀏覽器打開就能下載，不用裝 App。</li>' +
    '<li><b>對方也有這套 App</b>：在「瀏覽」首頁按「<b>掃 QR Code</b>」掃一下（或把連結貼到網址列），檔案會直接下載、解密、存進他的檔案庫。</li></ol>' +
    '<p><b>GitHub 中繼：第一次要設定權杖</b></p><ol>' +
    '<li>用瀏覽器登入 <b>github.com</b>（沒有帳號要先免費註冊）。</li>' +
    '<li>右上角頭像 → <b>Settings</b> → 左邊最下面 <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Tokens (classic)</b>。</li>' +
    '<li>按 <b>Generate new token (classic)</b>。Note 隨便填（例如「Terra 瀏覽器傳檔」），Expiration 選你要的期限，下面的權限只勾 <b>public_repo</b>。</li>' +
    '<li>按最下面的 <b>Generate token</b>，複製 <b>ghp_</b> 開頭的那一串（只會顯示這一次）。</li>' +
    '<li>回到 App 的「GitHub 中繼」分頁貼上，按「儲存並檢查」。App 會在你的 GitHub 自動建立一個叫 <b>web-saver-relay</b> 的公開倉庫當中繼站。</li></ol>' +
    '<p><b>GitHub 中繼：傳完刪除</b>　對方下載完後，按「<b>對方收到了，刪除暫存</b>」就會把 GitHub 上的暫存刪掉。忘了按也沒關係，60 分鐘後 App 會自動刪（App 要有開）。</p>' +
    '<div class="gTip">檔案很大（超過 300 MB）時，經過中繼會很慢，建議還是用同一個網路或手機熱點直接傳。公用中繼是別人的免費服務，偶爾可能連不上，連不上時改用 GitHub 中繼。</div>'},
  {ic: 'download', fig: 'watch', t: '其他 App 下載自動搬回（Snaptube 等）', html:
    '<p>有些影片用其他下載 App（例如 Snaptube、Quetta）比較好抓。設定一次之後，用它們下載完的影片、音樂、字幕會<b>自動搬進這個 App 的檔案庫</b>，原本的檔案會刪掉，不佔兩份空間。</p>' +
    '<ol>' +
    '<li>先在手機裝好那個下載 App，並用它隨便下載一個檔案（這樣它的下載資料夾才會出現）。</li>' +
    '<li>到「設定 → 圖片與影片下載 → 其他 App 下載自動搬回」。</li>' +
    '<li>選那個 App，按加入資料夾的按鈕，在跳出的畫面找到它的下載資料夾（通常在「Download」或以 App 名稱命名的資料夾），按「使用這個資料夾」→「允許」。影片和音樂分開放的話，兩個資料夾都要加。</li>' +
    '<li>之後在 YouTube 的下載面板選「交給 Snaptube 下載」（或其他 App），下載完回到這個 App，檔案就會自動出現在檔案庫。</li>' +
    '</ol>' +
    '<p class="gTip">App 回到前景時會檢查一次；交給其他 App 下載後的 3 小時內，每 15 秒也會檢查一次。想馬上檢查，按檔案庫的「重新整理」。</p>'},

  {ic: 'lock', fig: 'lock', t: '上鎖與安全', html:
    '<ul>' +
    '<li>到「設定 → 隱私與安全 → 密碼鎖與指紋」設定一組 6 位數密碼，可以再開啟指紋解鎖。</li>' +
    '<li>可以鎖住：已儲存的帳號密碼、檔案庫的整個分類（例如影片）、單一資料夾、我的收藏。</li>' +
    '<li>解鎖一次後，直到把 App 關掉前都不用再輸入；也可以按「立即上鎖」。</li>' +
    '<li>連續輸錯 3 次會用前鏡頭拍照（要允許相機），照片存在上鎖的資料夾。</li>' +
    '</ul>' +
    '<p class="gTip">請記住解鎖密碼。密碼只存在這支手機，忘記了沒有人能幫你找回，上鎖的內容就打不開了。</p>'},

  {ic: 'globe', t: '語言 Language：切換介面語言', html:
    '<p>介面原文是繁體中文。到「設定」最上面的「<b>語言 Language</b>」（說明書最上面也有按鈕）可以換成 English、日本語、한국어、简体中文、Tiếng Việt、ไทย、Bahasa Indonesia、Español、Français、Deutsch 等語言。</p>' +
    '<ul><li><b>English、简体中文</b>：已經內建，選了馬上切換，不需要金鑰也不用等。</li>' +
    '<li><b>其他語言</b>：第一次選的時候會用 Gemini 把介面和說明書翻譯一次（要先設定 Gemini 金鑰，見「AI 摘要」），大約 1～3 分鐘，畫面上會顯示進度；翻好後存在手機裡，之後不用再翻。</li>' +
    '<li>要換回來：再到同一個地方選「繁體中文」。</li></ul>' +
    '<div class="gTip">只翻譯介面文字，不會改你的檔名、歌名、收藏的標題。少數地方（系統通知列的文字、YouTube 播放器上的按鈕提示）目前仍是中文。</div>'},
  {ic: 'reload', fig: 'upd', t: '更新 App', html:
    '<ul>' +
    '<li>到「設定 → 版本與更新」可以檢查新版本，小更新會直接套用，大更新會下載新的安裝檔，按「安裝」即可（第一次要允許「安裝未知的應用程式」）。</li>' +
    '<li>同一頁可以分享 App 的下載連結給朋友。</li>' +
    '</ul>'},

  {ic: 'search', t: '常見問題', html:
    '<ul>' +
    '<li><b>關螢幕後音樂或下載停了</b>：允許通知，並把這個 App 的電池設定改成「不限制」。</li>' +
    '<li><b>AI 摘要顯示額度用完</b>：Gemini 免費額度當天用完了，隔天再試，或到「AI 設定」換另一個模型。</li>' +
    '<li><b>YouTube 影片下載失敗</b>：先重新整理那部影片再試；還是不行，就用下載面板裡的其他 App 下載。</li>' +
    '<li><b>其他 App 下載的檔案沒有搬回來</b>：確認已經加了正確的下載資料夾，再按檔案庫的「重新整理」。</li>' +
    '<li><b>找不到某個檔案</b>：在檔案庫上方的搜尋框輸入檔名；也看看是不是在上鎖的分類或垃圾桶裡。</li>' +
    '</ul>'}
];

function openGuide(first){
  var body = h('div', {class: 'guide'});
  body.appendChild(h('p', {class: 'gLead', text: first ? '歡迎使用「Terra 瀏覽器」！開始之前，請花兩分鐘看一下這份說明。滑到最下面按確認，就可以開始使用。' : '這裡整理了 App 的所有功能，以及需要設定的地方。點標題可以展開或收起。'}));
  body.appendChild(h('div', {class: 'btn-row', style: {margin: '0 0 10px'}}, h('button', {class: 'btn', 'data-i18n-skip': '', html: icon('globe', 'sm') + '語言 Language：' + (typeof I18N !== 'undefined' ? I18N.label() : '繁體中文'), onclick: function(){ openLang(); }})));
  GUIDE.forEach(function(g, i){
    var d = h('details', {class: 'gSec'});
    if(g.open || !first && i < 1) d.open = true;
    d.appendChild(h('summary', {html: '<span class="gIc">' + icon(g.ic) + '</span><b>' + esc(g.t) + '</b><span class="gChev">' + icon('chevR', 'sm') + '</span>'}));
    var fig = ''; try{ fig = g.fig && G_FIG[g.fig] ? G_FIG[g.fig]() : ''; }catch(e){}
    /* 說明書內文：其他語言時用整段翻好的版本（不走逐句替換，句子才通順） */
    var tr = typeof i18nGuideHtml === 'function' ? i18nGuideHtml(i) : g.html;
    d.appendChild(h('div', {class: 'gBody', html: fig + '<div' + (tr !== g.html ? ' data-i18n-skip' : '') + '>' + tr + '</div>'}));
    body.appendChild(d);
  });
  var ok = false;
  var btn = h('button', {class: 'btn pri gOk', html: icon('check', 'sm') + (first ? '我知道了，開始使用' : '關閉說明書'), onclick: function(){ ok = true; lsSet('ws.guideSeen', GUIDE_VER); buzz(12); s.close(); }});
  body.appendChild(h('div', {class: 'gEnd'}, first ? h('div', {class: 'sub', text: '之後想再看：設定 → 最上面的「軟體使用說明書」'}) : null, btn));
  var s = openSheet({title: '軟體使用說明書', icon: 'books', body: body, tall: true, cls: 'guideSheet'});
  if(first){
    /* 第一次：一定要滑到最下面按確認才能關閉 */
    var close0 = s.close;
    s.close = function(){ if(!ok){ toast('請滑到最下面，按「我知道了，開始使用」'); btn.scrollIntoView({behavior: 'smooth', block: 'center'}); return; } close0(); };
  }
  paintIcons(body);
  return s;
}
/* 第一次使用（還沒按過確認）：App 開好後自動顯示 */
setTimeout(function(){ if(lsGet('ws.guideSeen', 0) < GUIDE_VER && !Sheets.stack.length) openGuide(true); }, 900);
