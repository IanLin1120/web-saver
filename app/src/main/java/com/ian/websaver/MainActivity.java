package com.ian.websaver;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

public class MainActivity extends Activity {
    static MainActivity cur;
    static final int REQ_FILE = 1001, REQ_TREE = 1002, REQ_NOTIF = 1003;

    FrameLayout root;
    WebView ui;
    Browser br, yt;
    Fab fab;
    boolean inPipNow = false;
    Viewer vw;
    SharedPreferences prefs;
    private ValueCallback<Uri[]> fileCb;
    private View customView;
    private WebChromeClient.CustomViewCallback customCb;
    Runnable afterTree;

    @Override protected void onCreate(Bundle b) {
        if (Build.VERSION.SDK_INT >= 21) WebView.enableSlowWholeDocumentDraw();
        super.onCreate(b);
        cur = this;
        prefs = getSharedPreferences("ws", MODE_PRIVATE);
        Window w = getWindow();
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        String bar = prefs.getString("barColor", "#efe5d3");
        setBars(bar, prefs.getBoolean("barDark", false));

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor(bar));
        ui = new WebView(this);
        ui.setBackgroundColor(Color.parseColor(bar));
        root.addView(ui, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = ui.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        ui.addJavascriptInterface(new Bridge(this), "WSB");
        ui.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.startsWith("file:") || u.startsWith("about:") || u.startsWith("blob:") || u.startsWith("data:")) return false;
                openExternal(u);
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("wslib.local".equals(u.getHost())) return LibServe.serve(MainActivity.this, u, r.getRequestHeaders());
                return null;
            }
        });
        ui.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) { return chooseFile(cb, p); }
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("WS-ui", m.message() + " @" + m.lineNumber());
                return true;
            }
        });

        br = new Browser(this);
        yt = new Browser(this, "yt");
        vw = new Viewer(this);
        fab = new Fab(this);
        if (Build.VERSION.SDK_INT >= 24) {
            try {
                android.webkit.ServiceWorkerController.getInstance().setServiceWorkerClient(new android.webkit.ServiceWorkerClient() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r) {
                        Uri u = r.getUrl();
                        String h = u.getHost();
                        if (h != null && h.endsWith("googlevideo.com") && "/videoplayback".equals(u.getPath())) YtSniff.noteVid(YtSniff.lastVid, u.toString());
                        return null;
                    }
                });
            } catch (Throwable t) { /* ignore */ }
        }
        ui.loadUrl("file:///android_asset/index.html");
        handleIntent(getIntent());
    }

    void setBars(String color, boolean dark) {
        try {
            Window w = getWindow();
            int c = Color.parseColor(color);
            w.setStatusBarColor(c);
            w.setNavigationBarColor(c);
            int f = w.getDecorView().getSystemUiVisibility();
            if (dark) f &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            else f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            w.getDecorView().setSystemUiVisibility(f);
            if (root != null) root.setBackgroundColor(c);
            if (ui != null) ui.setBackgroundColor(c);
        } catch (Throwable t) { /* ignore */ }
    }

    private Browser pipBr;

    void immersive(boolean on) {
        View d = getWindow().getDecorView();
        if (on) d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        else { d.setSystemUiVisibility(0); setBars(prefs.getString("barColor", "#efe5d3"), prefs.getBoolean("barDark", false)); }
        if (fab != null) fab.refresh();
    }

    /** 重新排列原生畫面的上下順序：檢視器、彈出視窗、懸浮按鈕永遠在最上面 */
    void restack() {
        if (vw != null) vw.toFront();
        if (fab != null) fab.refresh();
    }

    /* ---------- 子母畫面（YouTube 影片播放中按 Home 自動縮小） ---------- */
    /** 目前在畫面上的瀏覽器（YouTube 分頁或瀏覽分頁） */
    Browser act() { return yt != null && (yt.isShown() || yt.fs || yt.inPip) ? yt : br; }

    void updatePipParams() {
        if (Build.VERSION.SDK_INT < 26 || br == null) return;
        Browser br = act();
        try {
            android.app.PictureInPictureParams.Builder b = new android.app.PictureInPictureParams.Builder()
                .setAspectRatio(new android.util.Rational(Math.round(br.videoRatio * 1000), 1000));
            if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(br.wantsPip()).setSeamlessResizeEnabled(true);
            setPictureInPictureParams(b.build());
        } catch (Throwable t) { /* ignore */ }
    }

    boolean enterPip(boolean force) {
        if (Build.VERSION.SDK_INT < 26 || br == null) return false;
        Browser br = act();
        if (!force && !br.wantsPip()) return false;
        try {
            return enterPictureInPictureMode(new android.app.PictureInPictureParams.Builder()
                .setAspectRatio(new android.util.Rational(Math.round(br.videoRatio * 1000), 1000)).build());
        } catch (Throwable t) { return false; }
    }

    @Override protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT < 31) enterPip(false);
    }

    @Override public void onPictureInPictureModeChanged(boolean on, android.content.res.Configuration c) {
        super.onPictureInPictureModeChanged(on, c);
        inPipNow = on;
        if (on) { pipBr = act(); pipBr.pipMode(true); }
        else if (pipBr != null) { pipBr.pipMode(false); pipBr = null; }
        if (fab != null) fab.refresh();
        emit("pip", on ? "1" : "0");
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        handleIntent(i);
    }

    /** 從其他 App「分享」網址進來：直接在瀏覽頁打開 */
    private void handleIntent(Intent i) {
        if (i == null) return;
        String u = null;
        if (Intent.ACTION_SEND.equals(i.getAction())) {
            String t = i.getStringExtra(Intent.EXTRA_TEXT);
            if (t != null) {
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("https?://\\S+").matcher(t);
                if (m.find()) u = m.group();
            }
        } else if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) u = i.getDataString();
        if (u != null) {
            final String url = u;
            final boolean dl = i.getComponent() != null && i.getComponent().getClassName().endsWith("DownloadAlias");
            Util.MAIN.postDelayed(new Runnable() { @Override public void run() { emit(dl ? "shareDl" : "openUrl", url); } }, 900);
        }
    }

    void js(final String code) {
        Util.ui(new Runnable() { @Override public void run() { if (ui != null) ui.evaluateJavascript(code, null); } });
    }

    static void emit(String type, String json) {
        MainActivity a = cur;
        if (a == null) return;
        a.js("window.onNativeEvent&&onNativeEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "" : json) + ")");
    }

    static void toast(String msg) {
        try { emit("toast", new JSONObject().put("msg", msg).toString()); } catch (Throwable t) { /* ignore */ }
    }

    void openExternal(String u) {
        try {
            Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse(u));
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Throwable t) { /* ignore */ }
    }

    boolean chooseFile(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        try { startActivityForResult(p.createIntent(), REQ_FILE); }
        catch (Throwable t) { fileCb = null; return false; }
        return true;
    }

    void pickTree(Runnable then) {
        afterTree = then;
        try {
            Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(it, REQ_TREE);
        } catch (Throwable t) { toast("無法開啟資料夾選擇器"); }
    }

    void hideKeyboard() {
        InputMethodManager im = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (im != null && ui != null) im.hideSoftInputFromWindow(ui.getWindowToken(), 0);
    }

    /* 網頁影片全螢幕 */
    void showCustom(View v, WebChromeClient.CustomViewCallback cb) {
        if (customView != null) { cb.onCustomViewHidden(); return; }
        customView = v;
        customCb = cb;
        v.setBackgroundColor(Color.BLACK);
        root.addView(v, new FrameLayout.LayoutParams(-1, -1));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    void hideCustom() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        if (customCb != null) customCb.onCustomViewHidden();
        customCb = null;
        getWindow().getDecorView().setSystemUiVisibility(0);
        setBars(prefs.getString("barColor", "#efe5d3"), prefs.getBoolean("barDark", false));
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE) {
            if (fileCb != null) {
                fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
                fileCb = null;
            }
        } else if (req == REQ_TREE) {
            if (res == RESULT_OK && data != null && data.getData() != null) {
                Uri tree = data.getData();
                try { getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Throwable t) { /* ignore */ }
                prefs.edit().putString("tree", tree.toString()).apply();
                emit("tree", tree.toString());
                if (afterTree != null) { Runnable r = afterTree; afterTree = null; r.run(); }
            } else { afterTree = null; emit("tree", ""); }
        }
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        emit("perm", "");
    }

    @Override protected void onResume() {
        super.onResume();
        if (br != null) br.onResume();
        if (yt != null) yt.onResume();
        emit("resume", "");
    }

    @Override protected void onPause() {
        super.onPause();
        try { CookieManager.getInstance().flush(); } catch (Throwable t) { /* ignore */ }
        if (br != null) br.onPause();
        if (yt != null) yt.onPause();
    }

    @Override public void onBackPressed() {
        if (customView != null) { hideCustom(); return; }
        if (yt != null && yt.fs) { yt.fullscreen(false, false); return; }
        if (br != null && br.fs) { br.fullscreen(false, false); return; }
        if (br != null && br.closePopup()) return;
        if (yt != null && yt.closePopup()) return;
        if (ui == null) { super.onBackPressed(); return; }
        ui.evaluateJavascript("(window.onNativeBack&&onNativeBack())?'1':'0'", new ValueCallback<String>() {
            @Override public void onReceiveValue(String v) {
                if ("\"1\"".equals(v)) return;
                if (yt != null && yt.isShown() && yt.goBack()) return;
                if (br != null && br.isShown() && br.goBack()) return;
                moveTaskToBack(true);
            }
        });
    }

    @Override protected void onDestroy() {
        if (cur == this) cur = null;
        WifiServer.stop();
        super.onDestroy();
    }
}
