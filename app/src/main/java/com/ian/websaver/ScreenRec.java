package com.ian.websaver;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.AudioAttributes;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.Surface;

import org.json.JSONObject;

import java.io.File;
import java.nio.ByteBuffer;

/**
 * 手機內建螢幕錄影（MediaProjection）：把整個螢幕（影片全螢幕播放）＋App 播出的聲音錄成 MP4。
 * 錄影期間自動開啟「勿擾模式」並隱藏通知橫幅，結束後恢復原本設定。
 */
final class ScreenRec {
    private ScreenRec() { }

    static final int REQ = 1005;
    static volatile ScreenRec.Rec cur;
    private static String pendingName = "";

    static final class Rec {
        MediaProjection mp;
        VirtualDisplay vd;
        MediaCodec venc, aenc;
        AudioRecord ar;
        MediaMuxer mux;
        File out;
        String name;
        int vTrack = -1, aTrack = -1, tracks = 0, need = 1;
        boolean muxing = false, vEos = false;
        Surface in;
        volatile boolean paused = false;
        volatile long pauseAt = 0, pausedUs = 0;
        long startMs = System.currentTimeMillis();
        RecCtl ctl;
        volatile boolean stop = false;
        long t0 = -1;
        Thread tv, ta;
        final Object lock = new Object();
        int dndOld = -1;
        NotificationManager.Policy polOld;
    }

