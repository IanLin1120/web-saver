package com.ian.websaver;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class Util {
    private Util() { }

    static final Handler MAIN = new Handler(Looper.getMainLooper());
    static final ExecutorService IO = Executors.newFixedThreadPool(6);
    static final ExecutorService BG = Executors.newSingleThreadExecutor();

    static void ui(Runnable r) { MAIN.post(r); }

    static int dp(Context c, float v) { return (int) (v * c.getResources().getDisplayMetrics().density + 0.5f); }

    static byte[] readAllBytes(InputStream in, long max) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        long total = 0;
        while ((n = in.read(buf)) > 0) {
            o.write(buf, 0, n);
            total += n;
            if (max > 0 && total > max) throw new Exception("檔案太大");
        }
        in.close();
        return o.toByteArray();
    }

    static String readText(InputStream in) throws Exception {
        return new String(readAllBytes(in, 0), StandardCharsets.UTF_8);
    }

    static String asset(Context c, String name) {
        try { return readText(c.getAssets().open(name)); } catch (Throwable t) { return ""; }
    }

    static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[131072];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        out.close();
    }

    static void copyFile(File a, File b) throws Exception { copy(new FileInputStream(a), new FileOutputStream(b)); }

    static void writeText(File f, String s) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        FileOutputStream o = new FileOutputStream(tmp);
        o.write(s.getBytes(StandardCharsets.UTF_8));
        o.getFD().sync();
        o.close();
        if (!tmp.renameTo(f)) { copyFile(tmp, f); tmp.delete(); }
    }

    static String safeName(String name) {
        String s = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001f]", "_").trim();
        if (s.length() > 120) {
            int dot = s.lastIndexOf('.');
            String ext = dot > 0 && s.length() - dot <= 6 ? s.substring(dot) : "";
            s = s.substring(0, 120 - ext.length()) + ext;
        }
        return s.isEmpty() ? "未命名" : s;
    }

    /** 下載檔名：照網站給的原本名稱，中文不會變成 %E4%BA%92… 這種亂碼。
        依序看：Content-Disposition 的 filename*（RFC 5987，UTF-8 編碼）→ filename → 網址裡的檔名參數 → 網址最後一段；
        有 %XX 的一律解碼；被當成 Latin-1 讀錯的 UTF-8（例如「äº’è©•」）也會還原；沒有副檔名就依檔案類型補上 */
    static String dlName(String url, String cd, String mime) {
        String n = null;
        if (cd != null) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?i)filename\\*\\s*=\\s*([^';]*)'[^']*'([^;]+)").matcher(cd);
            if (m.find()) {
                String cs = m.group(1).trim();
                try { n = java.net.URLDecoder.decode(m.group(2).trim().replace("+", "%2B").replaceAll("^\"|\"$", ""), cs.isEmpty() ? "UTF-8" : cs); } catch (Throwable t) { n = null; }
            }
            if (n == null || n.isEmpty()) {
                m = java.util.regex.Pattern.compile("(?i)(?:^|;)\\s*filename\\s*=\\s*(\"((?:[^\"\\\\]|\\\\.)*)\"|[^;]+)").matcher(cd);
                if (m.find()) n = m.group(2) != null ? m.group(2).replace("\\\"", "\"") : m.group(1).trim();
            }
        }
        if (n == null || n.trim().isEmpty()) {
            try {
                android.net.Uri u = android.net.Uri.parse(url);
                for (String k : new String[]{"filename", "fileName", "file_name", "name", "fn", "attname", "title"}) {
                    String v = u.getQueryParameter(k);
                    if (v != null && v.matches("(?s).+\\.[A-Za-z0-9]{1,6}")) { n = v; break; }
                }
                if (n == null) n = u.getLastPathSegment();
            } catch (Throwable t) { n = null; }
        }
        if (n == null) n = "";
        n = fixEnc(n.trim());
        if (n.isEmpty() || !n.matches("(?s).*[^._\\s].*")) n = android.webkit.URLUtil.guessFileName(url, null, mime);
        n = fixEnc(n);
        if (extOf(n).isEmpty() || extOf(n).length() > 6) {
            String e = extOfMime(mime);
            if (e != null && !e.isEmpty() && !"bin".equals(e)) n = n + "." + e;
        }
        return safeName(n);
    }

    /** 檔名裡的 %XX 解碼（可能被編碼兩次）、Latin-1 讀錯的 UTF-8 還原 */
    static String fixEnc(String s) {
        if (s == null) return "";
        for (int i = 0; i < 2 && s.matches("(?s).*%[0-9A-Fa-f]{2}.*"); i++) {
            try { s = java.net.URLDecoder.decode(s.replace("+", "%2B"), "UTF-8"); } catch (Throwable t) { break; }
        }
        boolean hi = false, wide = false;
        for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); if (c >= 0x80 && c <= 0xff) hi = true; if (c > 0xff) wide = true; }
        if (hi && !wide) {
            try {
                byte[] b = s.getBytes("ISO-8859-1");
                java.nio.charset.CharsetDecoder d = java.nio.charset.StandardCharsets.UTF_8.newDecoder();
                String t = d.decode(java.nio.ByteBuffer.wrap(b)).toString();
                if (!t.isEmpty()) s = t;
            } catch (Throwable t) { /* 不是 UTF-8，維持原樣 */ }
        }
        return s.trim();
    }

    static String extOf(String name) {
        int i = name == null ? -1 : name.lastIndexOf('.');
        return i < 0 ? "" : name.substring(i + 1).toLowerCase();
    }

    static String mimeOfExt(String ext) {
        switch (ext == null ? "" : ext.toLowerCase()) {
            case "html": case "htm": return "text/html";
            case "pdf": return "application/pdf";
            case "jpg": case "jpeg": case "jfif": return "image/jpeg";
            case "png": return "image/png";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "avif": return "image/avif";
            case "bmp": return "image/bmp";
            case "svg": return "image/svg+xml";
            case "mp4": case "m4v": return "video/mp4";
            case "webm": return "video/webm";
            case "mov": return "video/quicktime";
            case "mkv": return "video/x-matroska";
            case "ts": return "video/mp2t";
            case "3gp": return "video/3gpp";
            case "mp3": return "audio/mpeg";
            case "m4a": return "audio/mp4";
            case "aac": return "audio/aac";
            case "ogg": case "oga": return "audio/ogg";
            case "opus": return "audio/opus";
            case "wav": return "audio/wav";
            case "flac": return "audio/flac";
            case "zip": return "application/zip";
            case "json": return "application/json";
            case "txt": case "log": case "ini": case "cfg": return "text/plain";
            case "md": return "text/markdown";
            case "csv": return "text/csv";
            case "xml": return "text/xml";
            case "srt": return "application/x-subrip";
            case "vtt": return "text/vtt";
            case "heic": return "image/heic";
            case "heif": return "image/heif";
            case "tif": case "tiff": return "image/tiff";
            case "ico": return "image/x-icon";
            case "avi": return "video/x-msvideo";
            case "wmv": return "video/x-ms-wmv";
            case "flv": return "video/x-flv";
            case "mpg": case "mpeg": return "video/mpeg";
            case "m2ts": case "mts": return "video/mp2t";
            case "wma": return "audio/x-ms-wma";
            case "amr": return "audio/amr";
            case "m4b": return "audio/mp4";
            case "aif": case "aiff": return "audio/aiff";
            case "mid": case "midi": return "audio/midi";
            case "ape": return "audio/ape";
            case "doc": return "application/msword";
            case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "docm": return "application/vnd.ms-word.document.macroEnabled.12";
            case "xls": return "application/vnd.ms-excel";
            case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "xlsm": return "application/vnd.ms-excel.sheet.macroEnabled.12";
            case "xlsb": return "application/vnd.ms-excel.sheet.binary.macroEnabled.12";
            case "ppt": return "application/vnd.ms-powerpoint";
            case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "ppsx": return "application/vnd.openxmlformats-officedocument.presentationml.slideshow";
            case "pptm": return "application/vnd.ms-powerpoint.presentation.macroEnabled.12";
            case "odt": return "application/vnd.oasis.opendocument.text";
            case "ods": return "application/vnd.oasis.opendocument.spreadsheet";
            case "odp": return "application/vnd.oasis.opendocument.presentation";
            case "rtf": return "application/rtf";
            case "epub": return "application/epub+zip";
            case "apk": return "application/vnd.android.package-archive";
            case "rar": return "application/vnd.rar";
            case "7z": return "application/x-7z-compressed";
            case "gz": case "tgz": return "application/gzip";
            case "tar": return "application/x-tar";
            default: return "application/octet-stream";
        }
    }

    static String extOfMime(String mime) {
        if (mime == null) return "";
        String m = mime.toLowerCase();
        int sc = m.indexOf(';');
        if (sc > 0) m = m.substring(0, sc).trim();
        switch (m) {
            case "text/html": return "html";
            case "application/pdf": return "pdf";
            case "image/jpeg": case "image/jpg": return "jpg";
            case "image/png": return "png";
            case "image/gif": return "gif";
            case "image/webp": return "webp";
            case "image/avif": return "avif";
            case "image/svg+xml": return "svg";
            case "image/bmp": return "bmp";
            case "video/mp4": return "mp4";
            case "video/webm": return "webm";
            case "video/quicktime": return "mov";
            case "video/mp2t": return "ts";
            case "audio/mpeg": case "audio/mp3": return "mp3";
            case "audio/mp4": case "audio/x-m4a": return "m4a";
            case "audio/aac": return "aac";
            case "audio/ogg": return "ogg";
            case "audio/wav": case "audio/x-wav": return "wav";
            case "application/zip": return "zip";
            default: return "";
        }
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] ch = f.listFiles();
        if (ch != null) for (File c : ch) deleteTree(c);
        f.delete();
    }

    static long dirSize(File f) {
        if (f == null || !f.exists()) return 0;
        if (f.isFile()) return f.length();
        long s = 0;
        File[] ch = f.listFiles();
        if (ch != null) for (File c : ch) s += dirSize(c);
        return s;
    }
}
