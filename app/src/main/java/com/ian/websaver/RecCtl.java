package com.ian.websaver;

import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 滿版播放／錄影時的懸浮控制鈕。
 * 準備模式：● 開始錄影、▶／❚❚ 播放暫停、✕ 離開滿版；錄影模式：錄影時間、❚❚ 暫停錄影、■ 停止。
 * 視窗設成「安全內容」並做成黑色：螢幕錄影時錄不到這個按鈕。
 */
final class RecCtl {
    private static RecCtl inst;
    static RecCtl get(MainActivity a) { if (inst == null || inst.a != a) inst = new RecCtl(a); return inst; }

    final MainActivity a;
    LinearLayout box;
    WindowManager.LayoutParams lp;
    boolean shown = false, rec = false;
    /** 錄影中的狀態：hot＝看不見的觸控點（畫面上什麼都沒有，錄不到）；panel＝已暫停，顯示控制面板 */
    String st = "ready";
    TextView tm, pp;
    final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!shown || !"panel".equals(st) || tm == null) return;
            long s = ScreenRec.elapsed() / 1000;
            tm.setText(String.format(java.util.Locale.US, "%d:%02d", s / 60, s % 60));
            tm.postDelayed(this, 500);
        }
    };

    private RecCtl(MainActivity act) { a = act; }

    private TextView btn(String t, int size, String color) {
        TextView v = new TextView(a);
        v.setText(t);
        v.setTextSize(size);
        v.setTextColor(Color.parseColor(color));
        v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setGravity(Gravity.CENTER);
        v.setMinWidth(Util.dp(a, 44));
        v.setMinHeight(Util.dp(a, 44));
        return v;
    }

    /** rec＝false：準備模式（還沒錄影）；true：錄影模式 */
    void show(final boolean recMode) {
        Util.MAIN.post(new Runnable() {
            @Override public void run() {
                rec = recMode;
                st = recMode ? "hot" : "ready";
                try {
                    if (box == null) {
                        box = new LinearLayout(a);
                        box.setOrientation(LinearLayout.VERTICAL);
                        box.setGravity(Gravity.CENTER_HORIZONTAL);
                        GradientDrawable bg = new GradientDrawable();
                        bg.setColor(Color.BLACK);
                        bg.setCornerRadius(Util.dp(a, 26));
                        box.setBackground(bg);
                        box.setPadding(Util.dp(a, 4), Util.dp(a, 8), Util.dp(a, 4), Util.dp(a, 8));
                        lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                            WindowManager.LayoutParams.TYPE_APPLICATION_ATTACHED_DIALOG,
                            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                            PixelFormat.TRANSLUCENT);
                        lp.token = a.getWindow().getDecorView().getWindowToken();
                        lp.gravity = Gravity.TOP | Gravity.START;
                        lp.x = Util.dp(a, 4);
                        lp.y = a.getResources().getDisplayMetrics().heightPixels / 3;
                        box.setOnTouchListener(drag());
                    }
                    build();
                    if (!shown) { a.getWindowManager().addView(box, lp); shown = true; }
                } catch (Throwable t) { shown = false; }
            }
        });
    }

    void state(final String ns) {
        Util.MAIN.post(new Runnable() { @Override public void run() { st = ns; if (box != null) { build(); if ("panel".equals(st) && tm != null) tm.post(tick); } } });
    }

    private void build() {
        box.removeAllViews();
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(Util.dp(a, 26));
        if ("hot".equals(st)) {
            /* 錄影中：完全透明（錄影畫面裡看不到任何東西）；點這裡會先暫停錄影，再顯示控制面板 */
            bg.setColor(Color.TRANSPARENT);
            box.setBackground(bg);
            View hot = new View(a);
            hot.setLayoutParams(new LinearLayout.LayoutParams(Util.dp(a, 56), Util.dp(a, 120)));
            hot.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { ScreenRec.pause(a, true); } });
            box.addView(hot);
            tm = null; pp = null;
            return;
        }
        bg.setColor(Color.BLACK);
        box.setBackground(bg);
        if ("ready".equals(st)) {
            TextView r = btn("●", 20, "#e53935");
            r.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { MainActivity.emit("recCtl", "rec"); } });
            TextView p = btn("▶❚❚", 11, "#d8d8d8");
            p.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { MainActivity.emit("recCtl", "toggle"); } });
            TextView x = btn("✕", 16, "#d8d8d8");
            x.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { MainActivity.emit("recCtl", "exit"); } });
            TextView lb = btn("錄影", 9, "#9a9a9a");
            lb.setMinHeight(Util.dp(a, 14));
            box.addView(r); box.addView(lb); box.addView(p); box.addView(x);
            tm = null; pp = null;
        } else {
            /* 已暫停：顯示面板（錄影已暫停，所以面板不會被錄到） */
            TextView lb = btn("已暫停", 9, "#e53935");
            lb.setMinHeight(Util.dp(a, 18));
            tm = btn("0:00", 11, "#d8d8d8");
            tm.setMinHeight(Util.dp(a, 22));
            pp = btn("▶", 17, "#d8d8d8");
            pp.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    /* 先把面板變透明，等畫面更新後才繼續錄影，面板就不會出現在影片裡 */
                    state("hot");
                    Util.MAIN.postDelayed(new Runnable() { @Override public void run() { ScreenRec.pause(a, false); } }, 400);
                }
            });
            TextView stp = btn("■", 17, "#ff6b5f");
            stp.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { state("hot"); ScreenRec.stop(a); } });
            box.addView(lb); box.addView(tm); box.addView(pp); box.addView(stp);
        }
    }

    private View.OnTouchListener drag() {
        return new View.OnTouchListener() {
            float dx, dy;
            @Override public boolean onTouch(View v, MotionEvent e) {
                if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { dx = lp.x - e.getRawX(); dy = lp.y - e.getRawY(); return true; }
                if (e.getActionMasked() == MotionEvent.ACTION_MOVE) {
                    lp.x = Math.round(e.getRawX() + dx); lp.y = Math.round(e.getRawY() + dy);
                    try { a.getWindowManager().updateViewLayout(box, lp); } catch (Throwable t) { /* ignore */ }
                    return true;
                }
                return false;
            }
        };
    }

    void update(final boolean paused) {
        if (paused) state("panel");
        else if (!"hot".equals(st)) state("hot");
    }

    void hide() {
        Util.MAIN.post(new Runnable() {
            @Override public void run() {
                try { if (box != null && shown) a.getWindowManager().removeView(box); } catch (Throwable t) { /* ignore */ }
                shown = false;
            }
        });
    }
}
