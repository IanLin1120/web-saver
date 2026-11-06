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

    /** 分段下載（每段 10MB 的 Range 請求，避免影片伺服器限速）。ua 可為 null。 */
    static String chunked(String url, String ua, String referer, boolean cookies, File out, Progress p, boolean[] cancel) throws Exception {
        final long CH = 10L << 20;
        long got = 0, total = -1;
        String mime = "";
        OutputStream os = new FileOutputStream(out);
        try {
            while (total < 0 || got < total) {
                if (cancel != null && cancel[0]) throw new Exception("已取消");
                long end = got + CH - 1;
                if (total > 0) end = Math.min(end, total - 1);
                HttpURLConnection c = null;
                Exception last = null;
                for (int attempt = 0; attempt < 4; attempt++) {
                    try {
                        c = (HttpURLConnection) new URL(url).openConnection();
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(45000);
                        c.setRequestProperty("User-Agent", ua == null || ua.isEmpty() ? UA : ua);
                        c.setRequestProperty("Accept", "*/*");
                        c.setRequestProperty("Range", "bytes=" + got + "-" + end);
                        if (referer != null && referer.startsWith("http")) c.setRequestProperty("Referer", referer);
                        if (cookies) { try { String ck = CookieManager.getInstance().getCookie(url); if (ck != null) c.setRequestProperty("Cookie", ck); } catch (Throwable t) { /* ignore */ } }
                        int code = c.getResponseCode();
                        if (code == 416 && total > 0) return mime;
                        if (code != 206 && code != 200) throw new Exception("HTTP " + code);
                        String ct = c.getContentType();
                        if (ct != null) mime = ct.split(";")[0].trim().toLowerCase();
                        String cr = c.getHeaderField("Content-Range");
                        if (code == 206 && cr != null && cr.contains("/")) {
                            String t = cr.substring(cr.lastIndexOf('/') + 1).trim();
                            if (!t.equals("*")) total = Long.parseLong(t);
                        } else if (code == 200) {
                            total = c.getContentLengthLong();
                            if (got > 0) throw new Exception("伺服器不支援分段");
                        }
                        InputStream in = c.getInputStream();
                        byte[] buf = new byte[131072];
                        int n;
                        long lastT = 0;
                        while ((n = in.read(buf)) > 0) {
                            os.write(buf, 0, n);
                            got += n;
                            long now = System.currentTimeMillis();
                            if (p != null && now - lastT > 300) { lastT = now; p.on(got, total); }
                            if (cancel != null && cancel[0]) break;
                        }
                        in.close();
                        last = null;
                        break;
                    } catch (Exception e) {
                        last = e;
                        if (c != null) c.disconnect();
                        Thread.sleep(700L * (attempt + 1));
                    }
                }
                if (last != null) throw last;
                if (c != null) c.disconnect();
                if (total < 0) total = got;
                if (p != null) p.on(got, total);
            }
        } finally { os.close(); }
        return mime;
    }

    /** 一般 HTTP 請求（給介面用，例如 YouTube 解析）。回傳 [狀態碼, 內容]。 */
    static String[] request(String method, String url, java.util.Map<String, String> headers, String body, boolean cookies) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", UA);
            if (headers != null) for (java.util.Map.Entry<String, String> e : headers.entrySet()) c.setRequestProperty(e.getKey(), e.getValue());
            if (cookies) { try { String ck = CookieManager.getInstance().getCookie(url); if (ck != null) c.setRequestProperty("Cookie", ck); } catch (Throwable t) { /* ignore */ } }
            if (body != null) {
                c.setDoOutput(true);
                byte[] b = body.getBytes("UTF-8");
                c.setFixedLengthStreamingMode(b.length);
                OutputStream os = c.getOutputStream();
                os.write(b);
                os.close();
            }
            int code = c.getResponseCode();
            InputStream in = code >= 200 && code < 400 ? c.getInputStream() : c.getErrorStream();
            return new String[] {String.valueOf(code), in == null ? "" : new String(Util.readAllBytes(in, 32L << 20), "UTF-8")};
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
