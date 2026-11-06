package com.ian.websaver;

import android.graphics.Color;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.File;

/** 檔案庫的離線網頁檢視器：原生 WebView（可雙指縮放、快速捲動），網址列與按鈕由網頁介面提供。 */
final class Viewer {
    final MainActivity a;
    private WebView w;
    private boolean covered = false;

    Viewer(MainActivity act) { a = act; }

    void open(String id, float top, float bottom) {
        File f = Lib.get(a).fileOf(id);
        if (f == null || !f.exists()) { MainActivity.toast("找不到檔案"); return; }
        if (w == null) {
            w = new WebView(a);
            WebSettings s = w.getSettings();
            s.setJavaScriptEnabled(false);
            s.setAllowFileAccess(true);
            s.setBuiltInZoomControls(true);
            s.setDisplayZoomControls(false);
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(true);
            s.setSupportZoom(true);
            s.setTextZoom(a.br != null ? a.br.textZoom : 100);
            w.setBackgroundColor(Color.WHITE);
            w.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                    String u = r.getUrl().toString();
                    if (u.startsWith("file:")) return false;
                    if (u.startsWith("http")) {
                        try { MainActivity.emit("vwLink", new JSONObject().put("url", u).toString()); } catch (Throwable t) { /* ignore */ }
                    }
                    return true;
                }
            });
            a.root.addView(w, new FrameLayout.LayoutParams(-1, -1));
        }
        setRect(top, bottom);
        covered = false;
        w.setVisibility(View.VISIBLE);
        w.setAlpha(0f);
        w.animate().alpha(1f).setDuration(160).start();
        w.loadUrl("file://" + f.getAbsolutePath());
    }

    void setRect(float top, float bottom) {
        if (w == null) return;
        float d = a.getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) w.getLayoutParams();
        lp.topMargin = Math.round(top * d);
        lp.bottomMargin = Math.round(bottom * d);
        w.setLayoutParams(lp);
    }

    void cover(boolean on) {
        if (w == null || w.getVisibility() == View.GONE && !covered) return;
        if (on && w.getVisibility() == View.VISIBLE) {
            covered = true;
            MainActivity.emit("snapVw", Browser.snapshot(w, 0.5f, 62));
            w.setVisibility(View.INVISIBLE);
        } else if (!on && covered) {
            covered = false;
            w.setVisibility(View.VISIBLE);
        }
    }

    void close() {
        if (w == null) return;
        covered = false;
        a.root.removeView(w);
        w.destroy();
        w = null;
    }
}
