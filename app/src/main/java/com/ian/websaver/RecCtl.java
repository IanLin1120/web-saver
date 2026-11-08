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
 * 錄影時的懸浮控制鈕（暫停／繼續、停止、錄影時間）。
 * 視窗設成「安全內容」：螢幕錄影時這一塊會變成黑色、錄不到按鈕；顏色也做成黑色，放在影片旁的黑邊上，看不出來。
 */
final class RecCtl {
    final MainActivity a;
    LinearLayout box;
    TextView tm, pp;
    WindowManager.LayoutParams lp;
    boolean shown = false;
    final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!shown) return;
            long s = ScreenRec.elapsed() / 1000;
            tm.setText(String.format(java.util.Locale.US, "%d:%02d", s / 60, s % 60));
            tm.postDelayed(this, 500);
        }
    };

    RecCtl(MainActivity act) { a = act; }

    private TextView btn(String t, int size) {
        TextView v = new TextView(a);
        v.setText(t);
        v.setTextSize(size);
        v.setTextColor(Color.parseColor("#d8d8d8"));
        v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setGravity(Gravity.CENTER);
        int p = Util.dp(a, 8);
        v.setPadding(p, p, p, p);
        v.setMinWidth(Util.dp(a, 44));
        v.setMinHeight(Util.dp(a, 44));
        return v;
    }

    void show() {
        Util.MAIN.post(new Runnable() {
            @Override public void run() {
                try {
                    box = new LinearLayout(a);
                    box.setOrientation(LinearLayout.VERTICAL);
                    box.setGravity(Gravity.CENTER_HORIZONTAL);
                    GradientDrawable bg = new GradientDrawable();
                    bg.setColor(Color.BLACK);
                    bg.setCornerRadius(Util.dp(a, 26));
                    box.setBackground(bg);
                    box.setPadding(Util.dp(a, 4), Util.dp(a, 8), Util.dp(a, 4), Util.dp(a, 8));
                    TextView dot = btn("●", 12);
                    dot.setTextColor(Color.parseColor("#e53935"));
                    dot.setMinHeight(Util.dp(a, 20));
                    dot.setPadding(0, 0, 0, 0);
                    tm = btn("0:00", 11);
                    tm.setMinHeight(Util.dp(a, 22));
                    tm.setPadding(0, 0, 0, Util.dp(a, 4));
                    pp = btn("❚❚", 15);
                    pp.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { ScreenRec.pause(a, ScreenRec.cur != null && !ScreenRec.cur.paused); } });
                    TextView st = btn("■", 17);
                    st.setTextColor(Color.parseColor("#ff6b5f"));
                    st.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { ScreenRec.stop(a); } });
                    box.addView(dot); box.addView(tm); box.addView(pp); box.addView(st);
                    lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.TYPE_APPLICATION_ATTACHED_DIALOG,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                        PixelFormat.TRANSLUCENT);
                    lp.token = a.getWindow().getDecorView().getWindowToken();
                    lp.gravity = Gravity.TOP | Gravity.START;
                    lp.x = Util.dp(a, 4);
                    lp.y = a.getResources().getDisplayMetrics().heightPixels / 3;
                    box.setOnTouchListener(drag());
                    a.getWindowManager().addView(box, lp);
                    shown = true;
                    tm.post(tick);
                } catch (Throwable t) { shown = false; }
            }
        });
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
        Util.MAIN.post(new Runnable() { @Override public void run() { if (pp != null) pp.setText(paused ? "▶" : "❚❚"); } });
    }

    void hide() {
        Util.MAIN.post(new Runnable() {
            @Override public void run() {
                shown = false;
                try { if (box != null) a.getWindowManager().removeView(box); } catch (Throwable t) { /* ignore */ }
                box = null;
            }
        });
    }
}
