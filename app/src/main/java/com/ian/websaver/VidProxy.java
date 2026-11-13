package com.ian.websaver;

import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONObject;

/**
 * https://wslib.local/vp?u=…&r=… ：內建播放器看網頁影片用的轉送。
 * 代替介面向影片網站要資料（帶網頁的 Referer、Cookie、瀏覽器 UA，支援拖曳進度的 Range），
 * m3u8 播放清單裡的每個網址也改成經過這裡，避免防盜連與跨網域限制。
 */
final class VidProxy {
    private VidProxy() { }

    static String wrap(String url, String ref) {
        return "https://wslib.local/vp?r=" + Uri.encode(ref == null ? "" : ref) + "&u=" + Uri.encode(url);
    }

    private static String header(Map<String, String> h, String k) {
        if (h == null) return null;
        for (Map.Entry<String, String> e : h.entrySet()) if (e.getKey() != null && e.getKey().equalsIgnoreCase(k)) return e.getValue();
        return null;
    }

    /* ---------- 讀檔頭：分辨影像／聲音、算出長度 ---------- */
    private static HttpURLConnection open(String url, String ref, String range) throws Exception {
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(8000); c.setReadTimeout(10000);
            c.setRequestProperty("User-Agent", Fetcher.UA);
            if (ref != null && !ref.isEmpty()) c.setRequestProperty("Referer", ref);
            try { String ck = CookieManager.getInstance().getCookie(cur); if (ck != null && !ck.isEmpty()) c.setRequestProperty("Cookie", ck); } catch (Throwable t) { /* ignore */ }
            if (range != null) c.setRequestProperty("Range", range);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) { cur = new URL(new URL(cur), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
            return c;
        }
        throw new Exception("redirects");
    }

    private static byte[] readSome(InputStream in, int max) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while (bo.size() < max && (n = in.read(buf, 0, Math.min(buf.length, max - bo.size()))) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toByteArray();
    }

    private static long u32(byte[] b, int p) { return ((b[p] & 0xffL) << 24) | ((b[p + 1] & 0xffL) << 16) | ((b[p + 2] & 0xffL) << 8) | (b[p + 3] & 0xffL); }
    private static long u64(byte[] b, int p) { return (u32(b, p) << 32) | u32(b, p + 4); }

    /** mp4 檔頭：v＝有影像、a＝有聲音、dur＝長度（秒） */
    static JSONObject probeMp4(String url, String ref) {
        try {
            HttpURLConnection c = open(url, ref, "bytes=0-524287");
            if (c.getResponseCode() >= 400) return null;
            byte[] b = readSome(c.getInputStream(), 524288);
            c.disconnect();
            double[] st = new double[5]; /* 0 timescale, 1 mvhd dur, 2 mehd dur, 3 sidx sec, 4 flags(1=v,2=a) */
            walk(b, 0, b.length, st, 0);
            if (st[4] == 0) {
                /* 不是 mp4（例如 webm）：看副檔名 */
                String low = url.toLowerCase();
                if (low.contains(".webm") || low.contains(".mov") || low.contains(".m4v")) st[4] = 3; else return null;
            }
            double dur = st[0] > 0 && st[1] > 0 ? st[1] / st[0] : st[0] > 0 && st[2] > 0 ? st[2] / st[0] : st[3];
            return new JSONObject().put("v", ((int) st[4] & 1) != 0).put("a", ((int) st[4] & 2) != 0).put("dur", dur);
        } catch (Throwable t) { return null; }
    }

    private static void walk(byte[] b, int pos, int end, double[] st, int depth) {
        while (pos + 8 <= end && depth < 6) {
            long size = u32(b, pos); String type = new String(b, pos + 4, 4, java.nio.charset.StandardCharsets.ISO_8859_1);
            int hdr = 8;
            if (size == 1 && pos + 16 <= end) { size = u64(b, pos + 8); hdr = 16; }
            else if (size == 0) size = end - pos;
            if (size < hdr) return;
            int p = pos + hdr, e = (int) Math.min(end, pos + size);
            try {
                switch (type) {
                    case "moov": case "trak": case "mdia": case "mvex": walk(b, p, e, st, depth + 1); break;
                    case "mvhd":
                        if (b[p] == 1) { st[0] = u32(b, p + 20); st[1] = u64(b, p + 24); } else { st[0] = u32(b, p + 12); st[1] = u32(b, p + 16); }
                        break;
                    case "mehd": st[2] = b[p] == 1 ? u64(b, p + 4) : u32(b, p + 4); break;
                    case "hdlr": {
                        String h = new String(b, p + 8, 4, java.nio.charset.StandardCharsets.ISO_8859_1);
                        if ("vide".equals(h)) st[4] = ((int) st[4]) | 1; else if ("soun".equals(h)) st[4] = ((int) st[4]) | 2;
                        break;
                    }
                    case "sidx": {
                        int v = b[p]; int q = p + 8; long ts = u32(b, q); q += 4;
                        q += v == 0 ? 8 : 16; q += 2; int cnt = (int) ((b[q] & 0xff) << 8 | (b[q + 1] & 0xff)); q += 2;
                        long sum = 0; for (int i = 0; i < cnt && q + 12 <= e; i++, q += 12) sum += u32(b, q + 4);
                        if (ts > 0 && st[3] == 0) st[3] = sum / (double) ts;
                        break;
                    }
                    case "moof": case "mdat": return;
                    default: break;
                }
            } catch (Throwable t) { return; }
            pos += size;
        }
    }

