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
    TextView bubble;
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
                try { a.startActivityForResult(pm.createScreenCaptureIntent(), REQ); return; } catch (Throwable t) { /* 改用麥克風 */ }
            }
            inst.show(a, true);
        } catch (Throwable t) { emit("err", "無法開啟懸浮聽歌：" + t.getMessage()); }
    }

    static void onResult(final MainActivity a, final int res, final Intent data) {
        final ListenFloat f = inst;
        if (f == null) return;
        wantProj = res == android.app.Activity.RESULT_OK && data != null;
        KeepAlive.set(a, "lsnf", "懸浮聽歌辨識開著（長按懸浮按鈕可以關閉）");
        if (res != android.app.Activity.RESULT_OK || data == null) { f.show(a, true); emit("on", "沒有允許擷取手機的聲音，懸浮按鈕會改用麥克風聽"); return; }
        /* Android 14 起要先跑「螢幕擷取」類型的前景服務，才拿得到 MediaProjection */
        Util.MAIN.postDelayed(new Runnable() {
            int tries = 0;
            @Override public void run() {
                try {
                    MediaProjectionManager pm = (MediaProjectionManager) a.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                    f.mp = pm.getMediaProjection(res, data);
                    if (f.mp != null && Build.VERSION.SDK_INT >= 34) f.mp.registerCallback(new MediaProjection.Callback() { @Override public void onStop() { f.mp = null; } }, Util.MAIN);
                    f.show(a, true);
                } catch (SecurityException e) {
                    if (++tries < 6) Util.MAIN.postDelayed(this, 400); else { wantProj = false; f.show(a, true); }
                } catch (Throwable e) { f.show(a, true); }
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
        bubble = new TextView(app);
        bubble.setText("♫");
        bubble.setTextColor(Color.WHITE);
        bubble.setTextSize(24);
        bubble.setTypeface(Typeface.DEFAULT_BOLD);
        bubble.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xF08A6A48);
        bg.setStroke(dp(2), 0xCCFFFFFF);
        bubble.setBackground(bg);
        if (Build.VERSION.SDK_INT >= 21) bubble.setElevation(dp(6));
        int s = dp(56);
        blp = new WindowManager.LayoutParams(s, s, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        blp.gravity = Gravity.TOP | Gravity.START;
        android.util.DisplayMetrics dm = app.getResources().getDisplayMetrics();
        blp.x = dm.widthPixels - s - dp(12);
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
                            blp.x = blp.x + bubble.getWidth() / 2 < d.widthPixels / 2 ? dp(6) : d.widthPixels - bubble.getWidth() - dp(6);
                            try { wm.updateViewLayout(bubble, blp); } catch (Throwable t) { /* ignore */ }
                        } else if (e.getActionMasked() == MotionEvent.ACTION_UP) listen();
                        return true;
                }
                return false;
            }
        });
        try { wm.addView(bubble, blp); shown = true; }
        catch (Throwable t) { emit("err", "無法顯示懸浮按鈕：" + t.getMessage()); return; }
        emit("on", mp != null ? "懸浮聽歌已開啟：切到其他 App，點 ♫ 就會聽手機正在播的聲音" : "懸浮聽歌已開啟（用麥克風聽）");
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

    private void setBubble(final String txt, final int color) {
        Util.MAIN.post(new Runnable() { @Override public void run() {
            if (bubble == null) return;
            bubble.setText(txt);
            bubble.setTextSize(txt.length() > 1 ? 18 : 24);
            ((GradientDrawable) bubble.getBackground()).setColor(color);
        } });
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
                    pcm = record(true, 10);
                    if (pcm == null || rms(pcm) < 120) { pcm = null; }
                }
                if (pcm == null) { mode = "mic"; pcm = record(false, 9); }
                if (pcm == null || pcm.length < 16000) throw new Exception("沒有錄到聲音");
                setBubble("…", 0xF05C6B7A);
                JSONObject r = ask(wav(pcm), "tap".equals(mode) ? pTap : pMic);
                String title = r.optString("title").trim(), artist = r.optString("artist").trim(), ly = r.optString("lyrics").trim(), note = r.optString("note").trim();
                boolean sure = r.optBoolean("found") && !title.isEmpty() && (!r.has("confidence") || r.optDouble("confidence", 1) >= 0.5);
                String q = sure ? (title + " " + artist).trim() : ly.isEmpty() ? "" : ly.split("[\\n。！？!?]")[0];
                if (q.length() > 40) q = q.substring(0, 40);
                if (q.isEmpty()) showCard("沒有辨識出來", note.isEmpty() ? "聽不出是哪首歌，也沒有聽到歌詞。等唱到人聲時再試一次。" : note, null, mode);
                else { buzz(30); showCard(sure ? title : "用聽到的歌詞搜尋", sure ? (artist + (note.isEmpty() ? "" : "\n" + note)) : "「" + q + "」", q, mode); }
            } catch (Throwable t) {
                showCard("沒有辨識出來", t.getMessage() == null ? "辨識失敗" : t.getMessage(), null, mode);
            } finally {
                busy = false;
                setBubble("♫", 0xF08A6A48);
            }
        } }, "lsn-float").start();
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
        int last = -1;
        try {
            while (System.currentTimeMillis() < end && bo.size() < rate * 2 * sec) {
                int n = ar.read(buf, 0, buf.length);
                if (n > 0) bo.write(buf, 0, n);
                int left = (int) Math.ceil((end - System.currentTimeMillis()) / 1000.0);
                if (left != last) { last = left; setBubble(String.valueOf(Math.max(1, left)), tap ? 0xF0B5532F : 0xF02F7A5B); }
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
        GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(18)); g.setColor(pri ? 0xFF8A6A48 : 0x33FFFFFF);
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
            GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(20)); g.setColor(0xF2241D17); g.setStroke(dp(1), 0x40FFFFFF);
            card.setBackground(g);
            if (Build.VERSION.SDK_INT >= 21) card.setElevation(dp(10));
            TextView h = new TextView(app); h.setText("♫ 聽歌辨識" + ("mic".equals(mode) ? "（麥克風）" : "")); h.setTextSize(12); h.setTextColor(0xFFC9B49A);
            card.addView(h);
            TextView t = new TextView(app); t.setText(big); t.setTextSize(19); t.setTextColor(Color.WHITE); t.setTypeface(Typeface.DEFAULT_BOLD); t.setPadding(0, dp(4), 0, dp(2));
            card.addView(t);
            if (sub != null && !sub.isEmpty()) { TextView s = new TextView(app); s.setText(sub); s.setTextSize(14); s.setTextColor(0xFFE6DACB); card.addView(s); }
            LinearLayout row = new LinearLayout(app); row.setOrientation(LinearLayout.HORIZONTAL); row.setPadding(0, dp(8), 0, 0);
            android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(app); hs.setHorizontalScrollBarEnabled(false); hs.addView(row);
            if (q != null) {
                row.addView(btn("YouTube Music", true, new View.OnClickListener() { @Override public void onClick(View v) { openApp("mu", q); } }));
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
