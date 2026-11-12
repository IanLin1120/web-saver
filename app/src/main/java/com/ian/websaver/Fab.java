package com.ian.websaver;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;

/** 懸浮下載按鈕：浮在所有畫面最上層（包含彈出視窗），可拖曳，點一下就開啟下載面板。 */
final class Fab {
    final MainActivity a;
    final FrameLayout box;
    final View btn;
    final TextView badge;
    private boolean want = false, covered = false;

    Fab(MainActivity act) {
        a = act;
        int s = Util.dp(a, 52);
        box = new FrameLayout(a);
        int accent;
        try { accent = Color.parseColor(a.prefs.getString("accent", "#a2613a")); } catch (Throwable t) { accent = Color.parseColor("#a2613a"); }
        btn = new FabIcon(a, accent);
        btn.setOutlineProvider(android.view.ViewOutlineProvider.BACKGROUND);
        GradientDrawable sh = new GradientDrawable();
        sh.setShape(GradientDrawable.OVAL);
        sh.setColor(Color.TRANSPARENT);
        btn.setBackground(sh);
        btn.setElevation(Util.dp(a, 8));
        box.addView(btn, new FrameLayout.LayoutParams(s, s, Gravity.BOTTOM | Gravity.END));
        badge = new TextView(a);
        badge.setTextSize(11);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setTextColor(Color.WHITE);
        badge.setGravity(Gravity.CENTER);
        badge.setPadding(Util.dp(a, 5), 0, Util.dp(a, 5), 0);
        GradientDrawable bb = new GradientDrawable();
        bb.setCornerRadius(Util.dp(a, 99));
        bb.setColor(Color.parseColor("#d9483b"));
        badge.setBackground(bb);
        badge.setElevation(Util.dp(a, 9));
        badge.setMinWidth(Util.dp(a, 20));
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(-2, Util.dp(a, 20), Gravity.TOP | Gravity.END);
        box.addView(badge, blp);
        badge.setVisibility(View.GONE);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(s + Util.dp(a, 8), s + Util.dp(a, 8), Gravity.TOP | Gravity.START);
        a.root.addView(box, lp);
        box.setVisibility(View.GONE);
        float d = a.getResources().getDisplayMetrics().density;
        box.setX(a.prefs.getFloat("fabX", -1) >= 0 ? a.prefs.getFloat("fabX", 0) : a.getResources().getDisplayMetrics().widthPixels - s - 24 * d);
        box.setY(a.prefs.getFloat("fabY", -1) >= 0 ? a.prefs.getFloat("fabY", 0) : a.getResources().getDisplayMetrics().heightPixels * 0.62f);
        btn.setOnTouchListener(new View.OnTouchListener() {
            float dx, dy, sx, sy;
            boolean moved;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = box.getX() - e.getRawX(); dy = box.getY() - e.getRawY(); sx = e.getRawX(); sy = e.getRawY(); moved = false;
                        btn.animate().scaleX(0.9f).scaleY(0.9f).setDuration(80).start();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        if (Math.abs(e.getRawX() - sx) + Math.abs(e.getRawY() - sy) > Util.dp(a, 8)) moved = true;
                        if (moved) {
                            View p = (View) box.getParent();
                            box.setX(Math.max(0, Math.min(p.getWidth() - box.getWidth(), e.getRawX() + dx)));
                            box.setY(Math.max(0, Math.min(p.getHeight() - box.getHeight(), e.getRawY() + dy)));
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        btn.animate().scaleX(1f).scaleY(1f).setDuration(80).start();
                        if (moved) {
                            View p = (View) box.getParent();
                            float x = box.getX() + box.getWidth() / 2f < p.getWidth() / 2f ? Util.dp(a, 6) : p.getWidth() - box.getWidth() - Util.dp(a, 6);
                            box.animate().x(x).setDuration(160).start();
                            a.prefs.edit().putFloat("fabX", x).putFloat("fabY", box.getY()).apply();
                        } else if (e.getActionMasked() == MotionEvent.ACTION_UP) {
                            MainActivity.emit("fab", a.yt != null && a.yt.isShown() ? "yt" : "br");
                        }
                        return true;
                    default: return false;
                }
            }
        });
    }

    void set(boolean on, String label) {
        want = on;
        if (label == null || label.isEmpty() || "0".equals(label)) badge.setVisibility(View.GONE);
        else { badge.setText(label); badge.setVisibility(View.VISIBLE); }
        apply();
    }

    void prog(float p) { ((FabIcon) btn).setProg(p); apply(); }

    void cover(boolean on) { covered = on; apply(); }

    private void apply() {
        boolean fs = (a.br != null && a.br.fs) || (a.yt != null && a.yt.fs);
        boolean vis = (want || ((FabIcon) btn).busy()) && !covered && !fs && !a.inPipNow;
        box.setVisibility(vis ? View.VISIBLE : View.GONE);
        if (vis) {
            /* 子母畫面、全螢幕之後網頁會被拉到最上層，按鈕就被蓋在下面看不到：每次顯示都重新放回最上層，並確認沒有跑出畫面 */
            try {
                box.bringToFront();
                View p = (View) box.getParent();
                if (p != null && p.getWidth() > 0 && box.getWidth() > 0) {
                    if (box.getX() < 0 || box.getX() > p.getWidth() - box.getWidth()) box.setX(p.getWidth() - box.getWidth() - Util.dp(a, 6));
                    if (box.getY() < 0 || box.getY() > p.getHeight() - box.getHeight()) box.setY(p.getHeight() * 0.62f);
                }
            } catch (Throwable t) { /* ignore */ }
        }
        if (vis) box.bringToFront();
    }

    void refresh() { apply(); }
    /** 按鈕不見時用：解除遮蓋狀態、放回預設位置 */
    void reset() {
        covered = false;
        try {
            View p = (View) box.getParent();
            int w = p != null && p.getWidth() > 0 ? p.getWidth() : a.getResources().getDisplayMetrics().widthPixels;
            int h = p != null && p.getHeight() > 0 ? p.getHeight() : a.getResources().getDisplayMetrics().heightPixels;
            int bw = box.getWidth() > 0 ? box.getWidth() : Util.dp(a, 56);
            box.setX(w - bw - Util.dp(a, 6)); box.setY(h * 0.62f);
            a.prefs.edit().remove("fabX").remove("fabY").apply();
        } catch (Throwable t) { /* ignore */ }
        apply();
    }
}
