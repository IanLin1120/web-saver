package com.ian.websaver;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Wi-Fi 傳到電腦：手機開一個只在區網內、需要通行碼的小型網頁伺服器，電腦用瀏覽器打開就能下載原始檔案。 */
final class WifiServer {
    private WifiServer() { }

    private static ServerSocket ss;
    private static String key = "";
    private static int port = 0;
    private static Context ctx;

    static synchronized String start(Context c) throws Exception {
        ctx = c.getApplicationContext();
        if (ss == null || ss.isClosed()) {
            byte[] r = new byte[4];
            new SecureRandom().nextBytes(r);
            key = String.format("%08x", java.nio.ByteBuffer.wrap(r).getInt()).substring(0, 6);
            ServerSocket s = null;
            for (int p = 8848; p < 8870 && s == null; p++) { try { s = new ServerSocket(p); port = p; } catch (Throwable t) { /* 試下一個 */ } }
            if (s == null) throw new Exception("找不到可用的連接埠");
            ss = s;
            final ServerSocket srv = s;
            new Thread(new Runnable() {
                @Override public void run() {
                    while (!srv.isClosed()) {
                        try {
                            final Socket so = srv.accept();
                            Util.IO.execute(new Runnable() { @Override public void run() { handle(so); } });
                        } catch (Throwable t) { /* closed */ }
                    }
                }
            }, "ws-wifi").start();
        }
        org.json.JSONArray nets = nets();
        if (nets.length() == 0) throw new Exception("手機目前沒有可以分享的網路：請連上 Wi-Fi，或打開手機的「個人熱點」讓對方連進來");
        String ip = nets.getJSONObject(0).getString("ip");
        for (int i = 0; i < nets.length(); i++) { JSONObject o = nets.getJSONObject(i); o.put("url", "http://" + o.getString("ip") + ":" + port + "/?k=" + key); }
        return new JSONObject().put("url", "http://" + ip + ":" + port + "/?k=" + key).put("ip", ip).put("port", port).put("key", key).put("nets", nets).toString();
    }

    static synchronized void stop() {
        try { if (ss != null) ss.close(); } catch (Throwable t) { /* ignore */ }
        ss = null;
    }

    static boolean running() { return ss != null && !ss.isClosed(); }

