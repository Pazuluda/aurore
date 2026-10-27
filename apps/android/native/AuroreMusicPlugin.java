package io.github.pazuluda.aurore;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * aurore : trouve la musique du téléphone (comme les autres lecteurs Android) et la sert au lecteur
 * à l'adresse /_aurore_media_/<id>, avec la prise en charge des plages d'octets pour avancer dans un titre.
 */
@CapacitorPlugin(
    name = "AuroreMusic",
    permissions = {
        @Permission(alias = "audio", strings = { "android.permission.READ_MEDIA_AUDIO" }),
        @Permission(alias = "storage", strings = { "android.permission.READ_EXTERNAL_STORAGE" }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class AuroreMusicPlugin extends Plugin {

    static final String PREFIX = "/_aurore_media_/";

    private String musicAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio" : "storage";
    }

    @Override
    public void load() {
        final Bridge b = getBridge();
        final Context ctx = getContext();
        // après l'initialisation complète du pont : notre client remplace celui de Capacitor et lui délègue le reste
        new Handler(Looper.getMainLooper()).post(() -> b.setWebViewClient(new MediaClient(b, ctx)));
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("permission", getPermissionState(musicAlias()).toString());
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (getPermissionState(musicAlias()) == PermissionState.GRANTED) {
            status(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAliases(new String[] { "audio", "notifications" }, call, "permissionDone");
        } else {
            requestPermissionForAlias("storage", call, "permissionDone");
        }
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) {
        status(call);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Impossible d'ouvrir les paramètres");
        }
    }

    @PluginMethod
    public void scan(final PluginCall call) {
        if (getPermissionState(musicAlias()) != PermissionState.GRANTED) {
            call.reject("Accès à la musique non autorisé", "NO_PERMISSION");
            return;
        }
        getBridge().execute(() -> {
            try {
                call.resolve(query());
            } catch (Exception e) {
                call.reject("Lecture de la musique impossible : " + e.getMessage());
            }
        });
    }

    private JSObject query() {
        ContentResolver cr = getContext().getContentResolver();
        Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        boolean q = Build.VERSION.SDK_INT >= 29;
        List<String> cols = new ArrayList<>();
        cols.add(MediaStore.Audio.Media._ID);
        cols.add(MediaStore.Audio.Media.DISPLAY_NAME);
        cols.add(MediaStore.Audio.Media.TITLE);
        cols.add(MediaStore.Audio.Media.ARTIST);
        cols.add(MediaStore.Audio.Media.ALBUM);
        cols.add(MediaStore.Audio.Media.DURATION);
        cols.add(MediaStore.Audio.Media.SIZE);
        cols.add(MediaStore.Audio.Media.DATE_MODIFIED);
        cols.add(MediaStore.Audio.Media.MIME_TYPE);
        cols.add(MediaStore.Audio.Media.TRACK);
        cols.add(MediaStore.Audio.Media.YEAR);
        cols.add(q ? MediaStore.Audio.Media.RELATIVE_PATH : MediaStore.Audio.Media.DATA);
        String sel = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        JSArray items = new JSArray();
        try (Cursor c = cr.query(uri, cols.toArray(new String[0]), sel, null, null)) {
            if (c != null) {
                while (c.moveToNext()) {
                    String name = c.getString(1);
                    if (name == null) continue;
                    String dir;
                    if (q) {
                        dir = c.getString(11);
                        if (dir == null) dir = "";
                    } else {
                        String data = c.getString(11);
                        dir = "";
                        if (data != null) {
                            int i = data.indexOf("/0/");
                            String rel = i >= 0 ? data.substring(i + 3) : data;
                            int s = rel.lastIndexOf('/');
                            dir = s >= 0 ? rel.substring(0, s + 1) : "";
                        }
                    }
                    if (dir.length() > 0 && !dir.endsWith("/")) dir = dir + "/";
                    JSObject o = new JSObject();
                    o.put("id", c.getLong(0));
                    o.put("name", name);
                    o.put("path", dir + name);
                    o.put("title", c.getString(2));
                    o.put("artist", c.getString(3));
                    o.put("album", c.getString(4));
                    o.put("duration", c.getLong(5));
                    o.put("size", c.getLong(6));
                    o.put("mtime", c.getLong(7) * 1000L);
                    o.put("mime", c.getString(8));
                    o.put("track", c.getInt(9));
                    o.put("year", c.getInt(10));
                    items.put(o);
                }
            }
        }
        JSObject r = new JSObject();
        r.put("items", items);
        return r;
    }

    /** Sert les fichiers audio du téléphone au lecteur, en respectant les demandes de plage (« Range »). */
    static class MediaClient extends BridgeWebViewClient {

        private final Context ctx;

        MediaClient(Bridge bridge, Context ctx) {
            super(bridge);
            this.ctx = ctx;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String p = u != null ? u.getPath() : null;
            if (p != null && p.startsWith(PREFIX)) return serve(request, p.substring(PREFIX.length()));
            return super.shouldInterceptRequest(view, request);
        }

        private WebResourceResponse empty(int code, String reason, Map<String, String> h) {
            return new WebResourceResponse("text/plain", "utf-8", code, reason, h, new ByteArrayInputStream(new byte[0]));
        }

        private WebResourceResponse serve(WebResourceRequest request, String idPart) {
            Map<String, String> h = new HashMap<>();
            h.put("Accept-Ranges", "bytes");
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-store");
            try {
                String digits = idPart.replaceAll("[^0-9]", "");
                if (digits.isEmpty()) return empty(404, "Not Found", h);
                Uri cu = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, Long.parseLong(digits));
                ContentResolver cr = ctx.getContentResolver();
                String mime = cr.getType(cu);
                if (mime == null) mime = "audio/mpeg";
                AssetFileDescriptor afd = cr.openAssetFileDescriptor(cu, "r");
                if (afd == null) return empty(404, "Not Found", h);
                long total = afd.getLength();
                InputStream in = afd.createInputStream();
                if (total < 0) total = afd.getParcelFileDescriptor().getStatSize();
                String range = null;
                Map<String, String> rh = request.getRequestHeaders();
                if (rh != null) for (Map.Entry<String, String> e : rh.entrySet()) if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
                if (range != null && range.startsWith("bytes=") && total > 0) {
                    String[] se = range.substring(6).split(",")[0].split("-", 2);
                    long start, end;
                    if (se[0].trim().isEmpty()) {
                        long suffix = Long.parseLong(se[1].trim());
                        start = Math.max(0, total - suffix);
                        end = total - 1;
                    } else {
                        start = Long.parseLong(se[0].trim());
                        end = (se.length > 1 && !se[1].trim().isEmpty()) ? Long.parseLong(se[1].trim()) : total - 1;
                    }
                    if (start >= total) {
                        in.close();
                        h.put("Content-Range", "bytes */" + total);
                        return empty(416, "Range Not Satisfiable", h);
                    }
                    end = Math.min(end, total - 1);
                    skipFully(in, start);
                    long len = end - start + 1;
                    h.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
                    h.put("Content-Length", String.valueOf(len));
                    return new WebResourceResponse(mime, null, 206, "Partial Content", h, new Bounded(in, len));
                }
                if (total >= 0) h.put("Content-Length", String.valueOf(total));
                return new WebResourceResponse(mime, null, 200, "OK", h, in);
            } catch (Exception e) {
                return empty(404, "Not Found", h);
            }
        }

        private static void skipFully(InputStream in, long n) throws IOException {
            while (n > 0) {
                long s = in.skip(n);
                if (s <= 0) {
                    if (in.read() < 0) return;
                    s = 1;
                }
                n -= s;
            }
        }
    }

    /** Flux limité à un nombre d'octets (une plage). */
    static class Bounded extends InputStream {

        private final InputStream in;
        private long left;

        Bounded(InputStream in, long len) {
            this.in = in;
            this.left = len;
        }

        @Override
        public int read() throws IOException {
            if (left <= 0) return -1;
            int b = in.read();
            if (b >= 0) left--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = in.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(in.available(), left);
        }

        @Override
        public void close() throws IOException {
            in.close();
        }
    }
}
