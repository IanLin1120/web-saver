package com.ian.websaver;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Base64;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 懸浮聽歌辨識：一顆浮在其他 App 上面的按鈕。
 * 點一下聽 10 秒「手機正在播的聲音」（Android 10 起用播放音訊擷取；沒聲音或不支援時改用麥克風），
 * 直接在原生端交給 Gemini 辨識，結果顯示在懸浮卡片上，不用切回 App。長按按鈕可以關閉。
 */
final class ListenFloat {
    static final int REQ = 1007;
    static volatile ListenFloat inst;
    /** 已經允許擷取手機聲音：前景服務要帶「螢幕擷取」類型 */
    static volatile boolean wantProj = false;

    final Context app;
    final WindowManager wm;
    volatile MediaProjection mp;
    String key = "", pTap = "", pMic = "";
    JSONArray chain = new JSONArray();
    Bubble bubble;
    LinearLayout card;
    WindowManager.LayoutParams blp, clp;
    volatile boolean busy = false, shown = false;

    private ListenFloat(Context c) {
        app = c.getApplicationContext();
        wm = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
    }

    static boolean on() { return inst != null && inst.shown; }

    private static void emit(String st, String msg) {
        try { MainActivity.emit("lsnFloat", new JSONObject().put("st", st).put("msg", msg == null ? "" : msg).toString()); } catch (Throwable t) { /* ignore */ }
    }

