package com.ian.websaver;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.view.View;

/** 懸浮下載按鈕的圖示：漸層圓底＋圓角線條的下載箭頭與托盤（向量繪製，任何解析度都清楚） */
final class FabIcon extends View {
    private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG), ln = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path arrow = new Path(), tray = new Path();
    private int c1, c2;
    private float prog = -1;
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG), arcBg = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final android.graphics.RectF ov = new android.graphics.RectF();

    void setProg(float p) { prog = p; invalidate(); }

    boolean busy() { return prog >= 0; }

    FabIcon(Context c, int accent) {
        super(c);
        c1 = lighten(accent, 0.18f);
        c2 = darken(accent, 0.22f);
        ring.setStyle(Paint.Style.STROKE);
        ring.setColor(Color.argb(70, 255, 255, 255));
        ln.setStyle(Paint.Style.STROKE);
        ln.setColor(Color.WHITE);
        ln.setStrokeCap(Paint.Cap.ROUND);
        ln.setStrokeJoin(Paint.Join.ROUND);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setColor(Color.parseColor("#7fe08a"));
        arcBg.setStyle(Paint.Style.STROKE);
        arcBg.setColor(Color.argb(90, 0, 0, 0));
    }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        bg.setShader(new LinearGradient(0, 0, w, h, c1, c2, Shader.TileMode.CLAMP));
        float s = Math.min(w, h);
        ring.setStrokeWidth(s * 0.03f);
        ln.setStrokeWidth(s * 0.075f);
        float cx = w / 2f, cy = h / 2f;
        arrow.reset();
        arrow.moveTo(cx, cy - s * 0.22f);
        arrow.lineTo(cx, cy + s * 0.07f);
        arrow.moveTo(cx - s * 0.13f, cy - s * 0.05f);
        arrow.lineTo(cx, cy + s * 0.08f);
        arrow.lineTo(cx + s * 0.13f, cy - s * 0.05f);
        tray.reset();
        tray.moveTo(cx - s * 0.2f, cy + s * 0.08f);
        tray.lineTo(cx - s * 0.2f, cy + s * 0.15f);
        tray.quadTo(cx - s * 0.2f, cy + s * 0.21f, cx - s * 0.14f, cy + s * 0.21f);
        tray.lineTo(cx + s * 0.14f, cy + s * 0.21f);
        tray.quadTo(cx + s * 0.2f, cy + s * 0.21f, cx + s * 0.2f, cy + s * 0.15f);
        tray.lineTo(cx + s * 0.2f, cy + s * 0.08f);
    }

    @Override protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight(), r = Math.min(w, h) / 2f;
        c.drawCircle(w / 2f, h / 2f, r, bg);
        c.drawCircle(w / 2f, h / 2f, r - ring.getStrokeWidth(), ring);
        c.drawPath(arrow, ln);
        c.drawPath(tray, ln);
        if (prog >= 0) {
            /* 下載／擷取進行中：外圈顯示進度 */
            float sw = r * 0.16f;
            arc.setStrokeWidth(sw); arcBg.setStrokeWidth(sw);
            ov.set(sw / 2, sw / 2, w - sw / 2, h - sw / 2);
            c.drawArc(ov, 0, 360, false, arcBg);
            c.drawArc(ov, -90, Math.max(6f, 360f * Math.min(1f, prog)), false, arc);
            if (prog < 1) postInvalidateDelayed(500);
        }
    }

    private static int lighten(int c, float f) {
        return Color.rgb((int) (Color.red(c) + (255 - Color.red(c)) * f), (int) (Color.green(c) + (255 - Color.green(c)) * f), (int) (Color.blue(c) + (255 - Color.blue(c)) * f));
    }

    private static int darken(int c, float f) {
        return Color.rgb((int) (Color.red(c) * (1 - f)), (int) (Color.green(c) * (1 - f)), (int) (Color.blue(c) * (1 - f)));
    }
}
