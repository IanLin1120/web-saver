package com.ian.websaver;

import android.graphics.Color;
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
                            err = Integer.parseInt(p[3]);
                            if (!"x".equals(p[0])) { t = Double.parseDouble(p[0]); dur = Double.parseDouble(p[1]); playing = "true".equals(p[2]); }
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
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.contains("/embed/") || u.startsWith("about:") || u.startsWith("https://ianlin1120.github.io/")) return false;
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

    static void load(MainActivity a, String id, int start, boolean autoplay) {
        ensure(a);
        vid = id;
        t = start; dur = 0; playing = false; err = 0;
        /* 用 IFrame API 嵌入：頁面掛在 App 自己的 GitHub Pages 網址底下，YouTube 才拿得到合法的來源（直接開 /embed/ 會出現錯誤 152／153） */
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
