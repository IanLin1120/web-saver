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
            wv.evaluateJavascript("(function(){var v=document.querySelector('video');return v?[v.currentTime,v.duration||0,!v.paused].join(','):''})()", new ValueCallback<String>() {
                @Override public void onReceiveValue(String s) {
                    try {
                        s = s == null ? "" : s.replace("\"", "");
                        String[] p = s.split(",");
                        if (p.length == 3) { t = Double.parseDouble(p[0]); dur = Double.parseDouble(p[1]); playing = "true".equals(p[2]); }
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
                if (u.contains("/embed/")) return false;
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

    static void load(MainActivity a, String id, int start, boolean autoplay) {
        ensure(a);
        vid = id;
        t = start; dur = 0; playing = false;
        String u = "https://www.youtube.com/embed/" + id + "?playsinline=1&rel=0&modestbranding=1&fs=1&enablejsapi=0" + (autoplay ? "&autoplay=1" : "") + (start > 0 ? "&start=" + start : "");
        HashMap<String, String> h = new HashMap<>();
        h.put("Referer", "https://www.youtube.com/");
        wv.loadUrl(u, h);
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
        wv.evaluateJavascript("(function(){var v=document.querySelector('video');if(!v)return;v.currentTime=" + sec + ";" + (play ? "v.play();" : "") + "})()", null);
        t = sec;
    }

    static void toggle() {
        if (wv == null) return;
        wv.evaluateJavascript("(function(){var v=document.querySelector('video');if(!v){var b=document.querySelector('.ytp-large-play-button');if(b)b.click();return}if(v.paused)v.play();else v.pause()})()", null);
    }

    static void pause() {
        if (wv == null) return;
        wv.evaluateJavascript("(function(){var v=document.querySelector('video');if(v)v.pause()})()", null);
    }

    static String state() {
        try { return new JSONObject().put("id", vid).put("t", t).put("dur", dur).put("playing", playing).toString(); } catch (Throwable e) { return "{}"; }
    }
}
