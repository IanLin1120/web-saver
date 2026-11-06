package com.ian.websaver;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebStorage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

/** App 介面（網頁）⇄ 原生的橋：window.WSB */
public class Bridge {
    private final MainActivity a;

    Bridge(MainActivity act) { a = act; }

    private void ui(Runnable r) { a.runOnUiThread(r); }

    private static String err(Throwable t) {
        try { return new JSONObject().put("ok", false).put("err", String.valueOf(t.getMessage())).toString(); } catch (Throwable e) { return "{\"ok\":false}"; }
    }

    /* ---------- 一般 ---------- */
    @JavascriptInterface public String version() {
        try {
            PackageInfo p = a.getPackageManager().getPackageInfo(a.getPackageName(), 0);
            return p.versionName == null ? "" : p.versionName;
        } catch (Throwable t) { return ""; }
    }

    @JavascriptInterface public void openUrl(final String u) { ui(new Runnable() { @Override public void run() { a.openExternal(u); } }); }

    @JavascriptInterface public void hideKeyboard() { ui(new Runnable() { @Override public void run() { a.hideKeyboard(); } }); }

    @JavascriptInterface public void theme(final String color, final boolean dark) {
        a.prefs.edit().putString("barColor", color).putBoolean("barDark", dark).apply();
        ui(new Runnable() { @Override public void run() { a.setBars(color, dark); } });
    }

    @JavascriptInterface public void setPref(String k, String v) { a.prefs.edit().putString("u_" + k, v).apply(); if (k.equals("autoExport")) a.prefs.edit().putBoolean("autoExport", "1".equals(v)).apply(); }

    /* ---------- 瀏覽器 ---------- */
    @JavascriptInterface public void brRect(final float top, final float bottom, final float left, final float right) {
        ui(new Runnable() { @Override public void run() { a.br.setRect(top, bottom, left, right); } });
    }

    @JavascriptInterface public void brShow(final boolean on) { ui(new Runnable() { @Override public void run() { a.br.show(on); } }); }

    @JavascriptInterface public void cover(final boolean on) {
        ui(new Runnable() { @Override public void run() { a.br.cover(on); a.yt.cover(on); a.vw.cover(on); a.fab.cover(on); } });
    }

    /* ---------- YouTube 分頁 ---------- */
    @JavascriptInterface public void ytRect(final float top, final float bottom, final float left, final float right) {
        ui(new Runnable() { @Override public void run() { a.yt.setRect(top, bottom, left, right); } });
    }

    @JavascriptInterface public void ytShow(final boolean on) { ui(new Runnable() { @Override public void run() { a.yt.show(on); a.fab.refresh(); } }); }

    @JavascriptInterface public void ytLoad(final String url) { ui(new Runnable() { @Override public void run() { a.yt.load(url); } }); }

    @JavascriptInterface public void ytNav(final String what) {
        ui(new Runnable() {
            @Override public void run() {
                Browser y = a.yt;
                switch (what) {
                    case "back": y.goBack(); break;
                    case "fwd": if (y.wv.canGoForward()) y.wv.goForward(); break;
                    case "reload": y.wv.reload(); break;
                    case "stop": y.wv.stopLoading(); break;
                    case "fsOff": y.fullscreen(false, false); a.br.fullscreen(false, false); break;
                    case "pause": y.wv.evaluateJavascript("(function(){var v=document.querySelector('video');if(v)v.pause()})()", null); break;
                    default: break;
                }
            }
        });
    }

    @JavascriptInterface public String ytState() {
        try { return new JSONObject().put("url", a.yt.curUrl).put("title", a.yt.curTitle).put("br", a.br.curUrl).toString(); } catch (Throwable t) { return "{}"; }
    }

    /** 下載面板：讀取從播放器攔截到的串流與影片資訊 */
    @JavascriptInterface public String ytSniff(String vid) { return YtSniff.get(vid); }

    @JavascriptInterface public void ytForget(String vid) { YtSniff.forget(vid); }

