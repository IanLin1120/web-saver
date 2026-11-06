package com.ian.websaver;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfDocument;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** 把離線 HTML 轉成 PDF：在畫面外的 WebView 排版，再逐頁畫進 PdfDocument（不需要使用者操作）。 */
final class Pdf {
    private Pdf() { }

    static JSONObject renderSync(final MainActivity a, final File html, String name, String url, String title, final JSONObject opts) throws Exception {
        final File out = Lib.get(a).tmpFile("pdf");
        String first = null;
        /* 方法一：系統列印引擎（向量、可選取文字、正確分頁） */
        try { printSync(a, html, out, opts == null ? new JSONObject() : opts); }
        catch (Throwable t) { first = t.getMessage(); out.delete(); }
        if (!out.exists() || out.length() < 100) {
            /* 方法二：把網頁畫進 PDF */
            final CountDownLatch done = new CountDownLatch(1);
            final Throwable[] err = {null};
            Util.ui(new Runnable() {
                @Override public void run() {
                    try { new Job(a, html, out, opts == null ? new JSONObject() : opts, done, err).start(); }
                    catch (Throwable t) { err[0] = t; done.countDown(); }
                }
            });
            if (!done.await(150, TimeUnit.SECONDS)) throw new Exception("產生 PDF 逾時" + (first == null ? "" : "（" + first + "）"));
            if (err[0] != null) throw new Exception((err[0].getMessage() == null ? err[0].toString() : err[0].getMessage()) + (first == null ? "" : "；" + first));
            if (!out.exists() || out.length() < 100) throw new Exception("PDF 產生失敗" + (first == null ? "" : "（" + first + "）"));
        }
        return Lib.get(a).add(out, name, "application/pdf", url, title, null);
    }

