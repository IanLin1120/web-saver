package com.ian.websaver;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Iterator;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** 網站帳號密碼：用 Android Keystore 的 AES-GCM 金鑰加密後存在 App 私有空間。 */
final class Creds {
    private static Creds inst;
    private final SharedPreferences sp;
    private JSONObject data;   // {host: {user: "iv:cipher"}}
    private JSONObject never;

    static synchronized Creds get(Context c) {
        if (inst == null) inst = new Creds(c.getApplicationContext());
        return inst;
    }

    private Creds(Context c) {
        sp = c.getSharedPreferences("ws_creds", Context.MODE_PRIVATE);
        try { data = new JSONObject(sp.getString("d", "{}")); } catch (Throwable t) { data = new JSONObject(); }
        try { never = new JSONObject(sp.getString("never", "{}")); } catch (Throwable t) { never = new JSONObject(); }
    }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias("ws_cred")) return ((KeyStore.SecretKeyEntry) ks.getEntry("ws_cred", null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder("ws_cred", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return kg.generateKey();
    }

    private String enc(String plain) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
    }

    private String dec(String s) {
        try {
            String[] p = s.split(":");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Throwable t) { return null; }
    }

    private void persist() { sp.edit().putString("d", data.toString()).putString("never", never.toString()).apply(); }

    synchronized JSONArray users(String host) {
        JSONArray a = new JSONArray();
        JSONObject h = data.optJSONObject(host);
        if (h != null) { Iterator<String> it = h.keys(); while (it.hasNext()) a.put(it.next()); }
        return a;
    }

    synchronized boolean has(String host, String user) { JSONObject h = data.optJSONObject(host); return h != null && h.has(user); }

    synchronized boolean same(String host, String user, String pass) {
        JSONObject h = data.optJSONObject(host);
        if (h == null || !h.has(user)) return false;
        String p = dec(h.optString(user));
        return pass.equals(p);
    }

    synchronized String password(String host, String user) {
        JSONObject h = data.optJSONObject(host);
        return h == null || !h.has(user) ? null : dec(h.optString(user));
    }

    synchronized boolean save(String host, String user, String pass) {
        try {
            JSONObject h = data.optJSONObject(host);
            if (h == null) { h = new JSONObject(); data.put(host, h); }
            h.put(user == null ? "" : user, enc(pass));
            never.remove(host);
            persist();
            return true;
        } catch (Throwable t) { return false; }
    }

    synchronized void del(String host, String user) {
        JSONObject h = data.optJSONObject(host);
        if (h == null) return;
        h.remove(user);
        if (h.length() == 0) data.remove(host);
        persist();
    }

    synchronized void setNever(String host, boolean on) {
        try { if (on) never.put(host, true); else never.remove(host); } catch (Throwable t) { /* ignore */ }
        persist();
    }

    synchronized boolean isNever(String host) { return never.optBoolean(host, false); }

    synchronized String listJson() {
        try {
            JSONArray out = new JSONArray();
            Iterator<String> it = data.keys();
            while (it.hasNext()) {
                String host = it.next();
                JSONObject h = data.optJSONObject(host);
                if (h == null) continue;
                Iterator<String> us = h.keys();
                while (us.hasNext()) out.put(new JSONObject().put("host", host).put("user", us.next()));
            }
            JSONArray nv = new JSONArray();
            Iterator<String> ni = never.keys();
            while (ni.hasNext()) nv.put(ni.next());
            return new JSONObject().put("list", out).put("never", nv).toString();
        } catch (Throwable t) { return "{\"list\":[],\"never\":[]}"; }
    }
}