    /** 請正在播這部影片的播放器切換到指定畫質並短暫播放，讓我們攔截到該畫質的串流網址 */
    @JavascriptInterface public String ytPrep(final String vid, final String q) {
        final Browser b = YtSniff.vidOf(a.yt.curUrl).equals(vid) ? a.yt : YtSniff.vidOf(a.br.curUrl).equals(vid) ? a.br : null;
        if (b == null) return "";
        ui(new Runnable() { @Override public void run() { b.wv.evaluateJavascript("window.__wsYTprep&&__wsYTprep(" + JSONObject.quote(q) + ")", null); } });
        return b.tag;
    }

    @JavascriptInterface public String ytInfoReq(final String vid) {
        final Browser b = YtSniff.vidOf(a.yt.curUrl).equals(vid) ? a.yt : YtSniff.vidOf(a.br.curUrl).equals(vid) ? a.br : null;
        if (b == null) return "";
        ui(new Runnable() { @Override public void run() { b.wv.evaluateJavascript("window.__wsYTinfo&&__wsYTinfo()", null); } });
        return b.tag;
    }

    /** 懸浮下載按鈕 */
    @JavascriptInterface public void fab(final boolean on, final String label) { ui(new Runnable() { @Override public void run() { a.fab.set(on, label); } }); }

    @JavascriptInterface public void brLoad(final String url) { ui(new Runnable() { @Override public void run() { a.br.load(url); } }); }

    @JavascriptInterface public void brNav(final String what) {
        ui(new Runnable() {
            @Override public void run() {
                switch (what) {
                    case "back": a.br.goBack(); break;
                    case "fwd": if (a.br.wv.canGoForward()) a.br.wv.goForward(); break;
                    case "reload": a.br.wv.reload(); break;
                    case "stop": a.br.wv.stopLoading(); break;
                    case "blank": a.br.wv.loadUrl("about:blank"); a.br.curUrl = ""; a.br.show(false); break;
                    case "top": a.br.wv.pageUp(true); break;
                    default: break;
                }
            }
        });
    }

    @JavascriptInterface public void brConfig(final String json) {
        ui(new Runnable() { @Override public void run() { try { a.br.config(new JSONObject(json)); a.yt.config(new JSONObject(json)); } catch (Throwable t) { /* ignore */ } } });
    }

    @JavascriptInterface public String brState() {
        try {
            return new JSONObject().put("url", a.br.curUrl).put("title", a.br.curTitle).put("blockedTotal", AdBlock.blockedTotal.get()).put("rules", AdBlock.count()).toString();
        } catch (Throwable t) { return "{}"; }
    }

    @JavascriptInterface public String brFavicon() { return a.br.faviconB64(); }

    @JavascriptInterface public void brCapture(final String opts) {
        ui(new Runnable() { @Override public void run() { try { a.br.capture(new JSONObject(opts)); } catch (Throwable t) { MainActivity.emit("cap", "{\"state\":\"error\",\"msg\":\"設定錯誤\"}"); } } });
    }

    @JavascriptInterface public void brComic(final String opts) {
        ui(new Runnable() { @Override public void run() { try { a.br.comic(new JSONObject(opts)); } catch (Throwable t) { /* ignore */ } } });
    }

    @JavascriptInterface public void libComic(String id, String opts) {
        try { Comic.fromHtml(a, id, new JSONObject(opts == null || opts.isEmpty() ? "{}" : opts)); } catch (Throwable t) { MainActivity.toast("設定錯誤"); }
    }

    @JavascriptInterface public void setInject(final String name, final String code) { ui(new Runnable() { @Override public void run() { a.br.setInject(name, code); a.yt.setInject(name, code); } }); }

    @JavascriptInterface public void brMedia(final int minPx) { ui(new Runnable() { @Override public void run() { a.br.scanMedia(minPx); } }); }

    @JavascriptInterface public void brZap(final boolean on) { ui(new Runnable() { @Override public void run() { a.br.zap(on); } }); }

    @JavascriptInterface public void brFill(final String user) { ui(new Runnable() { @Override public void run() { a.br.fill(user); } }); }

