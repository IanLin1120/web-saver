package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/** 用系統列印引擎（Chromium 的列印排版）直接把 WebView 存成 PDF：向量文字、可選取、依頁面正確分頁。
 *  放在 android.print 套件裡才能建立列印回呼（建構子是套件私有）。 */
public final class PdfPrinter {
    public interface Done { void on(String err); }

    private PdfPrinter() { }

    public static void write(final PrintDocumentAdapter ad, PrintAttributes attrs, final File out, final Done done) {
        try {
            ad.onStart();
            ad.onLayout(null, attrs, null, new PrintDocumentAdapter.LayoutResultCallback() {
                @Override public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                    try {
                        final ParcelFileDescriptor pfd = ParcelFileDescriptor.open(out,
                            ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE | ParcelFileDescriptor.MODE_READ_WRITE);
                        ad.onWrite(new PageRange[] {PageRange.ALL_PAGES}, pfd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
                            @Override public void onWriteFinished(PageRange[] pages) { close(pfd); try { ad.onFinish(); } catch (Throwable t) { /* ignore */ } done.on(null); }
                            @Override public void onWriteFailed(CharSequence e) { close(pfd); done.on("寫入失敗：" + e); }
                            @Override public void onWriteCancelled() { close(pfd); done.on("已取消"); }
                        });
                    } catch (Throwable t) { done.on(String.valueOf(t)); }
                }
                @Override public void onLayoutFailed(CharSequence e) { done.on("排版失敗：" + e); }
                @Override public void onLayoutCancelled() { done.on("已取消"); }
            }, null);
        } catch (Throwable t) { done.on(String.valueOf(t)); }
    }

    private static void close(ParcelFileDescriptor p) { try { p.close(); } catch (Throwable t) { /* ignore */ } }
}
