package com.ian.websaver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.util.Size;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Arrays;

/**
 * App 內的上鎖功能：數字密碼（至少 6 碼，只存加鹽雜湊）＋指紋解鎖。
 * 解鎖一次後，直到 App 被關掉（行程結束）前都不用再輸入。
 * 連續輸入錯誤 3 次：用前鏡頭拍一張照片，存進上鎖的「入侵者照片」資料夾，下次打開 App 時提醒。
 */
final class Lock {
    private Lock() { }

    static volatile boolean session = false;
    /** 最近一次輸入正確密碼／指紋的時間（刪除上鎖的東西要用） */
    static volatile long lastOk = 0;
    static boolean recentlyOk() { return session || System.currentTimeMillis() - lastOk < 120000; }
    static final String INTRUDER_FOLDER = "f_intruder";

    private static SharedPreferences p(Context c) { return c.getSharedPreferences("ws_lock", Context.MODE_PRIVATE); }

    static boolean has(Context c) { return p(c).contains("hash"); }

    private static String hash(String pin, byte[] salt) throws Exception {
        javax.crypto.SecretKeyFactory f = javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1");
        byte[] h = f.generateSecret(new javax.crypto.spec.PBEKeySpec(pin.toCharArray(), salt, 20000, 256)).getEncoded();
        return Base64.encodeToString(h, Base64.NO_WRAP);
    }

    private static boolean verify(Context c, String pin) {
        try {
            SharedPreferences s = p(c);
            byte[] salt = Base64.decode(s.getString("salt", ""), Base64.NO_WRAP);
            String want = s.getString("hash", "");
            String got = hash(pin == null ? "" : pin, salt);
            return java.security.MessageDigest.isEqual(want.getBytes("UTF-8"), got.getBytes("UTF-8"));
        } catch (Throwable t) { return false; }
    }

    /** 設定新密碼；已經有密碼時要先給正確的舊密碼 */
    static String set(Context c, String oldPin, String pin) {
        try {
            if (pin == null || !pin.matches("\\d{6,16}")) return "密碼要 6～16 位數字";
            if (has(c) && waitMs(c) > 0) return "輸錯太多次，請稍後再試";
            if (has(c) && !verify(c, oldPin)) { int f = p(c).getInt("fails", 0) + 1; p(c).edit().putInt("fails", f).putLong("failAt", System.currentTimeMillis()).apply(); return "舊密碼不正確"; }
            byte[] salt = new byte[16];
            new SecureRandom().nextBytes(salt);
            p(c).edit().putString("salt", Base64.encodeToString(salt, Base64.NO_WRAP)).putString("hash", hash(pin, salt)).putInt("fails", 0).putInt("len", pin.length()).apply();
            session = true;
            return "";
        } catch (Throwable t) { return "設定失敗：" + t.getMessage(); }
    }

    /** 密碼長度：輸入到這個長度就自動確認（0＝不知道，要按確定） */
    static int len(Context c) { return p(c).getInt("len", 0); }

    static boolean clear(Context c, String pin) {
        if (waitMs(c) > 0) return false;
        if (!verify(c, pin)) { int f = p(c).getInt("fails", 0) + 1; p(c).edit().putInt("fails", f).putLong("failAt", System.currentTimeMillis()).apply(); return false; }
        p(c).edit().remove("salt").remove("hash").putInt("fails", 0).apply();
        session = false;
        return true;
    }

    /** 檢查密碼；錯誤累計到 3 的倍數時拍照 */
    /** 連續輸錯 5 次起要等一段時間才能再試（30 秒起跳、每多錯一次加倍，最多 1 小時），防止有人一直猜 */
    static long waitMs(Context c) {
        int f = p(c).getInt("fails", 0);
        if (f < 5) return 0;
        long w = Math.min(3600000L, 30000L << Math.min(7, f - 5));
        long left = p(c).getLong("failAt", 0) + w - System.currentTimeMillis();
        return Math.max(0, left);
    }
    static JSONObject check(MainActivity a, String pin) {
        JSONObject o = new JSONObject();
        try {
            long w = waitMs(a);
            if (w > 0) return o.put("ok", false).put("fails", p(a).getInt("fails", 0)).put("wait", w);
            if (verify(a, pin)) {
                session = true;
                lastOk = System.currentTimeMillis();
                p(a).edit().putInt("fails", 0).apply();
                return o.put("ok", true);
            }
            int f = p(a).getInt("fails", 0) + 1;
            p(a).edit().putInt("fails", f).putLong("failAt", System.currentTimeMillis()).apply();
            o.put("ok", false).put("fails", f);
            long w2 = waitMs(a);
            if (w2 > 0) o.put("wait", w2);
            if (f % 3 == 0 && a.prefs.getBoolean("intruderCam", true)) shoot(a);
        } catch (Throwable t) { /* ignore */ }
        return o;
    }

