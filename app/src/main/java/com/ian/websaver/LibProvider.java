package com.ian.websaver;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;

/** 讓其他 App（分享、用其他 App 開啟）可以讀取檔案庫裡的單一檔案（唯讀、需授權）。 */
public class LibProvider extends ContentProvider {
    static final String AUTH = "com.ian.websaver.files";

    @Override public boolean onCreate() { return true; }

    private JSONObject item(Uri u) {
        if (getContext() == null || u.getPathSegments().size() < 2) return null;
        return Lib.get(getContext()).find(u.getPathSegments().get(1));
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        JSONObject o = item(uri);
        if (o == null) throw new FileNotFoundException();
        File f = Lib.get(getContext()).fileOf(o);
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        JSONObject o = item(uri);
        if (o == null) return null;
        String[] cols = proj != null ? proj : new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = o.optString("name");
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = o.optLong("size");
        }
        c.addRow(row);
        return c;
    }

    @Override public String getType(Uri uri) { JSONObject o = item(uri); return o == null ? null : o.optString("mime"); }

    @Override public Uri insert(Uri uri, ContentValues v) { return null; }

    @Override public int delete(Uri uri, String s, String[] a) { return 0; }

    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