    /* ---------- 勿擾模式 ---------- */
    static boolean dndAllowed(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    static void openDndSettings(MainActivity a) {
        try { a.startActivity(new Intent(android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)); } catch (Throwable t) { MainActivity.toast("無法開啟勿擾權限設定"); }
    }

    private static void dndOn(Context c, Rec r) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (!nm.isNotificationPolicyAccessGranted()) return;
            r.dndOld = nm.getCurrentInterruptionFilter();
            r.polOld = nm.getNotificationPolicy();
            int fx = NotificationManager.Policy.SUPPRESSED_EFFECT_PEEK | NotificationManager.Policy.SUPPRESSED_EFFECT_STATUS_BAR | NotificationManager.Policy.SUPPRESSED_EFFECT_BADGE
                | NotificationManager.Policy.SUPPRESSED_EFFECT_AMBIENT | NotificationManager.Policy.SUPPRESSED_EFFECT_FULL_SCREEN_INTENT | NotificationManager.Policy.SUPPRESSED_EFFECT_LIGHTS
                | NotificationManager.Policy.SUPPRESSED_EFFECT_NOTIFICATION_LIST;
            /* 只擋來電、訊息、提醒與橫幅；媒體聲音不受影響（才錄得到影片聲音） */
            nm.setNotificationPolicy(new NotificationManager.Policy(0, 0, 0, fx));
            nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY);
        } catch (Throwable t) { /* ignore */ }
    }

    private static void dndOff(Context c, Rec r) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (r.polOld != null) nm.setNotificationPolicy(r.polOld);
            if (r.dndOld > 0) nm.setInterruptionFilter(r.dndOld);
        } catch (Throwable t) { /* ignore */ }
    }

    /* ---------- 開始：先請使用者同意錄影 ---------- */
    static void ask(MainActivity a, String name) {
        if (cur != null) { MainActivity.toast("已經在錄影中"); return; }
        pendingName = name == null || name.isEmpty() ? "螢幕錄影" : name;
        MediaProjectionManager pm = (MediaProjectionManager) a.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        try { a.startActivityForResult(pm.createScreenCaptureIntent(), REQ); }
        catch (Throwable t) { emit("err", "無法開始螢幕錄影：" + t.getMessage()); }
    }

    static void onResult(final MainActivity a, final int res, final Intent data) {
        if (res != android.app.Activity.RESULT_OK || data == null) { emit("cancel", "已取消螢幕錄影"); return; }
        /* 錄影開始前先把懸浮鈕變成透明（錄影畫面裡不會出現） */
        RecCtl.get(a).state("hot");
        /* Android 14 起要先啟動「螢幕錄影」類型的前景服務，才能開始錄 */
        KeepAlive.set(a, "srec", "螢幕錄影中");
        Util.MAIN.postDelayed(new Runnable() {
            int tries = 0;
            @Override public void run() {
                try { start(a, res, data); }
                catch (SecurityException e) { if (++tries < 6) Util.MAIN.postDelayed(this, 400); else fail(a, e); }
                catch (Throwable e) { fail(a, e); }
            }
        }, 500);
    }

    private static void fail(MainActivity a, Throwable e) {
        Rec r = cur;
        cur = null;
        if (r != null) { release(r); dndOff(a, r); if (r.out != null) r.out.delete(); }
        KeepAlive.set(a, "srec", null);
        emit("err", "螢幕錄影失敗：" + e.getMessage());
    }

    private static void start(final MainActivity a, int res, Intent data) throws Exception {
        MediaProjectionManager pm = (MediaProjectionManager) a.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        final Rec r = new Rec();
        r.mp = pm.getMediaProjection(res, data);
        if (r.mp == null) throw new Exception("系統不允許錄影");
        cur = r;
        r.name = pendingName;
        if (Build.VERSION.SDK_INT >= 34) r.mp.registerCallback(new MediaProjection.Callback() { @Override public void onStop() { stop(a); } }, Util.MAIN);
        DisplayMetrics dm = new DisplayMetrics();
        a.getWindowManager().getDefaultDisplay().getRealMetrics(dm);
        int w = dm.widthPixels & ~15, h = dm.heightPixels & ~15;
        /* 編碼器支援的最大尺寸通常是 1920 長邊以上；太大就等比縮小 */
        float sc = Math.min(1f, 2560f / Math.max(w, h));
        w = Math.round(w * sc) & ~15; h = Math.round(h * sc) & ~15;
        r.out = Lib.get(a).tmpFile("mp4");
        r.mux = new MediaMuxer(r.out.getPath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        MediaFormat vf = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h);
        vf.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        vf.setInteger(MediaFormat.KEY_BIT_RATE, Math.min(24_000_000, Math.max(6_000_000, w * h * 6)));
        vf.setInteger(MediaFormat.KEY_FRAME_RATE, 30);
        vf.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);
        r.venc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        r.venc.configure(vf, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        r.in = r.venc.createInputSurface();
        r.venc.start();
        r.vd = r.mp.createVirtualDisplay("websaver-rec", w, h, dm.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.in, null, null);
        /* 聲音：錄 App 播出的聲音（不是麥克風）；需要錄音權限，沒有就只錄畫面 */
        if (Build.VERSION.SDK_INT >= 29 && a.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            try {
                AudioPlaybackCaptureConfiguration cfg = new AudioPlaybackCaptureConfiguration.Builder(r.mp)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA).addMatchingUsage(AudioAttributes.USAGE_GAME).addMatchingUsage(AudioAttributes.USAGE_UNKNOWN).build();
                AudioFormat af = new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(44100).setChannelMask(AudioFormat.CHANNEL_IN_STEREO).build();
                int min = AudioRecord.getMinBufferSize(44100, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT);
                r.ar = new AudioRecord.Builder().setAudioFormat(af).setBufferSizeInBytes(Math.max(min * 4, 32768)).setAudioPlaybackCaptureConfig(cfg).build();
                MediaFormat aff = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, 44100, 2);
                aff.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
                aff.setInteger(MediaFormat.KEY_BIT_RATE, 192000);
                aff.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384);
                r.aenc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
                r.aenc.configure(aff, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
                r.aenc.start();
                r.ar.startRecording();
                r.need = 2;
            } catch (Throwable t) { r.ar = null; r.aenc = null; r.need = 1; }
        }
        dndOn(a, r);
        r.tv = new Thread(new Runnable() { @Override public void run() { drain(r, r.venc, true, true); } }, "rec-v");
        r.tv.start();
        if (r.aenc != null) {
            r.ta = new Thread(new Runnable() { @Override public void run() { audioLoop(r); } }, "rec-a");
            r.ta.start();
        }
        r.startMs = System.currentTimeMillis();
        r.ctl = RecCtl.get(a);
        r.ctl.show(true);
        emit("start", r.need == 2 ? "錄影中（含聲音）" : "錄影中（沒有錄音權限，只錄畫面）");
    }

    /* 錄影片播出的聲音：
       之前編碼器忙碌時會把讀到的聲音直接丟掉，聲音軌就比影片短（前面對得上、後面沒聲音）。
       現在讀到的每一段都一定送進編碼器（等它有空），時間戳也會跟實際經過的時間對齊。 */
    private static void audioLoop(Rec r) {
        byte[] buf = new byte[8192];
        long frames = 0;
        final long base = System.nanoTime();
        try {
            while (true) {
                int n = r.stop ? -1 : r.ar.read(buf, 0, buf.length);
                if (n == 0) continue;
                if (n > 0 && r.paused) continue;
                if (n < 0 || r.stop) {
                    while (true) {
                        int ix = r.aenc.dequeueInputBuffer(10000);
                        if (ix >= 0) { r.aenc.queueInputBuffer(ix, 0, 0, frames * 1_000_000L / 44100, MediaCodec.BUFFER_FLAG_END_OF_STREAM); break; }
                        drainOnce(r, r.aenc, false);
                    }
                    drain(r, r.aenc, false, false);
                    break;
                }
                /* 對齊實際時間：系統少給了聲音資料時，往後跳，避免越錄越短 */
                long pausedNow = r.pausedUs;
                long wallUs = (System.nanoTime() - base) / 1000 - pausedNow - (n / 4) * 1_000_000L / 44100;
                long ptsUs = frames * 1_000_000L / 44100;
                if (wallUs - ptsUs > 150_000) frames = wallUs * 44100 / 1_000_000L;
                int off = 0;
                while (off < n) {
                    int ix = r.aenc.dequeueInputBuffer(5000);
                    if (ix < 0) { drainOnce(r, r.aenc, false); continue; }
                    ByteBuffer ib = r.aenc.getInputBuffer(ix);
                    ib.clear();
                    int len = Math.min(n - off, ib.remaining());
                    len -= len % 4;
                    if (len <= 0) { r.aenc.queueInputBuffer(ix, 0, 0, frames * 1_000_000L / 44100, 0); break; }
                    ib.put(buf, off, len);
                    r.aenc.queueInputBuffer(ix, 0, len, frames * 1_000_000L / 44100, 0);
                    frames += len / 4;
                    off += len;
                }
                drainOnce(r, r.aenc, false);
                drainOnce(r, r.aenc, false);
            }
        } catch (Throwable t) { /* ignore */ }
    }

    private static void drain(Rec r, MediaCodec c, boolean video, boolean loop) {
        try {
            while (true) {
                if (video && r.stop && !r.vEos) { r.vEos = true; try { c.signalEndOfInputStream(); } catch (Throwable t) { break; } }
                if (drainOnce(r, c, video)) break;
                if (!loop && !video) { /* 音訊結尾：繼續拿到 EOS 為止 */ }
            }
        } catch (Throwable t) { /* ignore */ }
    }

    /** 回傳 true 代表已經拿到結尾 */
    private static boolean drainOnce(Rec r, MediaCodec c, boolean video) {
        MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
        int ox = c.dequeueOutputBuffer(bi, 10000);
        if (ox == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            synchronized (r.lock) {
                int t = r.mux.addTrack(c.getOutputFormat());
                if (video) r.vTrack = t; else r.aTrack = t;
                if (++r.tracks >= r.need) { r.mux.start(); r.muxing = true; r.lock.notifyAll(); }
            }
            return false;
        }
        if (ox < 0) return false;
        ByteBuffer ob = c.getOutputBuffer(ox);
        boolean eos = (bi.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
        if ((bi.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) bi.size = 0;
        if (bi.size > 0 && ob != null) {
            synchronized (r.lock) {
                long end = System.currentTimeMillis() + 3000;
                while (!r.muxing && System.currentTimeMillis() < end) { try { r.lock.wait(200); } catch (InterruptedException e) { break; } }
                if (r.muxing) {
                    if (video) {
                        if (r.t0 < 0) r.t0 = bi.presentationTimeUs;
                        bi.presentationTimeUs = Math.max(0, bi.presentationTimeUs - r.t0 - r.pausedUs);
                    }
                    ob.position(bi.offset); ob.limit(bi.offset + bi.size);
                    try { r.mux.writeSampleData(video ? r.vTrack : r.aTrack, ob, bi); } catch (Throwable t) { /* ignore */ }
                }
            }
        }
        c.releaseOutputBuffer(ox, false);
        return eos;
    }

    /* ---------- 暫停／繼續：暫停時不錄畫面也不錄聲音，影片也一起暫停 ---------- */
    static void pause(MainActivity a, boolean on) {
        Rec r = cur;
        if (r == null || r.paused == on) return;
        if (on) {
            r.paused = true;
            r.pauseAt = System.nanoTime();
            try { r.vd.setSurface(null); } catch (Throwable t) { /* ignore */ }
            a.br.wv.evaluateJavascript("window.__wsRecPaused=1;(function(){try{[].forEach.call(document.querySelectorAll('video'),function(v){v.pause()})}catch(e){}})()", null);
        } else {
            r.pausedUs += (System.nanoTime() - r.pauseAt) / 1000;
            try { r.vd.setSurface(r.in); } catch (Throwable t) { /* ignore */ }
            r.paused = false;
            a.br.wv.evaluateJavascript("window.__wsRecPaused=0;(function(){try{var v=document.querySelector('video[style*=\"2147483647\"]')||document.querySelector('video');if(v)v.play()}catch(e){}})()", null);
        }
        if (r.ctl != null) r.ctl.update(r.paused);
        emit(on ? "paused" : "resumed", "");
    }

    static long elapsed() { Rec r = cur; if (r == null) return 0; long p = r.pausedUs / 1000 + (r.paused ? (System.nanoTime() - r.pauseAt) / 1_000_000 : 0); return System.currentTimeMillis() - r.startMs - p; }

    /* ---------- 結束：存進檔案庫、恢復勿擾設定 ---------- */
    static void stop(final MainActivity a) {
        final Rec r = cur;
        if (r == null || r.stop) return;
        if (r.paused) { r.pausedUs += (System.nanoTime() - r.pauseAt) / 1000; try { r.vd.setSurface(r.in); } catch (Throwable t) { /* ignore */ } r.paused = false; }
        r.stop = true;
        cur = null;

        Util.IO.execute(new Runnable() {
            @Override public void run() {
                try { if (r.tv != null) r.tv.join(5000); } catch (Throwable t) { /* ignore */ }
                try { if (r.ta != null) r.ta.join(5000); } catch (Throwable t) { /* ignore */ }
                boolean ok = r.muxing;
                release(r);
                dndOff(a, r);
                KeepAlive.set(a, "srec", null);
                try {
                    if (!ok || r.out.length() < 1024) throw new Exception("沒有錄到畫面");
                    JSONObject it = Lib.get(a).add(r.out, Util.safeName(r.name) + "_螢幕錄影.mp4", "video/mp4", "", r.name, null);
                    KeepAlive.done(a, r.name + "（螢幕錄影）");
                    MainActivity.emit("srec", new JSONObject().put("state", "done").put("item", it).toString());
                    MainActivity.emit("lib", "");
                } catch (Throwable e) { r.out.delete(); emit("err", "螢幕錄影存檔失敗：" + e.getMessage()); }
            }
        });
    }

    private static void release(Rec r) {
        try { if (r.vd != null) r.vd.release(); } catch (Throwable t) { /* ignore */ }
        try { if (r.ar != null) { r.ar.stop(); r.ar.release(); } } catch (Throwable t) { /* ignore */ }
        try { if (r.venc != null) { r.venc.stop(); r.venc.release(); } } catch (Throwable t) { /* ignore */ }
        try { if (r.aenc != null) { r.aenc.stop(); r.aenc.release(); } } catch (Throwable t) { /* ignore */ }
        try { if (r.muxing) r.mux.stop(); } catch (Throwable t) { /* ignore */ }
        try { r.mux.release(); } catch (Throwable t) { /* ignore */ }
        try { if (r.mp != null) r.mp.stop(); } catch (Throwable t) { /* ignore */ }
    }

    private static void emit(String st, String msg) {
        try { MainActivity.emit("srec", new JSONObject().put("state", st).put("msg", msg).toString()); } catch (Throwable t) { /* ignore */ }
    }
}