    /* ---------- 指紋／臉部解鎖 ---------- */
    static boolean bioAvailable(Context c) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                android.hardware.biometrics.BiometricManager bm = c.getSystemService(android.hardware.biometrics.BiometricManager.class);
                if (Build.VERSION.SDK_INT >= 30) return bm.canAuthenticate(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG | android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK) == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
                return bm.canAuthenticate() == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
            }
            return Build.VERSION.SDK_INT >= 28 && c.getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        } catch (Throwable t) { return false; }
    }

    static void bio(final MainActivity a, String title) {
        if (Build.VERSION.SDK_INT < 28) { emitBio(false, "這支手機不支援"); return; }
        try {
            android.hardware.biometrics.BiometricPrompt.Builder b = new android.hardware.biometrics.BiometricPrompt.Builder(a)
                .setTitle(title == null || title.isEmpty() ? "解鎖" : title)
                .setSubtitle("使用指紋或臉部解鎖")
                .setNegativeButton("改用密碼", a.getMainExecutor(), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int w) { emitBio(false, "cancel"); }
                });
            if (Build.VERSION.SDK_INT >= 30) b.setAllowedAuthenticators(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG | android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK);
            b.build().authenticate(new CancellationSignal(), a.getMainExecutor(), new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(android.hardware.biometrics.BiometricPrompt.AuthenticationResult r) { session = true; lastOk = System.currentTimeMillis(); p(a).edit().putInt("fails", 0).apply(); emitBio(true, ""); }
                @Override public void onAuthenticationError(int code, CharSequence msg) { emitBio(false, String.valueOf(msg)); }
            });
        } catch (Throwable t) { emitBio(false, String.valueOf(t.getMessage())); }
    }

    private static void emitBio(boolean ok, String msg) {
        try { MainActivity.emit("lockBio", new JSONObject().put("ok", ok).put("msg", msg).toString()); } catch (Throwable t) { /* ignore */ }
    }

    /* ---------- 入侵者照片（前鏡頭） ---------- */
    static int pending(Context c) { return p(c).getInt("intruder", 0); }
    static void seen(Context c) { p(c).edit().putInt("intruder", 0).apply(); }

    static void shoot(final MainActivity a) {
        if (a.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return;
        try {
            final CameraManager cm = (CameraManager) a.getSystemService(Context.CAMERA_SERVICE);
            String front = null;
            for (String id : cm.getCameraIdList()) {
                Integer f = cm.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);
                if (f != null && f == CameraCharacteristics.LENS_FACING_FRONT) { front = id; break; }
            }
            if (front == null) return;
            CameraCharacteristics ch = cm.getCameraCharacteristics(front);
            StreamConfigurationMap map = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Size best = new Size(1280, 960);
            if (map != null) {
                Size[] ss = map.getOutputSizes(ImageFormat.JPEG);
                Arrays.sort(ss, new java.util.Comparator<Size>() { @Override public int compare(Size x, Size y) { return y.getWidth() * y.getHeight() - x.getWidth() * x.getHeight(); } });
                for (Size s : ss) { if (s.getWidth() <= 1920) { best = s; break; } }
            }
            final Integer sensor = ch.get(CameraCharacteristics.SENSOR_ORIENTATION);
            final CameraCharacteristics fch = ch;
            final HandlerThread ht = new HandlerThread("intruder");
            ht.start();
            final Handler hd = new Handler(ht.getLooper());
            final ImageReader ir = ImageReader.newInstance(best.getWidth(), best.getHeight(), ImageFormat.JPEG, 2);
            final long t0 = System.currentTimeMillis();
            final boolean[] done = {false};
            final CameraDevice[] dev = {null};
            final Runnable close = new Runnable() {
                @Override public void run() {
                    try { if (dev[0] != null) dev[0].close(); } catch (Throwable t) { /* ignore */ }
                    try { ir.close(); } catch (Throwable t) { /* ignore */ }
                    ht.quitSafely();
                }
            };
            /* ready[0]：曝光已收斂（有人臉就以人臉為準）、對焦完成，才存照片 */
            final boolean[] ready = {false};
            ir.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                @Override public void onImageAvailable(ImageReader r) {
                    Image img = null;
                    try {
                        img = r.acquireLatestImage();
                        if (img == null || done[0]) return;
                        long dt = System.currentTimeMillis() - t0;
                        /* 最少暖機 0.8 秒；曝光／對焦穩定就存；最晚 4 秒一定存 */
                        if (dt < 800 || (!ready[0] && dt < 4000)) return;
                        done[0] = true;
                        ByteBuffer bb = img.getPlanes()[0].getBuffer();
                        byte[] jpg = new byte[bb.remaining()];
                        bb.get(jpg);
                        save(a, jpg);
                        hd.post(close);
                    } catch (Throwable t) { /* ignore */ }
                    finally { if (img != null) img.close(); }
                }
            }, hd);
            cm.openCamera(front, new CameraDevice.StateCallback() {
                @Override public void onOpened(final CameraDevice cam) {
                    dev[0] = cam;
                    try {
                        cam.createCaptureSession(Arrays.asList(ir.getSurface()), new CameraCaptureSession.StateCallback() {
                            @Override public void onConfigured(final CameraCaptureSession s) {
                                try {
                                    final CaptureRequest.Builder b = cam.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                                    b.addTarget(ir.getSurface());
                                    b.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO);
                                    b.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                                    /* 自動對焦：前鏡頭多半是定焦，只有支援時才開 */
                                    boolean afOk = false;
                                    int[] afm = fch.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
                                    if (afm != null) for (int m : afm) if (m == CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE) afOk = true;
                                    if (afOk) b.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                                    final boolean hasAf = afOk;
                                    if (sensor != null) b.set(CaptureRequest.JPEG_ORIENTATION, sensor);
                                    final android.graphics.Rect ar = fch.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE);
                                    Integer mxAe = fch.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AE), mxAf = fch.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AF);
                                    final boolean aeReg = mxAe != null && mxAe > 0, afReg = mxAf != null && mxAf > 0;
                                    /* 人臉優先曝光：背光時臉才不會整個黑掉 */
                                    try {
                                        int[] scenes = fch.get(CameraCharacteristics.CONTROL_AVAILABLE_SCENE_MODES);
                                        boolean face = false;
                                        if (scenes != null) for (int sm : scenes) if (sm == CaptureRequest.CONTROL_SCENE_MODE_FACE_PRIORITY) face = true;
                                        int[] fd = fch.get(CameraCharacteristics.STATISTICS_INFO_AVAILABLE_FACE_DETECT_MODES);
                                        if (fd != null && fd.length > 1) b.set(CaptureRequest.STATISTICS_FACE_DETECT_MODE, fd[fd.length - 1]);
                                        if (face) { b.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_USE_SCENE_MODE); b.set(CaptureRequest.CONTROL_SCENE_MODE, CaptureRequest.CONTROL_SCENE_MODE_FACE_PRIORITY); }
                                        /* 再整體調亮一點（背光補償） */
                                        android.util.Range<Integer> ev = fch.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);
                                        android.util.Rational step = fch.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP);
                                        if (ev != null && step != null && step.floatValue() > 0) b.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, Math.min(ev.getUpper(), Math.round(1.0f / step.floatValue())));
                                        /* 還沒偵測到臉之前：測光／對焦放在畫面中上（拿手機的人臉通常在這裡） */
                                        if (ar != null) {
                                            android.hardware.camera2.params.MeteringRectangle[] mr = {new android.hardware.camera2.params.MeteringRectangle(ar.width() / 4, ar.height() / 5, ar.width() / 2, ar.height() / 2, 1000)};
                                            if (aeReg) b.set(CaptureRequest.CONTROL_AE_REGIONS, mr);
                                            if (afReg && hasAf) b.set(CaptureRequest.CONTROL_AF_REGIONS, mr);
                                        }
                                    } catch (Throwable t) { /* 不支援就用一般曝光 */ }
                                    final boolean[] faceSet = {false};
                                    final CameraCaptureSession.CaptureCallback cb = new CameraCaptureSession.CaptureCallback() {
                                        @Override public void onCaptureCompleted(CameraCaptureSession ss, CaptureRequest rq, android.hardware.camera2.TotalCaptureResult res) {
                                            try {
                                                if (done[0]) return;
                                                /* 偵測到臉：把曝光＋對焦區域改成最大的那張臉 */
                                                android.hardware.camera2.params.Face[] fs = res.get(android.hardware.camera2.CaptureResult.STATISTICS_FACES);
                                                if (!faceSet[0] && fs != null && fs.length > 0) {
                                                    android.hardware.camera2.params.Face big = fs[0];
                                                    for (android.hardware.camera2.params.Face f : fs) if (f.getBounds().width() * f.getBounds().height() > big.getBounds().width() * big.getBounds().height()) big = f;
                                                    android.graphics.Rect r0 = big.getBounds();
                                                    int pad = r0.width() / 5;
                                                    android.graphics.Rect r1 = new android.graphics.Rect(Math.max(0, r0.left - pad), Math.max(0, r0.top - pad), r0.right + pad, r0.bottom + pad);
                                                    if (ar != null) { r1.right = Math.min(r1.right, ar.width() - 1); r1.bottom = Math.min(r1.bottom, ar.height() - 1); }
                                                    android.hardware.camera2.params.MeteringRectangle[] mr = {new android.hardware.camera2.params.MeteringRectangle(r1, 1000)};
                                                    if (aeReg) b.set(CaptureRequest.CONTROL_AE_REGIONS, mr);
                                                    if (afReg && hasAf) b.set(CaptureRequest.CONTROL_AF_REGIONS, mr);
                                                    faceSet[0] = true;
                                                    ready[0] = false;
                                                    ss.setRepeatingRequest(b.build(), this, hd);
                                                    return;
                                                }
                                                Integer ae = res.get(android.hardware.camera2.CaptureResult.CONTROL_AE_STATE);
                                                Integer af = res.get(android.hardware.camera2.CaptureResult.CONTROL_AF_STATE);
                                                boolean aeOk = ae == null || ae == android.hardware.camera2.CaptureResult.CONTROL_AE_STATE_CONVERGED || ae == android.hardware.camera2.CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED || ae == android.hardware.camera2.CaptureResult.CONTROL_AE_STATE_LOCKED;
                                                boolean afOk2 = !hasAf || af == null || af == android.hardware.camera2.CaptureResult.CONTROL_AF_STATE_INACTIVE && System.currentTimeMillis() - t0 > 1500
                                                    || af == android.hardware.camera2.CaptureResult.CONTROL_AF_STATE_PASSIVE_FOCUSED || af == android.hardware.camera2.CaptureResult.CONTROL_AF_STATE_FOCUSED_LOCKED
                                                    || af == android.hardware.camera2.CaptureResult.CONTROL_AF_STATE_NOT_FOCUSED_LOCKED && System.currentTimeMillis() - t0 > 2500;
                                                /* 有臉就等臉的曝光穩定；沒臉的話 2 秒後也接受 */
                                                ready[0] = aeOk && afOk2 && (faceSet[0] || System.currentTimeMillis() - t0 > 2000);
                                            } catch (Throwable t) { /* ignore */ }
                                        }
                                    };
                                    s.setRepeatingRequest(b.build(), cb, hd);
                                } catch (Throwable t) { close.run(); }
                            }
                            @Override public void onConfigureFailed(CameraCaptureSession s) { close.run(); }
                        }, hd);
                    } catch (Throwable t) { close.run(); }
                }
                @Override public void onDisconnected(CameraDevice cam) { close.run(); }
                @Override public void onError(CameraDevice cam, int e) { close.run(); }
            }, hd);
            hd.postDelayed(new Runnable() { @Override public void run() { if (!done[0]) close.run(); } }, 8000);
        } catch (Throwable t) { /* 沒有相機或被占用 */ }
    }

    private static void save(MainActivity a, byte[] jpg) {
        try {
            Lib lib = Lib.get(a);
            File f = lib.tmpFile("jpg");
            FileOutputStream os = new FileOutputStream(f);
            os.write(jpg);
            os.close();
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inSampleSize = 4;
            Bitmap tb = BitmapFactory.decodeByteArray(jpg, 0, jpg.length, o);
            String ts = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(new java.util.Date());
            JSONObject it = lib.add(f, "入侵者_" + ts + ".jpg", "image/jpeg", "", "有人連續輸錯密碼", tb);
            lib.touch(it.getString("id"), "folder", INTRUDER_FOLDER);
            lib.touch(it.getString("id"), "sys", "intruder");
            p(a).edit().putInt("intruder", pending(a) + 1).apply();
            MainActivity.emit("lib", "");
            MainActivity.emit("intruder", it.toString());
        } catch (Throwable t) { /* ignore */ }
    }

    /** 下次打開 App：跳系統通知提醒 */
    static void notifyPending(Context c) {
        int n = pending(c);
        if (n <= 0) return;
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel("sec") == null) {
                android.app.NotificationChannel ch = new android.app.NotificationChannel("sec", "安全提醒", NotificationManager.IMPORTANCE_HIGH);
                nm.createNotificationChannel(ch);
            }
            PendingIntent pi = PendingIntent.getActivity(c, 9, new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, "sec") : new Notification.Builder(c);
            b.setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle("有人在動你的Terra 瀏覽器").setContentText("密碼連續輸錯 " + (n * 3) + " 次以上，已拍下 " + n + " 張照片，請確認").setAutoCancel(true).setContentIntent(pi);
            nm.notify(4242, b.build());
        } catch (Throwable t) { /* ignore */ }
    }
}
