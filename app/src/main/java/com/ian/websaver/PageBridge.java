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

    @JavascriptInterface public void zapCount(int n) { MainActivity.emit("zap", "{\"n\":" + n + ",\"on\":true}"); }

    @JavascriptInterface public void zapDone(int n) { MainActivity.emit("zap", "{\"n\":" + n + ",\"on\":false}"); }
}
