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

    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");

    static WebResourceResponse serve(String url, String ref, Map<String, String> reqH) throws Exception {
        Map<String, String> out = new HashMap<>();
        out.put("Access-Control-Allow-Origin", "*");
        out.put("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
        String range = header(reqH, "Range");
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
