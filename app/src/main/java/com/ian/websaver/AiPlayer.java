package com.ian.websaver;

import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.util.HashMap;

/** AI 摘要分頁上方的小播放器：用 YouTube 的嵌入播放器（帶正確的 Referer，避免「錯誤 153」）。 */
final class AiPlayer {
    private static WebView wv;
    private static String vid = "";
    private static boolean shown = false, covered = false;
    static volatile double t = 0, dur = 0;
    static volatile boolean playing = false;
    private static final Runnable TICK = new Runnable() {
        @Override public void run() {
            if (wv == null) return;
            wv.evaluateJavascript("(function(){try{if(!window.P||!P.getCurrentTime)return 'x,0,0,'+(window.ERR||0);return [P.getCurrentTime(),P.getDuration()||0,P.getPlayerState()==1,ERR].join(',')}catch(e){return ''}})()", new ValueCallback<String>() {
                @Override public void onReceiveValue(String s) {
                    try {
                        s = s == null ? "" : s.replace("\"", "");
                        String[] p = s.split(",");
                        if (p.length == 4) {
                            int e = Integer.parseInt(p[3]);
                            if (!"x".equals(p[0])) { ready = true; t = Double.parseDouble(p[0]); dur = Double.parseDouble(p[1]); playing = "true".equals(p[2]); }
                            if (mode == 0 && (e != 0 || (!ready && System.currentTimeMillis() - loadAt > 9000))) fallback();
                            else err = mode == 1 ? e : 0;
                        }
                    } catch (Throwable e) { /* ignore */ }
                }
            });
            Util.MAIN.postDelayed(this, 500);
        }
    };

    private AiPlayer() { }

