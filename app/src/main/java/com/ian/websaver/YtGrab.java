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
        long vBytes = 0, aBytes = 0;
        volatile long lastData = System.currentTimeMillis();
        volatile double pct = 0;
        final CountDownLatch done = new CountDownLatch(1);
    }

    static volatile Job cur;

    static Object[] run(final MainActivity a, Lib lib, JSONObject it, String base, int i, int n, String shown) throws Exception {
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
                if (MediaDl.cancel[0]) throw new Exception("已取消");
                long now = System.currentTimeMillis();
                if (now - j.lastData > (j.vBytes + j.aBytes == 0 ? 60000 : 90000))
                    throw new Exception(j.vBytes + j.aBytes == 0 ? "背景播放器 60 秒內沒有開始播放（可能需要登入、影片有年齡限制或地區限制）" : "背景播放器超過 90 秒沒有收到新資料（網路中斷？）");
                if (j.pct != lastPct) {
                    lastPct = j.pct;
                    String msg = shown + (j.note.isEmpty() ? "" : "（" + j.note + "）");
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
        emit(i, n, shown + "（合併影像與聲音）", 1, j.vBytes + j.aBytes);
        String cont = vw ? "webm" : "mp4";
        File out = lib.tmpFile(cont);
        try {
            Mux.mux(j.v, j.aBytes > 0 ? j.a : null, out, false, vw ? android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM : android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            j.v.delete();
            j.a.delete();
            return new Object[] {out, stem + "." + cont, vw ? "video/webm" : "video/mp4"};
        } catch (Throwable e) {
            out.delete();
            /* 合併失敗：至少把影像存下來（聲音另存） */
            if (j.aBytes > 0) {
                try { Lib.get(a).add(j.a, stem + "_聲音" + (aw ? ".webm" : ".m4a"), aw ? "audio/webm" : "audio/mp4", it.optString("src"), it.optString("title"), null); } catch (Throwable x) { /* ignore */ }
            }
            return new Object[] {j.v, stem + "." + cont, vw ? "video/webm" : "video/mp4"};
        }
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
        j.lastData = Math.max(j.lastData, System.currentTimeMillis() - 30000);
    }

    static void finish(String err) {
        Job j = cur;
        if (j == null) return;
        j.err = err;
        j.done.countDown();
    }
}
