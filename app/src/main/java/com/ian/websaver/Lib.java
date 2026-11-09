package com.ian.websaver;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.media.MediaMetadataRetriever;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** 檔案庫：App 私有空間的檔案＋索引（lib/index.json）＋縮圖。 */
final class Lib {
    private static Lib inst;
    final File dir, files, thumbs, tmp;
    private final File index;
    private JSONArray items;

    static synchronized Lib get(Context c) {
        if (inst == null) inst = new Lib(c.getApplicationContext());
        return inst;
    }

    private Lib(Context c) {
        dir = new File(c.getFilesDir(), "lib");
        files = new File(dir, "files");
        thumbs = new File(dir, "thumbs");
        tmp = new File(c.getCacheDir(), "work");
        files.mkdirs();
        thumbs.mkdirs();
        tmp.mkdirs();
        index = new File(dir, "index.json");
        try { items = index.exists() ? new JSONArray(Util.readText(new java.io.FileInputStream(index))) : new JSONArray(); }
        catch (Throwable t) { items = new JSONArray(); }
    }

    /* 系統（或手機的「清理／最佳化」）可能在 App 執行中把快取資料夾整個清掉：每次都確認資料夾還在 */
    File tmpFile(String ext) { if (!tmp.isDirectory()) tmp.mkdirs(); return new File(tmp, "t" + System.nanoTime() + "_" + new Random().nextInt(9999) + (ext.isEmpty() ? "" : "." + ext)); }

    private void save() {
        try { Util.writeText(index, items.toString()); } catch (Throwable t) { /* ignore */ }
    }

    static String catOf(String mime, String ext) {
        String m = mime == null ? "" : mime;
        if (m.startsWith("text/html") || ext.equals("html") || ext.equals("htm") || ext.equals("mhtml")) return "html";
        if (m.equals("application/pdf") || ext.equals("pdf")) return "pdf";
        if (m.startsWith("image/")) return "image";
        if (m.startsWith("video/") || ext.equals("ts")) return "video";
        if (m.startsWith("audio/")) return "audio";
        if (m.contains("zip") || ext.equals("zip")) return "zip";
        return "other";
    }

    synchronized String listJson() { return items.toString(); }

    synchronized JSONObject find(String id) {
        for (int i = 0; i < items.length(); i++) { JSONObject o = items.optJSONObject(i); if (o != null && id.equals(o.optString("id"))) return o; }
        return null;
    }

    File fileOf(JSONObject o) { return new File(files, o.optString("file")); }

    File fileOf(String id) { JSONObject o = find(id); return o == null ? null : fileOf(o); }

    /** 把暫存檔加入檔案庫（會搬移檔案）。 */
    JSONObject add(File src, String name, String mime, String srcUrl, String title, Bitmap thumb) throws Exception {
        String ext = Util.extOf(name);
        if (ext.isEmpty()) { ext = Util.extOfMime(mime); if (!ext.isEmpty()) name = name + "." + ext; }
        if (mime == null || mime.isEmpty() || mime.equals("application/octet-stream")) mime = Util.mimeOfExt(ext);
        String id = Long.toString(System.currentTimeMillis(), 36) + Integer.toString(new Random().nextInt(46655), 36);
        String fname = id + (ext.isEmpty() ? "" : "." + ext);
        if (!files.isDirectory()) files.mkdirs();
        if (!thumbs.isDirectory()) thumbs.mkdirs();
        File dst = new File(files, fname);
        if (!src.renameTo(dst)) { Util.copyFile(src, dst); src.delete(); }
        JSONObject o = new JSONObject();
        o.put("id", id);
        o.put("name", Util.safeName(name));
        o.put("file", fname);
        o.put("path", dst.getAbsolutePath());
        o.put("mime", mime);
        o.put("cat", catOf(mime, ext));
        o.put("size", dst.length());
        o.put("time", System.currentTimeMillis());
        o.put("src", srcUrl == null ? "" : srcUrl);
        o.put("title", title == null ? "" : title);
        boolean th = false;
        try {
            Bitmap b = thumb;
            if (b == null) {
                /* 縮圖最多等 8 秒（有些沒有索引的大影片讀取很久，之前會看起來卡在 100%） */
                final File fd = dst; final String cat = o.getString("cat"); final JSONObject meta = new JSONObject();
                java.util.concurrent.FutureTask<Bitmap> ft = new java.util.concurrent.FutureTask<>(new java.util.concurrent.Callable<Bitmap>() { @Override public Bitmap call() throws Exception { return makeThumb(fd, cat, meta); } });
                Thread th0 = new Thread(ft); th0.setDaemon(true); th0.start();
                try { b = ft.get(8, java.util.concurrent.TimeUnit.SECONDS); } catch (Throwable x) { b = null; }
                java.util.Iterator<String> ks = meta.keys();
                while (ks.hasNext()) { String k = ks.next(); o.put(k, meta.get(k)); }
            }
            if (b != null) { writeThumb(b, new File(thumbs, id + ".jpg")); th = true; }
        } catch (Throwable t) { /* ignore */ }
        o.put("thumb", th ? new File(thumbs, id + ".jpg").getAbsolutePath() : "");
        synchronized (this) {
            items.put(o);
            save();
        }
        return o;
    }