    @JavascriptInterface public void clearData(final String what) {
        ui(new Runnable() {
            @Override public void run() {
                if (what.contains("cache")) { a.br.wv.clearCache(true); Util.deleteTree(Lib.get(a).tmp); Lib.get(a).tmp.mkdirs(); }
                if (what.contains("cookies")) { CookieManager.getInstance().removeAllCookies(null); CookieManager.getInstance().flush(); WebStorage.getInstance().deleteAllData(); }
                if (what.contains("history")) a.br.wv.clearHistory();
                MainActivity.toast("已清除");
                MainActivity.emit("lib", "");
            }
        });
    }

    /* ---------- 密碼 ---------- */
    @JavascriptInterface public String credList() { return Creds.get(a).listJson(); }

    @JavascriptInterface public boolean credSavePending(String host) { return a.br.savePending(host); }

    @JavascriptInterface public void credNever(String host, boolean on) { Creds.get(a).setNever(host, on); }

    @JavascriptInterface public boolean credSave(String host, String user, String pass) { return Creds.get(a).save(host.trim().toLowerCase(), user, pass); }

    @JavascriptInterface public void credDel(String host, String user) { Creds.get(a).del(host, user); }

    @JavascriptInterface public String credReveal(String host, String user) { String p = Creds.get(a).password(host, user); return p == null ? "" : p; }

    /* ---------- 媒體下載 ---------- */
    @JavascriptInterface public void dlStart(String json) {
        try { MediaDl.start(a, new JSONObject(json)); } catch (Throwable t) { MainActivity.toast("下載設定錯誤"); }
    }

    @JavascriptInterface public void dlCancel() { MediaDl.cancel[0] = true; }

    @JavascriptInterface public void hlsInfo(String url, String ref) { MediaDl.hlsInfo(url, ref); }