    /** m3u8：算出總長度（直播＝0，不比對） */
    static JSONObject probeHls(String url, String ref) {
        try {
            String txt = getText(url, ref);
            if (txt == null || !txt.contains("#EXTM3U")) return null;
            if (txt.contains("#EXT-X-STREAM-INF")) {
                String[] L = txt.split("\r?\n");
                for (int i = 0; i < L.length; i++) if (L[i].startsWith("#EXT-X-STREAM-INF")) {
                    for (int j = i + 1; j < L.length; j++) { String t = L[j].trim(); if (!t.isEmpty() && !t.startsWith("#")) { txt = getText(new URL(new URL(url), t).toString(), ref); break; } }
                    break;
                }
                if (txt == null) return new JSONObject().put("v", true).put("dur", 0);
            }
            double sum = 0;
            Matcher m = Pattern.compile("#EXTINF:([0-9.]+)").matcher(txt);
            while (m.find()) sum += Double.parseDouble(m.group(1));
            return new JSONObject().put("v", true).put("a", true).put("dur", txt.contains("#EXT-X-ENDLIST") ? sum : 0);
        } catch (Throwable t) { return null; }
    }

    private static String getText(String url, String ref) throws Exception {
        HttpURLConnection c = open(url, ref, null);
        if (c.getResponseCode() >= 400) return null;
        return new String(readSome(c.getInputStream(), 4 << 20), "UTF-8");
    }

    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");

    static WebResourceResponse serve(String url, String ref, Map<String, String> reqH) throws Exception {
        Map<String, String> out = new HashMap<>();
        out.put("Access-Control-Allow-Origin", "*");
        out.put("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
        String range = header(reqH, "Range");
        /* 播放器要「從某個位置讀到最後」時，改成一次讀一段（4MB）：
           不會一直佔著一條連線，影片網站也不會因為閒置太久把連線切掉（之前播到一半聲音或畫面突然斷掉） */
        boolean playlist = url.toLowerCase().matches(".*\\.m3u8(\\?.*|#.*)?$");
        if (range != null && !playlist) {
            Matcher rm = Pattern.compile("bytes=(\\d+)-\\s*$").matcher(range.trim());
            if (rm.find()) { long st = Long.parseLong(rm.group(1)); range = "bytes=" + st + "-" + (st + (4L << 20) - 1); }
        }
        HttpURLConnection c = null;
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            c = (HttpURLConnection) new URL(cur).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", Fetcher.UA);
            c.setRequestProperty("Accept", "*/*");
            if (ref != null && !ref.isEmpty()) {
                c.setRequestProperty("Referer", ref);
                try { Uri r = Uri.parse(ref); c.setRequestProperty("Origin", r.getScheme() + "://" + r.getHost() + (r.getPort() > 0 ? ":" + r.getPort() : "")); } catch (Throwable t) { /* ignore */ }
            }
            try { String ck = CookieManager.getInstance().getCookie(cur); if (ck != null && !ck.isEmpty()) c.setRequestProperty("Cookie", ck); } catch (Throwable t) { /* ignore */ }
            if (range != null) c.setRequestProperty("Range", range);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                cur = new URL(new URL(cur), c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            break;
        }
        int code = c.getResponseCode();
        String ct = c.getContentType();
        String mime = ct == null ? "" : ct.split(";")[0].trim().toLowerCase();
        String low = cur.toLowerCase();
        boolean m3u8 = mime.contains("mpegurl") || low.matches(".*\\.m3u8(\\?.*|#.*)?$");
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) in = new ByteArrayInputStream(new byte[0]);
        if (m3u8 && code < 400) {
            /* 播放清單：裡面的分段、子清單、金鑰網址全部改成經過轉送 */
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0 && bo.size() < (8 << 20)) bo.write(buf, 0, n);
            in.close();
            String txt = new String(bo.toByteArray(), "UTF-8");
            if (txt.trim().startsWith("#EXTM3U")) {
                URL base = new URL(cur);
                StringBuilder sb = new StringBuilder();
                for (String line : txt.split("\r?\n")) {
                    String t = line.trim();
                    if (t.isEmpty()) { sb.append('\n'); continue; }
                    if (t.startsWith("#")) {
                        Matcher m = URI_ATTR.matcher(t);
                        StringBuffer r = new StringBuffer();
                        while (m.find()) m.appendReplacement(r, Matcher.quoteReplacement("URI=\"" + wrap(new URL(base, m.group(1)).toString(), ref) + "\""));
                        m.appendTail(r);
                        sb.append(r).append('\n');
                    } else sb.append(wrap(new URL(base, t).toString(), ref)).append('\n');
                }
                byte[] b = sb.toString().getBytes("UTF-8");
                return new WebResourceResponse("application/vnd.apple.mpegurl", "utf-8", 200, "OK", out, new ByteArrayInputStream(b));
            }
            in = new ByteArrayInputStream(bo.toByteArray());
        }
        String cr = c.getHeaderField("Content-Range"), cl = c.getHeaderField("Content-Length");
        if (cr != null) out.put("Content-Range", cr);
        if (cl != null) out.put("Content-Length", cl);
        out.put("Accept-Ranges", "bytes");
        if (mime.isEmpty() || mime.equals("application/octet-stream") || mime.equals("binary/octet-stream")) {
            mime = low.contains(".webm") ? "video/webm" : low.contains(".ts") ? "video/mp2t" : low.contains(".m4s") ? "video/iso.segment" : "video/mp4";
        }
        String reason = code == 206 ? "Partial Content" : code < 300 ? "OK" : "Error";
        return new WebResourceResponse(mime, null, code, reason, out, in);
    }
}
