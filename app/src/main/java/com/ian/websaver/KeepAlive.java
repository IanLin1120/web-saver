package com.ian.websaver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 前景服務：下載、背景擷取、YouTube／音樂播放進行中時，讓 App 在切到主畫面或關閉螢幕後繼續執行。
 * 也負責「下載完成」的震動與通知。
 */
public class KeepAlive extends Service {
    private static final String CH_RUN = "run", CH_DONE = "done";
    private static final Map<String, String> TASKS = new LinkedHashMap<>();
    private static Context app;
    private static volatile boolean requested, started;
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;

    /** key：dl、conv、cap、yt、music；text 為 null 代表結束 */
    static void set(Context c, String key, String text) {
        if (c == null) return;
        app = c.getApplicationContext();
        boolean need;
        synchronized (TASKS) {
            if (text == null) TASKS.remove(key); else TASKS.put(key, text);
            need = !TASKS.isEmpty();
        }
        Intent i = new Intent(app, KeepAlive.class);
        try {
            if (need) { requested = true; if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(i); else app.startService(i); }
            /* 剛要求啟動、服務還沒跑起來就 stopService，系統會直接讓 App 閃退（startForegroundService 之後一定要 startForeground）。
               這種情況不要停，等 onStartCommand 跑到時它會發現沒有工作、自己結束。 */
            else if (started || !requested) app.stopService(i);
        } catch (Throwable t) { /* 背景時不允許啟動前景服務：忽略 */ }
    }

    /* ---------- 系統媒體控制：通知列的播放器、快速面板、鎖定畫面、藍牙耳機 ---------- */
    private static android.media.session.MediaSession sess;
    private static String mTitle = "", mArtist = "", mArtUrl = "";
    private static android.graphics.Bitmap mArt;
    private static long mDur, mPos; private static boolean mPlaying;

    private static void cmd(String c) { MainActivity.emit("mediaCmd", c); MainActivity m = MainActivity.cur; if (m != null) m.mediaCmd(c); }

    private static void ensureSession(Context c) {
        if (sess != null) return;
        sess = new android.media.session.MediaSession(c.getApplicationContext(), "websaver");
        sess.setCallback(new android.media.session.MediaSession.Callback() {
            @Override public void onPlay() { cmd("play"); }
            @Override public void onPause() { cmd("pause"); }
            @Override public void onSkipToNext() { cmd("next"); }
            @Override public void onSkipToPrevious() { cmd("prev"); }
            @Override public void onSeekTo(long pos) { cmd("seek:" + (pos / 1000.0)); }
            @Override public void onStop() { cmd("pause"); }
        });
    }

