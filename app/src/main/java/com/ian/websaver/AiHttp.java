package com.ian.websaver;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * AI 摘要的網路請求放在原生執行緒：關螢幕、切到別的 App 也會繼續（配合前景服務）。
 * 模型忙碌（429／500／503）時自動等一下重試。結果先存起來，網頁回來時再取。
 */
final class AiHttp {
    private static final ExecutorService POOL = Executors.newFixedThreadPool(6);
    private static final ConcurrentHashMap<String, String> DONE = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, Boolean> CANCEL = new ConcurrentHashMap<>();
    private static final AtomicInteger RUN = new AtomicInteger();
    private static volatile String label = "AI 分析中";

    private AiHttp() { }

    static void setLabel(MainActivity a, String s) {
        label = s == null || s.isEmpty() ? "AI 分析中" : s;
        if (RUN.get() > 0) KeepAlive.set(a, "ai", label + "（" + RUN.get() + " 個請求）");
    }

    static void post(final MainActivity a, final String id, final String url, final String headers, final String body, final int retries) {
        RUN.incrementAndGet();
        KeepAlive.set(a, "ai", label + "（" + RUN.get() + " 個請求）");
        POOL.execute(new Runnable() {
            @Override public void run() {
                String res;
                int status = 0;
                String text = "";
                int tries = Math.max(1, retries + 1);
                long[] wait = {3000, 8000, 15000, 25000, 40000};
                for (int i = 0; i < tries; i++) {
                    if (CANCEL.remove(id) != null) { status = -2; text = "cancelled"; break; }
                    try {
                        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(15 * 60 * 1000);
                        c.setRequestMethod("POST");
                        c.setDoOutput(true);
                        JSONObject h = new JSONObject(headers == null || headers.isEmpty() ? "{}" : headers);
                        Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.optString(k)); }
                        byte[] b = body.getBytes("UTF-8");
                        c.setFixedLengthStreamingMode(b.length);
                        OutputStream os = c.getOutputStream();
                        os.write(b);
                        os.close();
                        status = c.getResponseCode();
                        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                        text = in == null ? "" : read(in);
                        c.disconnect();
                    } catch (Throwable t) {
                        status = -1;
                        text = String.valueOf(t.getMessage());
                    }
                    boolean busy = status == 429 || status == 500 || status == 502 || status == 503 || status == 504 || status == -1;
                    if (!busy || i == tries - 1) break;
                    try { Thread.sleep(wait[Math.min(i, wait.length - 1)]); } catch (InterruptedException e) { break; }
                }
                try { res = new JSONObject().put("id", id).put("status", status).put("body", text).toString(); }
                catch (Throwable t) { res = "{\"id\":\"" + id + "\",\"status\":-1,\"body\":\"\"}"; }
                DONE.put(id, res);
                MainActivity.emit("aiHttp", res);
                int n = RUN.decrementAndGet();
                KeepAlive.set(a, "ai", n <= 0 ? null : label + "（" + n + " 個請求）");
            }
        });
    }

    static String take(String id) { String r = DONE.remove(id); return r == null ? "" : r; }

    static void cancel(String id) { CANCEL.put(id, true); }

    private static String read(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toString("UTF-8");
    }
}
