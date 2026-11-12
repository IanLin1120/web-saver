# Terra 瀏覽器（Web Saver）

像瀏覽器一樣開網頁，去除廣告後把乾淨的內容存成**單一離線 HTML**（類似 SingleFile）或 **PDF**；偵測頁面上的圖片與影片，可選格式、解析度另外下載或打包成 ZIP。Android APK（原生 WebView 瀏覽器＋網頁介面）＋網頁版，附「版本與更新」系統。

- 網頁版：https://ianlin1120.github.io/web-saver/
- 每次 push 到 `main` 並改了 `VERSION` / `web/` / `app/`，GitHub Actions 會自動建置簽章 APK，放進 `apk/`，並更新 `apks.json`、`version.json`、`index.html`（App 內的更新就是讀這幾個檔案）。

## 三個分頁
1. **瀏覽**：網址列、上一頁／下一頁、☆ 收藏（自訂收藏夾）、收藏清冊、✂ 手動移除元素、版面模式（手機版／電腦版／閱讀模式）、⚙ 瀏覽設定（帳號密碼、文字大小、介面大小、顏色），右上「媒體」與「擷取」。
2. **檔案庫**：依類型分類（網頁／PDF／圖片／影片／音訊／壓縮檔），檔名／時間／大小排序（正序、倒序），空間統計（App 佔用、手機剩餘），App 內直接開啟（雙指縮放），匯出原始檔到下載資料夾、任選資料夾、分享或 Wi-Fi 傳到電腦。
3. **設定**：所有設定集中在這裡，含「版本與更新」。

## 發新版
1. 改 `VERSION`（例如 1.0.1），寫 `RELEASE_NOTES.txt`。
2. push 到 main → 等 Actions 跑完 → App 內「檢查更新」就會看到。
   - 只改網頁介面（`web/`）而沒有改原生程式：手機收到的是「線上更新」，不用重裝 APK。
   - 改了 `app/`（原生）：請同時把 `version.json` 的 `minApk` 調到新版號（或在 Actions 設環境變數 `MIN_APK`），App 會要求安裝新 APK。

## 一次性設定
1. Settings → Pages → Source: `main` / root。
2. Settings → Secrets and variables → Actions，新增：`KEYSTORE_B64`、`KEYSTORE_PASSWORD`、`KEY_ALIAS`、`KEY_PASSWORD`（簽章金鑰請自己保管，換金鑰會讓舊版無法覆蓋更新）。

## 本機建置（不用 Gradle）
`tools/build_apk.sh`：aapt2 → javac → dx → zipalign → apksigner。
