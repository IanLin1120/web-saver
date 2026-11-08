package com.ian.websaver;

import android.util.Base64;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * YouTube 錄製式下載：在看不到的背景播放器（靜音）裡打開影片，
 * 把 YouTube 播放器實際收到的影像／聲音資料依序存下來，再合併成檔案。
 * 不需要自己去要下載網址，所以不受 403、機器人驗證、SABR 新串流格式影響。
 */
final class YtGrab {
    private YtGrab() {}

    static final class Job {
        File v, a;
        FileOutputStream vo, ao;
        String vMime = "", aMime = "", err = null, note = "";
        boolean slow = false;
        long vBytes = 0, aBytes = 0;
        volatile long lastData = System.currentTimeMillis(), lastPing = System.currentTimeMillis();
        volatile double pct = 0;
        final CountDownLatch done = new CountDownLatch(1);
    }

    static volatile Job cur;

    static Object[] run(final MainActivity a, Lib lib, JSONObject it, String base, int i, int n, String shown) throws Exception {
        /* 背景錄製只有一個看不到的播放器：同時有多個錄製時依序排隊（其他直接下載不受影響） */
        while (!LOCK.tryAcquire(1, TimeUnit.SECONDS)) {
            if (MediaDl.cancel()[0]) throw new Exception("已取消");
            emit(i, n, "排隊中：等前一個錄製完成・" + shown, 0, 0);
        }
        try { return run2(a, lib, it, base, i, n, shown); } finally { LOCK.release(); }
    }

    static final java.util.concurrent.Semaphore LOCK = new java.util.concurrent.Semaphore(1);