    /** 開啟：先確認「顯示在其他應用程式上層」權限，再要求擷取手機播放的聲音 */
    static void start(MainActivity a, String cfg) {
        try {
            if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(a)) {
                try { a.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + a.getPackageName()))); } catch (Throwable t) { /* ignore */ }
                emit("need", "請允許「顯示在其他應用程式上層」，回來再開一次");
                return;
            }
            if (inst == null) inst = new ListenFloat(a);
            JSONObject o = new JSONObject(cfg == null || cfg.isEmpty() ? "{}" : cfg);
            inst.key = o.optString("key");
            inst.chain = o.optJSONArray("chain") != null ? o.optJSONArray("chain") : new JSONArray().put("gemini-2.5-flash");
            inst.pTap = o.optString("pTap");
            inst.pMic = o.optString("pMic");
            if (inst.shown) { emit("on", "懸浮聽歌按鈕已經開著"); return; }
            if (Build.VERSION.SDK_INT >= 29 && inst.mp == null) {
                MediaProjectionManager pm = (MediaProjectionManager) a.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                /* Android 14 起：直接要求「整個螢幕」，系統就不會再問「單個應用程式／整個螢幕」（聽其他 App 的聲音本來就要選整個螢幕） */
                Intent ci = null;
                if (Build.VERSION.SDK_INT >= 34) { try { ci = pm.createScreenCaptureIntent(android.media.projection.MediaProjectionConfig.createConfigForDefaultDisplay()); } catch (Throwable t) { ci = null; } }
                if (ci == null) ci = pm.createScreenCaptureIntent();
                try { a.startActivityForResult(ci, REQ); return; } catch (Throwable t) { /* 改用麥克風 */ }
            }
            inst.show(a, false);
        } catch (Throwable t) { emit("err", "無法開啟懸浮聽歌：" + t.getMessage()); }
    }

    static void onResult(final MainActivity a, final int res, final Intent data) {
        final ListenFloat f = inst;
        if (f == null) return;
        wantProj = res == android.app.Activity.RESULT_OK && data != null;
        KeepAlive.set(a, "lsnf", "懸浮聽歌辨識開著（長按懸浮按鈕可以關閉）");
        if (res != android.app.Activity.RESULT_OK || data == null) { f.show(a, false); emit("on", "沒有允許擷取手機的聲音，懸浮按鈕會改用麥克風聽"); return; }
        /* Android 14 起要先跑「螢幕擷取」類型的前景服務，才拿得到 MediaProjection */
        Util.MAIN.postDelayed(new Runnable() {
            int tries = 0;
            @Override public void run() {
                try {
                    MediaProjectionManager pm = (MediaProjectionManager) a.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                    f.mp = pm.getMediaProjection(res, data);
                    if (f.mp != null && Build.VERSION.SDK_INT >= 34) f.mp.registerCallback(new MediaProjection.Callback() { @Override public void onStop() { f.mp = null; } }, Util.MAIN);
                    f.show(a, false);
                } catch (SecurityException e) {
                    if (++tries < 6) Util.MAIN.postDelayed(this, 400); else { wantProj = false; f.show(a, false); }
                } catch (Throwable e) { f.show(a, false); }
            }
        }, 500);
    }

    static void stop() {
        ListenFloat f = inst;
        if (f == null) return;
        f.hideCard();
        try { if (f.bubble != null && f.shown) f.wm.removeView(f.bubble); } catch (Throwable t) { /* ignore */ }
        f.shown = false;
        try { if (f.mp != null) f.mp.stop(); } catch (Throwable t) { /* ignore */ }
        f.mp = null;
        wantProj = false;
        KeepAlive.set(f.app, "lsnf", null);
        inst = null;
        emit("off", "已關閉懸浮聽歌");
    }

    private int dp(float v) { return Math.round(v * app.getResources().getDisplayMetrics().density); }

    private int overlayType() {
        return Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
    }

    void show(MainActivity a, boolean goHome) {
        KeepAlive.set(app, "lsnf", "懸浮聽歌辨識開著（長按懸浮按鈕可以關閉）");
        if (shown) return;
        bubble = new Bubble(app);
        int s = dp(68);
        blp = new WindowManager.LayoutParams(s, s, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        blp.gravity = Gravity.TOP | Gravity.START;
        android.util.DisplayMetrics dm = app.getResources().getDisplayMetrics();
        blp.x = dm.widthPixels - s - dp(4);
        blp.y = dm.heightPixels / 3;
        bubble.setOnTouchListener(new View.OnTouchListener() {
            float sx, sy; int ox, oy; long t0; boolean moved, longed;
            final Runnable lp = new Runnable() { @Override public void run() { if (!moved) { longed = true; buzz(40); stop(); } } };
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        sx = e.getRawX(); sy = e.getRawY(); ox = blp.x; oy = blp.y; t0 = System.currentTimeMillis(); moved = false; longed = false;
                        v.postDelayed(lp, 800);
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - sx, dy = e.getRawY() - sy;
                        if (!moved && Math.hypot(dx, dy) > dp(8)) { moved = true; v.removeCallbacks(lp); }
                        if (moved) { blp.x = ox + Math.round(dx); blp.y = oy + Math.round(dy); try { wm.updateViewLayout(bubble, blp); } catch (Throwable t) { /* ignore */ } }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        v.removeCallbacks(lp);
                        if (longed) return true;
                        if (moved) {
                            /* 放開後靠到左右邊 */
                            android.util.DisplayMetrics d = app.getResources().getDisplayMetrics();
                            blp.x = blp.x + bubble.getWidth() / 2 < d.widthPixels / 2 ? dp(2) : d.widthPixels - bubble.getWidth() - dp(2);
                            try { wm.updateViewLayout(bubble, blp); } catch (Throwable t) { /* ignore */ }
                        } else if (e.getActionMasked() == MotionEvent.ACTION_UP) listen();
                        return true;
                }
                return false;
            }
        });
        try { wm.addView(bubble, blp); shown = true; }
        catch (Throwable t) { emit("err", "無法顯示懸浮按鈕：" + t.getMessage()); return; }
        emit("on", mp != null ? "懸浮聽歌已開啟：點畫面邊緣的 ♫ 就會聽手機正在播的聲音，切到其他 App 也能用（長按關閉）" : "懸浮聽歌已開啟（用麥克風聽；長按 ♫ 關閉）");
        if (goHome && a != null) {
            Util.MAIN.postDelayed(new Runnable() { @Override public void run() { try { Intent h = new Intent(Intent.ACTION_MAIN); h.addCategory(Intent.CATEGORY_HOME); h.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK); app.startActivity(h); } catch (Throwable t) { /* ignore */ } } }, 700);
        }
    }

    private void buzz(int ms) {
        try {
            android.os.Vibrator v = (android.os.Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE)); else v.vibrate(ms);
        } catch (Throwable t) { /* ignore */ }
    }

    private void setState(final int st, final long endMs, final int totalMs, final boolean tap) {
        Util.MAIN.post(new Runnable() { @Override public void run() { if (bubble != null) bubble.set(st, endMs, totalMs, tap); } });
    }

    /** 懸浮按鈕：圓形漸層底＋白色細框。待機畫音符；聆聽中顯示置中的倒數秒數與一圈進度；辨識中顯示轉動的圓弧 */
    final class Bubble extends View {
        static final int IDLE = 0, REC = 1, THINK = 2;
        int st = IDLE; long endMs; int totalMs = 10000; boolean tap = true;
        final android.graphics.Paint pf = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        final android.graphics.Paint ps = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        final android.graphics.Paint pt = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG | android.graphics.Paint.SUBPIXEL_TEXT_FLAG);
        final android.graphics.RectF rf = new android.graphics.RectF();
        final android.graphics.Rect tb = new android.graphics.Rect();
        final android.graphics.Path note = new android.graphics.Path();
        Bubble(Context c) {
            super(c);
            setLayerType(LAYER_TYPE_SOFTWARE, null);
            ps.setStyle(android.graphics.Paint.Style.STROKE);
            ps.setStrokeCap(android.graphics.Paint.Cap.ROUND);
            ps.setStrokeJoin(android.graphics.Paint.Join.ROUND);
            Typeface tf;
            try { tf = Typeface.create("sans-serif-medium", Typeface.BOLD); } catch (Throwable t) { tf = Typeface.DEFAULT_BOLD; }
            pt.setTypeface(tf);
            pt.setColor(Color.WHITE);
            pt.setTextAlign(android.graphics.Paint.Align.CENTER);
            if (Build.VERSION.SDK_INT >= 21) pt.setFontFeatureSettings("tnum");
        }
        void set(int s, long end, int total, boolean t) { st = s; endMs = end; totalMs = Math.max(1000, total); tap = t; invalidate(); }
        @Override protected void onDraw(android.graphics.Canvas c) {
            float w = getWidth(), h = getHeight(), cx = w / 2f, cy = h / 2f, r = Math.min(w, h) / 2f - dp(6);
            int c1, c2;
            if (st == REC) { c1 = tap ? 0xFFD0693F : 0xFF3F9A72; c2 = tap ? 0xFF9A3F22 : 0xFF246349; }
            else if (st == THINK) { c1 = 0xFF74859A; c2 = 0xFF475666; }
            else { c1 = 0xFFB8834F; c2 = 0xFF7A4E2C; }
            pf.setStyle(android.graphics.Paint.Style.FILL);
            pf.setShader(new android.graphics.LinearGradient(cx - r, cy - r, cx + r, cy + r, c1, c2, android.graphics.Shader.TileMode.CLAMP));
            pf.setShadowLayer(dp(4), 0, dp(2), 0x55000000);
            c.drawCircle(cx, cy, r, pf);
            pf.setShadowLayer(0, 0, 0, 0);
            pf.setShader(null);
            /* 白色細框 */
            ps.setShader(null); ps.setColor(0xD9FFFFFF); ps.setStrokeWidth(dp(1.6f));
            c.drawCircle(cx, cy, r - dp(0.8f), ps);
            if (st == REC) {
                long left = Math.max(0, endMs - System.currentTimeMillis());
                float fr = Math.min(1f, left / (float) totalMs);
                float rr = r - dp(5.5f);
                rf.set(cx - rr, cy - rr, cx + rr, cy + rr);
                ps.setStrokeWidth(dp(3)); ps.setColor(0x38FFFFFF);
                c.drawCircle(cx, cy, rr, ps);
                ps.setColor(Color.WHITE);
                c.drawArc(rf, -90, 360f * fr, false, ps);
                String t = String.valueOf(Math.max(1, (int) Math.ceil(left / 1000.0)));
                pt.setTextSize(dp(t.length() > 1 ? 19 : 22));
                /* 用數字實際的筆畫範圍置中（不受字型上下留白影響） */
                pt.getTextBounds(t, 0, t.length(), tb);
                c.drawText(t, cx - (tb.left + tb.right) / 2f + tb.width() * 0f, cy - (tb.top + tb.bottom) / 2f, pt);
                postInvalidateOnAnimation();
            } else if (st == THINK) {
                float rr = r - dp(5.5f);
                rf.set(cx - rr, cy - rr, cx + rr, cy + rr);
                ps.setStrokeWidth(dp(3)); ps.setColor(0x38FFFFFF);
                c.drawCircle(cx, cy, rr, ps);
                ps.setColor(Color.WHITE);
                float a0 = (System.currentTimeMillis() % 1100L) / 1100f * 360f;
                c.drawArc(rf, a0 - 90, 100, false, ps);
                pf.setColor(Color.WHITE);
                for (int i = -1; i <= 1; i++) c.drawCircle(cx + i * dp(6.5f), cy, dp(2.1f), pf);
                postInvalidateOnAnimation();
            } else {
                /* 音符（線條圖示，跟 App 裡的音樂圖示同一種畫法） */
                float u = r * 2f * 0.50f / 24f, ox = cx - 12f * u, oy = cy - 11.5f * u;
                note.reset();
                note.moveTo(ox + 9 * u, oy + 18 * u); note.lineTo(ox + 9 * u, oy + 5 * u); note.lineTo(ox + 21 * u, oy + 3 * u); note.lineTo(ox + 21 * u, oy + 16 * u);
                ps.setColor(Color.WHITE); ps.setStrokeWidth(2.3f * u);
                c.drawPath(note, ps);
                c.drawCircle(ox + 6 * u, oy + 18 * u, 3 * u, ps);
                c.drawCircle(ox + 18 * u, oy + 16 * u, 3 * u, ps);
            }
        }
    }

    /* ---------- 聽 10 秒 → 辨識 ---------- */
    void listen() {
        if (busy) return;
        if (TextUtils.isEmpty(key)) { showCard("還不能辨識", "請先在 App 的「AI 摘要」設定 Gemini 金鑰", null, null); return; }
        if (app.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            showCard("需要錄音權限", "請回到 App 允許錄音（麥克風）權限", null, null); return;
        }
        busy = true;
        hideCard();
        buzz(20);
        new Thread(new Runnable() { @Override public void run() {
            String mode = "tap";
            try {
                byte[] pcm = null;
                if (mp != null && Build.VERSION.SDK_INT >= 29) {
                    pcm = record(true, 12);
                    if (pcm == null || rms(pcm) < 120) { pcm = null; }
                }
                if (pcm == null) { mode = "mic"; pcm = record(false, 10); }
                if (pcm == null || pcm.length < 16000) throw new Exception("沒有錄到聲音");
                setState(Bubble.THINK, 0, 0, true);
                JSONObject r = ask(wav(pcm), "tap".equals(mode) ? pTap : pMic);
                String title = r.optString("title").trim(), artist = r.optString("artist").trim(), ly = r.optString("lyrics").trim(), note = r.optString("note").trim();
                double conf = r.has("confidence") ? r.optDouble("confidence", 0.6) : 0.6;
                /* 只有很確定（而且歌詞對得上）才直接給歌名；不確定時用聽到的歌詞搜尋，猜的歌名只當「可能是」 */
                boolean sure = r.optBoolean("found") && !title.isEmpty() && conf >= 0.85 && (r.optBoolean("lyrics_match") || ly.isEmpty());
                String lyQ = ly.isEmpty() ? "" : ly.split("[\\n。！？!?]")[0];
                if (lyQ.length() > 40) lyQ = lyQ.substring(0, 40);
                String guess = r.optBoolean("found") && !title.isEmpty() && conf >= 0.5 ? (title + " " + artist).trim() : "";
                String q = sure ? (title + " " + artist).trim() : !lyQ.isEmpty() ? lyQ : guess;
                if (!q.isEmpty()) saveRec(sure ? title : "", artist, q, sure, r.optString("lang"), mode, lyQ, guess);
                if (q.isEmpty()) showCard("沒有辨識出來", note.isEmpty() ? "聽不出是哪首歌，也沒有聽到歌詞。等唱到人聲時再試一次。" : note, null, mode);
                else if (sure) { buzz(30); showCard(title, artist + (note.isEmpty() ? "" : "\n" + note), q, mode); }
                else if (!lyQ.isEmpty()) { buzz(30); showCard("用聽到的歌詞搜尋", "「" + lyQ + "」" + (guess.isEmpty() ? "" : "\n可能是：" + guess + "（不確定）"), q, mode); }
                else { buzz(30); showCard("可能是這首（不確定）", guess + (note.isEmpty() ? "" : "\n" + note), q, mode); }
            } catch (Throwable t) {
                showCard("沒有辨識出來", t.getMessage() == null ? "辨識失敗" : t.getMessage(), null, mode);
            } finally {
                busy = false;
                setState(Bubble.IDLE, 0, 0, true);
            }
        } }, "lsn-float").start();
    }

    /** 辨識結果記下來（存在手機裡，App 之後讀走放進「辨識紀錄」） */
    private void saveRec(String title, String artist, String q, boolean sure, String lang, String mode, String lyQ, String guess) {
        try {
            android.content.SharedPreferences sp = app.getSharedPreferences("lsn", 0);
            JSONArray arr;
            synchronized (ListenFloat.class) {
                try { arr = new JSONArray(sp.getString("pending", "[]")); } catch (Throwable t) { arr = new JSONArray(); }
                arr.put(new JSONObject().put("t", System.currentTimeMillis()).put("title", title).put("artist", artist).put("q", q).put("sure", sure)
                    .put("lang", lang == null ? "" : lang).put("mode", mode).put("lyQ", lyQ).put("guess", guess).put("src", "float"));
                sp.edit().putString("pending", arr.toString()).apply();
            }
            MainActivity.emit("lsnRec", "{}");
        } catch (Throwable t) { /* ignore */ }
    }

    /** App 讀走還沒收進紀錄的辨識結果 */
    static String drain(Context c) {
        try {
            android.content.SharedPreferences sp = c.getSharedPreferences("lsn", 0);
            synchronized (ListenFloat.class) {
                String v = sp.getString("pending", "[]");
                if (!"[]".equals(v)) sp.edit().putString("pending", "[]").apply();
                return v;
            }
        } catch (Throwable t) { return "[]"; }
    }

    private byte[] record(boolean tap, int sec) throws Exception {
        final int rate = 16000;
        AudioRecord ar;
        int min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (tap && Build.VERSION.SDK_INT >= 29) {
            AudioPlaybackCaptureConfiguration cfg = new AudioPlaybackCaptureConfiguration.Builder(mp)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA).addMatchingUsage(AudioAttributes.USAGE_GAME).addMatchingUsage(AudioAttributes.USAGE_UNKNOWN).build();
            AudioFormat af = new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build();
            ar = new AudioRecord.Builder().setAudioFormat(af).setBufferSizeInBytes(Math.max(min * 4, 32768)).setAudioPlaybackCaptureConfig(cfg).build();
        } else {
            ar = new AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min * 4, 32768));
        }
        if (ar.getState() != AudioRecord.STATE_INITIALIZED) { ar.release(); return null; }
        ByteArrayOutputStream bo = new ByteArrayOutputStream(rate * 2 * sec);
        byte[] buf = new byte[4096];
        long end = System.currentTimeMillis() + sec * 1000L, start = System.currentTimeMillis();
        ar.startRecording();
        setState(Bubble.REC, end, sec * 1000, tap);
        try {
            while (System.currentTimeMillis() < end && bo.size() < rate * 2 * sec) {
                int n = ar.read(buf, 0, buf.length);
                if (n > 0) bo.write(buf, 0, n);
            }
        } finally { try { ar.stop(); } catch (Throwable t) { /* ignore */ } ar.release(); }
        return bo.toByteArray();
    }

    private static double rms(byte[] pcm) {
        long sum = 0; int n = 0;
        for (int i = 0; i + 1 < pcm.length; i += 8) { int s = (short) ((pcm[i] & 0xff) | (pcm[i + 1] << 8)); sum += (long) s * s; n++; }
        return n == 0 ? 0 : Math.sqrt(sum / (double) n);
    }

    private static byte[] wav(byte[] pcm) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream(pcm.length + 44);
        int rate = 16000, len = pcm.length;
        o.write("RIFF".getBytes("US-ASCII")); le(o, 36 + len, 4); o.write("WAVEfmt ".getBytes("US-ASCII"));
        le(o, 16, 4); le(o, 1, 2); le(o, 1, 2); le(o, rate, 4); le(o, rate * 2, 4); le(o, 2, 2); le(o, 16, 2);
        o.write("data".getBytes("US-ASCII")); le(o, len, 4); o.write(pcm);
        return o.toByteArray();
    }

    private static void le(ByteArrayOutputStream o, int v, int n) { for (int i = 0; i < n; i++) o.write((v >> (8 * i)) & 0xff); }

    private JSONObject ask(byte[] wav, String prompt) throws Exception {
        String b64 = Base64.encodeToString(wav, Base64.NO_WRAP);
        String last = "";
        for (int k = 0; k < chain.length(); k++) {
            String model = chain.optString(k);
            boolean think = model.matches("^gemini-([3-9]|\\d\\d).*");
            for (int pass = 0; pass < 2; pass++) {
                JSONObject gc = new JSONObject().put("responseMimeType", "application/json");
                if (think) gc.put("thinkingConfig", new JSONObject().put("thinkingLevel", "low"));
                JSONObject body = new JSONObject()
                    .put("contents", new JSONArray().put(new JSONObject().put("role", "user").put("parts", new JSONArray()
                        .put(new JSONObject().put("inline_data", new JSONObject().put("mime_type", "audio/wav").put("data", b64)))
                        .put(new JSONObject().put("text", prompt)))))
                    .put("generationConfig", gc);
                HttpURLConnection c = (HttpURLConnection) new URL("https://generativelanguage.googleapis.com/v1beta/models/" + Uri.encode(model) + ":generateContent").openConnection();
                c.setConnectTimeout(20000); c.setReadTimeout(90000);
                c.setRequestMethod("POST"); c.setDoOutput(true);
                c.setRequestProperty("content-type", "application/json");
                c.setRequestProperty("x-goog-api-key", key);
                byte[] b = body.toString().getBytes("UTF-8");
                c.setFixedLengthStreamingMode(b.length);
                OutputStream os = c.getOutputStream(); os.write(b); os.close();
                int st = c.getResponseCode();
                InputStream in = st >= 400 ? c.getErrorStream() : c.getInputStream();
                String txt = in == null ? "" : Util.readText(in);
                if (st >= 200 && st < 300) {
                    JSONObject j = new JSONObject(txt);
                    JSONArray parts = j.optJSONArray("candidates") != null && j.optJSONArray("candidates").length() > 0
                        ? j.optJSONArray("candidates").optJSONObject(0).optJSONObject("content").optJSONArray("parts") : null;
                    StringBuilder sb = new StringBuilder();
                    if (parts != null) for (int i = 0; i < parts.length(); i++) { JSONObject p = parts.optJSONObject(i); if (p != null && !p.optBoolean("thought")) sb.append(p.optString("text")); }
                    String t = sb.toString().trim();
                    int a0 = t.indexOf('{'), a1 = t.lastIndexOf('}');
                    if (a0 >= 0 && a1 > a0) return new JSONObject(t.substring(a0, a1 + 1));
                    throw new Exception("Gemini 沒有回傳內容");
                }
                last = txt;
                try { last = new JSONObject(txt).optJSONObject("error").optString("message", txt); } catch (Throwable x) { /* ignore */ }
                if (st == 400 && think && last.toLowerCase().contains("think")) { think = false; continue; }
                break;
            }
        }
        throw new Exception(last.length() > 120 ? last.substring(0, 120) : (last.isEmpty() ? "辨識失敗" : last));
    }

    /* ---------- 結果卡片 ---------- */
    private TextView btn(String t, boolean pri, View.OnClickListener l) {
        TextView b = new TextView(app);
        b.setText(t); b.setTextSize(14); b.setTextColor(pri ? Color.WHITE : 0xFFF3E9DC);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setPadding(dp(14), dp(9), dp(14), dp(9));
        GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(10)); g.setColor(pri ? 0xFFA9683C : 0x30FFFFFF);
        b.setBackground(g);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2); p.setMargins(dp(4), dp(4), dp(4), dp(4));
        b.setLayoutParams(p);
        return b;
    }

    private void openApp(String where, String q) {
        try {
            Intent i = new Intent(app, MainActivity.class).setAction("com.ian.websaver.LSN_SEARCH").putExtra("q", q).putExtra("where", where);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            app.startActivity(i);
        } catch (Throwable t) { /* ignore */ }
        hideCard();
    }

    void showCard(final String big, final String sub, final String q, final String mode) {
        Util.MAIN.post(new Runnable() { @Override public void run() {
            hideCard();
            card = new LinearLayout(app);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(18), dp(14), dp(18), dp(12));
            GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(16)); g.setColor(0xF4241D17); g.setStroke(dp(1), 0x40FFFFFF);
            card.setBackground(g);
            if (Build.VERSION.SDK_INT >= 21) card.setElevation(dp(10));
            TextView h = new TextView(app); h.setText("♫ 聽歌辨識" + ("mic".equals(mode) ? "（麥克風）" : "")); h.setTextSize(12); h.setTextColor(0xFFC9B49A);
            card.addView(h);
            TextView t = new TextView(app); t.setText(big); t.setTextSize(19); t.setTextColor(Color.WHITE); t.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD)); t.setPadding(0, dp(4), 0, dp(2));
            card.addView(t);
            if (sub != null && !sub.isEmpty()) { TextView s = new TextView(app); s.setText(sub); s.setTextSize(14); s.setTextColor(0xFFE6DACB); card.addView(s); }
            LinearLayout row = new LinearLayout(app); row.setOrientation(LinearLayout.HORIZONTAL); row.setPadding(0, dp(8), 0, 0);
            android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(app); hs.setHorizontalScrollBarEnabled(false); hs.addView(row);
            if (q != null) {
                row.addView(btn("▶ 播放", true, new View.OnClickListener() { @Override public void onClick(View v) { openApp("play", q); } }));
                row.addView(btn("YouTube Music", false, new View.OnClickListener() { @Override public void onClick(View v) { openApp("mu", q); } }));
                row.addView(btn("YouTube", false, new View.OnClickListener() { @Override public void onClick(View v) { openApp("yt", q); } }));
                row.addView(btn("複製", false, new View.OnClickListener() { @Override public void onClick(View v) {
                    try { ((android.content.ClipboardManager) app.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("song", q)); } catch (Throwable x) { /* ignore */ }
                    hideCard();
                } }));
            }
            row.addView(btn("再聽一次", q == null, new View.OnClickListener() { @Override public void onClick(View v) { hideCard(); listen(); } }));
            row.addView(btn("✕", false, new View.OnClickListener() { @Override public void onClick(View v) { hideCard(); } }));
            card.addView(hs);
            android.util.DisplayMetrics dm = app.getResources().getDisplayMetrics();
            clp = new WindowManager.LayoutParams(Math.min(dm.widthPixels - dp(24), dp(380)), -2, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH, PixelFormat.TRANSLUCENT);
            clp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            clp.y = dp(70);
            card.setOnTouchListener(new View.OnTouchListener() { @Override public boolean onTouch(View v, MotionEvent e) {
                if (e.getActionMasked() == MotionEvent.ACTION_OUTSIDE) { hideCard(); return true; }
                return false;
            } });
            try { wm.addView(card, clp); } catch (Throwable x) { card = null; }
        } });
    }

    void hideCard() {
        final LinearLayout c = card;
        card = null;
        if (c == null) return;
        Util.MAIN.post(new Runnable() { @Override public void run() { try { wm.removeView(c); } catch (Throwable t) { /* ignore */ } } });
    }
}
