package com.ian.websaver;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** HLS（m3u8）下載：解析主清單選畫質、下載片段（支援 AES-128 加密、fMP4、分離音軌）。 */
final class Hls {
    private Hls() { }

    static final class Variant {
        int w, h;
        long bw;
        String url, audio, name;
    }

    static final class Plan {
        String video;     // 影像（或含音訊）的 media playlist
        String audio;     // 分離的音訊 media playlist（可為 null）
        Variant chosen;
        List<Variant> variants = new ArrayList<>();
    }

    interface Prog { void on(int done, int total); }

    private static final Pattern ATTR = Pattern.compile("([A-Z0-9-]+)=(\"[^\"]*\"|[^,]*)");

    static Map<String, String> attrs(String line) {
        Map<String, String> m = new HashMap<>();
        int c = line.indexOf(':');
        Matcher x = ATTR.matcher(c >= 0 ? line.substring(c + 1) : line);
        while (x.find()) { String v = x.group(2); if (v.startsWith("\"")) v = v.substring(1, v.length() - 1); m.put(x.group(1), v); }
        return m;
    }

    static String res(String base, String rel) {
        try { return new URL(new URL(base), rel.trim()).toString(); } catch (Throwable t) { return rel; }
    }

    static Plan plan(String url, String ref, String pref) throws Exception {
        String txt = Fetcher.text(url, ref);
        Plan p = new Plan();
        if (!txt.contains("#EXT-X-STREAM-INF")) { p.video = url; return p; }
        String[] lines = txt.split("\\r?\\n");
        Map<String, String> audioGroups = new HashMap<>();
        for (int i = 0; i < lines.length; i++) {
            String l = lines[i].trim();
            if (l.startsWith("#EXT-X-MEDIA:")) {
                Map<String, String> a = attrs(l);
                if ("AUDIO".equals(a.get("TYPE")) && a.get("URI") != null) {
                    String g = a.get("GROUP-ID");
                    if (!audioGroups.containsKey(g) || "YES".equals(a.get("DEFAULT"))) audioGroups.put(g, res(url, a.get("URI")));
                }
            } else if (l.startsWith("#EXT-X-STREAM-INF:")) {
                Map<String, String> a = attrs(l);
                String next = null;
                for (int j = i + 1; j < lines.length; j++) { String n = lines[j].trim(); if (!n.isEmpty() && !n.startsWith("#")) { next = n; i = j; break; } }
                if (next == null) continue;
                Variant v = new Variant();
                v.url = res(url, next);
                try { v.bw = Long.parseLong(a.containsKey("AVERAGE-BANDWIDTH") ? a.get("AVERAGE-BANDWIDTH") : a.get("BANDWIDTH")); } catch (Throwable t) { /* ignore */ }
                String r = a.get("RESOLUTION");
                if (r != null && r.contains("x")) { try { v.w = Integer.parseInt(r.split("x")[0]); v.h = Integer.parseInt(r.split("x")[1]); } catch (Throwable t) { /* ignore */ } }
                v.audio = a.get("AUDIO");
                v.name = (v.h > 0 ? v.h + "p" : "") + (v.bw > 0 ? (v.h > 0 ? "・" : "") + Math.round(v.bw / 1000.0) + " kbps" : "");
                p.variants.add(v);
            }
        }
        if (p.variants.isEmpty()) { p.video = url; return p; }
        java.util.Collections.sort(p.variants, new java.util.Comparator<Variant>() {
            @Override public int compare(Variant x, Variant y) { return x.h != y.h ? y.h - x.h : Long.compare(y.bw, x.bw); }
        });
        Variant pick = p.variants.get(0);
        if (pref != null && pref.startsWith("http")) {
            for (Variant v : p.variants) if (v.url.equals(pref)) pick = v;
        } else if ("min".equals(pref)) pick = p.variants.get(p.variants.size() - 1);
        else if (pref != null && pref.matches("\\d+")) {
            int target = Integer.parseInt(pref);
            for (Variant v : p.variants) { if (v.h <= target) { pick = v; break; } pick = v; }
        }
        p.chosen = pick;
        p.video = pick.url;
        if (pick.audio != null) p.audio = audioGroups.get(pick.audio);
        return p;
    }

    static JSONObject info(String url, String ref) throws Exception {
        Plan p = plan(url, ref, "max");
        JSONArray a = new JSONArray();
        for (Variant v : p.variants) a.put(new JSONObject().put("url", v.url).put("w", v.w).put("h", v.h).put("bw", v.bw).put("name", v.name));
        return new JSONObject().put("url", url).put("variants", a);
    }

