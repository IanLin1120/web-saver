package com.ian.websaver;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 外部下載 App（Snaptube、Quetta、其他影片下載工具）下載完的檔案自動匯入：
 * 使用者選一次那個 App 的下載資料夾，之後新完成的影片／音樂／字幕會自動搬進檔案庫，搬完刪掉原檔。
 */
final class Importer {
    private Importer() { }

    static final class Doc { Uri uri; String id, name, mime; long size, mod; }

    private static final Map<String, Long> SEEN = new HashMap<>();
    private static volatile boolean busy = false;
    static volatile long pendingUntil = 0;

    static JSONArray dirs(MainActivity a) {
        try { return new JSONArray(a.prefs.getString("watchDirs", "[]")); } catch (Throwable t) { return new JSONArray(); }
    }

    static void addDir(MainActivity a, Uri tree) {
        try {
            JSONArray d = dirs(a), out = new JSONArray();
            for (int i = 0; i < d.length(); i++) if (!d.getJSONObject(i).optString("uri").equals(tree.toString())) out.put(d.get(i));
            String name = Uri.decode(tree.getLastPathSegment() == null ? "" : tree.getLastPathSegment()).replaceFirst("^[^:]*:", "");
            out.put(new JSONObject().put("uri", tree.toString()).put("name", name.isEmpty() ? "資料夾" : name));
            a.prefs.edit().putString("watchDirs", out.toString()).apply();
        } catch (Throwable t) { /* ignore */ }
    }

    static void removeDir(MainActivity a, String uri) {
        try {
            JSONArray d = dirs(a), out = new JSONArray();
            for (int i = 0; i < d.length(); i++) if (!d.getJSONObject(i).optString("uri").equals(uri)) out.put(d.get(i));
            a.prefs.edit().putString("watchDirs", out.toString()).apply();
            try { a.getContentResolver().releasePersistableUriPermission(Uri.parse(uri), android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Throwable t) { /* ignore */ }
        } catch (Throwable t) { /* ignore */ }
    }

    private static boolean media(String n) {
        return n.matches("(?i).+\\.(mp4|m4v|webm|mkv|mov|3gp|ts|mp3|m4a|aac|opus|ogg|flac|wav|srt|vtt|ass)$");
    }

    private static boolean temp(String n) {
        return n.startsWith(".") || n.matches("(?i).+\\.(tmp|part|crdownload|download|temp|dl|downloading|!ut)$") || n.toLowerCase().contains(".tmp.");
    }

    private static void list(ContentResolver cr, Uri tree, String docId, int depth, List<Doc> out) {
        if (depth > 3) return;
        Uri ch = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        Cursor c = null;
        try {
            c = cr.query(ch, new String[] {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED}, null, null, null);
            while (c != null && c.moveToNext()) {
                Doc d = new Doc();
                d.id = c.getString(0); d.name = c.getString(1); d.mime = c.getString(2);
                d.size = c.isNull(3) ? 0 : c.getLong(3); d.mod = c.isNull(4) ? 0 : c.getLong(4);
                if (d.name == null) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(d.mime)) { if (!d.name.startsWith(".")) list(cr, tree, d.id, depth + 1, out); continue; }
                d.uri = DocumentsContract.buildDocumentUriUsingTree(tree, d.id);
                out.add(d);
            }
        } catch (Throwable t) { /* ignore */ }
        finally { if (c != null) c.close(); }
    }

    /** 檢查所有監看的資料夾；force＝手動檢查（不需要等檔案穩定兩次） */
    static void scan(final MainActivity a, final boolean force) {
        if (busy) return;
        final JSONArray d = dirs(a);
        if (d.length() == 0) return;
        busy = true;
        Util.IO.execute(new Runnable() {
            @Override public void run() {
                try { scan2(a, d, force); } finally { busy = false; }
            }
        });
    }