    private static void ensure(final MainActivity a) {
        if (wv != null) return;
        wv = new WebView(a);
        wv.setBackgroundColor(Color.BLACK);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "").replace(" Version/4.0", ""));
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
        wv.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) { if (mode == 1 && url != null && url.contains("youtube.com")) v.evaluateJavascript(shim(), null); }
            @Override public void onPageCommitVisible(WebView v, String url) { if (mode == 1 && url != null && url.contains("youtube.com")) v.evaluateJavascript(shim(), null); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.contains("/embed/") || u.startsWith("about:") || u.startsWith("https://ianlin1120.github.io/")) return false;
                if (u.contains("youtube.com/watch") && u.contains("v=" + vid)) return false;
                if (u.contains("accounts.google.") || u.contains("consent.youtube.com") || u.contains("consent.google.")) return false;
                /* 點了「在 YouTube 觀看」之類的連結：交給 App 的 YouTube 分頁 */
                try { MainActivity.emit("aipLink", new JSONObject().put("url", u).toString()); } catch (Throwable t) { /* ignore */ }
                return true;
            }
        });
        wv.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback cb) { a.showCustom(view, cb); }
            @Override public void onHideCustomView() { a.hideCustom(); }
        });
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, 0);
        a.root.addView(wv, lp);
        wv.setVisibility(View.GONE);
        Util.MAIN.post(TICK);
    }

    static volatile int err = 0;
    private static int startAt = 0;
    private static boolean auto = false;
    /** 0＝嵌入播放器、1＝YouTube 手機版觀看頁（嵌入播放器被擋或一直載不出來時自動改用） */
    private static int mode = 0;
    private static long loadAt = 0;
    private static boolean ready = false;

    /** 嵌入播放器出錯（152／153／150／101）或 9 秒還沒準備好：改開 YouTube 手機版觀看頁 */
    private static void fallback() {
        if (wv == null || mode == 1 || vid.isEmpty()) return;
        mode = 1; err = 0; loadAt = System.currentTimeMillis();
        wv.loadUrl("https://m.youtube.com/watch?v=" + Uri.encode(vid) + (startAt > 1 ? "&t=" + startAt + "s" : ""));
    }

    /** 只顯示播放器、提供 P（時間／播放／暫停／跳轉）給 App 用、自動跳過廣告、不讓它自己跳到下一部 */
    private static String shim() {
        return "(function(){if(window.__aip)return;window.__aip=1;var ID=" + JSONObject.quote(vid) + ",START=" + startAt + ",AUTO=" + auto + ";"
            + "var css=document.createElement('style');css.textContent='html,body{background:#000!important;overflow:hidden!important}"
            + "ytm-mobile-topbar-renderer,header,.mobile-topbar-header,ytm-pivot-bar-renderer,ytm-item-section-renderer,ytm-slim-video-metadata-section-renderer,.watch-below-the-player,ytm-engagement-panel,ytm-single-column-watch-next-results-renderer,ytm-companion-slot,ytm-promoted-sparkles-web-renderer,ytm-statement-banner-renderer,.mealbar-promo-renderer,ytm-mealbar-promo-renderer{display:none!important}"
            /* 整個播放器容器（含 YouTube 自己的播放／暫停、快轉、全螢幕按鈕）放大到整個畫面 */
            + "#player-container-id{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-height:none!important;padding:0!important;margin:0!important;z-index:2147483646!important;transform:none!important}"
            + "#player-container-id #player,#player-container-id .html5-video-player{width:100%!important;height:100%!important;max-height:none!important}video{object-fit:contain!important}';"
            + "(document.head||document.documentElement).appendChild(css);"
            + "window.ERR=0;var V=function(){return document.querySelector('video')};"
            + "window.P={getCurrentTime:function(){var v=V();return v?v.currentTime:0},getDuration:function(){var v=V();return v&&isFinite(v.duration)?v.duration:0},"
            + "getPlayerState:function(){var v=V();return v&&!v.paused?1:2},seekTo:function(t){var v=V();if(v)v.currentTime=t},"
            + "playVideo:function(){var v=V();if(v){var p=v.play();if(p&&p.catch)p.catch(function(){})}},pauseVideo:function(){var v=V();if(v)v.pause()}};"
            + "var started=false,t0=Date.now();setInterval(function(){var v=V();"
            + "var m=location.search.match(/[?&]v=([^&]+)/);if(location.pathname.indexOf('/watch')===0&&m&&m[1]!==ID){location.replace('https://m.youtube.com/watch?v='+ID);return;}"
            + "if(!v){if(Date.now()-t0>15000&&!started)ERR=150;return;}"
            + "var ad=document.querySelector('.ad-showing,.ad-interrupting');"
            + "if(ad){v.__aipAd=1;v.muted=true;if(isFinite(v.duration)&&v.duration>0&&v.duration<180)v.currentTime=v.duration;"
            + "var sk=document.querySelector('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,button[class*=skip]');if(sk)sk.click();return;}"
            + "if(v.__aipAd){v.__aipAd=0;v.muted=false;}"
            + "if(!started&&v.readyState>0){started=true;if(START>1&&v.currentTime<START-2)v.currentTime=START;if(!AUTO)v.pause();else{var p=v.play();if(p&&p.catch)p.catch(function(){})}}"
            + "},300);})()";
    }

    static void load(MainActivity a, String id, int start, boolean autoplay) {
        ensure(a);
        vid = id;
        t = start; dur = 0; playing = false; err = 0;
        startAt = Math.max(0, start); auto = autoplay; mode = 0; loadAt = System.currentTimeMillis(); ready = false;
        /* 預設：YouTube 嵌入播放器（有自己的播放／暫停、快轉、全螢幕按鈕）。頁面掛在 App 的 GitHub Pages 網址底下，YouTube 才拿得到合法的來源 */
        String base = "https://ianlin1120.github.io/web-saver/";
        String html = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p,iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><div id=p></div><script>"
            + "var P=null,ERR=0;function onYouTubeIframeAPIReady(){P=new YT.Player('p',{videoId:" + JSONObject.quote(id) + ",host:'https://www.youtube.com',playerVars:{playsinline:1,rel:0,modestbranding:1,fs:1,start:" + Math.max(0, start) + ",autoplay:" + (autoplay ? 1 : 0) + ",origin:location.origin},events:{onError:function(e){ERR=e.data||1}}});}"
            + "</script><script src='https://www.youtube.com/iframe_api'></script></body></html>";
        wv.loadDataWithBaseURL(base, html, "text/html", "utf-8", null);
        apply();
    }

    static void rect(MainActivity a, float top, float left, float w, float hgt) {
        ensure(a);
        float d = a.getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) wv.getLayoutParams();
        lp.width = Math.round(w * d);
        lp.height = Math.round(hgt * d);
        lp.topMargin = Math.round(top * d);
        lp.leftMargin = Math.round(left * d);
        wv.setLayoutParams(lp);
    }

    static void show(boolean on) { shown = on; if (!on) pause(); apply(); }

    static void cover(boolean on) { covered = on; apply(); }

    private static void apply() {
        if (wv == null) return;
        wv.setVisibility(shown && !covered && vid.length() > 0 ? View.VISIBLE : View.GONE);
    }

    static void seek(double sec, boolean play) {
        if (wv == null) return;
        wv.evaluateJavascript("(function(){if(!window.P||!P.seekTo)return;P.seekTo(" + sec + ",true);" + (play ? "P.playVideo();" : "") + "})()", null);
        t = sec;
    }

    static void toggle() {
        if (wv == null) return;
        wv.evaluateJavascript("(function(){if(!window.P||!P.getPlayerState)return;if(P.getPlayerState()==1)P.pauseVideo();else P.playVideo()})()", null);
    }

    static void pause() {
        if (wv == null) return;
        wv.evaluateJavascript("(function(){try{P.pauseVideo()}catch(e){}})()", null);
    }

    static String state() {
        try { return new JSONObject().put("id", vid).put("t", t).put("dur", dur).put("playing", playing).put("err", err).toString(); } catch (Throwable e) { return "{}"; }
    }
}
