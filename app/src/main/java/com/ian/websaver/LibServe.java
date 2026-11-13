package com.ian.websaver;

import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/** https://wslib.local/px?u=…&r=… ：代替介面抓遠端縮圖（帶 Referer 與 Cookie，避免防盜連），附小型快取。 */
final class LibServe {
    private LibServe() { }

    private static final LinkedHashMap<String, Object[]> CACHE = new LinkedHashMap<String, Object[]>(64, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Object[]> e) { return size() > 120; }
    };

    static WebResourceResponse serve(MainActivity a, Uri u, Map<String, String> reqH) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "max-age=3600");
        try {
            if ("/vp".equals(u.getPath())) {
                String url = u.getQueryParameter("u");
                if (url == null || !url.startsWith("http")) throw new Exception("bad");
                return VidProxy.serve(url, u.getQueryParameter("r"), reqH);
            }
            if ("/px".equals(u.getPath())) {
                String url = u.getQueryParameter("u"), ref = u.getQueryParameter("r");
                if (url == null || !url.startsWith("http")) throw new Exception("bad");
                Object[] c;
                synchronized (CACHE) { c = CACHE.get(url); }
                if (c == null) {
                    Fetcher.Res r = Fetcher.get(url, ref, "image/avif,image/webp,image/*,*/*;q=0.8", 15L << 20);
                    String mime = r.mime.startsWith("image/") ? r.mime : Browser.sniffImage(r.bytes);
                    if (mime == null) mime = "application/octet-stream";
                    c = new Object[] {mime, r.bytes};
                    if (r.bytes.length < 3 << 20) synchronized (CACHE) { CACHE.put(url, c); }
                }
                return new WebResourceResponse((String) c[0], null, 200, "OK", h, new ByteArrayInputStream((byte[]) c[1]));
            }
        } catch (Throwable t) { /* fall through */ }
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new ByteArrayInputStream(new byte[0]));
    }
}
