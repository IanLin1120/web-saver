package com.ian.websaver;

import android.content.Context;
import android.os.Build;
import android.view.View;
import android.webkit.WebView;

/**
 * 切到主畫面或關閉螢幕時，系統會通知 WebView「看不到了」，Chromium 就會暫停影音與降低效能。
 * keep=true 時忽略這個通知，讓背景播放、背景下載（錄製）、音樂播放繼續進行。
 */
class KeepWebView extends WebView {
    volatile boolean keep;

    KeepWebView(Context c, boolean keep) {
        super(c);
        this.keep = keep;
        if (Build.VERSION.SDK_INT >= 26) setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    }

    @Override protected void onWindowVisibilityChanged(int visibility) {
        if (keep && visibility != View.VISIBLE) { super.onWindowVisibilityChanged(View.VISIBLE); return; }
        super.onWindowVisibilityChanged(visibility);
    }
}