    private static void printSync(final MainActivity a, final File html, final File out, final JSONObject opts) throws Exception {
        final CountDownLatch done = new CountDownLatch(1);
        final String[] err = {null};
        final WebView[] hold = {null};
        Util.ui(new Runnable() {
            @Override public void run() {
                try {
                    final WebView w = new WebView(a);
                    hold[0] = w;
                    w.getSettings().setAllowFileAccess(true);
                    w.getSettings().setJavaScriptEnabled(false);
                    w.setBackgroundColor(Color.WHITE);
                    int wpx = a.root.getWidth() > 0 ? a.root.getWidth() : 1080;
                    FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(wpx, a.root.getHeight() > 0 ? a.root.getHeight() : 1800);
                    w.setTranslationX(-wpx - 400);
                    a.root.addView(w, 0, lp);
                    w.setWebViewClient(new WebViewClient() {
                        boolean once = false;
                        @Override public void onPageFinished(final WebView v, String u) {
                            if (once) return;
                            once = true;
                            Util.MAIN.postDelayed(new Runnable() {
                                @Override public void run() {
                                    try {
                                        String paper = opts.optString("paper", "a4");
                                        PrintAttributes.MediaSize ms = paper.equals("letter") ? PrintAttributes.MediaSize.NA_LETTER : paper.equals("a3") ? PrintAttributes.MediaSize.ISO_A3 : PrintAttributes.MediaSize.ISO_A4;
                                        if (opts.optBoolean("landscape", false)) ms = ms.asLandscape();
                                        int mils = Math.round(opts.optInt("margin", 10) / 25.4f * 1000);
                                        PrintAttributes at = new PrintAttributes.Builder().setMediaSize(ms)
                                            .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 600, 600))
                                            .setMinMargins(new PrintAttributes.Margins(mils, mils, mils, mils))
                                            .setColorMode(PrintAttributes.COLOR_MODE_COLOR).build();
                                        android.print.PdfPrinter.write(v.createPrintDocumentAdapter("page"), at, out, new android.print.PdfPrinter.Done() {
                                            @Override public void on(String e) { err[0] = e; done.countDown(); }
                                        });
                                    } catch (Throwable t) { err[0] = String.valueOf(t); done.countDown(); }
                                }
                            }, 700);
                        }
                    });
                    w.loadUrl("file://" + html.getAbsolutePath());
                } catch (Throwable t) { err[0] = String.valueOf(t); done.countDown(); }
            }
        });
        boolean ok = done.await(120, TimeUnit.SECONDS);
        Util.ui(new Runnable() { @Override public void run() { if (hold[0] != null) { try { a.root.removeView(hold[0]); hold[0].destroy(); } catch (Throwable t) { /* ignore */ } } } });
        if (!ok) throw new Exception("列印引擎逾時");
        if (err[0] != null) throw new Exception(err[0]);
    }

    private static final class Job {
        final MainActivity a;
        final File html, out;
        final JSONObject opts;
        final CountDownLatch done;
        final Throwable[] err;
        WebView w;
        int pxW;
        float density;
        boolean finished = false;

        Job(MainActivity a, File html, File out, JSONObject opts, CountDownLatch done, Throwable[] err) {
            this.a = a; this.html = html; this.out = out; this.opts = opts == null ? new JSONObject() : opts; this.done = done; this.err = err;
        }

        void start() {
            density = a.getResources().getDisplayMetrics().density;
            int cssW = opts.optInt("pdfWidth", 820);
            pxW = Math.round(cssW * density);
            w = new WebView(a);
            WebSettings s = w.getSettings();
            s.setJavaScriptEnabled(true);
            s.setAllowFileAccess(true);
            s.setUseWideViewPort(false);
            s.setLoadWithOverviewMode(false);
            s.setTextZoom(100);
            s.setBlockNetworkLoads(!opts.optBoolean("pdfNetwork", true));
            w.setBackgroundColor(Color.WHITE);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(pxW, a.root.getHeight() > 0 ? a.root.getHeight() : 2000);
            w.setTranslationX(-pxW - 400);
            a.root.addView(w, 0, lp);
            w.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView v, String u) {
                    if (finished) return;
                    finished = true;
                    Util.MAIN.postDelayed(new Runnable() { @Override public void run() { measure(); } }, 900);
                }
            });
            w.loadUrl("file://" + html.getAbsolutePath());
            Util.MAIN.postDelayed(new Runnable() { @Override public void run() { if (!finished) { finished = true; measure(); } } }, 25000);
        }

        void measure() {
            w.evaluateJavascript("(function(){var d=document.documentElement,b=document.body;return Math.max(d.scrollHeight,b?b.scrollHeight:0,d.offsetHeight)})()", new ValueCallback<String>() {
                @Override public void onReceiveValue(String v) {
                    float cssH = 2000;
                    try { cssH = Float.parseFloat(v.replace("\"", "")); } catch (Throwable t) { /* ignore */ }
                    final int hPx = Math.max(100, Math.min(Math.round(cssH * density), 120000));
                    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) w.getLayoutParams();
                    lp.height = hPx;
                    w.setLayoutParams(lp);
                    w.measure(View.MeasureSpec.makeMeasureSpec(pxW, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(hPx, View.MeasureSpec.EXACTLY));
                    w.layout(0, 0, pxW, hPx);
                    Util.MAIN.postDelayed(new Runnable() { @Override public void run() { draw(hPx); } }, 600);
                }
            });
        }

        void draw(int hPx) {
            try {
                String paper = opts.optString("paper", "a4");
                boolean land = opts.optBoolean("landscape", false);
                float pw = paper.equals("letter") ? 612 : paper.equals("a3") ? 842 : 595;
                float ph = paper.equals("letter") ? 792 : paper.equals("a3") ? 1191 : 842;
                if (land) { float t = pw; pw = ph; ph = t; }
                float m = opts.optInt("margin", 10) * 2.835f;
                float cw = pw - 2 * m, ch = ph - 2 * m;
                float scale = cw / pxW;
                float pagePx = ch / scale;
                int pages = Math.max(1, (int) Math.ceil(hPx / pagePx));
                if (pages > 400) pages = 400;
                PdfDocument doc = new PdfDocument();
                for (int i = 0; i < pages; i++) {
                    PdfDocument.Page p = doc.startPage(new PdfDocument.PageInfo.Builder(Math.round(pw), Math.round(ph), i + 1).create());
                    Canvas c = p.getCanvas();
                    c.save();
                    c.translate(m, m);
                    c.clipRect(0, 0, cw, ch);
                    c.scale(scale, scale);
                    c.translate(0, -i * pagePx);
                    w.draw(c);
                    c.restore();
                    doc.finishPage(p);
                }
                FileOutputStream os = new FileOutputStream(out);
                doc.writeTo(os);
                os.close();
                doc.close();
            } catch (Throwable t) {
                err[0] = t;
            } finally {
                try { a.root.removeView(w); w.destroy(); } catch (Throwable t) { /* ignore */ }
                done.countDown();
            }
        }
    }

    /* ---------- 系統列印（可另存成文字可選取的 PDF） ---------- */
    private static WebView printView;

    static void systemPrint(final MainActivity a, File html, final String jobName) {
        final WebView w = new WebView(a);
        w.getSettings().setAllowFileAccess(true);
        printView = w;
        w.setWebViewClient(new WebViewClient() {
            boolean once = false;
            @Override public void onPageFinished(WebView v, String u) {
                if (once) return;
                once = true;
                PrintManager pm = (PrintManager) a.getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter ad = v.createPrintDocumentAdapter(jobName);
                pm.print(jobName, ad, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            }
        });
        w.loadUrl("file://" + html.getAbsolutePath());
    }
}
