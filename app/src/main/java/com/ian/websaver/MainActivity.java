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
    static final int REQ_FILE = 1001, REQ_TREE = 1002, REQ_NOTIF = 1003, REQ_WATCH = 1004, REQ_PICK = 1011;

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
        /* App 每次重新開啟（包含從最近使用劃掉後再開）都要重新解鎖；
           背景還有下載／匯入／AI 等前景服務時，程式本身不會被系統結束，所以要在這裡主動上鎖 */
        Lock.session = false;
        cur = this;
        prefs = getSharedPreferences("ws", MODE_PRIVATE);
        Window w = getWindow();
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        String bar = prefs.getString("barColor", "#efe5d3");
        setBars(bar, prefs.getBoolean("barDark", false));

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor(bar));
        ui = new KeepWebView(this, true);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            try { requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, 41); } catch (Throwable t) { /* ignore */ }
        }
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
        tabs.add(br);
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

    /** 通知列的「播放／暫停」「下一首」：YouTube 分頁有影片時控制影片，否則交給 App 內音樂播放器 */
    void mediaCmd(final String cmd) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Browser b = yt != null && yt.videoPlaying ? yt : (br != null && br.videoPlaying ? br : null);
                if (b == null && KeepAlive.musicOn()) return; /* App 內音樂播放器自己處理 */
                if (b == null && yt != null && YtSniff.vidOf(yt.curUrl).length() > 0) b = yt;
                if (b == null) return;
                String js = "toggle".equals(cmd) ? "(function(){var v=document.querySelector('video');if(v){if(v.paused)v.play();else v.pause();}})()"
                    : "next".equals(cmd) ? "(function(){var p=document.getElementById('movie_player');if(p&&p.nextVideo)p.nextVideo();})()" : "";
                if (!js.isEmpty()) b.wv.evaluateJavascript(js, null);
            }
        });
    }
    private Browser grabBr, bgBr, recBr;

    /** 背景用的隱藏瀏覽器：放在最底層（被 App 介面蓋住），照常載入與播放，但使用者看不到 */
    Browser hidden(String tag) {
        Browser b = "grab".equals(tag) ? grabBr : "rec".equals(tag) ? recBr : bgBr;
        if (b == null) {
            b = new Browser(this, tag);
            root.removeView(b.wv);
            root.addView(b.wv, 0, new android.widget.FrameLayout.LayoutParams(-1, -1));
            b.wv.setVisibility(View.VISIBLE);
            if ("grab".equals(tag)) grabBr = b; else if ("rec".equals(tag)) recBr = b; else bgBr = b;
        }
        if ("rec".equals(tag) && br != null && b.wv.getWidth() == 0) {
            /* 錄製用：橫向的大畫面，讓網站播放器選最高畫質 */
            android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
            b.wv.setLayoutParams(new android.widget.FrameLayout.LayoutParams(Math.max(dm.widthPixels, dm.heightPixels), Math.min(dm.widthPixels, dm.heightPixels)));
            b.mode = br.mode;
            b.wv.getSettings().setUserAgentString(br.wv.getSettings().getUserAgentString());
        }
        if ("bg".equals(tag) && br != null) {
            /* 背景擷取用和瀏覽分頁相同的版面大小與模式 */
            android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams(br.wv.getWidth() > 0 ? br.wv.getWidth() : -1, br.wv.getHeight() > 0 ? br.wv.getHeight() : -1);
            b.wv.setLayoutParams(lp);
            b.mode = br.mode;
            b.wv.getSettings().setUserAgentString(br.wv.getSettings().getUserAgentString());
        }
        b.shown = true;
        b.wv.setVisibility(View.VISIBLE);
        return b;
    }

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
    /* ---------- 瀏覽分頁的多分頁 ---------- */
    final java.util.List<Browser> tabs = new java.util.ArrayList<>();

    Browser tabById(int id) { for (Browser b : tabs) if (b.tabId == id) return b; return null; }

    Browser newTab() {
        Browser old = br;
        Browser b = new Browser(this);
        root.removeView(b.wv);
        root.addView(b.wv, root.indexOfChild(old.wv) + 1, new FrameLayout.LayoutParams((FrameLayout.LayoutParams) old.wv.getLayoutParams()));
        b.incog = old.incog;
        if (b.incog) { b.wv.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE); b.wv.getSettings().setSaveFormData(false); }
        old.pauseMedia();
        old.show(false);
        tabs.add(b);
        br = b;
        b.emitState();
        return b;
    }

    void switchTab(int id) {
        Browser b = tabById(id);
        if (b == null || b == br) return;
        boolean vis = br.shown;
        br.pauseMedia();
        br.show(false);
        b.wv.setLayoutParams(new FrameLayout.LayoutParams((FrameLayout.LayoutParams) br.wv.getLayoutParams()));
        br = b;
        b.show(vis);
        b.emitState();
        if (fab != null) fab.refresh();
    }

    void closeTab(int id) {
        Browser b = tabById(id);
        if (b == null) return;
        if (tabs.size() == 1) { b.pauseMedia(); b.wv.loadUrl("about:blank"); b.wv.clearHistory(); b.emitState(); return; }
        int i = tabs.indexOf(b);
        if (b == br) switchTab(tabs.get(i > 0 ? i - 1 : 1).tabId);
        tabs.remove(b);
        try { root.removeView(b.wv); b.wv.stopLoading(); b.wv.destroy(); } catch (Throwable t) { /* ignore */ }
    }

    /* ---------- YouTube ⇄ YouTube Music：兩個各自保留狀態的瀏覽器，切換只是換顯示（不重新載入、不閃白） ---------- */
    Browser ytYt, ytMu;
    final java.util.Map<String, String> injOverride = new java.util.HashMap<>();
    float[] ytRectV = null;
    java.util.List<Browser> ytAll() {
        java.util.List<Browser> l = new java.util.ArrayList<>();
        if (yt != null) l.add(yt);
        if (ytYt != null && !l.contains(ytYt)) l.add(ytYt);
        if (ytMu != null && !l.contains(ytMu)) l.add(ytMu);
        return l;
    }
    Browser ytFor(boolean music) {
        Browser b = music ? ytMu : ytYt;
        if (b != null) return b;
        if (yt != ytYt && yt != ytMu) b = yt;          /* 一開始的瀏覽器還沒指定是哪一種 */
        else {
            b = new Browser(this, "yt");
            root.removeView(b.wv);
            root.addView(b.wv, root.indexOfChild(yt.wv) + 1, new FrameLayout.LayoutParams((FrameLayout.LayoutParams) yt.wv.getLayoutParams()));
            for (java.util.Map.Entry<String, String> e : injOverride.entrySet()) b.setInject(e.getKey(), e.getValue());
            if (ytRectV != null) b.setRect(ytRectV[0], ytRectV[1], ytRectV[2], ytRectV[3]);
        }
        if (music) { ytMu = b; b.wv.setBackgroundColor(0xFFF7F0E5); } else ytYt = b;
        return b;
    }
    boolean ytLoaded(Browser b) { return b.curUrl != null && b.curUrl.startsWith("http"); }
    void ytActivate(Browser b) {
        if (b == null || b == yt) return;
        Browser old = yt;
        boolean vis = old.shown;
        old.pauseMedia();
        old.show(false);
        /* 藏起來的那一個暫停畫面更新，把效能留給正在用的（點擊比較靈敏） */
        final Browser o = old;
        Util.MAIN.postDelayed(new Runnable() { @Override public void run() { if (o != yt && !o.shown) try { o.wv.onPause(); } catch (Throwable t) { /* ignore */ } } }, 400);
        yt = b;
        b.show(vis);
        b.emitState();
        if (fab != null) fab.refresh();
    }

    Browser act() { return yt != null && (yt.isShown() || yt.fs || yt.inPip) ? yt : br; }

    /* ---------- 子母畫面的控制按鈕：倒退 10 秒、播放／暫停、快轉 10 秒 ---------- */
    static final String PIP_ACT = "com.ian.websaver.PIP";
    private android.content.BroadcastReceiver pipRx;

    java.util.List<android.app.RemoteAction> pipActions(boolean playing) {
        java.util.List<android.app.RemoteAction> L = new java.util.ArrayList<>();
        if (Build.VERSION.SDK_INT < 26) return L;
        if (pipRx == null) {
            pipRx = new android.content.BroadcastReceiver() {
                @Override public void onReceive(android.content.Context c, Intent i) {
                    String cmd = i.getStringExtra("cmd");
                    Browser b = pipBr != null ? pipBr : act();
                    if (b == null || cmd == null) return;
                    String js = "rew".equals(cmd) ? "(function(){var v=document.querySelector('video');if(v)v.currentTime=Math.max(0,v.currentTime-10)})()"
                        : "fwd".equals(cmd) ? "(function(){var v=document.querySelector('video');if(v)v.currentTime=Math.min(v.duration-0.5,v.currentTime+10)})()"
                        : "(function(){var v=document.querySelector('video');if(v){if(v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause()}})()";
                    b.wv.evaluateJavascript(js, null);
                    if ("toggle".equals(cmd)) { b.videoPlaying = !b.videoPlaying; updatePipParams(); }
                }
            };
            android.content.IntentFilter f = new android.content.IntentFilter(PIP_ACT);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(pipRx, f, android.content.Context.RECEIVER_NOT_EXPORTED); else registerReceiver(pipRx, f);
        }
        String[][] items = {{"rew", "倒退 10 秒", String.valueOf(android.R.drawable.ic_media_rew)},
            {"toggle", playing ? "暫停" : "播放", String.valueOf(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play)},
            {"fwd", "快轉 10 秒", String.valueOf(android.R.drawable.ic_media_ff)}};
        int code = 10;
        for (String[] x : items) {
            Intent i = new Intent(PIP_ACT).setPackage(getPackageName()).putExtra("cmd", x[0]);
            android.app.PendingIntent pi = android.app.PendingIntent.getBroadcast(this, code++, i, android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
            L.add(new android.app.RemoteAction(android.graphics.drawable.Icon.createWithResource(this, Integer.parseInt(x[2])), x[1], x[1], pi));
        }
        return L;
    }

    void updatePipParams() {
        if (Build.VERSION.SDK_INT < 26 || br == null) return;
        Browser br = act();
        try {
            android.app.PictureInPictureParams.Builder b = new android.app.PictureInPictureParams.Builder()
                .setAspectRatio(new android.util.Rational(Math.round(br.videoRatio * 1000), 1000));
            if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(br.wantsPip()).setSeamlessResizeEnabled(true);
            b.setActions(pipActions(br.videoPlaying));
            setPictureInPictureParams(b.build());
        } catch (Throwable t) { /* ignore */ }
    }

    boolean enterPip(boolean force) {
        if (Build.VERSION.SDK_INT < 26 || br == null) return false;
        Browser br = act();
        if (!force && !br.wantsPip()) return false;
        pipPending = true;
        br.pipWasPlaying = br.videoPlaying || force;
        Util.MAIN.postDelayed(new Runnable() { @Override public void run() { pipPending = false; } }, 2500);
        try {
            return enterPictureInPictureMode(new android.app.PictureInPictureParams.Builder()
                .setAspectRatio(new android.util.Rational(Math.round(br.videoRatio * 1000), 1000)).setActions(pipActions(true)).build());
        } catch (Throwable t) { return false; }
    }

    @Override protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT < 31) enterPip(false);
    }

    @Override public void onPictureInPictureModeChanged(boolean on, android.content.res.Configuration c) {
        super.onPictureInPictureModeChanged(on, c);
        inPipNow = on;
        pipPending = false;
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
            final String cn = i.getComponent() != null ? i.getComponent().getClassName() : "";
            final String ev = cn.endsWith("DownloadAlias") ? "shareDl" : cn.endsWith("AiAlias") ? "shareAi" : "openUrl";
            Util.MAIN.postDelayed(new Runnable() { @Override public void run() { emit(ev, url); } }, 900);
        }
    }

    void js(final String code) {
        Util.ui(new Runnable() { @Override public void run() { if (ui != null) ui.evaluateJavascript(code, null); } });
    }

    static void emit(String type, String json) {
        MainActivity a = cur;
        if (a == null) return;
        /* 下載、擷取完成：震動＋通知（要轉 MP3／FLAC 的音樂等轉檔完成才提醒） */
        if (json != null && ("dl".equals(type) || "cap".equals(type)) && json.contains("\"state\":\"done\"")) {
            try {
                JSONObject o = new JSONObject(json);
                org.json.JSONArray it = o.optJSONArray("items");
                boolean conv = it != null && it.length() > 0 && it.optJSONObject(0) != null && it.optJSONObject(0).has("convert");
                if ((it != null && it.length() > 0) && !conv) {
                    JSONObject f = it.optJSONObject(0);
                    KeepAlive.done(a, (f == null ? "" : f.optString("name")) + (it.length() > 1 ? " 等 " + it.length() + " 個檔案" : ""));
                }
            } catch (Throwable t) { /* ignore */ }
        }
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

    String watchPkg = "", watchLabel = "";
    void pickWatch(String pkg, String label) { watchPkg = pkg == null ? "" : pkg; watchLabel = label == null ? "" : label; pickWatch(); }

    /* 從手機的檔案（下載、雲端硬碟…）選檔案匯入檔案庫：可以一次選多個 */
    void pickFiles() {
        try {
            Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            it.addCategory(Intent.CATEGORY_OPENABLE);
            it.setType("*/*");
            it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            startActivityForResult(it, REQ_PICK);
        } catch (Throwable t) { toast("無法開啟檔案選擇器"); }
    }

    void importPicked(final java.util.List<Uri> uris) {
        new Thread(new Runnable() { @Override public void run() {
            org.json.JSONArray saved = new org.json.JSONArray();
            StringBuilder errs = new StringBuilder();
            Lib lib = Lib.get(MainActivity.this);
            android.content.ContentResolver cr = getContentResolver();
            int n = 0;
            for (Uri u : uris) {
                n++;
                String name = "file", mime = null;
                try {
                    android.database.Cursor c = cr.query(u, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null);
                    if (c != null) { try { if (c.moveToFirst() && c.getString(0) != null) name = c.getString(0); } finally { c.close(); } }
                    mime = cr.getType(u);
                    try { emit("pickProg", new org.json.JSONObject().put("i", n).put("n", uris.size()).put("name", name).toString()); } catch (Throwable t) { /* ignore */ }
                    String ext = Util.extOf(name);
                    java.io.File t = lib.tmpFile(ext);
                    java.io.InputStream in = cr.openInputStream(u);
                    if (in == null) throw new Exception("無法開啟");
                    java.io.FileOutputStream os = new java.io.FileOutputStream(t);
                    byte[] buf = new byte[1 << 16]; int r;
                    try { while ((r = in.read(buf)) > 0) os.write(buf, 0, r); } finally { in.close(); os.close(); }
                    if (mime == null || mime.isEmpty() || mime.equals("application/octet-stream")) mime = Util.mimeOfExt(ext);
                    int dot = name.lastIndexOf('.');
                    saved.put(lib.add(t, name, mime, "", dot > 0 ? name.substring(0, dot) : name, null));
                } catch (Throwable e) { errs.append(name).append("：").append(e.getMessage()).append('\n'); }
            }
            try { emit("picked", new org.json.JSONObject().put("items", saved).put("err", errs.toString().trim()).toString()); } catch (Throwable t) { /* ignore */ }
            emit("lib", "");
        } }).start();
    }

    void pickWatch() {
        try {
            Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(it, REQ_WATCH);
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
        /* 網頁影片全螢幕：自動轉成橫向（直式影片除外），離開時自動轉回 */
        Browser b = act();
        boolean portrait = b != null && b.vidW > 0 && b.vidH > b.vidW;
        if (!portrait) setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    void hideCustom() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        if (customCb != null) customCb.onCustomViewHidden();
        customCb = null;
        getWindow().getDecorView().setSystemUiVisibility(0);
        setBars(prefs.getString("barColor", "#efe5d3"), prefs.getBoolean("barDark", false));
        setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE) {
            if (fileCb != null) {
                fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
                fileCb = null;
            }
        } else if (req == ScreenRec.REQ) {
            ScreenRec.onResult(this, res, data);
        } else if (req == REQ_PICK) {
            java.util.List<Uri> L = new java.util.ArrayList<>();
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) L.add(data.getClipData().getItemAt(i).getUri());
                else if (data.getData() != null) L.add(data.getData());
            }
            if (L.isEmpty()) emit("picked", "{\"items\":[],\"cancel\":true}"); else importPicked(L);
        } else if (req == REQ_WATCH) {
            if (res == RESULT_OK && data != null && data.getData() != null) {
                Uri tree = data.getData();
                try { getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Throwable t) { /* ignore */ }
                Importer.addDir(this, tree, watchPkg, watchLabel);
                Importer.scan(this, true);
            }
            emit("watchDirs", Importer.dirs(this).toString());
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

    static volatile boolean visible = false;

    @Override protected void onResume() {
        super.onResume();
        visible = true;
        if (br != null) br.onResume();
        if (yt != null) yt.onResume();
        emit("resume", "");
        /* 從 Snaptube 等外部下載 App 回來：檢查有沒有下載完的檔案可以匯入 */
        Importer.scan(this, false);
        Util.MAIN.postDelayed(new Runnable() { @Override public void run() { Importer.scan(MainActivity.this, false); } }, 8000);
    }

    @Override protected void onPause() {
        super.onPause();
        visible = false;
        try { CookieManager.getInstance().flush(); } catch (Throwable t) { /* ignore */ }
        /* 進入子母畫面時也會觸發 onPause：這時不能暫停網頁，否則影片會停 */
        boolean pip = Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode();
        if (pip || pipPending) return;
        if (br != null) br.onPause();
        for (Browser b : ytAll()) b.onPause();
    }

    /** 正在進入子母畫面（onUserLeaveHint 之後、模式切換完成之前） */
    volatile boolean pipPending = false;

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
        if (!isChangingConfigurations()) Lock.session = false;
        WifiServer.stop();
        super.onDestroy();
    }
}
