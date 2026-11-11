package com.ian.websaver;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebStorage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

/** App 介面（網頁）⇄ 原生的橋：window.WSB */
public class Bridge {
    private final MainActivity a;

    Bridge(MainActivity act) { a = act; }

    private void ui(Runnable r) { a.runOnUiThread(r); }

    private static String err(Throwable t) {
        try { return new JSONObject().put("ok", false).put("err", String.valueOf(t.getMessage())).toString(); } catch (Throwable e) { return "{\"ok\":false}"; }
    }

    /* ---------- 一般 ---------- */
    @JavascriptInterface public String version() {
        try {
            PackageInfo p = a.getPackageManager().getPackageInfo(a.getPackageName(), 0);
            return p.versionName == null ? "" : p.versionName;
        } catch (Throwable t) { return ""; }
    }

    @JavascriptInterface public void openUrl(final String u) { ui(new Runnable() { @Override public void run() { a.openExternal(u); } }); }

    @JavascriptInterface public void hideKeyboard() { ui(new Runnable() { @Override public void run() { a.hideKeyboard(); } }); }

    @JavascriptInterface public void theme(final String color, final boolean dark) {
        a.prefs.edit().putString("barColor", color).putBoolean("barDark", dark).apply();
        ui(new Runnable() { @Override public void run() { a.setBars(color, dark); } });
    }

    @JavascriptInterface public void setPref(String k, String v) { a.prefs.edit().putString("u_" + k, v).apply(); if (k.equals("autoExport")) a.prefs.edit().putBoolean("autoExport", "1".equals(v)).apply(); }

    /* ---------- 瀏覽器 ---------- */
    @JavascriptInterface public void brRect(final float top, final float bottom, final float left, final float right) {
        ui(new Runnable() { @Override public void run() { a.br.setRect(top, bottom, left, right); } });
    }

    @JavascriptInterface public void brShow(final boolean on) { ui(new Runnable() { @Override public void run() { a.br.show(on); } }); }

    @JavascriptInterface public void cover(final boolean on) {
        ui(new Runnable() { @Override public void run() { a.br.cover(on); for (Browser b : a.ytAll()) b.cover(on); a.vw.cover(on); a.fab.cover(on); AiPlayer.cover(on); } });
    }

    /* ---------- YouTube 分頁 ---------- */
    /** 手機能不能把 4K 影片存成 MP4：需要 Android 14 以上（MP4 才能放 AV1）且有 AV1 解碼器 */
    @JavascriptInterface public boolean hasAv1() {
        if (android.os.Build.VERSION.SDK_INT < 34) return false;
        try {
            for (android.media.MediaCodecInfo i : new android.media.MediaCodecList(android.media.MediaCodecList.REGULAR_CODECS).getCodecInfos())
                if (!i.isEncoder()) for (String t : i.getSupportedTypes()) if (t.equalsIgnoreCase("video/av01")) return true;
        } catch (Throwable t) { /* ignore */ }
        return false;
    }

    /** 讓 App 在背景繼續執行（轉檔、音樂播放）：key＝conv／music／cap，text＝null 代表結束 */
    @JavascriptInterface public void keep(String key, String text) { KeepAlive.set(a, key, text == null || text.isEmpty() ? null : text); }

    /** 震動＋通知（App 內轉檔完成時用） */
    @JavascriptInterface public void doneBuzz(String title) { KeepAlive.done(a, title); }

    @JavascriptInterface public void nativeToast(final String msg) { ui(new Runnable() { @Override public void run() { android.widget.Toast.makeText(a, msg, android.widget.Toast.LENGTH_SHORT).show(); } }); }

