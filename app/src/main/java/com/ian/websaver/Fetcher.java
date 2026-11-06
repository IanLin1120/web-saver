package com.ian.websaver;

import android.webkit.CookieManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** 以瀏覽器的 Cookie 與 Referer 下載資源（不受網頁 CORS 限制，登入後的內容也抓得到）。 */
final class Fetcher {
    private Fetcher() { }

    static volatile String UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

    static final class Res {
        int code;
        String mime = "";
        String charset = "";
        byte[] bytes;
        String url;
        long length = -1;
    }

    interface Progress { void on(long got, long total); }

    static HttpURLConnection open(String url, String referer, String accept, long rangeFrom) throws Exception {
        String u = url;
        for (int hop = 0; hop < 8; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(45000);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", accept == null ? "*/*" : accept);
            c.setRequestProperty("Accept-Language", "zh-TW,zh;q=0.9,en;q=0.8");
            if (referer != null && !referer.isEmpty() && referer.startsWith("http")) c.setRequestProperty("Referer", referer);
            if (rangeFrom > 0) c.setRequestProperty("Range", "bytes=" + rangeFrom + "-");
            try {
                String ck = CookieManager.getInstance().getCookie(u);
                if (ck != null && !ck.isEmpty()) c.setRequestProperty("Cookie", ck);
            } catch (Throwable t) { /* ignore */ }
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                u = new URL(new URL(u), c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            return c;
        }
        throw new Exception("轉址太多次");
    }

    static Res get(String url, String referer, String accept, long max) throws Exception {
        HttpURLConnection c = open(url, referer, accept, 0);
        try {
            Res r = new Res();
            r.code = c.getResponseCode();
            r.url = c.getURL().toString();
            String ct = c.getContentType();
            if (ct != null) {
                int sc = ct.indexOf(';');
                r.mime = (sc > 0 ? ct.substring(0, sc) : ct).trim().toLowerCase();
                int cs = ct.toLowerCase().indexOf("charset=");
                if (cs >= 0) r.charset = ct.substring(cs + 8).replace("\"", "").trim();
            }
            if (r.code < 200 || r.code >= 300) throw new Exception("HTTP " + r.code);
            r.length = c.getContentLengthLong();
            if (max > 0 && r.length > max) throw new Exception("檔案太大");
            r.bytes = Util.readAllBytes(c.getInputStream(), max);
            return r;
        } finally {
            c.disconnect();
        }
    }

    /** 指定位元組範圍（HLS 的 EXT-X-BYTERANGE） */
    static byte[] getRange(String url, String referer, long off, long len) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(20000);
            c.setReadTimeout(45000);
            c.setRequestProperty("User-Agent", UA);
            if (referer != null && referer.startsWith("http")) c.setRequestProperty("Referer", referer);
            c.setRequestProperty("Range", "bytes=" + off + "-" + (off + len - 1));
            try { String ck = CookieManager.getInstance().getCookie(url); if (ck != null) c.setRequestProperty("Cookie", ck); } catch (Throwable t) { /* ignore */ }
            int code = c.getResponseCode();
            if (code != 206 && code != 200) throw new Exception("HTTP " + code);
            byte[] b = Util.readAllBytes(c.getInputStream(), 0);
            if (code == 200 && b.length > off + len - 1) { byte[] x = new byte[(int) len]; System.arraycopy(b, (int) off, x, 0, (int) len); return x; }
            return b;
        } finally { c.disconnect(); }
    }

    static String text(String url, String referer) throws Exception {
        Res r = get(url, referer, "*/*", 8 << 20);
        String cs = r.charset.isEmpty() ? "UTF-8" : r.charset;
        try { return new String(r.bytes, cs); } catch (Throwable t) { return new String(r.bytes, "UTF-8"); }
    }

    /** 串流下載到檔案（支援進度、中斷續傳一次）。回傳 Content-Type。 */
    static String toFile(String url, String referer, File out, Progress p) throws Exception {
        long got = 0, total = -1;
        String mime = "";
        for (int attempt = 0; attempt < 3; attempt++) {
            HttpURLConnection c = open(url, referer, "*/*", got);
            try {
                int code = c.getResponseCode();
                if (code == 416 && got > 0) return mime;
                if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
                boolean partial = code == 206 && got > 0;
                if (!partial) got = 0;
                String ct = c.getContentType();
                if (ct != null) mime = ct.split(";")[0].trim().toLowerCase();
                long len = c.getContentLengthLong();
                if (len > 0) total = got + len;
                InputStream in = c.getInputStream();
                OutputStream os = new FileOutputStream(out, partial);
                byte[] buf = new byte[131072];
                int n;
                long last = 0;
                try {
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        got += n;
                        long now = System.currentTimeMillis();
                        if (p != null && now - last > 300) { last = now; p.on(got, total); }
                    }
                } finally {
                    os.close();
                    in.close();
                }
                if (total > 0 && got < total) throw new java.io.IOException("連線中斷");
                if (p != null) p.on(got, total);
                return mime;
            } catch (java.io.IOException e) {
                if (attempt == 2) throw e;
                Thread.sleep(800);
            } finally {
                c.disconnect();
            }
        }
        return mime;
    }
}
