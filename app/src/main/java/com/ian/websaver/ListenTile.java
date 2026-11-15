package com.ian.websaver;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** 通知欄「快速設定」裡的「聽歌辨識」開關：
    懸浮按鈕開著 → 直接聽（辨識中再按一次就取消）；沒開 → 打開 App 開啟懸浮按鈕並馬上聽 */
public class ListenTile extends TileService {
    static final String ACT = "com.ian.websaver.LSN_TILE";

    @Override public void onStartListening() { refresh(); }
    @Override public void onTileAdded() { refresh(); }

    private void refresh() {
        Tile t = getQsTile();
        if (t == null) return;
        boolean on = ListenFloat.on();
        t.setState(on ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.setLabel("聽歌辨識");
        if (Build.VERSION.SDK_INT >= 29) t.setSubtitle(on ? (ListenFloat.inst != null && ListenFloat.inst.busy ? "辨識中" : "點一下就聽") : "開啟懸浮按鈕");
        t.updateTile();
    }

    @Override public void onClick() {
        final ListenFloat f = ListenFloat.inst;
        if (f != null && ListenFloat.on()) {
            Util.MAIN.post(new Runnable() { @Override public void run() { f.tap(); } });
            refresh();
            return;
        }
        Intent i = new Intent(this, MainActivity.class).setAction(ACT).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                PendingIntent pi = PendingIntent.getActivity(this, 7, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                TileService.class.getMethod("startActivityAndCollapse", PendingIntent.class).invoke(this, pi);
            } else startActivityAndCollapse(i);
        } catch (Throwable t) {
            try { startActivity(i); } catch (Throwable x) { /* ignore */ }
        }
    }

    /** 懸浮按鈕開關或狀態改變時，請系統更新開關的樣子 */
    static void update(Context c) {
        try { TileService.requestListeningState(c, new ComponentName(c, ListenTile.class)); } catch (Throwable t) { /* ignore */ }
    }
}
