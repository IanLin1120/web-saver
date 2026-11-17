package com.ian.websaver;

import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;

/**
 * 無痕模式的獨立空間：用 WebView 的「設定檔（Profile）」把無痕分頁跟一般瀏覽完全分開，
 * Cookie、登入帳號、網站儲存、快取都各自一份；離開無痕時整個設定檔刪掉。
 * 需要 Android System WebView 110 以上（androidx.webkit 的 MULTI_PROFILE）；不支援時退回舊做法。
 */
final class Incog {
    private Incog() { }
    static final String NAME = "terra_incognito";
    /** 目前畫面上是不是無痕分頁（下載、影片轉送要用無痕的 Cookie） */
    static volatile boolean active = false;

    static boolean supported() {
        try {
            Class<?> f = Class.forName("androidx.webkit.WebViewFeature");
            return (Boolean) f.getMethod("isFeatureSupported", String.class).invoke(null, "MULTI_PROFILE");
        } catch (Throwable t) { return false; }
    }

    private static Object store() throws Exception {
        return Class.forName("androidx.webkit.ProfileStore").getMethod("getInstance").invoke(null);
    }

    private static Object profile() throws Exception {
        Object st = store();
        return st.getClass().getMethod("getOrCreateProfile", String.class).invoke(st, NAME);
    }

    /** 新建的 WebView（還沒載入任何網頁之前）掛到無痕設定檔 */
    static boolean apply(WebView w) {
        try {
            profile();
            Class.forName("androidx.webkit.WebViewCompat").getMethod("setProfile", WebView.class, String.class).invoke(null, w, NAME);
            return true;
        } catch (Throwable t) { return false; }
    }

    /** 無痕分頁也要允許第三方 Cookie（Outlook 信件圖片、嵌入的登入框需要），要設在無痕設定檔自己的 Cookie 管理員上 */
    static void allowThirdParty(WebView w) {
        try { Object p = profile(); ((CookieManager) p.getClass().getMethod("getCookieManager").invoke(p)).setAcceptThirdPartyCookies(w, true); } catch (Throwable t) { /* ignore */ }
    }

    /** 無痕設定檔自己的 Cookie（沒有就用一般的） */
    static CookieManager cookies() {
        if (active) {
            try { Object p = profile(); return (CookieManager) p.getClass().getMethod("getCookieManager").invoke(p); } catch (Throwable t) { /* 退回一般 */ }
        }
        return CookieManager.getInstance();
    }

    static String cookie(String url) {
        try { return cookies().getCookie(url); } catch (Throwable t) { return null; }
    }

    /** 清掉無痕設定檔裡的 Cookie 與網站資料（還在無痕中，只清無痕的，不碰一般瀏覽） */
    static void clearInside() {
        try {
            Object p = profile();
            ((CookieManager) p.getClass().getMethod("getCookieManager").invoke(p)).removeAllCookies(null);
            ((WebStorage) p.getClass().getMethod("getWebStorage").invoke(p)).deleteAllData();
        } catch (Throwable t) { /* ignore */ }
    }

    /** App 每次啟動時呼叫：上次如果沒有先「離開無痕」就把 App 滑掉，無痕設定檔會留在手機裡（記錄、登入帳號都還在）。
        這時候還沒有任何無痕分頁，直接把「terra_incognito」這個設定檔整個刪掉；刪不掉（極少見，還有分頁佔用）就改成清空它的 Cookie 與網站資料。
        只動無痕這一個設定檔，一般瀏覽用的是預設設定檔，完全不會碰到。 */
    static void wipeLeftover() {
        active = false;
        try {
            if (!supported()) return;
            Object st = store();
            Object names = st.getClass().getMethod("getAllProfileNames").invoke(st);
            if (!(names instanceof java.util.Collection) || !((java.util.Collection<?>) names).contains(NAME)) return;
            try { st.getClass().getMethod("deleteProfile", String.class).invoke(st, NAME); }
            catch (Throwable t) { clearInside(); }
        } catch (Throwable t) { /* 不支援或查不到：不處理 */ }
    }

    /** 離開無痕：無痕分頁都關掉之後，把整個設定檔（Cookie、帳號、儲存、快取、記錄）刪掉 */
    static void wipe() {
        clearInside();
        Util.MAIN.postDelayed(new Runnable() { @Override public void run() {
            try { Object st = store(); st.getClass().getMethod("deleteProfile", String.class).invoke(st, NAME); }
            catch (Throwable t) { clearInside(); }
        } }, 600);
    }
}
