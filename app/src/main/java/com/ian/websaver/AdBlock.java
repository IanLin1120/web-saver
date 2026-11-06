package com.ian.websaver;

import android.content.Context;

import org.json.JSONArray;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/** 以網域比對的廣告阻擋（內建清單＋使用者自訂）。 */
final class AdBlock {
    private AdBlock() { }

    private static volatile Set<String> hosts = new HashSet<>();
    private static volatile Set<String> allow = new HashSet<>();
    static volatile String css = "";
    static volatile String hostsJson = "[]";
    static final AtomicInteger blockedPage = new AtomicInteger();
    static final AtomicInteger blockedTotal = new AtomicInteger();

    static void init(Context c, String extraHosts, String extraCss, String whitelist) {
        Set<String> h = new HashSet<>();
        JSONArray ja = new JSONArray();
        String all = Util.asset(c, "adhosts.txt") + "\n" + (extraHosts == null ? "" : extraHosts);
        for (String line : all.split("[\\r\\n,]+")) {
            String s = line.trim().toLowerCase();
            if (s.isEmpty() || s.startsWith("#") || s.contains("/") || s.contains(" ")) continue;
            if (s.startsWith("*.")) s = s.substring(2);
            if (s.startsWith("||")) s = s.substring(2).replace("^", "");
            if (h.add(s)) ja.put(s);
        }
        hosts = h;
        hostsJson = ja.toString();
        StringBuilder sb = new StringBuilder();
        String all2 = Util.asset(c, "adcss.txt") + "\n" + (extraCss == null ? "" : extraCss);
        for (String line : all2.split("[\\r\\n]+")) {
            String s = line.trim();
            if (s.isEmpty() || s.startsWith("#") || s.contains("{") || s.contains("}")) continue;
            if (sb.length() > 0) sb.append(',');
            sb.append(s);
        }
        css = sb.toString();
        Set<String> w = new HashSet<>();
        if (whitelist != null) for (String line : whitelist.split("[\\r\\n,\\s]+")) { String s = line.trim().toLowerCase(); if (!s.isEmpty()) w.add(s); }
        allow = w;
    }

    static boolean match(String host) {
        if (host == null || host.isEmpty()) return false;
        String h = host.toLowerCase();
        Set<String> set = hosts;
        while (true) {
            if (set.contains(h)) return true;
            int dot = h.indexOf('.');
            if (dot < 0 || dot == h.length() - 1) return false;
            h = h.substring(dot + 1);
        }
    }

    static boolean allowed(String pageHost) {
        if (pageHost == null) return false;
        String h = pageHost.toLowerCase();
        Set<String> set = allow;
        while (true) {
            if (set.contains(h)) return true;
            int dot = h.indexOf('.');
            if (dot < 0) return false;
            h = h.substring(dot + 1);
        }
    }

    static int count() { return hosts.size(); }
}