    private static void scan2(MainActivity a, JSONArray dirs, boolean force) {
        ContentResolver cr = a.getContentResolver();
        boolean del = a.prefs.getBoolean("importDel", true);
        Lib lib = Lib.get(a);
        JSONArray saved = new JSONArray();
        StringBuilder errs = new StringBuilder();
        long now = System.currentTimeMillis();
        for (int k = 0; k < dirs.length(); k++) {
            Uri tree;
            try { tree = Uri.parse(dirs.getJSONObject(k).getString("uri")); } catch (Throwable t) { continue; }
            List<Doc> all = new ArrayList<>();
            try { list(cr, tree, DocumentsContract.getTreeDocumentId(tree), 0, all); } catch (Throwable t) { errs.append("無法讀取資料夾（權限可能已失效，請重新加入）\n"); continue; }
            /* 先處理影片／音樂，再把同名字幕接到影片上 */
            List<Doc> subs = new ArrayList<>(), mains = new ArrayList<>();
            for (Doc x : all) {
                if (temp(x.name) || !media(x.name) || x.size <= 0) continue;
                /* 還在寫入的檔案：大小要連續兩次一樣、而且 6 秒內沒有修改 */
                Long prev = SEEN.put(x.id, x.size);
                boolean stable = (prev != null && prev == x.size) || (force && now - x.mod > 6000);
                if (!stable || now - x.mod < 6000) continue;
                if (x.name.matches("(?i).+\\.(srt|vtt|ass)$")) subs.add(x); else mains.add(x);
            }
            Map<String, JSONObject> byStem = new HashMap<>();
            for (Doc x : mains) {
                try {
                    JSONObject o = copyIn(a, lib, cr, x);
                    saved.put(o);
                    byStem.put(stem(x.name).toLowerCase(), o);
                    if (del) try { DocumentsContract.deleteDocument(cr, x.uri); } catch (Throwable t) { /* 刪不掉就留著 */ }
                    SEEN.remove(x.id);
                } catch (Throwable e) { errs.append(x.name).append("：").append(e.getMessage()).append('\n'); }
            }
            for (Doc x : subs) {
                try {
                    String sn = x.name.toLowerCase(), base = stem(sn);
                    JSONObject vid = null;
                    for (Map.Entry<String, JSONObject> e : byStem.entrySet()) if (base.equals(e.getKey()) || base.startsWith(e.getKey() + ".") || base.startsWith(e.getKey() + "_") || base.startsWith(e.getKey() + "-")) { vid = e.getValue(); break; }
                    String nm = x.name;
                    if (vid != null) {
                        String vs = stem(vid.optString("name"));
                        String lang = base.length() > stem(vid.optString("name")).length() ? base.substring(Math.min(base.length(), stem(vid.optString("name")).length())).replaceAll("^[._ -]+", "") : "";
                        nm = vs + (lang.isEmpty() ? "" : "." + lang) + "." + Util.extOf(x.name).toLowerCase();
                    }
                    JSONObject o = copyIn(a, lib, cr, x, nm);
                    saved.put(o);
                    if (vid != null) {
                        JSONArray ls = vid.optJSONArray("subs");
                        if (ls == null) ls = new JSONArray();
                        ls.put(new JSONObject().put("id", o.getString("id")).put("lang", "").put("label", x.name));
                        lib.touch(vid.getString("id"), "subs", ls);
                        vid.put("subs", ls);
                    }
                    if (del) try { DocumentsContract.deleteDocument(cr, x.uri); } catch (Throwable t) { /* ignore */ }
                    SEEN.remove(x.id);
                } catch (Throwable e) { errs.append(x.name).append("：").append(e.getMessage()).append('\n'); }
            }
        }
        if (saved.length() > 0 || errs.length() > 0) {
            try { MainActivity.emit("imported", new JSONObject().put("items", saved).put("err", errs.toString().trim()).toString()); } catch (Throwable t) { /* ignore */ }
            MainActivity.emit("lib", "");
            if (saved.length() > 0) {
                KeepAlive.done(a, "已從其他 App 匯入 " + saved.length() + " 個檔案");
                if (a.prefs.getBoolean("autoExport", false)) Exporter.toDownloads(a, saved, true);
            }
        }
    }

    private static String stem(String n) { int i = n.lastIndexOf('.'); return i > 0 ? n.substring(0, i) : n; }

    private static JSONObject copyIn(MainActivity a, Lib lib, ContentResolver cr, Doc x) throws Exception { return copyIn(a, lib, cr, x, x.name); }

    private static JSONObject copyIn(MainActivity a, Lib lib, ContentResolver cr, Doc x, String name) throws Exception {
        String ext = Util.extOf(x.name);
        File t = lib.tmpFile(ext);
        InputStream in = cr.openInputStream(x.uri);
        if (in == null) throw new Exception("無法開啟");
        FileOutputStream os = new FileOutputStream(t);
        byte[] buf = new byte[1 << 16];
        int r;
        try { while ((r = in.read(buf)) > 0) os.write(buf, 0, r); } finally { in.close(); os.close(); }
        if (t.length() != x.size && x.size > 0) { t.delete(); throw new Exception("檔案大小不符（還在下載？）"); }
        String mime = x.mime == null || x.mime.isEmpty() || x.mime.equals("application/octet-stream") ? Util.mimeOfExt(ext) : x.mime;
        return lib.add(t, name, mime, "", stem(name), null);
    }

    /** 交給其他 App 下載後：接下來 3 小時每 15 秒檢查一次 */
    static void pending(final MainActivity a) {
        pendingUntil = System.currentTimeMillis() + 3 * 3600_000L;
        tick(a);
    }

    private static boolean ticking = false;
    private static void tick(final MainActivity a) {
        if (ticking) return;
        ticking = true;
        Util.MAIN.postDelayed(new Runnable() {
            @Override public void run() {
                ticking = false;
                if (System.currentTimeMillis() > pendingUntil) return;
                scan(a, false);
                tick(a);
            }
        }, 15000);
    }
}
