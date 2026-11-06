package com.ian.websaver;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** 媒體下載：圖片轉格式／解析度、影片（直連或 HLS）、打包 ZIP，全部存進檔案庫。 */
final class MediaDl {
    private MediaDl() { }

    static final boolean[] cancel = {false};
    private static final java.util.concurrent.ExecutorService Q = java.util.concurrent.Executors.newSingleThreadExecutor();

    static void emit(JSONObject o) { MainActivity.emit("dl", o.toString()); }

    /** 瀏覽器裡一般的檔案下載（PDF、ZIP…） */
    static void single(final MainActivity a, final String url, final String ref, final String name, final String mime) {
        MainActivity.toast("開始下載：" + name);
        Q.execute(new Runnable() {
            @Override public void run() {
                try {
                    if (url.startsWith("blob:") || url.startsWith("data:")) throw new Exception("這種下載連結（" + url.substring(0, 5) + "）無法由 App 取得");
                    File t = Lib.get(a).tmpFile(Util.extOf(name));
                    final String nm = name;
                    String m = Fetcher.toFile(url, ref, t, new Fetcher.Progress() {
                        @Override public void on(long got, long total) {
                            try { emit(new JSONObject().put("state", "item").put("i", 0).put("n", 1).put("name", nm).put("got", got).put("total", total).put("pct", total > 0 ? (double) got / total : -1)); } catch (Throwable x) { /* ignore */ }
                        }
                    });
                    JSONObject it = Lib.get(a).add(t, name, m == null || m.isEmpty() ? mime : m, url, name, null);
                    emit(new JSONObject().put("state", "done").put("ok", 1).put("fail", 0).put("items", new JSONArray().put(it)));
                    MainActivity.emit("lib", "");
                } catch (Throwable e) {
                    try { emit(new JSONObject().put("state", "done").put("ok", 0).put("fail", 1).put("msg", String.valueOf(e.getMessage()))); } catch (Throwable x) { /* ignore */ }
                }
            }
        });
    }

    static void hlsInfo(final String url, final String ref) {
        Util.IO.execute(new Runnable() {
            @Override public void run() {
                try { MainActivity.emit("hlsInfo", Hls.info(url, ref).toString()); }
                catch (Throwable e) { try { MainActivity.emit("hlsInfo", new JSONObject().put("url", url).put("err", String.valueOf(e.getMessage())).toString()); } catch (Throwable x) { /* ignore */ } }
            }
        });
    }

    static void start(final MainActivity a, final JSONObject req) {
        cancel[0] = false;
        Q.execute(new Runnable() { @Override public void run() { runJob(a, req); } });
    }

