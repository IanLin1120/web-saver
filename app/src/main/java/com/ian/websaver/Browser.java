package com.ian.websaver;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Message;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** 內建瀏覽器：一個原生 WebView 疊在 App 介面上（位置由網頁介面決定），負責廣告阻擋、彈出視窗、擷取與媒體偵測。 */
final class Browser {
    final MainActivity a;
    WebView wv;
    private FrameLayout popupHost;
    private WebView popup;
    private TextView popupTitle;
    volatile String curUrl = "", curHost = "", curTitle = "";
    private boolean shown = false, covered = false;
    int progress = 100;
    private int lastInjectBucket = -1;
    Bitmap favicon;

    /* 設定（由網頁介面 br_config 傳入） */
    String mode = "mobile", popups = "smart";
    boolean ads = true, pw = true, autoReader = false, ytAds = true;
    int textZoom = 100;

    /* 擷取 */
    volatile String capToken = "";
    private JSONObject capOpts;
    private StringBuilder capBuf;
    private Bitmap capThumb;
    private String capUrl = "";

    /* 媒體 */
    volatile String mediaToken = "";
    private final LinkedHashMap<String, JSONObject> netMedia = new LinkedHashMap<>();
    private long lastMediaEmit = 0;
    private boolean mediaEmitPending = false;

    /* 密碼 */
    private final Map<String, String[]> pendingCred = new HashMap<>();

    static final Pattern YT_AD = Pattern.compile("^/(pagead/|api/stats/ads|get_midroll_info|ptracking|pcs/activeview|youtubei/v1/player/ad_break|ad_data_204|generate_204\\?.*ad|sw\\.js_data)");
    static final Pattern MEDIA_RE = Pattern.compile("(?i)\\.(m3u8|mpd|mp4|m4v|webm|mov|mp3|m4a|aac|ogg|oga|opus|wav|flac)(\\?|#|$)");
    static final Pattern SEG_RE = Pattern.compile("(?i)(\\.(ts|m4s|cmfv|cmfa)(\\?|#|$))|([/_-](seg|segment|chunk|frag)[-_]?\\d+)|(init\\.mp4)|(/range/)|([?&](range|bytes)=)");

    private String injectBase, injectCapture, injectMedia, injectReader, injectYt;

    static boolean isYt(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.equals("youtube.com") || h.endsWith(".youtube.com") || h.equals("youtube-nocookie.com") || h.endsWith(".youtube-nocookie.com");
    }

