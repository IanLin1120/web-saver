package com.ian.websaver;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** 量一個音樂／影片檔「聽起來有多大聲」，播放時用來把每個檔案調成差不多的音量；
    也可以順便剪一小段（12 秒、16kHz 單聲道 WAV）給聽歌辨識確認是哪首歌。
    作法：在檔案的 15%、45%、75% 三個位置各解碼 10 秒，每 0.4 秒算一次能量，
    去掉很安靜的片段（前奏、間奏的空白）之後取平均 —— 跟串流平台做「音量平衡」的方法類似。 */
final class Loud {
    private static final Object LOCK = new Object();

    static JSONObject analyze(File f, boolean wantClip) throws Exception {
        synchronized (LOCK) { return run(f, wantClip); }
    }

    private static JSONObject run(File f, boolean wantClip) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        MediaCodec codec = null;
        try {
            ex.setDataSource(f.getAbsolutePath());
            int track = -1; MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat m = ex.getTrackFormat(i);
                String mime = m.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) { track = i; fmt = m; break; }
            }
            if (track < 0) throw new Exception("沒有聲音");
            ex.selectTrack(track);
            long durUs = fmt.containsKey(MediaFormat.KEY_DURATION) ? fmt.getLong(MediaFormat.KEY_DURATION) : 0;
            int rate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE), ch = Math.max(1, fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
            codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
            codec.configure(fmt, null, null, 0);
            codec.start();

            final long WIN = 10_000_000L;
            long[] starts = durUs > 45_000_000L ? new long[]{(long) (durUs * 0.15), (long) (durUs * 0.45), (long) (durUs * 0.75)} : new long[]{0};
            long[] lens = durUs > 45_000_000L ? new long[]{WIN, WIN, WIN} : new long[]{Math.max(WIN, durUs)};
            java.util.ArrayList<Double> blocks = new java.util.ArrayList<>();
            ByteArrayOutputStream clip = wantClip ? new ByteArrayOutputStream() : null;
            int clipWin = starts.length > 1 ? 1 : 0;
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            long deadline = System.currentTimeMillis() + 15000;
            boolean isFloat = false;

            for (int w = 0; w < starts.length; w++) {
                ex.seekTo(starts[w], MediaExtractor.SEEK_TO_CLOSEST_SYNC);
                codec.flush();
                long endUs = starts[w] + lens[w];
                boolean inEnd = false, outEnd = false;
                double acc = 0; long accN = 0; int blockN = (int) (rate * 0.4) * ch;
                double clipPos = 0; double clipStep = rate / 16000.0;
                long clipFrames = 0;
                while (!outEnd && System.currentTimeMillis() < deadline) {
                    if (!inEnd) {
                        int ii = codec.dequeueInputBuffer(5000);
                        if (ii >= 0) {
                            ByteBuffer ib = codec.getInputBuffer(ii);
                            int n = ib == null ? -1 : ex.readSampleData(ib, 0);
                            long pts = ex.getSampleTime();
                            if (n < 0 || pts > endUs) { codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEnd = true; }
                            else { codec.queueInputBuffer(ii, 0, n, pts, 0); ex.advance(); }
                        }
                    }
                    int oi = codec.dequeueOutputBuffer(info, 5000);
                    if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        MediaFormat of = codec.getOutputFormat();
                        if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) rate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                        if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = Math.max(1, of.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
                        isFloat = of.containsKey("pcm-encoding") && of.getInteger("pcm-encoding") == 4;
                        blockN = (int) (rate * 0.4) * ch; clipStep = rate / 16000.0;
                    } else if (oi >= 0) {
                        ByteBuffer ob = codec.getOutputBuffer(oi);
                        if (ob != null && info.size > 0) {
                            ob.position(info.offset); ob.limit(info.offset + info.size);
                            ob.order(ByteOrder.LITTLE_ENDIAN);
                            int frames = info.size / ((isFloat ? 4 : 2) * ch);
                            for (int i = 0; i < frames; i++) {
                                double mono = 0;
                                for (int c = 0; c < ch; c++) {
                                    double v = isFloat ? ob.getFloat() : ob.getShort() / 32768.0;
                                    acc += v * v; accN++;
                                    mono += v;
                                }
                                mono /= ch;
                                if (accN >= blockN) { blocks.add(acc / accN); acc = 0; accN = 0; }
                                if (clip != null && w == clipWin && clipFrames < 16000 * 12) {
                                    clipPos += 1;
                                    if (clipPos >= clipStep) {
                                        clipPos -= clipStep;
                                        int s = (int) Math.max(-32768, Math.min(32767, Math.round(mono * 32767)));
                                        clip.write(s & 0xff); clip.write((s >> 8) & 0xff);
                                        clipFrames++;
                                    }
                                }
                            }
                        }
                        codec.releaseOutputBuffer(oi, false);
                        if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEnd = true;
                    }
                }
                if (w < starts.length - 1) {
                    /* 下一段要重新開始餵資料：EOS 之後一定要 flush（上面迴圈開頭會做） */
                }
            }
            if (blocks.size() < 3) throw new Exception("聲音太短");
            /* 去掉太安靜的片段：先去掉 -60dB 以下的，再去掉比平均小 10dB 以上的 */
            double sum = 0; int n = 0;
            for (double b : blocks) if (b > 1e-6) { sum += b; n++; }
            if (n == 0) throw new Exception("沒有聲音");
            double gate = sum / n * 0.1, s2 = 0; int n2 = 0;
            for (double b : blocks) if (b > 1e-6 && b >= gate) { s2 += b; n2++; }
            double db = 10 * Math.log10(n2 > 0 ? s2 / n2 : sum / n);
            JSONObject o = new JSONObject().put("db", Math.round(db * 10) / 10.0).put("dur", durUs / 1e6);
            if (clip != null && clip.size() > 16000 * 2 * 4) o.put("clip", Base64.encodeToString(wav(clip.toByteArray(), 16000), Base64.NO_WRAP));
            return o;
        } finally {
            try { if (codec != null) { codec.stop(); codec.release(); } } catch (Throwable t) { /* ignore */ }
            try { ex.release(); } catch (Throwable t) { /* ignore */ }
        }
    }

    private static byte[] wav(byte[] pcm, int rate) {
        ByteBuffer b = ByteBuffer.allocate(44 + pcm.length).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes()).putInt(36 + pcm.length).put("WAVE".getBytes()).put("fmt ".getBytes()).putInt(16).putShort((short) 1).putShort((short) 1)
            .putInt(rate).putInt(rate * 2).putShort((short) 2).putShort((short) 16).put("data".getBytes()).putInt(pcm.length).put(pcm);
        return b.array();
    }
}