    @JavascriptInterface public void share(String title, String url) {
        Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url);
        if (title != null && !title.isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, title);
        a.startActivity(Intent.createChooser(i, "分享網址").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    /** 懸浮按鈕外圈的進度（-1＝沒有進行中的工作） */
    @JavascriptInterface public void fabProg(final double p) { ui(new Runnable() { @Override public void run() { a.fab.prog((float) p); } }); }

    /** App 自己的全螢幕（檔案庫影片播放器）：隱藏狀態列；land＝橫向影片自動轉橫向 */
    @JavascriptInterface public void uiFull(final boolean on, final boolean land) {
        ui(new Runnable() { @Override public void run() {
            a.immersive(on);
            a.setRequestedOrientation(on && land ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } });
    }

    /** 無痕模式：開啟時不使用快取、不存表單、不詢問密碼；關閉時清除這段期間的快取與記錄（clearCookies＝連 Cookie 一起清，會登出所有網站） */
    @JavascriptInterface public void brIncog(final boolean on, final boolean clearCookies) {
        ui(new Runnable() { @Override public void run() {
            Browser b = a.br;
            b.incog = on;
            b.wv.getSettings().setCacheMode(on ? android.webkit.WebSettings.LOAD_NO_CACHE : android.webkit.WebSettings.LOAD_DEFAULT);
            b.wv.getSettings().setSaveFormData(!on);
            if (!on) {
                b.wv.clearCache(true);
                b.wv.clearHistory();
                b.wv.clearFormData();
                if (clearCookies) { android.webkit.CookieManager.getInstance().removeAllCookies(null); android.webkit.WebStorage.getInstance().deleteAllData(); }
            }
        } });
    }

    /** 清空瀏覽分頁偵測到的媒體（離開網頁、回首頁時） */
    /** 目前網頁裡的影片能不能錄製（DRM／跨網域的不行）：結果用 recCan 事件回傳 */
    @JavascriptInterface public void brRecCheck(final String src) {
        ui(new Runnable() { @Override public void run() {
            a.br.wv.evaluateJavascript("(function(){try{return window.__wsRec?__wsRec.can(" + org.json.JSONObject.quote(src == null ? "" : src) + "):'noscript'}catch(e){return 'err'}})()", new android.webkit.ValueCallback<String>() {
                @Override public void onReceiveValue(String v) { MainActivity.emit("recCan", v == null ? "" : v.replaceAll("^\"|\"$", "")); }
            });
        } });
    }
    @JavascriptInterface public void brMediaClear() { ui(new Runnable() { @Override public void run() { a.br.clearMedia(); } }); }

    @JavascriptInterface public void ytRect(final float top, final float bottom, final float left, final float right) {
        ui(new Runnable() { @Override public void run() { a.ytRectV = new float[]{top, bottom, left, right}; for (Browser b : a.ytAll()) b.setRect(top, bottom, left, right); } });
    }

    @JavascriptInterface public void ytShow(final boolean on) { ui(new Runnable() { @Override public void run() { a.yt.show(on); a.fab.refresh(); } }); }

    /* 只換網址，不改變顯示狀態：在 AI 摘要等其他分頁背景讀取影片時，YouTube 畫面不能蓋上來（要顯示由網頁的 ytShow 決定） */
    @JavascriptInterface public void ytLoad(final String url) { ui(new Runnable() { @Override public void run() {
        boolean was = a.yt.shown;
        Browser t = a.ytFor(url != null && url.matches("(?i)^https?://music\\.youtube\\.com.*"));
        a.ytActivate(t);
        a.yt.load(url); if (!was) a.yt.show(false);
    } }); }
    /** YouTube ⇄ YouTube Music 切換：已經開過的直接換上來（保留原本的頁面），沒開過的先在背景載入，畫面出來再換 */
    @JavascriptInterface public void ytSwitch(final boolean music, final String url) { ui(new Runnable() { @Override public void run() {
        final Browser t = a.ytFor(music);
        if (t == a.yt) { t.load(url); return; }
        if (a.ytLoaded(t)) { a.ytActivate(t); return; }
        final boolean vis = a.yt.shown;
        t.onCommit = new Runnable() { @Override public void run() { if (a.yt != t) a.ytActivate(t); } };
        t.wv.loadUrl(url);
        Util.MAIN.postDelayed(new Runnable() { @Override public void run() { if (t.onCommit != null) { t.onCommit = null; a.ytActivate(t); } } }, 3500);
        if (!vis) t.show(false);
    } }); }
    @JavascriptInterface public boolean ytHas(boolean music) { Browser b = music ? a.ytMu : a.ytYt; return b != null && a.ytLoaded(b); }

    /** 聽歌辨識：直接錄目前 YouTube／YouTube Music 頁面正在播的聲音（不暫停播放、不用麥克風） */
    @JavascriptInterface public void ytTap(final String cmd) {
        ui(new Runnable() { @Override public void run() {
            Browser y = a.yt; if (y == null || y.wv == null) { MainActivity.emit("tapAudio", "{\"err\":\"nopage\"}"); return; }
            y.wv.evaluateJavascript("(function(){try{if(window.__wsTap)__wsTap(" + JSONObject.quote(cmd == null ? "" : cmd) + ");else WSPage.tapAudio('{\"err\":\"noscript\"}')}catch(e){}})()", null);
        } });
    }
    @JavascriptInterface public void muCmd(final String c, final String arg) {
        ui(new Runnable() { @Override public void run() {
            Browser m = a.ytMu; if (m == null || m.wv == null) return;
            m.wv.evaluateJavascript("window.__wsMuCmd&&__wsMuCmd(" + JSONObject.quote(c) + "," + JSONObject.quote(arg == null ? "" : arg) + ")", null);
        } });
    }

    @JavascriptInterface public void ytNav(final String what) {
        ui(new Runnable() {
            @Override public void run() {
                Browser y = a.yt;
                switch (what) {
                    case "back": y.goBack(); break;
                    case "fwd": if (y.wv.canGoForward()) y.wv.goForward(); break;
                    case "reload": y.wv.reload(); break;
                    case "stop": y.wv.stopLoading(); break;
                    case "fsOff": y.fullscreen(false, false); a.br.fullscreen(false, false); break;
                    case "fsOn": if (YtSniff.vidOf(y.curUrl).length() > 0) y.fullscreen(true, false); break;
                    case "muStop": { Browser m = a.ytMu != null ? a.ytMu : y; m.wv.evaluateJavascript("(function(){if(window.__wsMuStop)__wsMuStop();else{var v=document.querySelector('video');if(v)v.pause()}})()", null); break; }
                    case "pause": y.wv.evaluateJavascript("(function(){var v=document.querySelector('video');if(v)v.pause()})()", null); break;
                    default: break;
                }
            }
        });
    }

    @JavascriptInterface public String ytState() {
        try { return new JSONObject().put("url", a.yt.curUrl).put("title", a.yt.curTitle).put("br", a.br.curUrl).toString(); } catch (Throwable t) { return "{}"; }
    }

    /** 下載面板：讀取從播放器攔截到的串流與影片資訊 */
    /** 正在開著這部影片的播放器：YouTube（就算在背景）、目前顯示的、或瀏覽分頁；不會選到 YouTube Music（免得打斷正在聽的音樂） */
    private Browser ytOf(String vid) {
        Browser[] c = {a.ytYt, a.yt != a.ytMu ? a.yt : null, a.br};
        for (Browser b : c) if (b != null && YtSniff.vidOf(b.curUrl).equals(vid)) return b;
        return null;
    }
    /** 在背景的 YouTube 載入影片（不切換畫面、不暫停 YouTube Music）：從 YouTube Music 下載時讀影片資訊用 */
    @JavascriptInterface public void ytBgLoad(final String url) { ui(new Runnable() { @Override public void run() {
        Browser t = a.ytFor(false);
        if (t == a.yt) { t.load(url); return; }
        try { t.wv.onResume(); } catch (Throwable e) { /* ignore */ }
        t.bgQuiet = true;
        t.show(false);              /* 一定保持隱藏：只在背景載入，不能蓋到任何畫面上 */
        t.wv.loadUrl(url);
    } }); }
    @JavascriptInterface public void ytBgPause() { ui(new Runnable() { @Override public void run() {
        Browser t = a.ytYt; if (t == null || t == a.yt) return;
        t.wv.evaluateJavascript("(function(){try{[].forEach.call(document.querySelectorAll('video'),function(v){v.muted=true;v.pause()})}catch(e){}})()", null);
    } }); }
    /** 系統的媒體控制（通知列、快速面板、鎖定畫面）顯示正在播的歌 */
    @JavascriptInterface public void mediaMeta(final String json) { KeepAlive.meta(a, json); }

    @JavascriptInterface public String ytSniff(String vid) { return YtSniff.get(vid); }

    @JavascriptInterface public void ytForget(String vid) { YtSniff.forget(vid); }

    /** 請正在播這部影片的播放器切換到指定畫質並短暫播放，讓我們攔截到該畫質的串流網址 */
    @JavascriptInterface public String ytPrep(final String vid, final String q) {
        final Browser b = ytOf(vid);
        if (b == null) return "";
        ui(new Runnable() { @Override public void run() { b.wv.evaluateJavascript("window.__wsYTprep&&__wsYTprep(" + JSONObject.quote(q) + ")", null); } });
        return b.tag;
    }

    @JavascriptInterface public String ytInfoReq(final String vid) {
        final Browser b = ytOf(vid);
        if (b == null) return "";
        ui(new Runnable() { @Override public void run() { b.wv.evaluateJavascript("window.__wsYTinfo&&__wsYTinfo()", null); } });
        return b.tag;
    }

    /** 懸浮下載按鈕 */
    @JavascriptInterface public void fab(final boolean on, final String label) { ui(new Runnable() { @Override public void run() { a.fab.set(on, label); } }); }

    @JavascriptInterface public void brLoad(final String url) { ui(new Runnable() { @Override public void run() { a.br.load(url); } }); }

    @JavascriptInterface public void brNav(final String what) {
        ui(new Runnable() {
            @Override public void run() {
                switch (what) {
                    case "back": a.br.goBack(); break;
                    case "fwd": if (a.br.wv.canGoForward()) a.br.wv.goForward(); break;
                    case "reload": a.br.wv.reload(); break;
                    case "stop": a.br.wv.stopLoading(); break;
                    case "blank": a.br.wv.loadUrl("about:blank"); a.br.curUrl = ""; a.br.show(false); break;
                    case "top": a.br.wv.pageUp(true); break;
                    default: break;
                }
            }
        });
    }

    @JavascriptInterface public void brConfig(final String json) {
        ui(new Runnable() { @Override public void run() { try { a.br.config(new JSONObject(json)); for (Browser b : a.ytAll()) b.config(new JSONObject(json)); } catch (Throwable t) { /* ignore */ } } });
    }

    @JavascriptInterface public String brState() {
        try {
            return new JSONObject().put("url", a.br.curUrl).put("title", a.br.curTitle).put("blockedTotal", AdBlock.blockedTotal.get()).put("rules", AdBlock.count()).toString();
        } catch (Throwable t) { return "{}"; }
    }

    @JavascriptInterface public String brFavicon() { return a.br.faviconB64(); }

    @JavascriptInterface public void brCapture(final String opts) {
        ui(new Runnable() { @Override public void run() { try { JSONObject o = new JSONObject(opts); if (o.optBoolean("bg")) bgRun(o, false); else a.br.capture(o); } catch (Throwable t) { MainActivity.emit("cap", "{\"state\":\"error\",\"msg\":\"設定錯誤\"}"); } } });
    }

    @JavascriptInterface public void brComic(final String opts) {
        ui(new Runnable() { @Override public void run() { try { JSONObject o = new JSONObject(opts); if (o.optBoolean("bg")) bgRun(o, true); else a.br.comic(o); } catch (Throwable t) { /* ignore */ } } });
    }

    /** 背景擷取：在看不到的瀏覽器裡重新開啟同一個網頁，捲動、讀取、產生檔案都在背景進行，不會動到你正在看的畫面 */
    private void bgRun(final JSONObject o, final boolean comic) {
        final String url = a.br.curUrl;
        if (url == null || !url.startsWith("http")) { if (comic) a.br.comic(o); else a.br.capture(o); return; }
        final Browser b = a.hidden("bg");
        MainActivity.emit("cap", "{\"state\":\"progress\",\"pct\":1,\"msg\":\"在背景開啟網頁…\"}");
        b.afterLoad = new Runnable() { @Override public void run() { if (comic) b.comic(o); else b.capture(o); } };
        b.wv.loadUrl(url);
    }

    @JavascriptInterface public void libComic(String id, String opts) {
        try { Comic.fromHtml(a, id, new JSONObject(opts == null || opts.isEmpty() ? "{}" : opts)); } catch (Throwable t) { MainActivity.toast("設定錯誤"); }
    }

    @JavascriptInterface public void setInject(final String name, final String code) { ui(new Runnable() { @Override public void run() { a.injOverride.put(name, code); a.br.setInject(name, code); for (Browser b : a.ytAll()) b.setInject(name, code); } }); }

    @JavascriptInterface public void brMedia(final int minPx) { ui(new Runnable() { @Override public void run() { a.br.scanMedia(minPx); } }); }

    @JavascriptInterface public void brZap(final boolean on) { ui(new Runnable() { @Override public void run() { a.br.zap(on); } }); }

    @JavascriptInterface public void brFill(final String user) { ui(new Runnable() { @Override public void run() { a.br.fill(user); } }); }

    @JavascriptInterface public void clearData(final String what) {
        ui(new Runnable() {
            @Override public void run() {
                if (what.contains("cache")) { a.br.wv.clearCache(true); Util.deleteTree(Lib.get(a).tmp); Lib.get(a).tmp.mkdirs(); }
                if (what.contains("cookies")) { CookieManager.getInstance().removeAllCookies(null); CookieManager.getInstance().flush(); WebStorage.getInstance().deleteAllData(); }
                if (what.contains("history")) a.br.wv.clearHistory();
                MainActivity.toast("已清除");
                MainActivity.emit("lib", "");
            }
        });
    }

    /* ---------- 密碼 ---------- */
    @JavascriptInterface public String credList() { return Creds.get(a).listJson(); }

    @JavascriptInterface public boolean credSavePending(String host) { return a.br.savePending(host); }

    @JavascriptInterface public void credNever(String host, boolean on) { Creds.get(a).setNever(host, on); }

    @JavascriptInterface public boolean credSave(String host, String user, String pass) { return Creds.get(a).save(host.trim().toLowerCase(), user, pass); }

    @JavascriptInterface public void credDel(String host, String user) { Creds.get(a).del(host, user); }

    @JavascriptInterface public String credReveal(String host, String user) { String p = Creds.get(a).password(host, user); return p == null ? "" : p; }

    /* ---------- 媒體下載 ---------- */
    @JavascriptInterface public void dlStart(String json) {
        try { MediaDl.start(a, new JSONObject(json)); } catch (Throwable t) { MainActivity.toast("下載設定錯誤"); }
    }

    @JavascriptInterface public void dlCancel() { MediaDl.cancel(""); }
    @JavascriptInterface public void dlCancelJob(String id) { MediaDl.cancel(id); }
    @JavascriptInterface public void dlMax(int n) { a.prefs.edit().putInt("dlMax", n).apply(); MediaDl.setMax(n); }
    @JavascriptInterface public int dlMaxGet() { return a.prefs.getInt("dlMax", 3); }
    @JavascriptInterface public int dlRunning() { return MediaDl.JOBS.size(); }
    /* ---------- 上鎖 ---------- */
    @JavascriptInterface public boolean lockHas() { return Lock.has(a); }
    @JavascriptInterface public int lockLen() { return Lock.len(a); }
    /** 短震動（按鍵回饋）：ms 毫秒；ms＜0 代表「成功」的兩下震動 */
    @JavascriptInterface public void buzzAmp(int ms, int amp) {
        try {
            android.os.Vibrator v = (android.os.Vibrator) a.getSystemService(android.content.Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            int am = v.hasAmplitudeControl() ? Math.max(1, Math.min(255, amp)) : android.os.VibrationEffect.DEFAULT_AMPLITUDE;
            v.vibrate(android.os.VibrationEffect.createOneShot(Math.max(5, Math.min(400, ms)), am));
        } catch (Throwable t) { /* ignore */ }
    }
    @JavascriptInterface public void buzz(int ms) {
        try {
            android.os.Vibrator v = (android.os.Vibrator) a.getSystemService(android.content.Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            if (ms < 0) v.vibrate(android.os.VibrationEffect.createWaveform(new long[] {0, 40, 70, 60}, -1));
            else v.vibrate(android.os.VibrationEffect.createOneShot(Math.max(5, Math.min(400, ms)), android.os.VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Throwable t) { /* ignore */ }
    }
    /** 剪輯影片（不重新編碼）：保留 start～end 秒；replace＝覆蓋原檔，否則另存新檔 */
    @JavascriptInterface public void vidTrim(final String id, final double start, final double end, final boolean replace) {
        Util.IO.execute(new Runnable() {
            @Override public void run() {
                try {
                    Lib lib = Lib.get(a);
                    JSONObject src = lib.find(id);
                    if (src == null) throw new Exception("找不到檔案");
                    File in = lib.fileOf(src);
                    String name = src.optString("name"), ext = Util.extOf(name).toLowerCase();
                    boolean webm = ext.equals("webm");
                    File out = lib.tmpFile(webm ? "webm" : "mp4");
                    Mux.trim(in, out, (long) (start * 1e6), end > 0 ? (long) (end * 1e6) : Long.MAX_VALUE, webm ? android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM : android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
                    String stem = name.replaceAll("\\.[^.]+$", "");
                    JSONObject it = lib.add(out, replace ? stem + (webm ? ".webm" : ".mp4") : stem + "_剪輯" + (webm ? ".webm" : ".mp4"), webm ? "video/webm" : "video/mp4", src.optString("src"), src.optString("title"), null);
                    String[] keep = {"folder", "subs"};
                    for (String k : keep) if (src.has(k)) { lib.touch(it.getString("id"), k, src.get(k)); it.put(k, src.get(k)); }
                    if (replace) lib.delete(new JSONArray().put(id));
                    MainActivity.emit("trim", new JSONObject().put("ok", true).put("item", it).put("replaced", replace).put("old", id).toString());
                    MainActivity.emit("lib", "");
                } catch (Throwable e) {
                    try { MainActivity.emit("trim", new JSONObject().put("ok", false).put("err", String.valueOf(e.getMessage())).toString()); } catch (Throwable x) { /* ignore */ }
                }
            }
        });
    }
    @JavascriptInterface public boolean lockSession() { return Lock.session; }
    @JavascriptInterface public void lockRelock() { Lock.session = false; }
    @JavascriptInterface public String lockSet(String oldPin, String pin) { return Lock.set(a, oldPin, pin); }
    @JavascriptInterface public boolean lockClear(String pin) { return Lock.clear(a, pin); }
    @JavascriptInterface public String lockCheck(String pin) { return Lock.check(a, pin).toString(); }
    @JavascriptInterface public boolean lockBioOk() { return Lock.bioAvailable(a); }
    @JavascriptInterface public void lockBio(final String title) { ui(new Runnable() { @Override public void run() { Lock.bio(a, title); } }); }
    @JavascriptInterface public int intruderPending() { return Lock.pending(a); }
    @JavascriptInterface public void intruderSeen() { Lock.seen(a); }
    @JavascriptInterface public void intruderNotify() { Lock.notifyPending(a); }
    @JavascriptInterface public void intruderCam(boolean on) { a.prefs.edit().putBoolean("intruderCam", on).apply(); }
    @JavascriptInterface public boolean intruderCamGet() { return a.prefs.getBoolean("intruderCam", true); }
    @JavascriptInterface public boolean camOk() { return a.checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED; }
    @JavascriptInterface public void camAsk() { ui(new Runnable() { @Override public void run() { a.requestPermissions(new String[] {android.Manifest.permission.CAMERA}, 1011); } }); }

    /* ---------- 多分頁 ---------- */
    @JavascriptInterface public String tabsList() {
        JSONArray out = new JSONArray();
        try { for (Browser b : a.tabs) out.put(new JSONObject().put("id", b.tabId).put("url", b.curUrl == null ? "" : b.curUrl).put("title", b.curTitle == null ? "" : b.curTitle).put("cur", b == a.br)); } catch (Throwable t) { /* ignore */ }
        return out.toString();
    }
    @JavascriptInterface public void tabNew(final String url) { ui(new Runnable() { @Override public void run() { Browser b = a.newTab(); if (url != null && !url.isEmpty()) b.load(url); } }); }
    @JavascriptInterface public void tabSwitch(final int id) { ui(new Runnable() { @Override public void run() { a.switchTab(id); } }); }
    @JavascriptInterface public void tabClose(final int id) { ui(new Runnable() { @Override public void run() { a.closeTab(id); MainActivity.emit("tabs", ""); } }); }
    @JavascriptInterface public void tabCloseAll() {
        ui(new Runnable() { @Override public void run() {
            int keep = a.br.tabId;
            for (Browser b : new java.util.ArrayList<>(a.tabs)) if (b.tabId != keep) a.closeTab(b.tabId);
            a.closeTab(keep);
            MainActivity.emit("tabs", "");
        } });
    }

    /* ---------- 手機內建螢幕錄影 ---------- */
    @JavascriptInterface public boolean dndOk() { return ScreenRec.dndAllowed(a); }
    @JavascriptInterface public void dndSettings() { ui(new Runnable() { @Override public void run() { ScreenRec.openDndSettings(a); } }); }
    /* 聽歌辨識：用麥克風錄一小段（AAC），回傳 base64 */
    private android.media.MediaRecorder micRec; private java.io.File micFile;
    @JavascriptInterface public boolean micStart() {
        try {
            micStop0();
            micFile = new java.io.File(a.getCacheDir(), "listen.aac");
            micRec = new android.media.MediaRecorder();
            micRec.setAudioSource(android.media.MediaRecorder.AudioSource.MIC);
            micRec.setOutputFormat(android.media.MediaRecorder.OutputFormat.AAC_ADTS);
            micRec.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC);
            micRec.setAudioChannels(1); micRec.setAudioSamplingRate(44100); micRec.setAudioEncodingBitRate(96000);
            micRec.setOutputFile(micFile.getAbsolutePath());
            micRec.prepare(); micRec.start();
            return true;
        } catch (Throwable t) { micStop0(); return false; }
    }
    private void micStop0() { try { if (micRec != null) { try { micRec.stop(); } catch (Throwable t) { /* 太短 */ } micRec.release(); } } catch (Throwable t) { /* ignore */ } micRec = null; }
    @JavascriptInterface public String micStop() {
        micStop0();
        try {
            if (micFile == null || !micFile.exists() || micFile.length() < 2000) return "";
            java.io.FileInputStream in = new java.io.FileInputStream(micFile);
            byte[] b = new byte[(int) micFile.length()]; int o = 0, r;
            try { while (o < b.length && (r = in.read(b, o, b.length - o)) > 0) o += r; } finally { in.close(); }
            micFile.delete();
            return android.util.Base64.encodeToString(b, 0, o, android.util.Base64.NO_WRAP);
        } catch (Throwable t) { return ""; }
    }
    @JavascriptInterface public boolean audioOk() { return a.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED; }
    @JavascriptInterface public void audioAsk() { ui(new Runnable() { @Override public void run() { a.requestPermissions(new String[] {android.Manifest.permission.RECORD_AUDIO}, 1010); } }); }
    @JavascriptInterface public void srecAsk(final String name) { ui(new Runnable() { @Override public void run() { ScreenRec.ask(a, name); } }); }
    @JavascriptInterface public void srecStop() { ui(new Runnable() { @Override public void run() { ScreenRec.stop(a); } }); }
    @JavascriptInterface public boolean srecOn() { return ScreenRec.cur != null; }
    /** 懸浮控制鈕：ready＝準備（還沒錄影）、rec＝錄影中、hide＝收起 */
    @JavascriptInterface public void recCtl(String mode) {
        if ("hide".equals(mode)) RecCtl.get(a).hide(); else RecCtl.get(a).show("rec".equals(mode));
    }
    /** 在瀏覽分頁執行一段程式，結果用指定的事件回傳 */
    @JavascriptInterface public void brRun(final String js, final String ev) {
        ui(new Runnable() { @Override public void run() {
            a.br.wv.evaluateJavascript(js, new android.webkit.ValueCallback<String>() {
                @Override public void onReceiveValue(String v) { if (ev != null && !ev.isEmpty()) MainActivity.emit(ev, v == null ? "null" : v); }
            });
        } });
    }

    /* ---------- 外部下載 App 自動匯入 ---------- */
    @JavascriptInterface public String watchDirs() { return Importer.dirs(a).toString(); }
    @JavascriptInterface public void watchAdd() { watchAddFor("", ""); }
    @JavascriptInterface public void watchAddFor(final String pkg, final String label) { ui(new Runnable() { @Override public void run() { a.pickWatch(pkg, label); } }); }
    @JavascriptInterface public void watchRemoveFor(String uri, String pkg) {
        try {
            JSONArray d = Importer.dirs(a), out = new JSONArray();
            for (int i = 0; i < d.length(); i++) { JSONObject o = d.getJSONObject(i); if (!(o.optString("uri").equals(uri) && o.optString("pkg").equals(pkg))) out.put(o); }
            a.prefs.edit().putString("watchDirs", out.toString()).apply();
        } catch (Throwable t) { /* ignore */ }
        MainActivity.emit("watchDirs", Importer.dirs(a).toString());
    }
    /** 可以接收分享網址的 App（下載工具、瀏覽器…）：名稱、套件名、小圖示 */
    @JavascriptInterface public String shareApps() {
        JSONArray out = new JSONArray();
        try {
            android.content.pm.PackageManager pm = a.getPackageManager();
            android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain");
            java.util.HashSet<String> seen = new java.util.HashSet<>();
            for (android.content.pm.ResolveInfo ri : pm.queryIntentActivities(i, 0)) {
                String pkg = ri.activityInfo.packageName;
                if (pkg.equals(a.getPackageName()) || !seen.add(pkg)) continue;
                String icon = "";
                try {
                    android.graphics.drawable.Drawable d = ri.loadIcon(pm);
                    android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(72, 72, android.graphics.Bitmap.Config.ARGB_8888);
                    android.graphics.Canvas c = new android.graphics.Canvas(bm);
                    d.setBounds(0, 0, 72, 72); d.draw(c);
                    java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                    bm.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, bo);
                    icon = "data:image/png;base64," + android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP);
                } catch (Throwable t) { /* ignore */ }
                out.put(new JSONObject().put("pkg", pkg).put("label", String.valueOf(pm.getApplicationLabel(ri.activityInfo.applicationInfo))).put("icon", icon));
            }
        } catch (Throwable t) { /* ignore */ }
        return out.toString();
    }
    /** 可以開這個網址的 App（view: true）＋手機桌面上所有的 App（給使用者自己指定） */
    @JavascriptInterface public String viewApps(String url) {
        JSONArray out = new JSONArray();
        try {
            android.content.pm.PackageManager pm = a.getPackageManager();
            java.util.HashSet<String> seen = new java.util.HashSet<>();
            android.content.Intent v = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)).addCategory(android.content.Intent.CATEGORY_BROWSABLE);
            int flag = android.os.Build.VERSION.SDK_INT >= 23 ? android.content.pm.PackageManager.MATCH_ALL : 0;
            for (android.content.pm.ResolveInfo ri : pm.queryIntentActivities(v, flag)) addApp(out, seen, pm, ri, true);
            android.content.Intent l = new android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_LAUNCHER);
            for (android.content.pm.ResolveInfo ri : pm.queryIntentActivities(l, 0)) addApp(out, seen, pm, ri, false);
        } catch (Throwable t) { /* ignore */ }
        return out.toString();
    }
    private void addApp(JSONArray out, java.util.HashSet<String> seen, android.content.pm.PackageManager pm, android.content.pm.ResolveInfo ri, boolean view) throws Exception {
        String pkg = ri.activityInfo.packageName;
        if (pkg.equals(a.getPackageName()) || !seen.add(pkg)) return;
        String icon = "";
        try {
            android.graphics.drawable.Drawable d = ri.loadIcon(pm);
            android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(72, 72, android.graphics.Bitmap.Config.ARGB_8888);
            android.graphics.Canvas c = new android.graphics.Canvas(bm);
            d.setBounds(0, 0, 72, 72); d.draw(c);
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            bm.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, bo);
            icon = "data:image/png;base64," + android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP);
        } catch (Throwable t) { /* ignore */ }
        out.put(new JSONObject().put("pkg", pkg).put("label", String.valueOf(pm.getApplicationLabel(ri.activityInfo.applicationInfo))).put("icon", icon).put("view", view));
    }
    /** 用指定的 App 開網址；那個 App 不接受網址就直接打開 App */
    @JavascriptInterface public boolean openWith(final String pkg, final String url) {
        try {
            android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)).setPackage(pkg).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(a.getPackageManager()) != null) { a.startActivity(i); return true; }
        } catch (Throwable t) { /* 改用直接開啟 */ }
        try {
            android.content.Intent l = a.getPackageManager().getLaunchIntentForPackage(pkg);
            if (l == null) return false;
            a.startActivity(l.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (Throwable t) { return false; }
    }
    @JavascriptInterface public boolean pkgInstalled(String pkg) {
        try { a.getPackageManager().getPackageInfo(pkg, 0); return true; } catch (Throwable t) { return false; }
    }
    @JavascriptInterface public void watchRemove(String uri) { Importer.removeDir(a, uri); MainActivity.emit("watchDirs", Importer.dirs(a).toString()); }
    @JavascriptInterface public void pickFiles() { ui(new Runnable() { @Override public void run() { a.pickFiles(); } }); }
    @JavascriptInterface public void watchScan() { Importer.scan(a, true); }
    @JavascriptInterface public void importDel(boolean on) { a.prefs.edit().putBoolean("importDel", on).apply(); }
    @JavascriptInterface public boolean importDelGet() { return a.prefs.getBoolean("importDel", true); }
    /** 用系統分享選單交給其他下載 App；之後自動檢查下載資料夾 */
    @JavascriptInterface public void shareDl(final String text) {
        ui(new Runnable() { @Override public void run() {
            try {
                android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT, text);
                a.startActivity(android.content.Intent.createChooser(i, "交給哪個 App 下載？").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
                Importer.pending(a);
            } catch (Throwable t) { MainActivity.toast("無法開啟分享選單"); }
        } });
    }
    /** 把網址交給指定的 App（例如 Snaptube）；沒裝就回傳 false */
    @JavascriptInterface public boolean sendTo(String pkg, String text) {
        try {
            android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT, text).setPackage(pkg).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(i);
            ui(new Runnable() { @Override public void run() { Importer.pending(a); } });
            return true;
        } catch (Throwable t) { return false; }
    }

    @JavascriptInterface public void hlsInfo(String url, String ref) { MediaDl.hlsInfo(url, ref); }

    /* ---------- 通用 HTTP（介面的 YouTube 解析等，不受 CORS 限制） ---------- */
    @JavascriptInterface public void http(final String id, final String method, final String url, final String headersJson, final String body, final boolean cookies) {
        Util.IO.execute(new Runnable() {
            @Override public void run() {
                JSONObject o = new JSONObject();
                try {
                    java.util.Map<String, String> hd = new java.util.HashMap<>();
                    if (headersJson != null && !headersJson.isEmpty()) {
                        JSONObject h = new JSONObject(headersJson);
                        java.util.Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); hd.put(k, h.getString(k)); }
                    }
                    String[] r = Fetcher.request(method, url, hd, body == null || body.isEmpty() ? null : body, cookies);
                    o.put("id", id).put("status", Integer.parseInt(r[0])).put("body", r[1]);
                } catch (Throwable t) {
                    try { o.put("id", id).put("status", 0).put("err", String.valueOf(t.getMessage())); } catch (Throwable x) { /* ignore */ }
                }
                MainActivity.emit("http", o.toString());
            }
        });
    }

    /* ---------- 檔案庫 ---------- */
    private final java.util.Map<String, File> chunks = new java.util.HashMap<>();

    /** 分段寫入大檔（介面轉檔後的 WAV／FLAC／MP3），最後一段才加入檔案庫 */
    @JavascriptInterface public String libSaveChunk(String token, String b64, boolean last, String name, String mime, String metaJson) {
        try {
            File f;
            synchronized (chunks) {
                f = chunks.get(token);
                if (f == null) { f = Lib.get(a).tmpFile(Util.extOf(name)); chunks.put(token, f); }
            }
            java.io.FileOutputStream os = new java.io.FileOutputStream(f, true);
            os.write(Base64.decode(b64, Base64.DEFAULT));
            os.close();
            if (!last) return "{\"ok\":true}";
            synchronized (chunks) { chunks.remove(token); }
            JSONObject m = metaJson == null || metaJson.isEmpty() ? new JSONObject() : new JSONObject(metaJson);
            android.graphics.Bitmap tb = null;
            String thumbFrom = m.optString("thumbFrom", "");
            if (!thumbFrom.isEmpty()) {
                File tf = new File(Lib.get(a).thumbs, thumbFrom + ".jpg");
                if (tf.exists()) tb = android.graphics.BitmapFactory.decodeFile(tf.getPath());
            }
            JSONObject o = Lib.get(a).add(f, name, mime, m.optString("src"), m.optString("title"), tb);
            java.util.Iterator<String> it = m.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (k.equals("artist") || k.equals("album") || k.equals("folder") || k.equals("seq") || k.equals("lrc") || k.equals("lrcSrc") || k.equals("dur") || k.equals("lrcOff")) { Lib.get(a).touch(o.getString("id"), k, m.get(k)); o.put(k, m.get(k)); }
            }
            return new JSONObject().put("ok", true).put("item", o).toString();
        } catch (Throwable t) { return err(t); }
    }

    /** 分段寫入，最後一段把檔案庫裡「同一個檔案」整個換成新內容（文件編輯後存檔用；其他資訊不變） */
    @JavascriptInterface public String libOverwriteChunk(String token, String b64, boolean last, String id) {
        try {
            File f;
            synchronized (chunks) {
                f = chunks.get(token);
                if (f == null) { f = Lib.get(a).tmpFile("bin"); chunks.put(token, f); }
            }
            java.io.FileOutputStream os = new java.io.FileOutputStream(f, true);
            os.write(Base64.decode(b64, Base64.DEFAULT));
            os.close();
            if (!last) return "{\"ok\":true}";
            synchronized (chunks) { chunks.remove(token); }
            File dst = Lib.get(a).fileOf(id);
            if (dst == null) { f.delete(); return "{\"ok\":false,\"error\":\"找不到原檔\"}"; }
            File bak = new File(dst.getPath() + ".bak");
            if (dst.exists() && !dst.renameTo(bak)) { Util.copyFile(dst, bak); }
            if (!f.renameTo(dst)) { Util.copyFile(f, dst); f.delete(); }
            bak.delete();
            Lib.get(a).touch(id, "size", dst.length());
            Lib.get(a).touch(id, "time", System.currentTimeMillis());
            return new JSONObject().put("ok", true).put("size", dst.length()).toString();
        } catch (Throwable t) { return err(t); }
    }

    @JavascriptInterface public void libMeta(String id, String json) {
        try {
            JSONObject m = new JSONObject(json);
            java.util.Iterator<String> it = m.keys();
            while (it.hasNext()) { String k = it.next(); if (!k.equals("id") && !k.equals("file") && !k.equals("path")) Lib.get(a).touch(id, k, m.get(k)); }
        } catch (Throwable t) { /* ignore */ }
    }

    @JavascriptInterface public String libList() { return Lib.get(a).listJson(); }

    @JavascriptInterface public String libStats() { return Lib.get(a).stats(a); }

    @JavascriptInterface public int libDelete(String idsJson) {
        try { int n = Lib.get(a).delete(new JSONArray(idsJson)); return n; } catch (Throwable t) { return 0; }
    }

    @JavascriptInterface public boolean libRename(String id, String name) { return Lib.get(a).rename(id, name); }

    @JavascriptInterface public String libSave(String name, String mime, String b64, String src, String title) {
        try {
            JSONObject o = Lib.get(a).addBytes(Base64.decode(b64, Base64.DEFAULT), name, mime, src, title, null);
            return new JSONObject().put("ok", true).put("item", o).toString();
        } catch (Throwable t) { return err(t); }
    }

    @JavascriptInterface public String libText(String id, int max) {
        try {
            File f = Lib.get(a).fileOf(id);
            byte[] b = Util.readAllBytes(new java.io.FileInputStream(f), 0);
            String s = new String(b, "UTF-8");
            return max > 0 && s.length() > max ? s.substring(0, max) : s;
        } catch (Throwable t) { return ""; }
    }

    @JavascriptInterface public void libExport(String idsJson, String how) {
        try {
            JSONArray items = new JSONArray();
            for (JSONObject o : Lib.get(a).pick(new JSONArray(idsJson))) items.put(o);
            if (how.equals("downloads")) Exporter.toDownloads(a, items, false);
            else if (how.equals("tree")) {
                final JSONArray it2 = items;
                ui(new Runnable() { @Override public void run() { Exporter.toTree(a, it2); } });
            } else if (how.equals("pickTree")) {
                final JSONArray it3 = items;
                a.prefs.edit().remove("tree").apply();
                ui(new Runnable() { @Override public void run() { Exporter.toTree(a, it3); } });
            } else if (how.equals("share")) {
                final JSONArray it4 = items;
                ui(new Runnable() { @Override public void run() { Exporter.share(a, it4); } });
            } else if (how.equals("open") && items.length() > 0) {
                final JSONObject o = items.getJSONObject(0);
                ui(new Runnable() { @Override public void run() { Exporter.openWith(a, o); } });
            }
        } catch (Throwable t) { MainActivity.toast("匯出失敗：" + t.getMessage()); }
    }

    @JavascriptInterface public void libZip(final String idsJson, final String name) {
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                try {
                    Lib lib = Lib.get(a);
                    java.util.List<JSONObject> items = lib.pick(new JSONArray(idsJson));
                    File z = lib.tmpFile("zip");
                    java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(z));
                    zos.setLevel(java.util.zip.Deflater.BEST_SPEED);
                    java.util.HashSet<String> used = new java.util.HashSet<>();
                    byte[] buf = new byte[131072];
                    for (JSONObject o : items) {
                        String nm = o.optString("name");
                        int k = 2;
                        while (!used.add(nm.toLowerCase())) nm = "(" + (k++) + ") " + o.optString("name");
                        zos.putNextEntry(new java.util.zip.ZipEntry(nm));
                        java.io.FileInputStream in = new java.io.FileInputStream(lib.fileOf(o));
                        int n;
                        while ((n = in.read(buf)) > 0) zos.write(buf, 0, n);
                        in.close();
                        zos.closeEntry();
                    }
                    zos.close();
                    lib.add(z, Util.safeName(name) + ".zip", "application/zip", "", name, null);
                    MainActivity.toast("✓ 已打包成 ZIP，存入檔案庫");
                    MainActivity.emit("lib", "");
                } catch (Throwable t) { MainActivity.toast("打包失敗：" + t.getMessage()); }
            }
        });
    }

    @JavascriptInterface public String treeName() {
        String t = a.prefs.getString("tree", "");
        if (t.isEmpty()) return "";
        String s = Uri.decode(Uri.parse(t).getLastPathSegment() == null ? "" : Uri.parse(t).getLastPathSegment());
        return s.contains(":") ? s.substring(s.indexOf(':') + 1) : s;
    }

    @JavascriptInterface public void libToPdf(final String id, final String optsJson) {
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject o = Lib.get(a).find(id);
                    if (o == null) throw new Exception("找不到檔案");
                    String nm = o.optString("name").replaceAll("\\.html?$", "") + ".pdf";
                    JSONObject r = Pdf.renderSync(a, Lib.get(a).fileOf(o), nm, o.optString("src"), o.optString("title"), new JSONObject(optsJson));
                    MainActivity.emit("pdf", new JSONObject().put("ok", true).put("item", r).toString());
                    MainActivity.emit("lib", "");
                } catch (Throwable t) {
                    try { MainActivity.emit("pdf", new JSONObject().put("ok", false).put("err", String.valueOf(t.getMessage())).toString()); } catch (Throwable x) { /* ignore */ }
                }
            }
        });
    }

    @JavascriptInterface public void libPrint(final String id) {
        ui(new Runnable() {
            @Override public void run() {
                JSONObject o = Lib.get(a).find(id);
                if (o != null) Pdf.systemPrint(a, Lib.get(a).fileOf(o), o.optString("name").replaceAll("\\.html?$", ""));
            }
        });
    }

    /* ---------- 離線網頁檢視器 ---------- */
    @JavascriptInterface public void vwOpen(final String id, final float top, final float bottom) { ui(new Runnable() { @Override public void run() { a.vw.open(id, top, bottom); } }); }

    @JavascriptInterface public void vwRect(final float top, final float bottom) { ui(new Runnable() { @Override public void run() { a.vw.setRect(top, bottom); } }); }

    @JavascriptInterface public void vwClose() { ui(new Runnable() { @Override public void run() { a.vw.close(); } }); }

    /* ---------- Wi-Fi 傳到電腦 ---------- */
    @JavascriptInterface public String wifiStart() { try { return WifiServer.start(a); } catch (Throwable t) { return err(t); } }

    @JavascriptInterface public void wifiStop() { WifiServer.stop(); }

    @JavascriptInterface public boolean wifiOn() { return WifiServer.running(); }

    /* ---------- App 內更新 ---------- */
    @JavascriptInterface public boolean canInstall() { return a.getPackageManager().canRequestPackageInstalls(); }

    @JavascriptInterface public void askInstall() {
        ui(new Runnable() {
            @Override public void run() {
                try { a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName()))); } catch (Throwable t) { /* ignore */ }
            }
        });
    }

    @JavascriptInterface public void installApk(String url) { Updater.start(a, url); }

    /* 舊介面相容：存檔到下載資料夾 */
    @JavascriptInterface public String saveFile(String name, String mime, String b64) {
        try {
            JSONObject o = Lib.get(a).addBytes(Base64.decode(b64, Base64.DEFAULT), name, mime, "", name, null);
            Exporter.toDownloads(a, new JSONArray().put(o), false);
            return new JSONObject().put("ok", true).put("path", "下載/" + Exporter.FOLDER + "/" + o.optString("name")).toString();
        } catch (Throwable t) { return err(t); }
    }

    /* ---------- AI 摘要：Claude 訂閱引擎（背景 claude.ai 工作頁）＋小播放器 ---------- */
    @JavascriptInterface public void cengStart(String url) { ClaudeEngine.start(a, url); }
    @JavascriptInterface public void cengStop() { ClaudeEngine.stop(a); }
    @JavascriptInterface public String cengState() { return ClaudeEngine.state(); }
    @JavascriptInterface public void cengReq(String id, String json) { ClaudeEngine.request(id, json); }
    @JavascriptInterface public void openClaude(final String url) {
        ui(new Runnable() { @Override public void run() {
            android.content.Intent i = new android.content.Intent(a, ClaudeActivity.class);
            i.putExtra("url", url);
            a.startActivity(i);
        } });
    }
    @JavascriptInterface public void aipLoad(final String id, final int start, final boolean autoplay) { ui(new Runnable() { @Override public void run() { AiPlayer.load(a, id, start, autoplay); } }); }
    @JavascriptInterface public void aipRect(final float top, final float left, final float w, final float hh) { ui(new Runnable() { @Override public void run() { AiPlayer.rect(a, top, left, w, hh); } }); }
    @JavascriptInterface public void aipShow(final boolean on) { ui(new Runnable() { @Override public void run() { AiPlayer.show(on); } }); }
    @JavascriptInterface public void aipSeek(final double sec, final boolean play) { ui(new Runnable() { @Override public void run() { AiPlayer.seek(sec, play); } }); }
    @JavascriptInterface public void aipToggle() { ui(new Runnable() { @Override public void run() { AiPlayer.toggle(); } }); }
    @JavascriptInterface public String aipState() { return AiPlayer.state(); }
    @JavascriptInterface public void aiPost(String id, String url, String headers, String body, int retries) { AiHttp.post(a, id, url, headers, body, retries); }
    @JavascriptInterface public String aiTake(String id) { return AiHttp.take(id); }
    @JavascriptInterface public void aiCancel(String id) { AiHttp.cancel(id); }
    @JavascriptInterface public void aiLabel(String s) { AiHttp.setLabel(a, s); }
    @JavascriptInterface public void aiNotice(String head, String text) { KeepAlive.notice(a, head, text); }
    @JavascriptInterface public boolean appVisible() { return MainActivity.visible; }
}
