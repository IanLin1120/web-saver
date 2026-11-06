package com.ian.websaver;

import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 從 YouTube 自己的播放器「攔截」實際在播的串流網址（做法同影片下載工具的嗅探）。
 * 這些網址已經帶有 YouTube 播放器算好的簽章與驗證權杖，所以下載時不會被 403 拒絕。
 */
final class YtSniff {
    private YtSniff() {}

    /** videoId → (itag → 串流資訊) */
    private static final Map<String, LinkedHashMap<Integer, JSONObject>> STREAMS = new HashMap<>();
    /** videoId → 頁面播放器回報的影片資訊（各畫質的大小、編碼等） */
    private static final Map<String, String> INFO = new HashMap<>();
    static volatile String lastVid = "";

    static String vidOf(String pageUrl) {
        try {
            Uri u = Uri.parse(pageUrl);
            String h = u.getHost();
            if (h == null) return "";
            h = h.toLowerCase();
            if (h.endsWith("youtu.be")) { String p = u.getPath(); return p != null && p.length() >= 12 ? p.substring(1, 12) : ""; }
            if (!Browser.isYt(h)) return "";
            String v = u.getQueryParameter("v");
            if (v != null && v.length() >= 11) return v.substring(0, 11);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("^/(shorts|live|embed)/([\\w-]{11})").matcher(u.getPath() == null ? "" : u.getPath());
            return m.find() ? m.group(2) : "";
        } catch (Throwable t) { return ""; }
    }

    /** 去掉「只抓一小段」的參數，留下可以完整下載的網址 */
    static String clean(String url) {
        Uri u = Uri.parse(url);
        Uri.Builder b = u.buildUpon().clearQuery();
        for (String k : u.getQueryParameterNames()) {
            if (k.equals("range") || k.equals("rn") || k.equals("rbuf") || k.equals("ump") || k.equals("srfvp") || k.equals("pot_ump")) continue;
            String v = u.getQueryParameter(k);
            if (v != null) b.appendQueryParameter(k, v);
        }
        return b.build().toString();
    }

    static void note(Browser br, String url) {
        String vid = vidOf(br.curUrl);
        if (vid.isEmpty()) vid = lastVid;
        noteVid(vid, url);
    }

    static void noteVid(String vid, String url) {
        if (vid == null || vid.isEmpty() || url == null) return;
        try {
            Uri u = Uri.parse(url);
            String it = u.getQueryParameter("itag");
            if (it == null) {
                /* SABR 新串流：網址裡沒有畫質編號，無法直接下載，只記下來讓面板顯示正確原因 */
                if (url.contains("sabr=1")) it = "0"; else return;
            }
            int itag = Integer.parseInt(it);
            JSONObject o = new JSONObject();
            boolean sabr = "1".equals(u.getQueryParameter("sabr"));
            o.put("itag", itag);
            o.put("url", clean(url));
            o.put("mime", u.getQueryParameter("mime") == null ? "" : u.getQueryParameter("mime"));
            o.put("clen", u.getQueryParameter("clen") == null ? "0" : u.getQueryParameter("clen"));
            o.put("dur", u.getQueryParameter("dur") == null ? "0" : u.getQueryParameter("dur"));
            o.put("sabr", sabr);
            o.put("t", System.currentTimeMillis());
            synchronized (STREAMS) {
                LinkedHashMap<Integer, JSONObject> m = STREAMS.get(vid);
                if (m == null) { m = new LinkedHashMap<>(); STREAMS.put(vid, m); }
                JSONObject old = m.get(itag);
                if (old == null || !sabr || old.optBoolean("sabr")) m.put(itag, o);
            }
        } catch (Throwable t) { /* ignore */ }
    }

    static void info(String vid, String json) {
        if (vid == null || vid.isEmpty()) return;
        lastVid = vid;
        synchronized (INFO) { INFO.put(vid, json); }
    }

    static String get(String vid) {
        try {
            JSONObject o = new JSONObject();
            JSONArray a = new JSONArray();
            synchronized (STREAMS) {
                LinkedHashMap<Integer, JSONObject> m = STREAMS.get(vid);
                if (m != null) for (JSONObject x : m.values()) a.put(x);
            }
            o.put("streams", a);
            String inf;
            synchronized (INFO) { inf = INFO.get(vid); }
            if (inf != null) o.put("info", new JSONObject(inf));
            return o.toString();
        } catch (Throwable t) { return "{\"streams\":[]}"; }
    }

    static void forget(String vid) {
        synchronized (STREAMS) { STREAMS.remove(vid); }
    }
}