    /** YouTube 去廣告：自己抓主頁面 HTML，在 <head> 最前面插入去廣告腳本（比網站程式更早執行），並移除 CSP 標頭。 */
    private WebResourceResponse ytPage(String url, Map<String, String> reqH) {
        java.net.HttpURLConnection c = null;
        try {
            c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            if (reqH != null) for (Map.Entry<String, String> e : reqH.entrySet()) {
                String k = e.getKey();
                if (k == null || k.equalsIgnoreCase("Accept-Encoding") || k.equalsIgnoreCase("Cookie")) continue;
                c.setRequestProperty(k, e.getValue());
            }
            c.setRequestProperty("User-Agent", wv.getSettings().getUserAgentString());
            String ck = CookieManager.getInstance().getCookie(url);
            if (ck != null && !ck.isEmpty()) c.setRequestProperty("Cookie", ck);
            int code = c.getResponseCode();
            java.util.List<String> sc = c.getHeaderFields().get("Set-Cookie");
            if (sc == null) sc = c.getHeaderFields().get("set-cookie");
            if (sc != null) for (String v : sc) CookieManager.getInstance().setCookie(url, v);
            String ct = c.getContentType();
            if (code != 200 || ct == null || !ct.toLowerCase().contains("text/html")) { c.disconnect(); return null; }
            String cs = "UTF-8";
            int ci = ct.toLowerCase().indexOf("charset=");
            if (ci >= 0) cs = ct.substring(ci + 8).replace("\"", "").trim();
            String html = new String(Util.readAllBytes(c.getInputStream(), 20L << 20), cs);
            String tag = "<script>" + cfgJs() + injectYt + "</script>";
            int hi = html.toLowerCase().indexOf("<head");
            int he = hi >= 0 ? html.indexOf('>', hi) : -1;
            html = he > 0 ? html.substring(0, he + 1) + tag + html.substring(he + 1) : tag + html;
            Map<String, String> h = new HashMap<>();
            for (Map.Entry<String, java.util.List<String>> e : c.getHeaderFields().entrySet()) {
                String k = e.getKey();
                if (k == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                String kl = k.toLowerCase();
                if (kl.startsWith("content-security-policy") || kl.equals("content-length") || kl.equals("content-encoding") || kl.equals("set-cookie") || kl.equals("content-type") || kl.equals("transfer-encoding")) continue;
                h.put(k, e.getValue().get(0));
            }
            c.disconnect();
            return new WebResourceResponse("text/html", "utf-8", 200, "OK", h, new ByteArrayInputStream(html.getBytes("UTF-8")));
        } catch (Throwable t) {
            if (c != null) try { c.disconnect(); } catch (Throwable x) { /* ignore */ }
            return null;
        }
    }

    Browser(MainActivity act) {
        a = act;
        android.content.SharedPreferences p = a.prefs;
        mode = p.getString("brMode", "mobile");
        popups = p.getString("brPopups", "smart");
        ads = p.getBoolean("brAds", true);
        pw = p.getBoolean("brPw", true);
        textZoom = p.getInt("brZoom", 100);
        AdBlock.init(a, p.getString("adHosts", ""), p.getString("adCss", ""), p.getString("adAllow", ""));
        injectBase = Util.asset(a, "inject/page.js");
        injectCapture = Util.asset(a, "inject/capture.js");
        injectMedia = Util.asset(a, "inject/media.js");
        injectReader = Util.asset(a, "inject/reader.js");
        injectYt = Util.asset(a, "inject/yt.js");
        ytAds = p.getBoolean("ytAds", true);
        try { ytOpts = new JSONObject(p.getString("ytOpts", "{}")); } catch (Throwable t) { ytOpts = new JSONObject(); }
        wv = makeWebView(false);
        wv.setVisibility(View.GONE);
        final float rad = Util.dp(a, 16);
        wv.setOutlineProvider(new android.view.ViewOutlineProvider() {
            @Override public void getOutline(View v, android.graphics.Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), rad); }
        });
        wv.setClipToOutline(true);
        a.root.addView(wv, new FrameLayout.LayoutParams(-1, -1));
        applyMode(false);
    }

    /* ---------- 建立 WebView ---------- */
    static String cleanUa(String ua) {
        return ua.replace("; wv)", ")").replaceAll("Version/\\d+\\.\\d+ ", "");
    }

    static final String DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    String mobileUa;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private WebView makeWebView(final boolean isPopup) {
        final WebView w = new WebView(a);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(textZoom);
        if (mobileUa == null) mobileUa = cleanUa(s.getUserAgentString());
        s.setUserAgentString("desktop".equals(mode) ? DESKTOP_UA : mobileUa);
        Fetcher.UA = s.getUserAgentString();
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        w.setBackgroundColor(Color.WHITE);
        if (!isPopup) w.addJavascriptInterface(new PageBridge(this), "WSPage");
        w.setWebViewClient(new Client(isPopup));
        w.setWebChromeClient(new Chrome(isPopup));
        w.setDownloadListener(new DownloadListener() {
            @Override public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
                String name = URLUtil.guessFileName(url, cd, mime);
                MediaDl.single(a, url, curUrl, name, mime);
                if (isPopup && popup != null && popup.copyBackForwardList().getSize() <= 1) closePopup();
            }
        });
        return w;
    }

    private final class Client extends WebViewClient {
        final boolean isPopup;
        Client(boolean p) { isPopup = p; }

        @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            String scheme = u.getScheme();
            if (scheme == null || !scheme.startsWith("http")) return null;
            String host = u.getHost();
            if (ytAds && !isPopup && r.isForMainFrame() && "GET".equalsIgnoreCase(r.getMethod()) && isYt(host)) {
                WebResourceResponse x = ytPage(u.toString(), r.getRequestHeaders());
                if (x != null) return x;
            }
            if (ytAds && !r.isForMainFrame() && host != null && (isYt(host) || host.endsWith("googlevideo.com")) && YT_AD.matcher(u.getPath() == null ? "" : u.getPath()).find()) {
                AdBlock.blockedPage.incrementAndGet();
                Map<String, String> h0 = new HashMap<>();
                h0.put("Access-Control-Allow-Origin", "*");
                return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", h0, new ByteArrayInputStream(new byte[0]));
            }
            if (ads && !r.isForMainFrame() && !AdBlock.allowed(curHost) && AdBlock.match(host)) {
                AdBlock.blockedPage.incrementAndGet();
                AdBlock.blockedTotal.incrementAndGet();
                Map<String, String> h = new HashMap<>();
                h.put("Access-Control-Allow-Origin", "*");
                return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", h, new ByteArrayInputStream(new byte[0]));
            }
            if (!isPopup) noteMedia(u.toString(), r.getRequestHeaders());
            return null;
        }

        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            String s = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            String url = u.toString();
            if (s.equals("http") || s.equals("https")) {
                if (ads && r.isForMainFrame() && !r.hasGesture() && AdBlock.match(u.getHost()) && !AdBlock.allowed(curHost)) {
                    MainActivity.toast("已阻擋廣告轉址");
                    if (isPopup) closePopup();
                    return true;
                }
                if (isPopup && ads && AdBlock.match(u.getHost())) { closePopup(); MainActivity.toast("已阻擋廣告視窗"); return true; }
                return false;
            }
            if (s.equals("about") || s.equals("data") || s.equals("blob") || s.equals("javascript")) return false;
            if (s.equals("intent")) {
                try {
                    Intent it = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                    String fb = it.getStringExtra("browser_fallback_url");
                    if (r.hasGesture()) {
                        try { a.startActivity(it); return true; } catch (Throwable t) { /* 沒有對應 App */ }
                    }
                    if (fb != null && fb.startsWith("http")) { v.loadUrl(fb); return true; }
                } catch (Throwable t) { /* ignore */ }
                return true;
            }
            if (r.hasGesture()) a.openExternal(url);
            return true;
        }

        @Override public void onPageStarted(WebView v, String url, Bitmap fav) {
            if (isPopup) { if (popupTitle != null) popupTitle.setText(Uri.parse(url).getHost()); return; }
            curUrl = url;
            curHost = hostOf(url);
            favicon = fav;
            AdBlock.blockedPage.set(0);
            synchronized (netMedia) { netMedia.clear(); }
            capToken = "";
            lastInjectBucket = -1;
            emitState();
            emitMediaCount();
        }

        @Override public void onPageCommitVisible(WebView v, String url) { if (!isPopup) inject(v, ytAds && isYt(hostOf(url)) ? injectYt : null); }

        @Override public void onPageFinished(WebView v, String url) {
            if (isPopup) return;
            curUrl = url;
            curHost = hostOf(url);
            inject(v, "reader".equals(mode) ? injectReader + ";(function(){var r=window.__wsPage?__wsPage.reader(true):'none';return r;})()" : null);
            if ("reader".equals(mode)) {
                Util.MAIN.postDelayed(new Runnable() {
                    @Override public void run() {
                        wv.evaluateJavascript("(function(){var e=document.getElementById('__ws_reader_view');return e?'on':'off'})()", new ValueCallback<String>() {
                            @Override public void onReceiveValue(String r) { if (!"\"on\"".equals(r) && !curUrl.startsWith("data:") && !curUrl.startsWith("about:")) MainActivity.toast("這個頁面沒有偵測到文章內容，顯示原始頁面"); }
                        });
                    }
                }, 500);
            }
            emitState();
            emitMediaCount();
        }

        @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) {
            if (isPopup) return;
            curUrl = url;
            curHost = hostOf(url);
            emitState();
        }

        @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (isPopup || !r.isForMainFrame()) return;
            String desc = String.valueOf(e.getDescription());
            showError(v, r.getUrl().toString(), desc);
        }

        @Override public void onReceivedSslError(WebView v, SslErrorHandler h, SslError e) {
            h.cancel();
            if (!isPopup && e.getUrl() != null && e.getUrl().equals(curUrl)) showError(v, e.getUrl(), "安全憑證有問題（SSL），已停止載入以保護你的資料");
        }
    }

    private final class Chrome extends WebChromeClient {
        final boolean isPopup;
        Chrome(boolean p) { isPopup = p; }

        @Override public void onProgressChanged(WebView v, int p) {
            if (isPopup) return;
            progress = p;
            int bucket = p / 25;
            if (p >= 30 && p < 100 && bucket != lastInjectBucket) { lastInjectBucket = bucket; inject(v, null); }
            emitState();
        }

        @Override public void onReceivedTitle(WebView v, String t) {
            if (isPopup) { if (popupTitle != null) popupTitle.setText(t); return; }
            curTitle = t == null ? "" : t;
            emitState();
        }

        @Override public void onReceivedIcon(WebView v, Bitmap icon) { if (!isPopup) favicon = icon; }

        @Override public boolean onCreateWindow(WebView v, boolean isDialog, boolean gesture, Message msg) {
            if ("block".equals(popups) || ("smart".equals(popups) && !gesture)) {
                MainActivity.toast("已阻擋自動彈出的視窗");
                return false;
            }
            openPopup(msg);
            return true;
        }

        @Override public void onCloseWindow(WebView w) { if (w == popup) closePopup(); }

        @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) { return a.chooseFile(cb, p); }

        @Override public void onShowCustomView(View view, CustomViewCallback cb) { a.showCustom(view, cb); }

        @Override public void onHideCustomView() { a.hideCustom(); }

        @Override public void onPermissionRequest(PermissionRequest r) { r.deny(); }

        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) { cb.invoke(origin, false, false); }
    }

    static String hostOf(String url) {
        try { String h = Uri.parse(url).getHost(); return h == null ? "" : h.toLowerCase(); } catch (Throwable t) { return ""; }
    }

    private void showError(WebView v, String url, String desc) {
        String safeUrl = url.replace("&", "&amp;").replace("<", "&lt;").replace("\"", "&quot;");
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='margin:0;font:15px/1.6 -apple-system,\"Noto Sans TC\",sans-serif;background:#f4ecdc;color:#3a2e22;display:flex;min-height:100vh;align-items:center;justify-content:center'>"
            + "<div style='max-width:420px;padding:28px;text-align:center'><div style='font-size:46px'>🌐</div><h2 style='color:#a2613a;margin:8px 0'>無法開啟這個網頁</h2>"
            + "<p style='color:#7d6c57;word-break:break-all'>" + safeUrl + "</p><p style='font-size:13px;background:#ebdfc8;border-radius:12px;padding:10px'>" + desc.replace("<", "&lt;") + "</p>"
            + "<a href=\"" + safeUrl + "\" style='display:inline-block;margin-top:10px;background:#a2613a;color:#fff;padding:10px 22px;border-radius:99px;text-decoration:none;font-weight:700'>重新載入</a></div></body>";
        v.loadDataWithBaseURL(url, html, "text/html", "utf-8", url);
    }

    /* ---------- 注入頁面輔助程式 ---------- */
    String cfgJs() {
        try {
            JSONObject c = new JSONObject();
            c.put("ads", ads && !AdBlock.allowed(curHost));
            c.put("css", AdBlock.css);
            c.put("pw", pw);
            if (ytOpts != null) c.put("yt", ytOpts);
            return "window.__wsCfg=" + c.toString() + ";";
        } catch (Throwable t) { return "window.__wsCfg={};"; }
    }

    void inject(WebView v, String extra) {
        if (v == null) return;
        String code = cfgJs() + injectBase + (extra == null ? "" : ";" + extra);
        v.evaluateJavascript(code, null);
    }

    /* ---------- 顯示與位置 ---------- */
    void setRect(float top, float bottom, float left, float right) {
        float d = a.getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) wv.getLayoutParams();
        lp.topMargin = Math.round(top * d);
        lp.bottomMargin = Math.round(bottom * d);
        lp.leftMargin = Math.round(left * d);
        lp.rightMargin = Math.round(right * d);
        wv.setLayoutParams(lp);
    }

    void show(boolean on) {
        shown = on;
        wv.setVisibility(on && !covered ? View.VISIBLE : View.GONE);
        if (on) wv.onResume();
    }

    boolean isShown() { return shown && !covered && wv.getVisibility() == View.VISIBLE; }

    /** 網頁介面要開啟對話框時：先拍一張快照給介面當背景，再把原生瀏覽器藏起來，讓對話框能顯示在最上層。 */
    void cover(boolean on) {
        covered = on;
        if (on) {
            if (wv.getVisibility() == View.VISIBLE) MainActivity.emit("snap", snapshot(wv, 0.5f, 62));
            wv.setVisibility(View.GONE);
        } else {
            wv.setVisibility(shown ? View.VISIBLE : View.GONE);
        }
    }

    static String snapshot(View v, float scale, int q) {
        try {
            int w = Math.max(1, Math.round(v.getWidth() * scale)), h = Math.max(1, Math.round(v.getHeight() * scale));
            Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
            Canvas c = new Canvas(b);
            c.scale(scale, scale);
            v.draw(c);
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.JPEG, q, o);
            return "data:image/jpeg;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable t) { return ""; }
    }

    Bitmap thumbBitmap() {
        try {
            if (wv.getWidth() <= 0) return null;
            float s = 400f / wv.getWidth();
            int w = 400, h = Math.max(1, Math.round(Math.min(wv.getHeight(), wv.getWidth() * 1.4f) * s));
            Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            c.drawColor(Color.WHITE);
            c.scale(s, s);
            wv.draw(c);
            return b;
        } catch (Throwable t) { return null; }
    }

    /* ---------- 導覽 ---------- */
    void load(String url) {
        show(true);
        wv.loadUrl(url);
    }

    boolean goBack() { if (wv.canGoBack()) { wv.goBack(); return true; } return false; }

    void onResume() { wv.onResume(); }

    /** YouTube 背景播放：離開 App 時不暫停瀏覽器（影片聲音繼續）；其他網站照常暫停 */
    void onPause() {
        boolean bg = ytOpts != null && ytOpts.optBoolean("bg", true) && isYt(curHost) && videoPlaying;
        if (!bg) wv.onPause();
    }

    /* ---------- YouTube 播放器強化（Morphe 風格） ---------- */
    JSONObject ytOpts;
    volatile boolean videoPlaying = false;
    float videoRatio = 16f / 9f;
    private FrameLayout.LayoutParams savedLp;
    boolean inPip = false;

    void videoState(boolean playing, int w, int h) {
        videoPlaying = playing;
        if (w > 0 && h > 0) videoRatio = Math.max(0.42f, Math.min(2.38f, (float) w / h));
        a.updatePipParams();
    }

    boolean wantsPip() { return ytOpts != null && ytOpts.optBoolean("pip", true) && videoPlaying && isShown() && isYt(curHost); }

    void pipMode(boolean on) {
        inPip = on;
        if (on) {
            savedLp = new FrameLayout.LayoutParams((FrameLayout.LayoutParams) wv.getLayoutParams());
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) wv.getLayoutParams();
            lp.topMargin = lp.bottomMargin = lp.leftMargin = lp.rightMargin = 0;
            wv.setLayoutParams(lp);
            wv.setClipToOutline(false);
            wv.bringToFront();
            wv.evaluateJavascript("window.__wsYTpip&&__wsYTpip(true)", null);
        } else {
            if (savedLp != null) wv.setLayoutParams(savedLp);
            wv.setClipToOutline(true);
            wv.evaluateJavascript("window.__wsYTpip&&__wsYTpip(false)", null);
            if (a.vw != null) a.vw.toFront();
        }
    }

    void brightness(float v) {
        android.view.WindowManager.LayoutParams lp = a.getWindow().getAttributes();
        lp.screenBrightness = v < 0 ? -1f : Math.max(0.02f, Math.min(1f, v));
        a.getWindow().setAttributes(lp);
    }

    void emitState() {
        try {
            JSONObject o = new JSONObject();
            o.put("url", curUrl);
            o.put("title", curTitle);
            o.put("host", curHost);
            o.put("progress", progress);
            o.put("back", wv.canGoBack());
            o.put("fwd", wv.canGoForward());
            o.put("blocked", AdBlock.blockedPage.get());
            o.put("mode", mode);
            o.put("secure", curUrl.startsWith("https:"));
            MainActivity.emit("br", o.toString());
        } catch (Throwable t) { /* ignore */ }
    }

    String faviconB64() {
        Bitmap f = favicon;
        if (f == null) return "";
        try {
            Bitmap s = Bitmap.createScaledBitmap(f, 48, 48, true);
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            s.compress(Bitmap.CompressFormat.PNG, 100, o);
            return "data:image/png;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable t) { return ""; }
    }

    /* ---------- 設定 ---------- */
    void config(JSONObject c) {
        String oldMode = mode;
        mode = c.optString("mode", mode);
        popups = c.optString("popups", popups);
        ads = c.optBoolean("ads", ads);
        ytAds = c.optBoolean("ytAds", ytAds);
        if (c.has("yt")) { ytOpts = c.optJSONObject("yt"); a.prefs.edit().putString("ytOpts", String.valueOf(ytOpts)).apply(); }
        pw = c.optBoolean("pw", pw);
        textZoom = c.optInt("textZoom", textZoom);
        a.prefs.edit().putString("brMode", mode).putString("brPopups", popups).putBoolean("brAds", ads).putBoolean("ytAds", ytAds).putBoolean("brPw", pw).putInt("brZoom", textZoom)
            .putString("adHosts", c.optString("adHosts", a.prefs.getString("adHosts", "")))
            .putString("adCss", c.optString("adCss", a.prefs.getString("adCss", "")))
            .putString("adAllow", c.optString("adAllow", a.prefs.getString("adAllow", ""))).apply();
        AdBlock.init(a, a.prefs.getString("adHosts", ""), a.prefs.getString("adCss", ""), a.prefs.getString("adAllow", ""));
        wv.getSettings().setTextZoom(textZoom);
        if (!oldMode.equals(mode)) applyMode(true);
        else inject(wv, null);
    }

    void applyMode(boolean reload) {
        WebSettings s = wv.getSettings();
        boolean desk = "desktop".equals(mode);
        String ua = desk ? DESKTOP_UA : mobileUa;
        boolean uaChanged = !ua.equals(s.getUserAgentString());
        s.setUserAgentString(ua);
        Fetcher.UA = ua;
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        if (reload && !curUrl.isEmpty()) {
            if (uaChanged || !"reader".equals(mode)) wv.reload();
            else wv.evaluateJavascript(cfgJs() + injectBase + ";" + injectCapture + ";" + injectReader + ";__wsPage.reader(true)", new ValueCallback<String>() {
                @Override public void onReceiveValue(String r) { if (!"\"on\"".equals(r)) MainActivity.toast("這個頁面沒有偵測到文章內容"); }
            });
        }
        emitState();
    }

    /* ---------- 彈出視窗（登入視窗等） ---------- */
    private void openPopup(Message msg) {
        closePopupView();
        popup = makeWebView(true);
        LinearLayout box = new LinearLayout(a);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.parseColor("#f4ecdc"));
        LinearLayout bar = new LinearLayout(a);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int pad = Util.dp(a, 10);
        bar.setPadding(pad, pad / 2, pad / 2, pad / 2);
        bar.setBackgroundColor(Color.parseColor(a.prefs.getString("barColor", "#efe5d3")));
        popupTitle = new TextView(a);
        popupTitle.setText("視窗");
        popupTitle.setSingleLine(true);
        popupTitle.setTextSize(15);
        popupTitle.setTypeface(Typeface.DEFAULT_BOLD);
        popupTitle.setTextColor(Color.parseColor(a.prefs.getBoolean("barDark", false) ? "#efe2cb" : "#3a2e22"));
        bar.addView(popupTitle, new LinearLayout.LayoutParams(0, -2, 1));
        TextView close = new TextView(a);
        close.setText("✕ 關閉");
        close.setTextSize(15);
        close.setTypeface(Typeface.DEFAULT_BOLD);
        close.setTextColor(Color.WHITE);
        close.setPadding(pad * 2, pad, pad * 2, pad);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setCornerRadius(Util.dp(a, 99));
        bg.setColor(Color.parseColor("#a2613a"));
        close.setBackground(bg);
        close.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { closePopup(); } });
        bar.addView(close);
        box.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        box.addView(popup, new LinearLayout.LayoutParams(-1, 0, 1));
        popupHost = new FrameLayout(a);
        popupHost.addView(box, new FrameLayout.LayoutParams(-1, -1));
        popupHost.setElevation(Util.dp(a, 12));
        a.root.addView(popupHost, new FrameLayout.LayoutParams(-1, -1));
        popupHost.setTranslationY(Util.dp(a, 40));
        popupHost.setAlpha(0f);
        popupHost.animate().translationY(0).alpha(1f).setDuration(200).start();
        WebView.WebViewTransport t = (WebView.WebViewTransport) msg.obj;
        t.setWebView(popup);
        msg.sendToTarget();
        MainActivity.emit("popup", "{\"open\":true}");
    }

    private void closePopupView() {
        if (popupHost != null) { a.root.removeView(popupHost); popupHost = null; }
        if (popup != null) { try { popup.destroy(); } catch (Throwable t) { /* ignore */ } popup = null; }
    }

    boolean closePopup() {
        if (popup == null) return false;
        if (popup.canGoBack()) { popup.goBack(); return true; }
        final FrameLayout h = popupHost;
        if (h != null) h.animate().alpha(0f).translationY(Util.dp(a, 40)).setDuration(160).withEndAction(new Runnable() { @Override public void run() { closePopupView(); } }).start();
        else closePopupView();
        MainActivity.emit("popup", "{\"open\":false}");
        return true;
    }

    /* ---------- 擷取 ---------- */
    void capture(JSONObject opts) {
        if (curUrl.isEmpty()) { MainActivity.emit("cap", "{\"state\":\"error\",\"msg\":\"請先開啟一個網頁\"}"); return; }
        capToken = Long.toString(System.nanoTime(), 36) + Long.toString((long) (Math.random() * 1e12), 36);
        capOpts = opts;
        capBuf = new StringBuilder();
        capUrl = curUrl;
        capThumb = thumbBitmap();
        try {
            opts.put("extraHosts", new JSONArray());
            opts.put("url", curUrl);
        } catch (Throwable t) { /* ignore */ }
        String adJs = "window.WS_AD={hosts:" + AdBlock.hostsJson + ",css:" + JSONObject.quote(AdBlock.css) + "};";
        String code = cfgJs() + adJs + injectBase + ";" + injectCapture + ";" + injectReader + ";__wsPage.capture(" + JSONObject.quote(capToken) + "," + JSONObject.quote(opts.toString()) + ");";
        MainActivity.emit("cap", "{\"state\":\"progress\",\"pct\":1,\"msg\":\"準備擷取…\"}");
        wv.evaluateJavascript(code, null);
    }

    void capResult(String token, int i, int n, String chunk, String title) {
        if (!token.equals(capToken) || capBuf == null) return;
        capBuf.append(chunk);
        if (i < n - 1) return;
        final String html = capBuf.toString();
        capBuf = null;
        capToken = "";
        final JSONObject opts = capOpts;
        final String t = title == null || title.trim().isEmpty() ? curHost : title.trim();
        final String url = capUrl;
        final Bitmap thumb = capThumb;
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                try {
                    String base = Util.safeName(opts.optString("name", t));
                    String fmt = opts.optString("format", "html");
                    JSONArray out = new JSONArray();
                    Lib lib = Lib.get(a);
                    JSONObject htmlItem = lib.addText(html, base + ".html", "text/html", url, t, thumb);
                    if (!fmt.equals("pdf")) out.put(htmlItem);
                    if (fmt.equals("pdf") || fmt.equals("both")) {
                        MainActivity.emit("cap", "{\"state\":\"progress\",\"pct\":97,\"msg\":\"產生 PDF…\"}");
                        JSONObject pdf = Pdf.renderSync(a, lib.fileOf(htmlItem), base + ".pdf", url, t, opts);
                        out.put(pdf);
                        if (fmt.equals("pdf")) lib.delete(new JSONArray().put(htmlItem.getString("id")));
                    }
                    if (a.prefs.getBoolean("autoExport", false)) Exporter.toDownloads(a, out, true);
                    MainActivity.emit("cap", new JSONObject().put("state", "done").put("items", out).toString());
                    MainActivity.emit("lib", "");
                } catch (Throwable e) {
                    try { MainActivity.emit("cap", new JSONObject().put("state", "error").put("msg", String.valueOf(e.getMessage())).toString()); } catch (Throwable x) { /* ignore */ }
                }
            }
        });
    }

    void capFail(String token, String msg) {
        if (!token.equals(capToken)) return;
        capToken = "";
        capBuf = null;
        try { MainActivity.emit("cap", new JSONObject().put("state", "error").put("msg", msg).toString()); } catch (Throwable t) { /* ignore */ }
    }

    /** 擷取時頁面向原生要資源（不受 CORS 限制，帶 Cookie） */
    void fetchFor(String token, final String id, final String url, final String kind) {
        if (!token.equals(capToken)) return;
        final String ref = curUrl;
        Util.IO.execute(new Runnable() {
            @Override public void run() {
                String json;
                try {
                    String acc = "css".equals(kind) ? "text/css,*/*;q=0.1" : "img".equals(kind) ? "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" : "*/*";
                    Fetcher.Res r = Fetcher.get(url, ref, acc, 30L << 20);
                    JSONObject o = new JSONObject();
                    String mime = r.mime.isEmpty() ? Util.mimeOfExt(Util.extOf(Uri.parse(url).getPath())) : r.mime;
                    if ("font".equals(kind) && (mime.isEmpty() || mime.startsWith("text/") || mime.equals("application/octet-stream"))) {
                        String e = Util.extOf(Uri.parse(url).getPath());
                        mime = e.equals("woff2") ? "font/woff2" : e.equals("woff") ? "font/woff" : e.equals("ttf") ? "font/ttf" : e.equals("otf") ? "font/otf" : "application/octet-stream";
                    }
                    if ("img".equals(kind) && !mime.startsWith("image/")) {
                        String sniff = sniffImage(r.bytes);
                        if (sniff == null) throw new Exception("not image");
                        mime = sniff;
                    }
                    o.put("mime", mime);
                    if ("css".equals(kind)) {
                        String cs = r.charset.isEmpty() ? "UTF-8" : r.charset;
                        String txt;
                        try { txt = new String(r.bytes, cs); } catch (Throwable t) { txt = new String(r.bytes, "UTF-8"); }
                        if (txt.startsWith("﻿")) txt = txt.substring(1);
                        o.put("text", txt);
                    } else o.put("b64", Base64.encodeToString(r.bytes, Base64.NO_WRAP));
                    json = o.toString();
                } catch (Throwable t) { json = "null"; }
                final String js = "window.__wsIO&&__wsIO(" + JSONObject.quote(id) + "," + json + ")";
                Util.ui(new Runnable() { @Override public void run() { wv.evaluateJavascript(js, null); } });
            }
        });
    }

    static String sniffImage(byte[] b) {
        if (b == null || b.length < 12) return null;
        if ((b[0] & 0xff) == 0xFF && (b[1] & 0xff) == 0xD8) return "image/jpeg";
        if ((b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "image/png";
        if (b[0] == 'G' && b[1] == 'I' && b[2] == 'F') return "image/gif";
        if (b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        if (b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p' && b[8] == 'a' && b[9] == 'v' && b[10] == 'i') return "image/avif";
        String head = new String(b, 0, Math.min(b.length, 300)).trim().toLowerCase();
        if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.contains("<svg"))) return "image/svg+xml";
        return null;
    }

    /* ---------- 媒體偵測 ---------- */
    private void noteMedia(String url, Map<String, String> headers) {
        if (!MEDIA_RE.matcher(url).find()) return;
        if (SEG_RE.matcher(url).find() && !url.toLowerCase().contains(".m3u8")) return;
        String key = url.replaceAll("#.*$", "");
        synchronized (netMedia) {
            if (netMedia.containsKey(key) || netMedia.size() > 300) return;
            try {
                JSONObject o = new JSONObject();
                o.put("url", url);
                String low = url.toLowerCase();
                o.put("kind", low.contains(".m3u8") ? "hls" : low.contains(".mpd") ? "dash" : low.matches(".*\\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\\?.*|#.*)?$") ? "audio" : "video");
                o.put("net", true);
                netMedia.put(key, o);
            } catch (Throwable t) { return; }
        }
        long now = System.currentTimeMillis();
        if (now - lastMediaEmit > 800) { lastMediaEmit = now; emitMediaCount(); }
        else if (!mediaEmitPending) {
            mediaEmitPending = true;
            Util.MAIN.postDelayed(new Runnable() { @Override public void run() { mediaEmitPending = false; lastMediaEmit = System.currentTimeMillis(); emitMediaCount(); } }, 900);
        }
    }

    void emitMediaCount() {
        Util.ui(new Runnable() {
            @Override public void run() {
                wv.evaluateJavascript("(function(){try{return document.querySelectorAll('img,video,audio').length}catch(e){return 0}})()", new ValueCallback<String>() {
                    @Override public void onReceiveValue(String v) {
                        int n = 0;
                        try { n = Integer.parseInt(v.replace("\"", "")); } catch (Throwable t) { /* ignore */ }
                        int net;
                        synchronized (netMedia) { net = netMedia.size(); }
                        MainActivity.emit("mediaCount", "{\"dom\":" + n + ",\"net\":" + net + "}");
                    }
                });
            }
        });
    }

    void scanMedia(int minPx) {
        mediaToken = Long.toString(System.nanoTime(), 36);
        String adJs = "window.WS_AD={hosts:" + AdBlock.hostsJson + ",css:" + JSONObject.quote(AdBlock.css) + "};";
        String code = cfgJs() + adJs + injectBase + ";" + injectCapture + ";" + injectMedia + ";__wsPage.media(" + JSONObject.quote(mediaToken) + "," + minPx + ");";
        wv.evaluateJavascript(code, null);
    }

    void mediaResult(String token, String json) {
        if (!token.equals(mediaToken)) return;
        try {
            JSONArray dom = new JSONArray(json);
            JSONArray all = new JSONArray();
            java.util.HashSet<String> seen = new java.util.HashSet<>();
            List<JSONObject> net;
            synchronized (netMedia) { net = new ArrayList<>(netMedia.values()); }
            /* 先放網路攔截到的影片串流（通常是真正播放的來源），再放頁面上的 */
            for (JSONObject o : net) { if (!"image".equals(o.optString("kind")) && seen.add(o.optString("url"))) all.put(o); }
            for (int i = 0; i < dom.length(); i++) { JSONObject o = dom.optJSONObject(i); if (o != null && seen.add(o.optString("url"))) all.put(o); }
            JSONObject out = new JSONObject();
            out.put("items", all);
            out.put("page", curUrl);
            out.put("title", curTitle);
            MainActivity.emit("media", out.toString());
        } catch (Throwable t) { MainActivity.emit("media", "{\"items\":[]}"); }
    }

    /* ---------- 密碼 ---------- */
    void pwField(String host) {
        if (!pw || !host.equals(curHost)) return;
        JSONArray users = Creds.get(a).users(host);
        if (users.length() > 0) {
            try { MainActivity.emit("credAvail", new JSONObject().put("host", host).put("users", users).toString()); } catch (Throwable t) { /* ignore */ }
        }
    }

    void pwOffer(String host, String user, String pass) {
        if (!pw || pass == null || pass.isEmpty() || !host.equals(curHost)) return;
        Creds c = Creds.get(a);
        if (c.isNever(host) || c.same(host, user, pass)) return;
        synchronized (pendingCred) { pendingCred.put(host, new String[] {user, pass}); }
        try { MainActivity.emit("credAsk", new JSONObject().put("host", host).put("user", user).put("update", c.has(host, user)).toString()); } catch (Throwable t) { /* ignore */ }
    }

    boolean savePending(String host) {
        String[] up;
        synchronized (pendingCred) { up = pendingCred.remove(host); }
        if (up == null) return false;
        return Creds.get(a).save(host, up[0], up[1]);
    }

    void fill(String user) {
        String p = Creds.get(a).password(curHost, user);
        if (p == null) return;
        wv.evaluateJavascript(cfgJs() + injectBase + ";__wsPage.fill(" + JSONObject.quote(user) + "," + JSONObject.quote(p) + ")", null);
    }

    void zap(boolean on) {
        wv.evaluateJavascript(cfgJs() + injectBase + ";__wsPage.zap(" + on + ")", null);
    }

    void clearPageMedia() { synchronized (netMedia) { netMedia.clear(); } }

    ViewGroup.LayoutParams lp() { return wv.getLayoutParams(); }
}
