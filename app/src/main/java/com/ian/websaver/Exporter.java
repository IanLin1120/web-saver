package com.ian.websaver;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/** 把檔案庫的檔案「原封不動」匯出：手機的下載資料夾、任選資料夾（含 SD 卡／USB）、分享給其他 App 或電腦。 */
final class Exporter {
    private Exporter() { }

    static final String FOLDER = "網頁擷取";

    static void report(String how, int ok, int fail, String where, String err) {
        try {
            MainActivity.emit("export", new JSONObject().put("how", how).put("ok", ok).put("fail", fail).put("where", where).put("err", err == null ? "" : err).toString());
        } catch (Throwable t) { /* ignore */ }
    }

    static void toDownloads(final MainActivity a, final JSONArray items, final boolean quiet) {
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                int ok = 0, fail = 0;
                String err = null;
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.optJSONObject(i);
                    if (o == null) continue;
                    try {
                        File src = Lib.get(a).fileOf(o);
                        String name = o.optString("name"), mime = o.optString("mime", "application/octet-stream");
                        if (Build.VERSION.SDK_INT >= 29) {
                            ContentValues v = new ContentValues();
                            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
                            Uri u = a.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                            if (u == null) throw new Exception("無法建立檔案");
                            OutputStream os = a.getContentResolver().openOutputStream(u);
                            if (os == null) throw new Exception("無法寫入");
                            Util.copy(new FileInputStream(src), os);
                        } else {
                            File d = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
                            d.mkdirs();
                            Util.copy(new FileInputStream(src), new FileOutputStream(new File(d, name)));
                        }
                        ok++;
                    } catch (Throwable t) { fail++; err = t.getMessage(); }
                }
                if (!quiet || fail > 0) report("downloads", ok, fail, "下載/" + FOLDER, err);
            }
        });
    }

    static void toTree(final MainActivity a, final JSONArray items) {
        final String tree = a.prefs.getString("tree", "");
        if (tree.isEmpty()) { a.pickTree(new Runnable() { @Override public void run() { toTree(a, items); } }); return; }
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                int ok = 0, fail = 0;
                String err = null;
                Uri t = Uri.parse(tree);
                Uri dir;
                try { dir = DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t)); }
                catch (Throwable e) { a.prefs.edit().remove("tree").apply(); report("tree", 0, items.length(), "", "資料夾權限失效，請重新選擇"); return; }
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.optJSONObject(i);
                    if (o == null) continue;
                    try {
                        Uri f = DocumentsContract.createDocument(a.getContentResolver(), dir, o.optString("mime", "application/octet-stream"), o.optString("name"));
                        if (f == null) throw new Exception("無法建立檔案");
                        OutputStream os = a.getContentResolver().openOutputStream(f);
                        Util.copy(new FileInputStream(Lib.get(a).fileOf(o)), os);
                        ok++;
                    } catch (Throwable e) { fail++; err = e.getMessage(); }
                }
                String name = Uri.decode(t.getLastPathSegment() == null ? "" : t.getLastPathSegment());
                if (name.contains(":")) name = name.substring(name.indexOf(':') + 1);
                report("tree", ok, fail, name.isEmpty() ? "選擇的資料夾" : name, err);
                if (fail > 0 && ok == 0) a.prefs.edit().remove("tree").apply();
            }
        });
    }

    static void share(MainActivity a, JSONArray items) {
        ArrayList<Uri> uris = new ArrayList<>();
        String mime = null;
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o == null) continue;
            uris.add(Uri.parse("content://" + LibProvider.AUTH + "/f/" + o.optString("id")));
            String m = o.optString("mime", "*/*");
            mime = mime == null ? m : (mime.equals(m) ? mime : (mime.split("/")[0].equals(m.split("/")[0]) ? mime.split("/")[0] + "/*" : "*/*"));
        }
        if (uris.isEmpty()) return;
        Intent it;
        if (uris.size() == 1) { it = new Intent(Intent.ACTION_SEND); it.putExtra(Intent.EXTRA_STREAM, uris.get(0)); }
        else { it = new Intent(Intent.ACTION_SEND_MULTIPLE); it.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris); }
        it.setType(mime == null ? "*/*" : mime);
        it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { a.startActivity(Intent.createChooser(it, "分享／傳送檔案")); } catch (Throwable t) { MainActivity.toast("沒有可以分享的 App"); }
    }

    /** 用其他 App 開啟（例如用 Chrome 開 HTML、用相簿開圖片） */
    static void openWith(MainActivity a, JSONObject o) {
        Intent it = new Intent(Intent.ACTION_VIEW);
        it.setDataAndType(Uri.parse("content://" + LibProvider.AUTH + "/f/" + o.optString("id")), o.optString("mime", "*/*"));
        it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { a.startActivity(Intent.createChooser(it, "用其他 App 開啟")); } catch (Throwable t) { MainActivity.toast("沒有可以開啟的 App"); }
    }
}