    /** 下載一個 media playlist，片段依序串接到 out。回傳 true 表示 fMP4。 */
    static boolean download(String plUrl, String ref, File out, Prog prog, final boolean[] cancel) throws Exception {
        String txt = Fetcher.text(plUrl, ref);
        if (txt.contains("#EXT-X-STREAM-INF")) {
            Plan p = plan(plUrl, ref, "max");
            return download(p.video, ref, out, prog, cancel);
        }
        String[] lines = txt.split("\\r?\\n");
        long seq = 0;
        final List<String[]> segs = new ArrayList<>(); // url, keyUri, iv, byteOff, byteLen
        String keyUri = null, iv = null, init = null, initRange = null;
        String nextRange = null;
        long lastRangeEnd = 0;
        boolean fmp4 = false;
        for (String raw : lines) {
            String l = raw.trim();
            if (l.isEmpty()) continue;
            if (l.startsWith("#EXT-X-MEDIA-SEQUENCE:")) { try { seq = Long.parseLong(l.substring(22).trim()); } catch (Throwable t) { /* ignore */ } }
            else if (l.startsWith("#EXT-X-KEY:")) {
                Map<String, String> a = attrs(l);
                String m = a.get("METHOD");
                if ("NONE".equals(m)) { keyUri = null; iv = null; }
                else if ("AES-128".equals(m)) { keyUri = res(plUrl, a.get("URI")); iv = a.get("IV"); }
                else throw new Exception("這個影片使用 DRM 加密（" + m + "），無法下載");
            } else if (l.startsWith("#EXT-X-MAP:")) {
                Map<String, String> a = attrs(l);
                init = res(plUrl, a.get("URI"));
                initRange = a.get("BYTERANGE");
                fmp4 = true;
            } else if (l.startsWith("#EXT-X-BYTERANGE:")) nextRange = l.substring(17).trim();
            else if (!l.startsWith("#")) {
                String u = res(plUrl, l);
                String off = "", len = "";
                if (nextRange != null) {
                    String[] r = nextRange.split("@");
                    long ln = Long.parseLong(r[0]);
                    long of = r.length > 1 ? Long.parseLong(r[1]) : lastRangeEnd;
                    lastRangeEnd = of + ln;
                    off = String.valueOf(of);
                    len = String.valueOf(ln);
                    nextRange = null;
                }
                String ivx = iv != null ? iv : (keyUri != null ? "seq:" + (seq + segs.size()) : null);
                segs.add(new String[] {u, keyUri, ivx, off, len});
                if (u.toLowerCase().contains(".m4s") || u.toLowerCase().contains(".mp4")) fmp4 = true;
            }
        }
        if (segs.isEmpty()) throw new Exception("播放清單裡沒有影片片段");
        final Map<String, byte[]> keys = new HashMap<>();
        final String referer = ref;
        OutputStream os = new FileOutputStream(out);
        ExecutorService ex = Executors.newFixedThreadPool(4);
        try {
            if (init != null) {
                byte[] ib;
                if (initRange != null) { String[] r = initRange.split("@"); ib = Fetcher.getRange(init, ref, r.length > 1 ? Long.parseLong(r[1]) : 0, Long.parseLong(r[0])); }
                else ib = Fetcher.get(init, ref, "*/*", 50L << 20).bytes;
                os.write(ib);
            }
            int total = segs.size(), batch = 6;
            for (int i = 0; i < total; i += batch) {
                if (cancel[0]) throw new Exception("已取消");
                List<Future<byte[]>> fs = new ArrayList<>();
                for (int j = i; j < Math.min(total, i + batch); j++) {
                    final String[] s = segs.get(j);
                    fs.add(ex.submit(new java.util.concurrent.Callable<byte[]>() {
                        @Override public byte[] call() throws Exception {
                            byte[] b = null;
                            Exception last = null;
                            for (int t = 0; t < 3 && b == null; t++) {
                                try { b = s[3].isEmpty() ? Fetcher.get(s[0], referer, "*/*", 200L << 20).bytes : Fetcher.getRange(s[0], referer, Long.parseLong(s[3]), Long.parseLong(s[4])); }
                                catch (Exception e) { last = e; Thread.sleep(500); }
                            }
                            if (b == null) throw last;
                            if (s[1] != null) {
                                byte[] key;
                                synchronized (keys) {
                                    key = keys.get(s[1]);
                                    if (key == null) { key = Fetcher.get(s[1], referer, "*/*", 1024).bytes; keys.put(s[1], key); }
                                }
                                byte[] ivb = new byte[16];
                                if (s[2].startsWith("seq:")) {
                                    long n = Long.parseLong(s[2].substring(4));
                                    for (int k = 15; k >= 8; k--) { ivb[k] = (byte) (n & 0xff); n >>= 8; }
                                } else {
                                    String hex = s[2].replaceFirst("(?i)^0x", "");
                                    while (hex.length() < 32) hex = "0" + hex;
                                    for (int k = 0; k < 16; k++) ivb[k] = (byte) Integer.parseInt(hex.substring(k * 2, k * 2 + 2), 16);
                                }
                                Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
                                c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(ivb));
                                b = c.doFinal(b);
                            }
                            return b;
                        }
                    }));
                }
                for (Future<byte[]> f : fs) os.write(f.get());
                if (prog != null) prog.on(Math.min(total, i + batch), total);
            }
        } finally {
            ex.shutdownNow();
            os.close();
        }
        return fmp4;
    }
}
