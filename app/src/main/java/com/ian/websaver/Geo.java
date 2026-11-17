package com.ian.websaver;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.webkit.GeolocationPermissions;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.HashSet;

/** 網頁要用你的目前位置（例如找附近的店、地圖定位）：
    1. 先問你「這個網站可以使用你的位置嗎？」（允許／只有這次／不允許，可以記住）
    2. 你允許後，App 第一次會再跟手機要「位置」權限
    記住的選擇存在手機裡，設定裡可以清除；無痕模式只記到離開無痕為止。 */
final class Geo {
    static final int REQ = 52;
    private static final HashMap<String, Object[]> pending = new HashMap<>();   // id → {origin, callback}
    private static final HashSet<String> session = new HashSet<>();            // 只允許這次／無痕：關掉 App 就忘記
    private static Object[] waitPerm;                                           // 等手機權限回覆的那一筆
    private static int seq = 0;

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences("geo", 0); }

    static boolean hasPerm(Context c) {
        return Build.VERSION.SDK_INT < 23 || c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** 網頁要求位置 */
    static void ask(MainActivity a, String origin, GeolocationPermissions.Callback cb, boolean incog) {
        if (a == null || cb == null) return;
        if (!a.prefs.getBoolean("geoOn", true)) { cb.invoke(origin, false, false); return; }
        String saved = incog ? null : sp(a).getString(origin, null);
        if ("deny".equals(saved)) { cb.invoke(origin, false, false); return; }
        if ("allow".equals(saved) || session.contains(origin)) { grant(a, origin, cb); return; }
        String id = "g" + (++seq);
        synchronized (pending) { pending.put(id, new Object[]{origin, cb, incog}); }
        try { MainActivity.emit("geoAsk", new JSONObject().put("id", id).put("origin", origin).put("incog", incog).toString()); }
        catch (Throwable t) { cb.invoke(origin, false, false); }
    }

    /** 你在 App 的詢問框按了：allow 允許／不允許；remember 記住（無痕不記） */
    static void answer(MainActivity a, String id, boolean allow, boolean remember) {
        Object[] p;
        synchronized (pending) { p = pending.remove(id); }
        if (p == null) return;
        String origin = (String) p[0];
        GeolocationPermissions.Callback cb = (GeolocationPermissions.Callback) p[1];
        boolean incog = (Boolean) p[2];
        if (remember && !incog) sp(a).edit().putString(origin, allow ? "allow" : "deny").apply();
        if (!allow) { cb.invoke(origin, false, false); return; }
        session.add(origin);
        grant(a, origin, cb);
    }

    private static void grant(MainActivity a, String origin, GeolocationPermissions.Callback cb) {
        if (hasPerm(a)) { cb.invoke(origin, true, false); checkService(a); return; }
        waitPerm = new Object[]{origin, cb};
        try { a.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ); }
        catch (Throwable t) { cb.invoke(origin, false, false); waitPerm = null; }
    }

    /** 手機的位置權限回覆了 */
    static void onPerm(MainActivity a) {
        Object[] w = waitPerm; waitPerm = null;
        if (w == null) return;
        boolean ok = hasPerm(a);
        ((GeolocationPermissions.Callback) w[1]).invoke((String) w[0], ok, false);
        if (ok) checkService(a);
        else MainActivity.emit("geoDenied", "{}");
    }

    /** 手機的「定位」整個關著時提醒一下（網頁會拿不到位置） */
    private static void checkService(Context c) {
        try {
            LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
            boolean on = Build.VERSION.SDK_INT >= 28 ? lm.isLocationEnabled() : (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
            if (!on) MainActivity.emit("geoOff", "{}");
        } catch (Throwable t) { /* ignore */ }
    }

    /** 網頁不再需要了（例如換頁）：把還沒回答的詢問收掉 */
    static void hide(String origin) {
        synchronized (pending) {
            java.util.Iterator<java.util.Map.Entry<String, Object[]>> it = pending.entrySet().iterator();
            while (it.hasNext()) {
                java.util.Map.Entry<String, Object[]> e = it.next();
                if (origin == null || origin.equals(e.getValue()[0])) { it.remove(); try { MainActivity.emit("geoHide", new JSONObject().put("id", e.getKey()).toString()); } catch (Throwable t) { /* ignore */ } }
            }
        }
    }

    /** 記住的網站清單 {origin: allow|deny} */
    static String list(Context c) { return new JSONObject(sp(c).getAll()).toString(); }

    static void forget(Context c, String origin) {
        if (origin == null || origin.isEmpty()) { sp(c).edit().clear().apply(); session.clear(); }
        else { sp(c).edit().remove(origin).apply(); session.remove(origin); }
        try { GeolocationPermissions.getInstance().clearAll(); } catch (Throwable t) { /* ignore */ }
    }

    /** 離開無痕：無痕時允許過的網站忘掉 */
    static void clearSession() { session.clear(); }
}
