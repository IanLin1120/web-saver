package com.ian.websaver;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

/** 震動：點一下、震兩下、拖曳時一路輕震 */
final class Haptic {
    private static long lastTick = 0;

    static void buzz(Context c, int ms) { buzz(c, ms, -1); }

    static void buzz(Context c, int ms, int amp) {
        try {
            Vibrator v = (Vibrator) c.getApplicationContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, amp > 0 && v.hasAmplitudeControl() ? amp : VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(ms);
        } catch (Throwable t) { /* ignore */ }
    }

    /** 震兩下（關閉） */
    static void twice(Context c) {
        try {
            Vibrator v = (Vibrator) c.getApplicationContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            long[] w = {0, 45, 90, 45};
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(w, -1)); else v.vibrate(w, -1);
        } catch (Throwable t) { /* ignore */ }
    }

    /** 拖曳中：手指在動就每 45ms 輕震一下，摸起來是連續的震動 */
    static void dragTick(Context c) {
        long now = System.currentTimeMillis();
        if (now - lastTick < 45) return;
        lastTick = now;
        buzz(c, 9, 90);
    }
}