    /** 手機目前所有可以讓別的裝置連進來的區域網路位址：Wi-Fi、個人熱點、USB 網路共用、有線、藍牙（不含行動網路） */
    static org.json.JSONArray nets() {
        org.json.JSONArray out = new org.json.JSONArray(), hot = new org.json.JSONArray();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName().toLowerCase();
                if (n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("dummy") || n.startsWith("tun") || n.startsWith("ppp") || n.startsWith("v4-") || n.startsWith("clat") || n.startsWith("pdp")) continue;
                String kind = n.equals("wlan0") ? "wifi" : (n.startsWith("ap") || n.startsWith("swlan") || n.startsWith("softap") || n.startsWith("wlan") || n.startsWith("wigig")) ? "hotspot"
                    : (n.startsWith("rndis") || n.startsWith("usb") || n.startsWith("ncm")) ? "usb" : n.startsWith("eth") ? "eth" : n.startsWith("bt") ? "bt" : n.startsWith("p2p") ? "p2p" : null;
                if (kind == null) continue;
                for (InetAddress ad : Collections.list(ni.getInetAddresses())) {
                    if (!(ad instanceof Inet4Address) || ad.isLinkLocalAddress()) continue;
                    JSONObject o = new JSONObject().put("ip", ad.getHostAddress()).put("kind", kind).put("ifn", n);
                    if (kind.equals("wifi")) out.put(o); else hot.put(o);
                }
            }
            for (int i = 0; i < hot.length(); i++) out.put(hot.get(i));
            if (out.length() == 0) { String ip = ip(); if (ip != null) out.put(new JSONObject().put("ip", ip).put("kind", "wifi").put("ifn", "")); }
        } catch (Throwable t) { /* ignore */ }
        return out;
    }

    static String ip() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName().toLowerCase();
                for (InetAddress ad : Collections.list(ni.getInetAddresses())) {
                    if (ad instanceof Inet4Address && ad.isSiteLocalAddress() && (n.startsWith("wlan") || n.startsWith("ap") || n.startsWith("eth") || n.startsWith("swlan"))) return ad.getHostAddress();
                }
            }
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces()))
                for (InetAddress ad : Collections.list(ni.getInetAddresses()))
                    if (ad instanceof Inet4Address && ad.isSiteLocalAddress()) return ad.getHostAddress();
        } catch (Throwable t) { /* ignore */ }
        return null;
    }

    private static String esc(String s) { return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }

    private static String size(long b) {
        if (b < 1024) return b + " B";
        if (b < 1 << 20) return String.format("%.1f KB", b / 1024.0);
        if (b < 1 << 30) return String.format("%.1f MB", b / 1048576.0);
        return String.format("%.2f GB", b / 1073741824.0);
    }

    private static void handle(Socket so) {
        try {
            so.setSoTimeout(30000);
            BufferedReader in = new BufferedReader(new InputStreamReader(so.getInputStream(), StandardCharsets.UTF_8));
            String req = in.readLine();
            if (req == null) { so.close(); return; }
            String line;
            while ((line = in.readLine()) != null && !line.isEmpty()) { /* 略過標頭 */ }
            String[] p = req.split(" ");
            String path = p.length > 1 ? p[1] : "/";
            String q = "";
            int qi = path.indexOf('?');
            if (qi >= 0) { q = path.substring(qi + 1); path = path.substring(0, qi); }
            String k = "";
            for (String kv : q.split("&")) if (kv.startsWith("k=")) k = URLDecoder.decode(kv.substring(2), "UTF-8");
            OutputStream os = so.getOutputStream();
            if (!key.equals(k)) {
                send(os, 403, "text/html; charset=utf-8", "<meta charset=utf-8><h2>需要通行碼</h2><p>請輸入手機 App 上顯示的完整網址。</p>".getBytes(StandardCharsets.UTF_8), null);
                so.close();
                return;
            }
            Lib lib = Lib.get(ctx);
            if (path.equals("/") || path.equals("/index.html")) {
                JSONArray items = new JSONArray(lib.listJson());
                StringBuilder sb = new StringBuilder();
                sb.append("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>網頁擷取・Wi-Fi 傳輸</title>")
                  .append("<style>body{margin:0;font:15px/1.5 -apple-system,'Microsoft JhengHei','Noto Sans TC',sans-serif;background:#efe5d3;color:#3a2e22}")
                  .append(".w{max-width:900px;margin:0 auto;padding:24px}h1{color:#a2613a;margin:0 0 4px}.s{color:#7d6c57;font-size:13px}")
                  .append(".r{display:flex;align-items:center;gap:12px;background:#f9f3e5;border:1px solid #d8c5a3;border-radius:14px;padding:10px 14px;margin:8px 0}")
                  .append(".r b{flex:1;word-break:break-all}.t{font-size:11px;background:#a2613a;color:#fff;border-radius:99px;padding:1px 8px}a.b{background:#a2613a;color:#fff;text-decoration:none;padding:7px 14px;border-radius:99px;font-weight:700;white-space:nowrap}")
                  .append("a.all{display:inline-block;margin:14px 0;background:#6f7d4c}</style><div class=w><h1>📁 網頁擷取・檔案庫</h1><div class=s>")
                  .append(items.length()).append(" 個檔案・按「下載」取得原始檔案（格式與大小不變）</div><a class='b all' href='/all.zip?k=").append(key).append("'>⬇ 全部打包下載（ZIP）</a>");
                for (int i = items.length() - 1; i >= 0; i--) {
                    JSONObject o = items.getJSONObject(i);
                    sb.append("<div class=r><span class=t>").append(esc(o.optString("cat"))).append("</span><b>").append(esc(o.optString("name"))).append("<div class=s>")
                      .append(size(o.optLong("size"))).append("・").append(new java.text.SimpleDateFormat("yyyy/MM/dd HH:mm").format(new java.util.Date(o.optLong("time"))))
                      .append("</div></b><a class=b href='/d/").append(o.optString("id")).append("/").append(URLEncoder.encode(o.optString("name"), "UTF-8").replace("+", "%20")).append("?k=").append(key).append("'>下載</a></div>");
                }
                sb.append("</div>");
                send(os, 200, "text/html; charset=utf-8", sb.toString().getBytes(StandardCharsets.UTF_8), null);
            } else if (path.startsWith("/d/")) {
                String id = path.substring(3).split("/")[0];
                JSONObject o = lib.find(id);
                File f = o == null ? null : lib.fileOf(o);
                if (f == null || !f.exists()) { send(os, 404, "text/plain", "not found".getBytes(), null); }
                else {
                    String cd = "attachment; filename*=UTF-8''" + URLEncoder.encode(o.optString("name"), "UTF-8").replace("+", "%20");
                    String h = "HTTP/1.1 200 OK\r\nContent-Type: " + o.optString("mime", "application/octet-stream") + "\r\nContent-Length: " + f.length() + "\r\nContent-Disposition: " + cd + "\r\nConnection: close\r\n\r\n";
                    os.write(h.getBytes(StandardCharsets.UTF_8));
                    FileInputStream fi = new FileInputStream(f);
                    byte[] buf = new byte[131072];
                    int n;
                    while ((n = fi.read(buf)) > 0) os.write(buf, 0, n);
                    fi.close();
                }
            } else if (path.equals("/all.zip")) {
                String h = "HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nContent-Disposition: attachment; filename*=UTF-8''%E7%B6%B2%E9%A0%81%E6%93%B7%E5%8F%96.zip\r\nConnection: close\r\n\r\n";
                os.write(h.getBytes(StandardCharsets.UTF_8));
                ZipOutputStream z = new ZipOutputStream(os);
                z.setLevel(java.util.zip.Deflater.BEST_SPEED);
                JSONArray items = new JSONArray(lib.listJson());
                java.util.HashSet<String> used = new java.util.HashSet<>();
                byte[] buf = new byte[131072];
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.getJSONObject(i);
                    File f = lib.fileOf(o);
                    if (!f.exists()) continue;
                    String nm = o.optString("cat") + "/" + o.optString("name");
                    while (!used.add(nm)) nm = o.optString("cat") + "/" + o.optString("id") + "_" + o.optString("name");
                    z.putNextEntry(new ZipEntry(nm));
                    FileInputStream fi = new FileInputStream(f);
                    int n;
                    while ((n = fi.read(buf)) > 0) z.write(buf, 0, n);
                    fi.close();
                    z.closeEntry();
                }
                z.finish();
            } else send(os, 404, "text/plain", "not found".getBytes(), null);
            os.flush();
            so.close();
        } catch (Throwable t) {
            try { so.close(); } catch (Throwable x) { /* ignore */ }
        }
    }

    private static void send(OutputStream os, int code, String type, byte[] body, String extra) throws Exception {
        String h = "HTTP/1.1 " + code + (code == 200 ? " OK" : code == 403 ? " Forbidden" : " Not Found") + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n" + (extra == null ? "" : extra) + "\r\n";
        os.write(h.getBytes(StandardCharsets.UTF_8));
        os.write(body);
    }
}
