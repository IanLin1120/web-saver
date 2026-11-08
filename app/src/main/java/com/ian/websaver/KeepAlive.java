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
            if (need) { if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(i); else app.startService(i); }
            else app.stopService(i);
        } catch (Throwable t) { /* 背景時不允許啟動前景服務：忽略 */ }
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
        b.setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("網頁擷取").setContentText(sb.length() == 0 ? "背景執行中" : sb.toString())
            .setContentIntent(pi).setOngoing(true).setOnlyAlertOnce(true);
        boolean rec;
        synchronized (TASKS) { rec = TASKS.containsKey("srec"); }
        if (rec) {
            b.addAction(new Notification.Action.Builder(null, "暫停／繼續錄影", act("srecPause", 4)).build());
            b.addAction(new Notification.Action.Builder(null, "停止錄影", act("srecStop", 3)).build());
        }
        if (media()) {
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
                synchronized (TASKS) { proj = TASKS.containsKey("srec"); }
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
        if (empty) stopSelf();
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        try { if (wake != null) wake.release(); } catch (Throwable t) { /* ignore */ }
        try { if (wifi != null) wifi.release(); } catch (Throwable t) { /* ignore */ }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    /** 下載／擷取完成：震動並發通知 */
    static void done(Context c, String title) { notice(c, "下載完成", title); }

    static void notice(Context c, String head, String title) {
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
            PendingIntent pi = PendingIntent.getActivity(ac, 3, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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