    private static Object[] run2(final MainActivity a, Lib lib, JSONObject it, String base, int i, int n, String shown) throws Exception {
        final String vid = it.optString("vid");
        final boolean audio = it.optBoolean("audioOnly", false);
        final Job j = new Job();
        j.v = lib.tmpFile("v");
        j.a = lib.tmpFile("a");
        j.vo = new FileOutputStream(j.v);
        j.ao = new FileOutputStream(j.a);
        cur = j;
        final JSONObject g = new JSONObject();
        g.put("q", it.optString("q", "hd720"));
        g.put("h", it.optInt("h", 720));
        g.put("audio", audio);
        g.put("len", it.optDouble("len", 0));
        g.put("codec", it.optString("codec", "webm"));
        Util.MAIN.post(new Runnable() {
            @Override public void run() {
                Browser b = a.hidden("grab");
                b.grabOpts = g;
                b.wv.getSettings().setMediaPlaybackRequiresUserGesture(false);
                b.wv.loadUrl("https://m.youtube.com/watch?v=" + vid);
            }
        });
        String stem = base.replaceAll("\\.[A-Za-z0-9]{2,5}$", "");
        long start = System.currentTimeMillis();
        double lastPct = -1;
        try {
            while (!j.done.await(700, TimeUnit.MILLISECONDS)) {
                if (MediaDl.cancel()[0]) throw new Exception("已取消");
                long now = System.currentTimeMillis();
                if (now - j.lastData > (j.vBytes + j.aBytes == 0 ? 60000 : 90000))
                    throw new Exception(j.vBytes + j.aBytes == 0 ? "背景播放器 60 秒內沒有開始播放（可能需要登入、影片有年齡限制或地區限制）" : "背景播放器超過 90 秒沒有收到新資料（網路中斷？）");
                final boolean watching = a.yt != null && a.yt.videoPlaying;
                if (watching != j.slow) {
                    j.slow = watching;
                    Util.MAIN.post(new Runnable() { @Override public void run() { a.hidden("grab").wv.evaluateJavascript("window.__wsGrabSlow=" + (watching ? 1 : 0), null); } });
                }
                if (j.pct != lastPct) {
                    lastPct = j.pct;
                    String msg = (j.note.isEmpty() ? "" : j.note + "・") + shown;
                    emit(i, n, msg, j.pct, j.vBytes + j.aBytes);
                }
                if (now - start > 3 * 3600_000L) throw new Exception("下載時間過長");
            }
            if (j.err != null && !j.err.isEmpty()) throw new Exception(j.err);
        } finally {
            cur = null;
            try { j.vo.close(); } catch (Throwable t) { /* ignore */ }
            try { j.ao.close(); } catch (Throwable t) { /* ignore */ }
            Util.MAIN.post(new Runnable() {
                @Override public void run() {
                    Browser b = a.hidden("grab");
                    b.grabOpts = null;
                    b.wv.loadUrl("about:blank");
                }
            });
        }
        boolean aw = j.aMime.contains("webm"), vw = j.vMime.contains("webm");
        if (audio || j.vBytes == 0) {
            if (j.aBytes == 0) throw new Exception("沒有收到聲音資料");
            j.v.delete();
            String out = it.optString("audioOut", "orig");
            if (out.equals("opus") && aw && android.os.Build.VERSION.SDK_INT >= 29) {
                File o = lib.tmpFile("opus");
                try { Mux.mux(null, j.a, o, true, 4); j.a.delete(); return new Object[] {o, stem + ".opus", "audio/ogg"}; } catch (Throwable e) { o.delete(); }
            }
            /* 重新封裝一次，產生有正確時長與索引的檔案 */
            File o = lib.tmpFile(aw ? "webm" : "m4a");
            try {
                Mux.mux(null, j.a, o, true, aw ? android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM : android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
                j.a.delete();
                return new Object[] {o, stem + (aw ? ".webm" : ".m4a"), aw ? "audio/webm" : "audio/mp4"};
            } catch (Throwable e) {
                o.delete();
                return new Object[] {j.a, stem + (aw ? ".webm" : ".m4a"), aw ? "audio/webm" : "audio/mp4"};
            }
        }
        emit(i, n, "合併影像與聲音…・" + shown, 1, j.vBytes + j.aBytes);
        String cont = vw ? "webm" : "mp4";
        File out = lib.tmpFile(cont);
        try {
            Mux.mux(j.v, j.aBytes > 0 ? j.a : null, out, false, vw ? android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM : android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            /* 最後再確認一次長度：明顯比影片短就當作失敗，不會再出現「顯示完成但只有 19 秒」 */
            double want = it.optDouble("len", 0);
            if (want > 10) {
                double got = durationOf(out);
                if (got > 0 && got < want * 0.9) { out.delete(); throw new Exception("錄製不完整：只有 " + Math.round(got) + " 秒（影片長 " + Math.round(want) + " 秒），請再試一次"); }
            }
            j.v.delete();
            j.a.delete();
            return new Object[] {out, stem + "." + cont, vw ? "video/webm" : "video/mp4"};
        } catch (Throwable e) {
            out.delete();
            if (e.getMessage() != null && e.getMessage().startsWith("錄製不完整")) throw new Exception(e.getMessage());
            /* 合併失敗：至少把影像存下來（聲音另存） */
            if (j.aBytes > 0) {
                try { Lib.get(a).add(j.a, stem + "_聲音" + (aw ? ".webm" : ".m4a"), aw ? "audio/webm" : "audio/mp4", it.optString("src"), it.optString("title"), null); } catch (Throwable x) { /* ignore */ }
            }
            return new Object[] {j.v, stem + "." + cont, vw ? "video/webm" : "video/mp4"};
        }
    }

    /* ================= 一般網頁影片：錄製下載（影片原畫面＋聲音） ================= */
    static Object[] runRec(final MainActivity a, Lib lib, JSONObject it, String base, int i, int n, String shown) throws Exception {
        while (!LOCK.tryAcquire(1, TimeUnit.SECONDS)) {
            if (MediaDl.cancel()[0]) throw new Exception("已取消");
            emit(i, n, "排隊中：等前一個錄製完成・" + shown, 0, 0);
        }
        try { return rec2(a, lib, it, base, i, n, shown); } finally { LOCK.release(); }
    }

    private static Object[] rec2(final MainActivity a, Lib lib, JSONObject it, String base, int i, int n, String shown) throws Exception {
        final Job j = new Job();
        j.v = lib.tmpFile("v");
        j.a = lib.tmpFile("a");
        j.vo = new FileOutputStream(j.v);
        j.ao = new FileOutputStream(j.a);
        cur = j;
        final boolean here = it.optBoolean("here", false);
        final String page = it.optString("page", it.optString("referer", ""));
        JSONObject o = new JSONObject();
        o.put("src", it.optString("url"));
        o.put("keepPos", false);
        final String js = "(function(){try{[].forEach.call(document.querySelectorAll('video'),function(v){if(!v.__wsSrcNode)v.muted=true;});"
            + "return window.__wsRec?__wsRec.start(" + o.toString() + "):'noscript';}catch(e){return 'err:'+e.message;}})()";
        final String[] res = {""};
        if (!here) {
            Util.MAIN.post(new Runnable() { @Override public void run() { Browser b = a.hidden("rec"); b.wv.loadUrl(page); } });
        }
        String stem = base.replaceAll("\\.[A-Za-z0-9]{2,5}$", "");
        long start = System.currentTimeMillis(), lastTry = 0;
        boolean started = false;
        double lastPct = -1;
        String partial = null;
        try {
            while (!j.done.await(1000, TimeUnit.MILLISECONDS)) {
                if (MediaDl.cancel()[0]) throw new Exception("已取消");
                long now = System.currentTimeMillis();
                /* 錄製頁面不見了（網頁跳轉、被關掉）：保留已經錄到的部分 */
                if (started && now - j.lastPing > 20000) { partial = "網頁停止回應"; break; }
                if (!started) {
                    String r = res[0];
                    if (r.equals("ok")) { started = true; j.lastData = now; continue; }
                    if (r.startsWith("nocap")) throw new Exception("這部影片不能錄製（有防錄製保護，或影片來自其他網域）。請改用一般下載。" + (r.length() > 6 ? "\n" + r.substring(6) : ""));
                    if (now - start > 75000) throw new Exception((r.equals("novideo") ? "在網頁裡找不到影片（可能要先點播放，試試「在目前分頁錄製」）" : "影片沒有開始播放（" + r + "）"));
                    if (now - start > (here ? 0 : 3500) && now - lastTry > 2500) {
                        lastTry = now;
                        Util.MAIN.post(new Runnable() {
                            @Override public void run() {
                                Browser b = here ? a.br : a.hidden("rec");
                                b.wv.evaluateJavascript(js, new android.webkit.ValueCallback<String>() {
                                    @Override public void onReceiveValue(String v) { res[0] = v == null ? "" : v.replaceAll("^\"|\"$", ""); }
                                });
                            }
                        });
                    }
                    emit(i, n, "載入影片、準備錄製…・" + shown, 0, 0);
                    continue;
                }
                if (now - j.lastData > 150000) { partial = "影片卡住"; break; }
                lastPct = j.pct;
                emit(i, n, (j.note.isEmpty() ? "錄製中" : j.note) + "・" + shown, lastPct, j.vBytes);
                if (now - start > 6 * 3600_000L) { partial = "錄製時間過長"; break; }
            }
            if (j.err != null && !j.err.isEmpty()) partial = j.err;
        } catch (Exception e) {
            /* 已經錄到一部分：除非是你按取消，否則把錄到的部分存起來 */
            if (!started || j.vBytes == 0 || MediaDl.cancel()[0]) throw e;
            partial = e.getMessage();
        } finally {
            cur = null;
            try { j.vo.close(); } catch (Throwable t) { /* ignore */ }
            try { j.ao.close(); } catch (Throwable t) { /* ignore */ }
            j.a.delete();
            if (!started || MediaDl.cancel()[0] || partial != null) {
                Util.MAIN.post(new Runnable() { @Override public void run() {
                    Browser b = here ? a.br : a.hidden("rec");
                    b.wv.evaluateJavascript("window.__wsRec&&__wsRec.stop()", null);
                } });
            }
            if (!here) Util.MAIN.postDelayed(new Runnable() { @Override public void run() { a.hidden("rec").wv.loadUrl("about:blank"); } }, 1500);
        }
        if (j.vBytes == 0) throw new Exception("沒有錄到任何畫面");
        emit(i, n, "整理錄影檔…・" + shown, 1, j.vBytes);
        String mm = j.vMime.toLowerCase();
        boolean mp4 = mm.contains("mp4"), h264 = mm.contains("h264") || mm.contains("avc");
        File raw = j.v;
        File out = lib.tmpFile(mp4 || h264 ? "mp4" : "webm");
        try {
            Mux.mux(raw, null, out, false, mp4 || h264 ? android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4 : android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM);
            if (durationOf(out) <= 0) throw new Exception("remux");
            raw.delete();
            return new Object[] {out, stem + (partial != null ? "_錄製(部分)." : "_錄製.") + (mp4 || h264 ? "mp4" : "webm"), mp4 || h264 ? "video/mp4" : "video/webm"};
        } catch (Throwable e) {
            out.delete();
            return new Object[] {raw, stem + (partial != null ? "_錄製(部分)." : "_錄製.") + (mp4 ? "mp4" : "webm"), mp4 ? "video/mp4" : "video/webm"};
        }
    }

    static double durationOf(File f) {
        android.media.MediaMetadataRetriever r = new android.media.MediaMetadataRetriever();
        try { r.setDataSource(f.getAbsolutePath()); String d = r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION); return d == null ? 0 : Long.parseLong(d) / 1000.0; }
        catch (Throwable t) { return 0; }
        finally { try { r.release(); } catch (Throwable t) { /* ignore */ } }
    }

    private static void emit(int i, int n, String name, double pct, long got) {
        try { MediaDl.emit(new JSONObject().put("state", "item").put("i", i).put("n", n).put("name", name).put("pct", pct).put("got", got).put("total", 0)); } catch (Throwable x) { /* ignore */ }
    }

    /* ---------- 由背景播放器頁面呼叫 ---------- */
    static void mime(String kind, String mime) {
        Job j = cur;
        if (j == null) return;
        if ("a".equals(kind)) j.aMime = mime == null ? "" : mime; else j.vMime = mime == null ? "" : mime;
    }

    static void data(String kind, String b64, boolean reset) {
        Job j = cur;
        if (j == null) return;
        try {
            byte[] d = Base64.decode(b64, Base64.DEFAULT);
            synchronized (j) {
                boolean au = "a".equals(kind);
                if (reset) {
                    if (au) { j.ao.close(); j.ao = new FileOutputStream(j.a); j.aBytes = 0; }
                    else { j.vo.close(); j.vo = new FileOutputStream(j.v); j.vBytes = 0; }
                }
                if (au) { j.ao.write(d); j.aBytes += d.length; } else { j.vo.write(d); j.vBytes += d.length; }
            }
            j.lastData = System.currentTimeMillis();
        } catch (Throwable t) { j.err = "寫入失敗：" + t.getMessage(); j.done.countDown(); }
    }

    static void progress(double pct, String note) {
        Job j = cur;
        if (j == null) return;
        j.pct = pct;
        j.note = note == null ? "" : note;
        j.lastPing = System.currentTimeMillis();
        j.lastData = Math.max(j.lastData, System.currentTimeMillis() - 30000);
    }

    static void finish(String err) {
        Job j = cur;
        if (j == null) return;
        j.err = err;
        j.done.countDown();
    }
}
