package com.ian.websaver;

import android.content.Context;
import android.media.AudioManager;
import android.webkit.WebView;

/** 播放被其他 App 打斷後自動繼續：
    在其他 App 時，別的 App 一出聲（看影片、語音訊息、遊戲），系統會把我們正在播的音樂「搶走焦點」，WebView 就會暫停而且不會自己恢復。
    這裡在偵測到「不是你按的暫停」之後，等手機安靜下來（沒有其他 App 在播、也沒在通話）3 秒，再把原本的音樂接著播。
    你自己按的暫停（App 裡、通知列、耳機鍵）不會被接回去。 */
final class Resume {
    private static volatile long lastCmd = 0;
    private static Runnable task;
    private static final int MAX_WAIT_S = 30 * 60;

    /** App 自己或你下的播放／暫停指令：之後 2.5 秒內的暫停都當作你按的 */
    static void mark() { lastCmd = System.currentTimeMillis(); stop(); }

    static void stop() {
        if (task != null) { Util.MAIN.removeCallbacks(task); task = null; }
    }

    /** 網頁回報「影片／音樂被暫停了，不是使用者按的」 */
    static void interrupted(final MainActivity a, final WebView wv) {
        if (System.currentTimeMillis() - lastCmd < 2500) return;
        if (a == null || wv == null) return;
        if (!a.prefs.getBoolean("autoResume", true)) return;
        Util.MAIN.post(new Runnable() { @Override public void run() {
            /* 正在看 App 的時候被打斷（例如通知音），系統會自己恢復；只處理在其他 App 或關螢幕時 */
            if (MainActivity.visible) return;
            stop();
            final long since = lastCmd;
            final AudioManager am = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
            task = new Runnable() {
                int quiet = 0, n = 0;
                @Override public void run() {
                    if (task != this) return;
                    if (lastCmd != since || MainActivity.visible || ++n > MAX_WAIT_S) { task = null; return; }
                    boolean busy = true;
                    try { busy = am == null || am.getMode() != AudioManager.MODE_NORMAL || am.isMusicActive(); } catch (Throwable t) { /* ignore */ }
                    quiet = busy ? 0 : quiet + 1;
                    if (quiet >= 3) {
                        task = null;
                        try { wv.evaluateJavascript("window.__wsIntResume&&__wsIntResume()", null); } catch (Throwable t) { /* ignore */ }
                        return;
                    }
                    Util.MAIN.postDelayed(this, 1000);
                }
            };
            Util.MAIN.postDelayed(task, 1500);
        } });
    }
}