    /* ---------- 通用 HTTP（介面的 YouTube 解析等，不受 CORS 限制） ---------- */
    @JavascriptInterface public void http(final String id, final String method, final String url, final String headersJson, final String body, final boolean cookies) {
        Util.IO.execute(new Runnable() {
            @Override public void run() {
                JSONObject o = new JSONObject();
                try {
                    java.util.Map<String, String> hd = new java.util.HashMap<>();
                    if (headersJson != null && !headersJson.isEmpty()) {
                        JSONObject h = new JSONObject(headersJson);
                        java.util.Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); hd.put(k, h.getString(k)); }
                    }
                    String[] r = Fetcher.request(method, url, hd, body == null || body.isEmpty() ? null : body, cookies);
                    o.put("id", id).put("status", Integer.parseInt(r[0])).put("body", r[1]);
                } catch (Throwable t) {
                    try { o.put("id", id).put("status", 0).put("err", String.valueOf(t.getMessage())); } catch (Throwable x) { /* ignore */ }
                }
                MainActivity.emit("http", o.toString());
            }
        });
    }

    /* ---------- 檔案庫 ---------- */
    private final java.util.Map<String, File> chunks = new java.util.HashMap<>();

    /** 分段寫入大檔（介面轉檔後的 WAV／FLAC／MP3），最後一段才加入檔案庫 */
    @JavascriptInterface public String libSaveChunk(String token, String b64, boolean last, String name, String mime, String metaJson) {
        try {
            File f;
            synchronized (chunks) {
                f = chunks.get(token);
                if (f == null) { f = Lib.get(a).tmpFile(Util.extOf(name)); chunks.put(token, f); }
            }
            java.io.FileOutputStream os = new java.io.FileOutputStream(f, true);
            os.write(Base64.decode(b64, Base64.DEFAULT));
            os.close();
            if (!last) return "{\"ok\":true}";
            synchronized (chunks) { chunks.remove(token); }
            JSONObject m = metaJson == null || metaJson.isEmpty() ? new JSONObject() : new JSONObject(metaJson);
            android.graphics.Bitmap tb = null;
            String thumbFrom = m.optString("thumbFrom", "");
            if (!thumbFrom.isEmpty()) {
                File tf = new File(Lib.get(a).thumbs, thumbFrom + ".jpg");
                if (tf.exists()) tb = android.graphics.BitmapFactory.decodeFile(tf.getPath());
            }
            JSONObject o = Lib.get(a).add(f, name, mime, m.optString("src"), m.optString("title"), tb);
            java.util.Iterator<String> it = m.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (k.equals("artist") || k.equals("album") || k.equals("folder") || k.equals("seq") || k.equals("lrc") || k.equals("lrcSrc") || k.equals("dur")) { Lib.get(a).touch(o.getString("id"), k, m.get(k)); o.put(k, m.get(k)); }
            }
            return new JSONObject().put("ok", true).put("item", o).toString();
        } catch (Throwable t) { return err(t); }
    }

    @JavascriptInterface public void libMeta(String id, String json) {
        try {
            JSONObject m = new JSONObject(json);
            java.util.Iterator<String> it = m.keys();
            while (it.hasNext()) { String k = it.next(); if (!k.equals("id") && !k.equals("file") && !k.equals("path")) Lib.get(a).touch(id, k, m.get(k)); }
        } catch (Throwable t) { /* ignore */ }
    }

    @JavascriptInterface public String libList() { return Lib.get(a).listJson(); }

    @JavascriptInterface public String libStats() { return Lib.get(a).stats(a); }

    @JavascriptInterface public int libDelete(String idsJson) {
        try { int n = Lib.get(a).delete(new JSONArray(idsJson)); return n; } catch (Throwable t) { return 0; }
    }

    @JavascriptInterface public boolean libRename(String id, String name) { return Lib.get(a).rename(id, name); }

    @JavascriptInterface public String libSave(String name, String mime, String b64, String src, String title) {
        try {
            JSONObject o = Lib.get(a).addBytes(Base64.decode(b64, Base64.DEFAULT), name, mime, src, title, null);
            return new JSONObject().put("ok", true).put("item", o).toString();
        } catch (Throwable t) { return err(t); }
    }

    @JavascriptInterface public String libText(String id, int max) {
        try {
            File f = Lib.get(a).fileOf(id);
            byte[] b = Util.readAllBytes(new java.io.FileInputStream(f), 0);
            String s = new String(b, "UTF-8");
            return max > 0 && s.length() > max ? s.substring(0, max) : s;
        } catch (Throwable t) { return ""; }
    }

    @JavascriptInterface public void libExport(String idsJson, String how) {
        try {
            JSONArray items = new JSONArray();
            for (JSONObject o : Lib.get(a).pick(new JSONArray(idsJson))) items.put(o);
            if (how.equals("downloads")) Exporter.toDownloads(a, items, false);
            else if (how.equals("tree")) {
                final JSONArray it2 = items;
                ui(new Runnable() { @Override public void run() { Exporter.toTree(a, it2); } });
            } else if (how.equals("pickTree")) {
                final JSONArray it3 = items;
                a.prefs.edit().remove("tree").apply();
                ui(new Runnable() { @Override public void run() { Exporter.toTree(a, it3); } });
            } else if (how.equals("share")) {
                final JSONArray it4 = items;
                ui(new Runnable() { @Override public void run() { Exporter.share(a, it4); } });
            } else if (how.equals("open") && items.length() > 0) {
                final JSONObject o = items.getJSONObject(0);
                ui(new Runnable() { @Override public void run() { Exporter.openWith(a, o); } });
            }
        } catch (Throwable t) { MainActivity.toast("匯出失敗：" + t.getMessage()); }
    }

    @JavascriptInterface public void libZip(final String idsJson, final String name) {
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                try {
                    Lib lib = Lib.get(a);
                    java.util.List<JSONObject> items = lib.pick(new JSONArray(idsJson));
                    File z = lib.tmpFile("zip");
                    java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(z));
                    zos.setLevel(java.util.zip.Deflater.BEST_SPEED);
                    java.util.HashSet<String> used = new java.util.HashSet<>();
                    byte[] buf = new byte[131072];
                    for (JSONObject o : items) {
                        String nm = o.optString("name");
                        int k = 2;
                        while (!used.add(nm.toLowerCase())) nm = "(" + (k++) + ") " + o.optString("name");
                        zos.putNextEntry(new java.util.zip.ZipEntry(nm));
                        java.io.FileInputStream in = new java.io.FileInputStream(lib.fileOf(o));
                        int n;
                        while ((n = in.read(buf)) > 0) zos.write(buf, 0, n);
                        in.close();
                        zos.closeEntry();
                    }
                    zos.close();
                    lib.add(z, Util.safeName(name) + ".zip", "application/zip", "", name, null);
                    MainActivity.toast("✓ 已打包成 ZIP，存入檔案庫");
                    MainActivity.emit("lib", "");
                } catch (Throwable t) { MainActivity.toast("打包失敗：" + t.getMessage()); }
            }
        });
    }

    @JavascriptInterface public String treeName() {
        String t = a.prefs.getString("tree", "");
        if (t.isEmpty()) return "";
        String s = Uri.decode(Uri.parse(t).getLastPathSegment() == null ? "" : Uri.parse(t).getLastPathSegment());
        return s.contains(":") ? s.substring(s.indexOf(':') + 1) : s;
    }

    @JavascriptInterface public void libToPdf(final String id, final String optsJson) {
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject o = Lib.get(a).find(id);
                    if (o == null) throw new Exception("找不到檔案");
                    String nm = o.optString("name").replaceAll("\\.html?$", "") + ".pdf";
                    JSONObject r = Pdf.renderSync(a, Lib.get(a).fileOf(o), nm, o.optString("src"), o.optString("title"), new JSONObject(optsJson));
                    MainActivity.emit("pdf", new JSONObject().put("ok", true).put("item", r).toString());
                    MainActivity.emit("lib", "");
                } catch (Throwable t) {
                    try { MainActivity.emit("pdf", new JSONObject().put("ok", false).put("err", String.valueOf(t.getMessage())).toString()); } catch (Throwable x) { /* ignore */ }
                }
            }
        });
    }

    @JavascriptInterface public void libPrint(final String id) {
        ui(new Runnable() {
            @Override public void run() {
                JSONObject o = Lib.get(a).find(id);
                if (o != null) Pdf.systemPrint(a, Lib.get(a).fileOf(o), o.optString("name").replaceAll("\\.html?$", ""));
            }
        });
    }

    /* ---------- 離線網頁檢視器 ---------- */
    @JavascriptInterface public void vwOpen(final String id, final float top, final float bottom) { ui(new Runnable() { @Override public void run() { a.vw.open(id, top, bottom); } }); }

    @JavascriptInterface public void vwRect(final float top, final float bottom) { ui(new Runnable() { @Override public void run() { a.vw.setRect(top, bottom); } }); }

    @JavascriptInterface public void vwClose() { ui(new Runnable() { @Override public void run() { a.vw.close(); } }); }

    /* ---------- Wi-Fi 傳到電腦 ---------- */
    @JavascriptInterface public String wifiStart() { try { return WifiServer.start(a); } catch (Throwable t) { return err(t); } }

    @JavascriptInterface public void wifiStop() { WifiServer.stop(); }

    @JavascriptInterface public boolean wifiOn() { return WifiServer.running(); }

    /* ---------- App 內更新 ---------- */
    @JavascriptInterface public boolean canInstall() { return a.getPackageManager().canRequestPackageInstalls(); }

    @JavascriptInterface public void askInstall() {
        ui(new Runnable() {
            @Override public void run() {
                try { a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName()))); } catch (Throwable t) { /* ignore */ }
            }
        });
    }

    @JavascriptInterface public void installApk(String url) { Updater.start(a, url); }

    /* 舊介面相容：存檔到下載資料夾 */
    @JavascriptInterface public String saveFile(String name, String mime, String b64) {
        try {
            JSONObject o = Lib.get(a).addBytes(Base64.decode(b64, Base64.DEFAULT), name, mime, "", name, null);
            Exporter.toDownloads(a, new JSONArray().put(o), false);
            return new JSONObject().put("ok", true).put("path", "下載/" + Exporter.FOLDER + "/" + o.optString("name")).toString();
        } catch (Throwable t) { return err(t); }
    }
}
