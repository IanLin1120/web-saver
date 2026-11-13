package com.ian.websaver;

import android.webkit.JavascriptInterface;

/** 瀏覽器頁面裡的 window.WSPage：只接受 App 發起的擷取／媒體偵測（用一次性 token 驗證），網站本身無法利用。 */
public class PageBridge {
    private final Browser b;

    PageBridge(Browser br) { b = br; }

    @JavascriptInterface public void fetch(String token, String id, String url, String kind) { b.fetchFor(token, id, url, kind); }

    @JavascriptInterface public void progress(String token, int pct, String msg) {
        if (!token.equals(b.capToken)) return;
        try { MainActivity.emit("cap", new org.json.JSONObject().put("state", "progress").put("pct", pct).put("msg", msg).toString()); } catch (Throwable t) { /* ignore */ }
    }

    @JavascriptInterface public void result(String token, int i, int n, String chunk, String title) { b.capResult(token, i, n, chunk, title); }

    @JavascriptInterface public void fail(String token, String msg) { b.capFail(token, msg); }

    @JavascriptInterface public void media(String token, String json) { b.mediaResult(token, json); }

    @JavascriptInterface public void pwField(final String host) { Util.ui(new Runnable() { @Override public void run() { b.pwField(host); } }); }

    @JavascriptInterface public void pwOffer(final String host, final String user, final String pass) {
        Util.ui(new Runnable() { @Override public void run() { b.pwOffer(host, user, pass); } });
    }

    @JavascriptInterface public void video(final boolean playing, final int w, final int h) { Util.ui(new Runnable() { @Override public void run() { b.videoState(playing, w, h); } }); }

    @JavascriptInterface public void blobChunk(String tok, String b64, boolean last, String name, String mime) { b.blobChunk(tok, b64, last, name, mime); }
    @JavascriptInterface public String pickStream() { return b.pickStream(); }

    @JavascriptInterface public void webVideo(String json) { b.webVideo(json); }

    @JavascriptInterface public void webVideoBlob(String json) { b.webVideoBlob(json); }

    /** 內建播放器開著嗎（設定開、是主瀏覽器、這個網頁沒有選「改回網頁裡播放」） */
    @JavascriptInterface public boolean vpOn() {
        return "br".equals(b.tag) && !"0".equals(b.a.prefs.getString("u_webVp", "1")) && (b.vpOffUrl.isEmpty() || !b.vpOffUrl.equals(b.curUrl));
    }
    @JavascriptInterface public boolean vpHeld() { return b.vpHold; }
    @JavascriptInterface public void vpHold(boolean on) { b.vpHold = on; }
    @JavascriptInterface public String vpResult(String tok) { String r = b.vpRes.get(tok); return r == null ? "" : r; }

    @JavascriptInterface public void muState(String json) { MainActivity.emit("muState", json); }
    /** 聽歌辨識：頁面把正在播的聲音（不經麥克風）錄好後傳回來 */
    @JavascriptInterface public void tapAudio(String json) { MainActivity.emit("tapAudio", json); }

    @JavascriptInterface public void ytDl(String id) { MainActivity.emit("ytdl", id); }

    /** 網頁上正在播放的影片（下載面板用來找出真正的影片） */
    @JavascriptInterface public void played(String json) { b.notePlayed(json); }

    /* YouTube 錄製下載（背景播放器） */
    @JavascriptInterface public void grabMime(String kind, String mime) { YtGrab.mime(kind, mime); }

    @JavascriptInterface public void grabData(String kind, String b64, boolean reset) { YtGrab.data(kind, b64, reset); }

    @JavascriptInterface public void grabProg(double pct, String note) { YtGrab.progress(pct, note); }

    @JavascriptInterface public void grabDone(String err) { YtGrab.finish(err); }

    @JavascriptInterface public void srecEnd() { Util.ui(new Runnable() { @Override public void run() { ScreenRec.stop(b.a); } }); }

    @JavascriptInterface public void ytStream(String url) { if (url != null && url.contains("googlevideo.com/videoplayback")) YtSniff.note(b, url); }

    @JavascriptInterface public void ytInfo(String vid, String json) { YtSniff.info(vid, json); MainActivity.emit("ytInfo", vid); }

    @JavascriptInterface public void fullscreen(final boolean on, final boolean land) { Util.ui(new Runnable() { @Override public void run() { b.fullscreen(on, land); } }); }

    @JavascriptInterface public void ytOpenTab(final String url) { MainActivity.emit("ytOpen", url); }

    @JavascriptInterface public void brightness(final float v) { Util.ui(new Runnable() { @Override public void run() { b.brightness(v); } }); }

    @JavascriptInterface public void pip() { Util.ui(new Runnable() { @Override public void run() { b.a.enterPip(true); } }); }

    @JavascriptInterface public void comicList(String token, String json) { b.comicList(token, json); }

    @JavascriptInterface public void zapCount(int n) { MainActivity.emit("zap", "{\"n\":" + n + ",\"on\":true}"); }

    @JavascriptInterface public void zapDone(int n) { MainActivity.emit("zap", "{\"n\":" + n + ",\"on\":false}"); }
}