    private static void runJob(MainActivity a, JSONObject req) {
        JSONArray items = req.optJSONArray("items");
        JSONObject o = req.optJSONObject("opts");
        if (o == null) o = new JSONObject();
        if (items == null) items = new JSONArray();
        String page = req.optString("page", "");
        String title = req.optString("title", "");
        boolean zip = o.optBoolean("zip", false) && items.length() > 1;
        Lib lib = Lib.get(a);
        List<File> outFiles = new ArrayList<>();
        List<String> outNames = new ArrayList<>();
        List<String> outMimes = new ArrayList<>();
        JSONArray saved = new JSONArray();
        int ok = 0, fail = 0;
        StringBuilder errs = new StringBuilder();
        final int n = items.length();
        try { emit(new JSONObject().put("state", "start").put("n", n)); } catch (Throwable t) { /* ignore */ }
        Set<String> usedNames = new HashSet<>();
        for (int i = 0; i < n; i++) {
            if (cancel[0]) break;
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            final int idx = i;
            final String url = it.optString("url");
            String kind = it.optString("kind", "image");
            String ref = it.optString("referer", page);
            String base = it.optString("name", "");
            if (base.isEmpty()) base = Util.safeName(Uri.parse(url).getLastPathSegment() == null ? "media" : Uri.parse(url).getLastPathSegment());
            base = Util.safeName(base);
            final String shown = base;
            try {
                emit(new JSONObject().put("state", "item").put("i", i).put("n", n).put("name", shown).put("pct", 0));
                File f;
                String name, mime;
                if (kind.equals("image")) {
                    Object[] r = image(lib, url, ref, base, o);
                    f = (File) r[0]; name = (String) r[1]; mime = (String) r[2];
                } else if (kind.equals("hls")) {
                    String pref = it.optString("variant", "");
                    if (pref.isEmpty()) pref = o.optString("vidQ", "max");
                    Object[] r = hls(lib, url, ref, base, pref, o.optString("vidOut", "mp4"), idx, n, shown);
                    f = (File) r[0]; name = (String) r[1]; mime = (String) r[2];
                } else if (kind.equals("video") || kind.equals("audio")) {
                    Object[] r = direct(lib, url, ref, base, kind, o.optString("vidOut", "mp4"), idx, n, shown);
                    f = (File) r[0]; name = (String) r[1]; mime = (String) r[2];
                } else if (kind.equals("dash")) {
                    throw new Exception("DASH（.mpd）串流暫不支援，請改選偵測到的 mp4／m3u8");
                } else {
                    throw new Exception("串流影片（blob）無法直接下載，請改選偵測到的 m3u8／mp4 來源");
                }
                /* 檔名去重 */
                String uniq = name;
                int k = 2;
                while (!usedNames.add(uniq.toLowerCase())) {
                    String e = Util.extOf(name);
                    uniq = (e.isEmpty() ? name : name.substring(0, name.length() - e.length() - 1)) + " (" + (k++) + ")" + (e.isEmpty() ? "" : "." + e);
                }
                if (zip) { outFiles.add(f); outNames.add(uniq); outMimes.add(mime); }
                else saved.put(lib.add(f, uniq, mime, url, title, null));
                ok++;
                emit(new JSONObject().put("state", "itemDone").put("i", i).put("n", n).put("name", uniq).put("ok", true));
            } catch (Throwable e) {
                fail++;
                String msg = e.getMessage() == null ? e.toString() : e.getMessage();
                errs.append(shown).append("：").append(msg).append('\n');
                try { emit(new JSONObject().put("state", "itemDone").put("i", i).put("n", n).put("name", shown).put("ok", false).put("msg", msg)); } catch (Throwable x) { /* ignore */ }
            }
        }
        if (zip && !outFiles.isEmpty()) {
            try {
                emit(new JSONObject().put("state", "zip").put("n", outFiles.size()));
                String zn = Util.safeName(o.optString("zipName", "").isEmpty() ? (title.isEmpty() ? "媒體" : title) + "_媒體" : o.optString("zipName"));
                if (!zn.toLowerCase().endsWith(".zip")) zn += ".zip";
                File z = lib.tmpFile("zip");
                ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(z));
                zos.setLevel(Deflater.BEST_SPEED);
                byte[] buf = new byte[131072];
                for (int i = 0; i < outFiles.size(); i++) {
                    zos.putNextEntry(new ZipEntry(outNames.get(i)));
                    FileInputStream in = new FileInputStream(outFiles.get(i));
                    int r;
                    while ((r = in.read(buf)) > 0) zos.write(buf, 0, r);
                    in.close();
                    zos.closeEntry();
                    outFiles.get(i).delete();
                }
                zos.close();
                saved.put(lib.add(z, zn, "application/zip", page, title, null));
            } catch (Throwable e) { errs.append("ZIP：").append(e.getMessage()).append('\n'); }
        }
        if (a.prefs.getBoolean("autoExport", false) && saved.length() > 0) Exporter.toDownloads(a, saved, true);
        try { emit(new JSONObject().put("state", "done").put("ok", ok).put("fail", fail).put("cancel", cancel[0]).put("msg", errs.toString().trim()).put("items", saved)); } catch (Throwable t) { /* ignore */ }
        MainActivity.emit("lib", "");
    }

    /* ---------- 圖片 ---------- */
    private static Object[] image(Lib lib, String url, String ref, String base, JSONObject o) throws Exception {
        byte[] data;
        String mime;
        if (url.startsWith("data:")) {
            int c = url.indexOf(','), sc = url.indexOf(';');
            mime = url.substring(5, sc > 0 && sc < c ? sc : c);
            data = url.substring(0, c).contains(";base64") ? android.util.Base64.decode(url.substring(c + 1), android.util.Base64.DEFAULT) : Uri.decode(url.substring(c + 1)).getBytes("UTF-8");
            if (base.length() > 40 || base.startsWith("data")) base = "image";
        } else {
            Fetcher.Res r = Fetcher.get(url, ref, "image/avif,image/webp,image/png,image/*,*/*;q=0.8", 80L << 20);
            data = r.bytes;
            mime = r.mime.startsWith("image/") ? r.mime : Browser.sniffImage(data);
            if (mime == null) throw new Exception("不是圖片檔");
        }
        String fmt = o.optString("imgFmt", "orig");
        int maxPx = o.optInt("imgMax", 0), q = o.optInt("imgQ", 90);
        String srcExt = Util.extOfMime(mime);
        String stem = base.replaceAll("\\.[A-Za-z0-9]{2,5}$", "");
        boolean keep = (fmt.equals("orig") && maxPx <= 0) || mime.equals("image/svg+xml") || (mime.equals("image/gif") && fmt.equals("orig"));
        if (keep) {
            File f = lib.tmpFile(srcExt);
            FileOutputStream os = new FileOutputStream(f);
            os.write(data);
            os.close();
            return new Object[] {f, stem + "." + (srcExt.isEmpty() ? "img" : srcExt), mime};
        }
        BitmapFactory.Options bo = new BitmapFactory.Options();
        bo.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, bo);
        if (bo.outWidth <= 0) throw new Exception("無法解碼這張圖片（" + mime + "）");
        int ss = 1;
        if (maxPx > 0) while (Math.max(bo.outWidth, bo.outHeight) / (ss * 2) >= maxPx) ss *= 2;
        BitmapFactory.Options b2 = new BitmapFactory.Options();
        b2.inSampleSize = ss;
        Bitmap bm = BitmapFactory.decodeByteArray(data, 0, data.length, b2);
        if (bm == null) throw new Exception("無法解碼這張圖片");
        if (maxPx > 0 && Math.max(bm.getWidth(), bm.getHeight()) > maxPx) {
            float s = (float) maxPx / Math.max(bm.getWidth(), bm.getHeight());
            bm = Bitmap.createScaledBitmap(bm, Math.max(1, Math.round(bm.getWidth() * s)), Math.max(1, Math.round(bm.getHeight() * s)), true);
        }
        String outFmt = fmt.equals("orig") ? (srcExt.equals("png") ? "png" : srcExt.equals("webp") ? "webp" : "jpg") : fmt;
        Bitmap.CompressFormat cf;
        String ext, om;
        if (outFmt.equals("png")) { cf = Bitmap.CompressFormat.PNG; ext = "png"; om = "image/png"; }
        else if (outFmt.equals("webp")) { cf = Build.VERSION.SDK_INT >= 30 ? Bitmap.CompressFormat.WEBP_LOSSY : Bitmap.CompressFormat.WEBP; ext = "webp"; om = "image/webp"; }
        else {
            cf = Bitmap.CompressFormat.JPEG; ext = "jpg"; om = "image/jpeg";
            if (bm.hasAlpha()) {
                Bitmap w = Bitmap.createBitmap(bm.getWidth(), bm.getHeight(), Bitmap.Config.ARGB_8888);
                Canvas c = new Canvas(w);
                c.drawColor(Color.WHITE);
                c.drawBitmap(bm, 0, 0, null);
                bm = w;
            }
        }
        File f = lib.tmpFile(ext);
        FileOutputStream os = new FileOutputStream(f);
        bm.compress(cf, q, os);
        os.close();
        return new Object[] {f, stem + "." + ext, om};
    }

    /* ---------- 直連影片／音訊 ---------- */
    private static Object[] direct(Lib lib, final String url, String ref, String base, String kind, String out, final int i, final int n, final String shown) throws Exception {
        String ext = Util.extOf(Uri.parse(url).getPath());
        File t = lib.tmpFile(ext);
        String mime = Fetcher.toFile(url, ref, t, new Fetcher.Progress() {
            @Override public void on(long got, long total) {
                try { emit(new JSONObject().put("state", "item").put("i", i).put("n", n).put("name", shown).put("got", got).put("total", total).put("pct", total > 0 ? (double) got / total : -1)); } catch (Throwable x) { /* ignore */ }
            }
        });
        if (mime.isEmpty() || mime.equals("application/octet-stream") || mime.startsWith("text/")) mime = Util.mimeOfExt(ext);
        if (ext.isEmpty()) ext = Util.extOfMime(mime);
        if (ext.isEmpty()) ext = kind.equals("audio") ? "mp3" : "mp4";
        String stem = base.replaceAll("\\.[A-Za-z0-9]{2,5}$", "");
        if (out.equals("m4a") && kind.equals("video")) {
            File m = lib.tmpFile("m4a");
            try {
                Mux.mux(t, null, m, true);
                t.delete();
                return new Object[] {m, stem + ".m4a", "audio/mp4"};
            } catch (Throwable e) { m.delete(); /* 保留原檔 */ }
        }
        if (out.equals("mp4") && ext.equals("ts")) {
            File m = lib.tmpFile("mp4");
            try {
                Mux.mux(t, null, m, false);
                t.delete();
                return new Object[] {m, stem + ".mp4", "video/mp4"};
            } catch (Throwable e) { m.delete(); }
        }
        return new Object[] {t, stem + "." + ext, mime};
    }

    /* ---------- HLS ---------- */
    private static Object[] hls(Lib lib, String url, String ref, String base, String pref, String out, final int i, final int n, final String shown) throws Exception {
        Hls.Plan p = Hls.plan(url, ref, pref);
        final boolean hasAudio = p.audio != null;
        File v = lib.tmpFile("ts");
        boolean fmp4 = Hls.download(p.video, ref, v, new Hls.Prog() {
            @Override public void on(int d, int t) {
                try { emit(new JSONObject().put("state", "item").put("i", i).put("n", n).put("name", shown).put("pct", (hasAudio ? 0.8 : 1.0) * d / Math.max(1, t)).put("seg", d + "/" + t)); } catch (Throwable x) { /* ignore */ }
            }
        }, cancel);
        File a = null;
        if (hasAudio && !out.equals("orig-video")) {
            a = lib.tmpFile("aud");
            Hls.download(p.audio, ref, a, new Hls.Prog() {
                @Override public void on(int d, int t) {
                    try { emit(new JSONObject().put("state", "item").put("i", i).put("n", n).put("name", shown + "（音軌）").put("pct", 0.8 + 0.2 * d / Math.max(1, t))); } catch (Throwable x) { /* ignore */ }
                }
            }, cancel);
        }
        String stem = base.replaceAll("\\.(m3u8|[A-Za-z0-9]{2,4})$", "");
        if (stem.isEmpty() || stem.equalsIgnoreCase("index") || stem.equalsIgnoreCase("master") || stem.equalsIgnoreCase("playlist")) stem = "影片";
        if (p.chosen != null && p.chosen.h > 0) stem += "_" + p.chosen.h + "p";
        try { emit(new JSONObject().put("state", "item").put("i", i).put("n", n).put("name", shown + "（轉成 MP4）").put("pct", 1)); } catch (Throwable x) { /* ignore */ }
        if (out.equals("m4a")) {
            File m = lib.tmpFile("m4a");
            Mux.mux(a != null ? a : v, null, m, true);
            v.delete();
            if (a != null) a.delete();
            return new Object[] {m, stem + ".m4a", "audio/mp4"};
        }
        if (out.equals("orig") && a == null) return new Object[] {v, stem + (fmp4 ? ".mp4" : ".ts"), fmp4 ? "video/mp4" : "video/mp2t"};
        File m = lib.tmpFile("mp4");
        try {
            Mux.mux(v, a, m, false);
            v.delete();
            if (a != null) a.delete();
            return new Object[] {m, stem + ".mp4", "video/mp4"};
        } catch (Throwable e) {
            m.delete();
            if (a != null) a.delete();
            return new Object[] {v, stem + (fmp4 ? ".mp4" : ".ts"), fmp4 ? "video/mp4" : "video/mp2t"};
        }
    }
}