    JSONObject addBytes(byte[] data, String name, String mime, String srcUrl, String title, Bitmap thumb) throws Exception {
        File t = tmpFile(Util.extOf(name));
        FileOutputStream os = new FileOutputStream(t);
        os.write(data);
        os.close();
        return add(t, name, mime, srcUrl, title, thumb);
    }

    JSONObject addText(String text, String name, String mime, String srcUrl, String title, Bitmap thumb) throws Exception {
        return addBytes(text.getBytes(StandardCharsets.UTF_8), name, mime, srcUrl, title, thumb);
    }

    synchronized int delete(JSONArray ids) {
        int n = 0;
        JSONArray keep = new JSONArray();
        java.util.HashSet<String> set = new java.util.HashSet<>();
        for (int i = 0; i < ids.length(); i++) set.add(ids.optString(i));
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o == null) continue;
            if (set.contains(o.optString("id"))) {
                fileOf(o).delete();
                new File(thumbs, o.optString("id") + ".jpg").delete();
                n++;
            } else keep.put(o);
        }
        items = keep;
        save();
        return n;
    }

    synchronized boolean rename(String id, String name) {
        JSONObject o = find(id);
        if (o == null) return false;
        String old = o.optString("name"), ext = Util.extOf(old);
        String nn = Util.safeName(name);
        if (!ext.isEmpty() && !nn.toLowerCase().endsWith("." + ext)) nn = nn + "." + ext;
        try { o.put("name", nn); } catch (Throwable t) { return false; }
        save();
        return true;
    }

    synchronized void touch(String id, String key, Object val) {
        JSONObject o = find(id);
        if (o == null) return;
        try { o.put(key, val); } catch (Throwable t) { /* ignore */ }
        save();
    }

    synchronized List<JSONObject> pick(JSONArray ids) {
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < ids.length(); i++) { JSONObject o = find(ids.optString(i)); if (o != null) out.add(o); }
        return out;
    }

    String stats(Context c) {
        try {
            long used = 0;
            int count;
            JSONObject by = new JSONObject();
            synchronized (this) {
                count = items.length();
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.optJSONObject(i);
                    if (o == null) continue;
                    long s = o.optLong("size");
                    used += s;
                    String k = o.optString("cat", "other");
                    JSONObject b = by.optJSONObject(k);
                    if (b == null) { b = new JSONObject(); b.put("n", 0); b.put("bytes", 0L); by.put(k, b); }
                    b.put("n", b.optInt("n") + 1);
                    b.put("bytes", b.optLong("bytes") + s);
                }
            }
            StatFs st = new StatFs(c.getFilesDir().getAbsolutePath());
            long cache = Util.dirSize(c.getCacheDir());
            return new JSONObject().put("count", count).put("bytes", used).put("thumbs", Util.dirSize(thumbs)).put("by", by)
                .put("free", st.getAvailableBytes()).put("total", st.getTotalBytes()).put("cache", cache).toString();
        } catch (Throwable t) { return "{}"; }
    }

    /* ---------- 縮圖 ---------- */
    static void writeThumb(Bitmap b, File f) throws Exception {
        int w = b.getWidth(), h = b.getHeight();
        float s = Math.min(1f, 360f / Math.max(1, Math.min(w, h * 1.6f)));
        Bitmap x = s < 1 ? Bitmap.createScaledBitmap(b, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), true) : b;
        if (x.getHeight() > x.getWidth() * 2) x = Bitmap.createBitmap(x, 0, 0, x.getWidth(), x.getWidth() * 2);
        FileOutputStream os = new FileOutputStream(f);
        x.compress(Bitmap.CompressFormat.JPEG, 78, os);
        os.close();
    }

    static Bitmap makeThumb(File f, String cat, JSONObject meta) {
        try {
            if (cat.equals("image")) {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(f.getPath(), o);
                if (o.outWidth > 0) { meta.put("w", o.outWidth); meta.put("h", o.outHeight); }
                int ss = 1;
                while (Math.min(o.outWidth, o.outHeight) / (ss * 2) >= 360) ss *= 2;
                BitmapFactory.Options o2 = new BitmapFactory.Options();
                o2.inSampleSize = ss;
                return BitmapFactory.decodeFile(f.getPath(), o2);
            }
            if (cat.equals("video") || cat.equals("audio")) {
                MediaMetadataRetriever r = new MediaMetadataRetriever();
                try {
                    r.setDataSource(f.getPath());
                    String d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                    if (d != null) meta.put("dur", Long.parseLong(d) / 1000);
                    String w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH), h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                    if (w != null && h != null) { meta.put("w", Integer.parseInt(w)); meta.put("h", Integer.parseInt(h)); }
                    if (cat.equals("audio")) {
                        byte[] art = r.getEmbeddedPicture();
                        return art == null ? null : BitmapFactory.decodeByteArray(art, 0, art.length);
                    }
                    return r.getFrameAtTime(1000000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                } finally { r.release(); }
            }
            if (cat.equals("pdf")) {
                ParcelFileDescriptor pfd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
                PdfRenderer pr = new PdfRenderer(pfd);
                try {
                    meta.put("pages", pr.getPageCount());
                    PdfRenderer.Page p = pr.openPage(0);
                    int w = 360, h = Math.round(360f * p.getHeight() / Math.max(1, p.getWidth()));
                    Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                    new Canvas(b).drawColor(Color.WHITE);
                    p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    p.close();
                    return b;
                } finally { pr.close(); pfd.close(); }
            }
        } catch (Throwable t) { /* ignore */ }
        return null;
    }
}