    private static void pushSession() {
        if (sess == null) return;
        android.media.MediaMetadata.Builder mb = new android.media.MediaMetadata.Builder()
            .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, mTitle)
            .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, mArtist)
            .putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, mDur > 0 ? mDur : -1);
        if (mArt != null) mb.putBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART, mArt);
        sess.setMetadata(mb.build());
        long acts = android.media.session.PlaybackState.ACTION_PLAY | android.media.session.PlaybackState.ACTION_PAUSE | android.media.session.PlaybackState.ACTION_PLAY_PAUSE
            | android.media.session.PlaybackState.ACTION_SKIP_TO_NEXT | android.media.session.PlaybackState.ACTION_SKIP_TO_PREVIOUS | android.media.session.PlaybackState.ACTION_SEEK_TO;
        sess.setPlaybackState(new android.media.session.PlaybackState.Builder().setActions(acts)
            .setState(mPlaying ? android.media.session.PlaybackState.STATE_PLAYING : android.media.session.PlaybackState.STATE_PAUSED, mPos, mPlaying ? 1f : 0f).build());
        sess.setActive(true);
    }

    private static android.graphics.Bitmap loadArt(String u) {
        try {
            android.graphics.Bitmap b = null;
            if (u.startsWith("data:")) { byte[] d = android.util.Base64.decode(u.substring(u.indexOf(',') + 1), android.util.Base64.DEFAULT); b = android.graphics.BitmapFactory.decodeByteArray(d, 0, d.length); }
            else if (u.startsWith("file://")) b = android.graphics.BitmapFactory.decodeFile(android.net.Uri.parse(u).getPath());
            else if (u.startsWith("/")) b = android.graphics.BitmapFactory.decodeFile(u);
            else if (u.startsWith("http")) {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(u).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(8000);
                java.io.InputStream in = c.getInputStream();
                try { b = android.graphics.BitmapFactory.decodeStream(in); } finally { in.close(); }
            }
            if (b != null && (b.getWidth() > 640 || b.getHeight() > 640)) {
                float k = 640f / Math.max(b.getWidth(), b.getHeight());
                b = android.graphics.Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * k), Math.round(b.getHeight() * k), true);
            }
            return b;
        } catch (Throwable t) { return null; }
    }

    /** App 介面回報正在播的歌：{title, artist, art, dur（秒）, pos（秒）, playing}；title 空白代表沒有在播 */
    static void meta(final Context c, final String json) {
        Util.ui(new Runnable() { @Override public void run() {
            try {
                org.json.JSONObject o = new org.json.JSONObject(json == null || json.isEmpty() ? "{}" : json);
                String t = o.optString("title", "");
                if (t.isEmpty()) {
                    mTitle = ""; mArtist = ""; mArt = null; mArtUrl = "";
                    if (sess != null) { try { sess.setActive(false); sess.release(); } catch (Throwable e) { /* ignore */ } sess = null; }
                    refresh(c); return;
                }
                ensureSession(c);
                mTitle = t; mArtist = o.optString("artist", "");
                mDur = (long) (o.optDouble("dur", 0) * 1000); mPos = (long) (o.optDouble("pos", 0) * 1000); mPlaying = o.optBoolean("playing", false);
                final String art = o.optString("art", "");
                if (!art.equals(mArtUrl)) {
                    mArtUrl = art; mArt = null;
                    if (!art.isEmpty()) new Thread(new Runnable() { @Override public void run() {
                        final android.graphics.Bitmap b = loadArt(art);
                        Util.ui(new Runnable() { @Override public void run() { if (art.equals(mArtUrl) && b != null) { mArt = b; pushSession(); refresh(c); } } });
                    } }).start();
                }
                pushSession(); refresh(c);
            } catch (Throwable t) { /* ignore */ }
        } });
    }

    /** 重新產生通知（服務在執行時才需要） */
    private static void refresh(Context c) {
        boolean need; synchronized (TASKS) { need = !TASKS.isEmpty(); }
        if (!need || c == null) return;
        try { Intent i = new Intent(c.getApplicationContext(), KeepAlive.class); if (Build.VERSION.SDK_INT >= 26) c.getApplicationContext().startForegroundService(i); else c.getApplicationContext().startService(i); } catch (Throwable t) { /* ignore */ }
    }

    static boolean musicOn() { synchronized (TASKS) { return TASKS.containsKey("music"); } }

    static boolean media() { synchronized (TASKS) { return TASKS.containsKey("yt") || TASKS.containsKey("music"); } }

    private static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CH_RUN) == null) {
            NotificationChannel ch = new NotificationChannel(CH_RUN, "背景執行中", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CH_DONE) == null) {
            NotificationChannel ch = new NotificationChannel(CH_DONE, "下載完成", NotificationManager.IMPORTANCE_DEFAULT);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[] {0, 120, 90, 160});
            nm.createNotificationChannel(ch);
        }
    }

    private Notification build() {
        channels(this);
        StringBuilder sb = new StringBuilder();
        synchronized (TASKS) { for (String v : TASKS.values()) { if (sb.length() > 0) sb.append("・"); sb.append(v); } }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_RUN) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("Terra 瀏覽器").setContentText(sb.length() == 0 ? "背景執行中" : sb.toString())
            .setContentIntent(pi).setOngoing(true).setOnlyAlertOnce(true);
        boolean rec;
        synchronized (TASKS) { rec = TASKS.containsKey("srec"); }
        if (rec) {
            b.addAction(new Notification.Action.Builder(null, "暫停／繼續錄影", act("srecPause", 4)).build());
            b.addAction(new Notification.Action.Builder(null, "停止錄影", act("srecStop", 3)).build());
        }
        if (media() && sess != null && !mTitle.isEmpty()) {
            /* 媒體樣式通知：封面、歌名、歌手、上一首／播放暫停／下一首；系統的快速面板與鎖定畫面也會顯示 */
            b.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(mTitle).setContentText(mArtist.isEmpty() ? "Terra 瀏覽器" : mArtist)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
            if (mArt != null) b.setLargeIcon(mArt);
            b.addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(this, android.R.drawable.ic_media_previous), "上一首", act("prev", 5)).build());
            b.addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(this, mPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play), mPlaying ? "暫停" : "播放", act("toggle", 1)).build());
            b.addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(this, android.R.drawable.ic_media_next), "下一首", act("next", 2)).build());
            b.setStyle(new Notification.MediaStyle().setMediaSession(sess.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        } else if (media()) {
            b.setSmallIcon(android.R.drawable.ic_media_play);
            b.addAction(new Notification.Action.Builder(null, "播放／暫停", act("toggle", 1)).build());
            b.addAction(new Notification.Action.Builder(null, "下一首", act("next", 2)).build());
        }
        return b.build();
    }

    private PendingIntent act(String a, int code) {
        return PendingIntent.getService(this, code, new Intent(this, KeepAlive.class).setAction(a), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if ("srecStop".equals(a)) { MainActivity m = MainActivity.cur; if (m != null) ScreenRec.stop(m); a = null; }
        if ("srecPause".equals(a)) { MainActivity m = MainActivity.cur; if (m != null && ScreenRec.cur != null) ScreenRec.pause(m, !ScreenRec.cur.paused); a = null; }
        if (a != null) { MainActivity.emit("mediaCmd", a); MainActivity m = MainActivity.cur; if (m != null) m.mediaCmd(a); }
        boolean empty;
        synchronized (TASKS) { empty = TASKS.isEmpty(); }
        Notification n = build();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                boolean proj;
                synchronized (TASKS) { proj = TASKS.containsKey("srec") || (TASKS.containsKey("lsnf") && ListenFloat.wantProj); }
                int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC | (media() ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0) | (proj ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION : 0);
                startForeground(7, n, type);
            } else startForeground(7, n);
        } catch (Throwable t) {
            try { startForeground(7, n); } catch (Throwable x) { /* ignore */ }
        }
        if (wake == null) {
            wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "websaver:keep");
            wake.setReferenceCounted(false);
            wake.acquire(6 * 3600_000L);
        }
        if (wifi == null) {
            try {
                wifi = ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "websaver:wifi");
                wifi.setReferenceCounted(false);
                wifi.acquire();
            } catch (Throwable t) { wifi = null; }
        }
        started = true;
        if (empty) { requested = false; started = false; stopSelf(); }
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        started = false; requested = false;
        try { if (wake != null) wake.release(); } catch (Throwable t) { /* ignore */ }
        try { if (wifi != null) wifi.release(); } catch (Throwable t) { /* ignore */ }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    /** 下載／擷取完成：震動並發通知 */
    static void done(Context c, String title) { notice(c, "下載完成", title); }

    static void notice(Context c, String head, String title) { notice(c, head, title, null); }
    /** aiId：點通知時要直接打開的那部影片（AI 摘要） */
    static void notice(Context c, String head, String title, String aiId) {
        if (c == null) return;
        Context ac = c.getApplicationContext();
        try {
            Vibrator v = (Vibrator) ac.getSystemService(VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[] {0, 120, 90, 160}, -1));
                else v.vibrate(new long[] {0, 120, 90, 160}, -1);
            }
        } catch (Throwable t) { /* ignore */ }
        try {
            channels(ac);
            Intent open = new Intent(ac, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int rc = 3;
            if (aiId != null && !aiId.isEmpty()) { open.setAction("com.ian.websaver.AI_OPEN").putExtra("aiId", aiId); rc = 4000 + (aiId.hashCode() & 0xfff); }
            PendingIntent pi = PendingIntent.getActivity(ac, rc, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ac, CH_DONE) : new Notification.Builder(ac);
            b.setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle(head).setContentText(title == null ? "" : title).setAutoCancel(true).setContentIntent(pi);
            ((NotificationManager) ac.getSystemService(NOTIFICATION_SERVICE)).notify((int) (System.currentTimeMillis() % 100000) + 100, b.build());
        } catch (Throwable t) { /* 沒有通知權限 */ }
    }

    /** 從「最近使用」把 App 劃掉：服務還在跑也要把檔案庫／收藏重新鎖上 */
    @Override public void onTaskRemoved(android.content.Intent rootIntent) {
        Lock.session = false;
        super.onTaskRemoved(rootIntent);
    }
}
