package com.ian.websaver;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 長條漫畫／圖集模式：只取網頁裡的內容圖片，依序做成「無縫」PDF（每張圖一頁、頁寬一致、沒有任何按鈕遮擋）與長條 HTML。
 *  PDF 直接嵌入 JPEG（不重新壓縮成點陣），檔案小、畫質不變。 */
final class Comic {
    private Comic() { }

    static final int MAX_W = 1600;

    static final class Img { File f; int w, h, comps = 3; }

    static void emit(String state, int pct, String msg) {
        try { MainActivity.emit("cap", new JSONObject().put("state", state).put("pct", pct).put("msg", msg).toString()); } catch (Throwable t) { /* ignore */ }
    }

    /** 轉成 PDF 可直接嵌入的 JPEG（RGB 或灰階），太寬的縮到 MAX_W */
    static Img toJpeg(Lib lib, byte[] data) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, o);
        if (o.outWidth <= 0) return null;
        boolean jpeg = data.length > 3 && (data[0] & 0xff) == 0xFF && (data[1] & 0xff) == 0xD8;
        int comps = jpeg ? sofComponents(data) : 0;
        Img im = new Img();
        im.f = lib.tmpFile("jpg");
        if (jpeg && (comps == 3 || comps == 1) && o.outWidth <= MAX_W) {
            FileOutputStream os = new FileOutputStream(im.f);
            os.write(data);
            os.close();
            im.w = o.outWidth; im.h = o.outHeight; im.comps = comps;
            return im;
        }
        int ss = 1;
        while (o.outWidth / (ss * 2) >= MAX_W) ss *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = ss;
        Bitmap b = BitmapFactory.decodeByteArray(data, 0, data.length, o2);
        if (b == null) return null;
        if (b.getWidth() > MAX_W) b = Bitmap.createScaledBitmap(b, MAX_W, Math.max(1, Math.round((float) b.getHeight() * MAX_W / b.getWidth())), true);
        Bitmap w = Bitmap.createBitmap(b.getWidth(), b.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(w);
        c.drawColor(Color.WHITE);
        c.drawBitmap(b, 0, 0, null);
        FileOutputStream os = new FileOutputStream(im.f);
        w.compress(Bitmap.CompressFormat.JPEG, 92, os);
        os.close();
        im.w = w.getWidth(); im.h = w.getHeight(); im.comps = 3;
        return im;
    }

    static int sofComponents(byte[] d) {
        int i = 2;
        while (i + 9 < d.length) {
            if ((d[i] & 0xff) != 0xFF) { i++; continue; }
            int m = d[i + 1] & 0xff;
            if (m == 0xD8 || m == 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
            int len = ((d[i + 2] & 0xff) << 8) | (d[i + 3] & 0xff);
            if (m >= 0xC0 && m <= 0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC) return d[i + 9] & 0xff;
            i += 2 + len;
        }
        return 0;
    }

    /** 最小的 PDF 寫入器：每張 JPEG 一頁，頁寬 595pt，高度依比例 */
    static void writePdf(List<Img> imgs, File out, String title) throws Exception {
        OutputStream os = new java.io.BufferedOutputStream(new FileOutputStream(out), 1 << 16);
        long[] off = new long[3 + imgs.size() * 3 + 1];
        long[] pos = {0};
        int n = imgs.size();
        int pagesObj = 2, infoObj = 3 + n * 3;
        pos[0] += w(os, "%PDF-1.4\n%âãÏÓ\n");
        off[1] = pos[0];
        pos[0] += w(os, "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /PageLayout /OneColumn >>\nendobj\n");
        StringBuilder kids = new StringBuilder();
        for (int i = 0; i < n; i++) kids.append(3 + i * 3).append(" 0 R ");
        off[2] = pos[0];
        pos[0] += w(os, "2 0 obj\n<< /Type /Pages /Count " + n + " /Kids [" + kids + "] >>\nendobj\n");
        byte[] buf = new byte[65536];
        for (int i = 0; i < n; i++) {
            Img im = imgs.get(i);
            float pw = 595f, ph = Math.max(10f, 595f * im.h / im.w);
            int pageObj = 3 + i * 3, contObj = pageObj + 1, imgObj = pageObj + 2;
            off[pageObj] = pos[0];
            pos[0] += w(os, pageObj + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + fmt(pw) + " " + fmt(ph) + "] /Resources << /XObject << /Im0 " + imgObj + " 0 R >> >> /Contents " + contObj + " 0 R >>\nendobj\n");
            String cs = "q " + fmt(pw) + " 0 0 " + fmt(ph) + " 0 0 cm /Im0 Do Q";
            off[contObj] = pos[0];
            pos[0] += w(os, contObj + " 0 obj\n<< /Length " + cs.length() + " >>\nstream\n" + cs + "\nendstream\nendobj\n");
            off[imgObj] = pos[0];
            pos[0] += w(os, imgObj + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace " + (im.comps == 1 ? "/DeviceGray" : "/DeviceRGB") +
                " /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.f.length() + " >>\nstream\n");
            FileInputStream in = new FileInputStream(im.f);
            int r;
            while ((r = in.read(buf)) > 0) { os.write(buf, 0, r); pos[0] += r; }
            in.close();
            pos[0] += w(os, "\nendstream\nendobj\n");
        }
        off[infoObj] = pos[0];
        pos[0] += w(os, infoObj + " 0 obj\n<< /Title " + pdfStr(title) + " /Producer (WebSaver) >>\nendobj\n");
        long xref = pos[0];
        StringBuilder x = new StringBuilder("xref\n0 " + (infoObj + 1) + "\n0000000000 65535 f \n");
        for (int i = 1; i <= infoObj; i++) x.append(String.format("%010d 00000 n \n", off[i]));
        x.append("trailer\n<< /Size ").append(infoObj + 1).append(" /Root 1 0 R /Info ").append(infoObj).append(" 0 R >>\nstartxref\n").append(xref).append("\n%%EOF\n");
        w(os, x.toString());
        os.close();
    }

    static String fmt(float v) { return String.format(java.util.Locale.US, "%.2f", v); }

    static String pdfStr(String s) {
        StringBuilder b = new StringBuilder("<FEFF");
        for (char ch : (s == null ? "" : s).toCharArray()) b.append(String.format("%04X", (int) ch));
        return b.append(">").toString();
    }

    static int w(OutputStream os, String s) throws Exception {
        byte[] b = s.getBytes(StandardCharsets.ISO_8859_1);
        os.write(b);
        return b.length;
    }

    static void writeHtml(List<Img> imgs, File out, String title, String src) throws Exception {
        OutputStream os = new java.io.BufferedOutputStream(new FileOutputStream(out), 1 << 16);
        String t = title == null ? "" : title.replace("&", "&amp;").replace("<", "&lt;");
        os.write(("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + t + "</title>" +
            "<meta name=\"ws-saved-from\" content=\"" + (src == null ? "" : src.replace("\"", "%22")) + "\">" +
            "<style>html,body{margin:0;background:#111}img{display:block;width:100%;max-width:900px;margin:0 auto;height:auto}</style></head><body>").getBytes(StandardCharsets.UTF_8));
        byte[] buf = new byte[3 * 21846];
        for (Img im : imgs) {
            os.write(("<img width=\"" + im.w + "\" height=\"" + im.h + "\" src=\"data:image/jpeg;base64,").getBytes(StandardCharsets.US_ASCII));
            FileInputStream in = new FileInputStream(im.f);
            int r;
            while ((r = readFully(in, buf)) > 0) os.write(Base64.encode(buf, 0, r, Base64.NO_WRAP));
            in.close();
            os.write("\">".getBytes(StandardCharsets.US_ASCII));
        }
        os.write("</body></html>".getBytes(StandardCharsets.UTF_8));
        os.close();
    }

    static int readFully(java.io.InputStream in, byte[] b) throws Exception {
        int got = 0, r;
        while (got < b.length && (r = in.read(b, got, b.length - got)) > 0) got += r;
        return got;
    }

    /** 從網頁上收集到的圖片網址製作 */
    static void fromUrls(final MainActivity a, final JSONArray list, final String referer, final JSONObject opts, final String title, final android.graphics.Bitmap thumb) {
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                Lib lib = Lib.get(a);
                List<Img> imgs = new ArrayList<>();
                try {
                    int n = list.length();
                    if (n == 0) throw new Exception("這個頁面沒有找到內容圖片");
                    for (int i = 0; i < n; i++) {
                        JSONObject it = list.getJSONObject(i);
                        emit("progress", 10 + 75 * i / n, "下載圖片 " + (i + 1) + "/" + n);
                        byte[] d = null;
                        String u = it.getString("url");
                        for (int t = 0; t < 3 && d == null; t++) {
                            try {
                                if (u.startsWith("data:")) d = Base64.decode(u.substring(u.indexOf(',') + 1), Base64.DEFAULT);
                                else d = Fetcher.get(u, referer, "image/avif,image/webp,image/*,*/*;q=0.8", 60L << 20).bytes;
                            } catch (Throwable e) { Thread.sleep(500); }
                        }
                        if (d == null) continue;
                        Img im = toJpeg(lib, d);
                        if (im != null) imgs.add(im);
                    }
                    finish(a, imgs, opts, title, referer, thumb);
                } catch (Throwable e) {
                    for (Img im : imgs) im.f.delete();
                    try { MainActivity.emit("cap", new JSONObject().put("state", "error").put("msg", String.valueOf(e.getMessage())).toString()); } catch (Throwable x) { /* ignore */ }
                }
            }
        });
    }

    static void finish(MainActivity a, List<Img> imgs, JSONObject opts, String title, String src, android.graphics.Bitmap thumb) throws Exception {
        if (imgs.isEmpty()) throw new Exception("沒有可用的圖片");
        Lib lib = Lib.get(a);
        String fmt = opts.optString("format", "pdf");
        String base = Util.safeName(opts.optString("name", title));
        JSONArray out = new JSONArray();
        if (!fmt.equals("html")) {
            emit("progress", 90, "製作無縫 PDF（" + imgs.size() + " 頁）…");
            File pdf = lib.tmpFile("pdf");
            writePdf(imgs, pdf, title);
            JSONObject o = lib.add(pdf, base + ".pdf", "application/pdf", src, title, thumb);
            lib.touch(o.getString("id"), "seamless", true);
            o.put("seamless", true);
            out.put(o);
        }
        if (!fmt.equals("pdf")) {
            emit("progress", 95, "製作長條 HTML…");
            File html = lib.tmpFile("html");
            writeHtml(imgs, html, title, src);
            out.put(lib.add(html, base + ".html", "text/html", src, title, thumb));
        }
        for (Img im : imgs) im.f.delete();
        if (a.prefs.getBoolean("autoExport", false)) Exporter.toDownloads(a, out, true);
        MainActivity.emit("cap", new JSONObject().put("state", "done").put("items", out).toString());
        MainActivity.emit("lib", "");
    }

    /** 從已存的離線網頁（HTML）取出內容圖片，做成無縫 PDF */
    static void fromHtml(final MainActivity a, final String id, final JSONObject opts) {
        Util.BG.execute(new Runnable() {
            @Override public void run() {
                List<Img> imgs = new ArrayList<>();
                try {
                    Lib lib = Lib.get(a);
                    JSONObject item = lib.find(id);
                    if (item == null) throw new Exception("找不到檔案");
                    emit("progress", 5, "讀取網頁…");
                    String html = new String(Util.readAllBytes(new FileInputStream(lib.fileOf(item)), 0), StandardCharsets.UTF_8);
                    Matcher m = Pattern.compile("<img\\b[^>]*?\\ssrc=\"data:image/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)\"", Pattern.CASE_INSENSITIVE).matcher(html);
                    List<byte[]> datas = new ArrayList<>();
                    List<int[]> dims = new ArrayList<>();
                    int maxW = 0;
                    while (m.find()) {
                        byte[] d = Base64.decode(m.group(1), Base64.DEFAULT);
                        BitmapFactory.Options o = new BitmapFactory.Options();
                        o.inJustDecodeBounds = true;
                        BitmapFactory.decodeByteArray(d, 0, d.length, o);
                        if (o.outWidth <= 0) continue;
                        datas.add(d);
                        dims.add(new int[] {o.outWidth, o.outHeight});
                        maxW = Math.max(maxW, o.outWidth);
                    }
                    html = null;
                    double ratio = opts.optDouble("minRatio", 0.6);
                    int n = datas.size();
                    for (int i = 0; i < n; i++) {
                        int[] wh = dims.get(i);
                        if (wh[0] < maxW * ratio || wh[1] < 80) continue;
                        emit("progress", 10 + 75 * i / Math.max(1, n), "整理圖片 " + (i + 1) + "/" + n);
                        Img im = toJpeg(lib, datas.get(i));
                        if (im != null) imgs.add(im);
                        datas.set(i, null);
                    }
                    if (!opts.has("name")) opts.put("name", item.optString("name").replaceAll("\\.html?$", "") + "_無縫");
                    if (!opts.has("format")) opts.put("format", "pdf");
                    finish(a, imgs, opts, item.optString("title", item.optString("name")), item.optString("src"), null);
                } catch (Throwable e) {
                    for (Img im : imgs) im.f.delete();
                    try { MainActivity.emit("cap", new JSONObject().put("state", "error").put("msg", String.valueOf(e.getMessage())).toString()); } catch (Throwable x) { /* ignore */ }
                }
            }
        });
    }
}
