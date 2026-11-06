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
            case "txt": return "text/plain";
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
