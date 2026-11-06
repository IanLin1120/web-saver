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

    @JavascriptInterface public void ytDl(String id) { MainActivity.emit("ytdl", id); }

    /* YouTube 錄製下載（背景播放器） */
    @JavascriptInterface public void grabMime(String kind, String mime) { YtGrab.mime(kind, mime); }

    @JavascriptInterface public void grabData(String kind, String b64, boolean reset) { YtGrab.data(kind, b64, reset); }

    @JavascriptInterface public void grabProg(double pct, String note) { YtGrab.progress(pct, note); }

    @JavascriptInterface public void grabDone(String err) { YtGrab.finish(err); }

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
