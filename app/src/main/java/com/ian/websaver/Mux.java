package com.ian.websaver;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.io.File;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/** 不重新編碼的封裝轉換：TS／fMP4 → MP4、合併分離音軌、只取出音訊（M4A）。 */
final class Mux {
    private Mux() { }

    private static final class Src {
        MediaExtractor ex;
        int[] map = new int[16];
        long t0 = Long.MIN_VALUE;
        boolean done;
    }

    /** video 可以為 null（只處理音訊）；audioOnly = true 時只輸出音軌。 */
    static void mux(File video, File audio, File out, boolean audioOnly) throws Exception { mux(video, audio, out, audioOnly, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4); }

    /** fmt：MUXER_OUTPUT_MPEG_4（H.264/HEVC/AAC）、MUXER_OUTPUT_WEBM（VP9/Opus）、4＝OGG（Opus，Android 10 以上） */
    static void mux(File video, File audio, File out, boolean audioOnly, int fmt) throws Exception {
        List<Src> srcs = new ArrayList<>();
        MediaMuxer m = new MediaMuxer(out.getPath(), fmt);
        int tracks = 0;
        boolean haveAudio = false;
        try {
            File[] files = audio != null ? new File[] {video, audio} : new File[] {video};
            for (int fi = 0; fi < files.length; fi++) {
                if (files[fi] == null) continue;
                Src s = new Src();
                s.ex = new MediaExtractor();
                s.ex.setDataSource(files[fi].getPath());
                java.util.Arrays.fill(s.map, -1);
                boolean any = false;
                for (int i = 0; i < s.ex.getTrackCount() && i < 16; i++) {
                    MediaFormat f = s.ex.getTrackFormat(i);
                    String mime = f.getString(MediaFormat.KEY_MIME);
                    if (mime == null) continue;
                    boolean isV = mime.startsWith("video/"), isA = mime.startsWith("audio/");
                    if (isV && audioOnly) continue;
                    if (isA && audio != null && fi == 0) continue;   // 用分離音軌
                    if (isA && haveAudio) continue;
                    if (!isV && !isA) continue;
                    s.ex.selectTrack(i);
                    s.map[i] = m.addTrack(f);
                    tracks++;
                    any = true;
                    if (isA) haveAudio = true;
                }
                if (any) srcs.add(s); else s.ex.release();
            }
            if (tracks == 0) throw new Exception(audioOnly ? "找不到音軌" : "找不到可轉換的影音軌");
            m.start();
            ByteBuffer buf = ByteBuffer.allocate(8 << 20);
            MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
            for (Src s : srcs) s.t0 = s.ex.getSampleTime();
            while (true) {
                Src pick = null;
                long best = Long.MAX_VALUE;
                for (Src s : srcs) {
                    if (s.done) continue;
                    long t = s.ex.getSampleTime();
                    if (t < 0) { s.done = true; continue; }
                    long rel = t - Math.max(0, s.t0);
                    if (rel < best) { best = rel; pick = s; }
                }
                if (pick == null) break;
                int ti = pick.ex.getSampleTrackIndex();
                int size = pick.ex.readSampleData(buf, 0);
                if (size < 0 || ti < 0) { pick.done = true; continue; }
                int mt = ti < 16 ? pick.map[ti] : -1;
                if (mt >= 0) {
                    bi.offset = 0;
                    bi.size = size;
                    bi.presentationTimeUs = Math.max(0, pick.ex.getSampleTime() - Math.max(0, pick.t0));
                    int fl = pick.ex.getSampleFlags();
                    bi.flags = (fl & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                    m.writeSampleData(mt, buf, bi);
                }
                pick.ex.advance();
            }
            m.stop();
        } finally {
            try { m.release(); } catch (Throwable t) { /* ignore */ }
            for (Src s : srcs) try { s.ex.release(); } catch (Throwable t) { /* ignore */ }
        }
    }
}
