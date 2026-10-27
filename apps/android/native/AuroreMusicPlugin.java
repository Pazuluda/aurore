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
import android.os.HandlerThread;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
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
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * aurore : trouve la musique du téléphone (comme les autres lecteurs Android) et la sert au lecteur
 * à l'adresse /_aurore_media_/<id>, avec la prise en charge des plages d'octets pour avancer dans un titre.
 * Pilote aussi le lecteur natif (AuroreService), qui continue de jouer quand l'app est fermée.
 */
@OptIn(markerClass = UnstableApi.class)
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

    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        final Bridge b = getBridge();
        final Context ctx = getContext();
        // après l'initialisation complète du pont : notre client remplace celui de Capacitor et lui délègue le reste
        main.post(() -> b.setWebViewClient(new MediaClient(b, ctx)));
    }

    @Override
    protected void handleOnDestroy() {
        vizOn = false;
        AuroreService.TAP.setActive(false);
        if (vizThread != null) {
            vizThread.quitSafely();
            vizThread = null;
            vizHandler = null;
        }
        main.post(() -> {
            if (attached != null) attached.removeListener(listener);
            attached = null;
        });
    }

    /* ===================== lecteur natif ===================== */

    interface Op {
        void run(ExoPlayer p) throws Exception;
    }

    private ExoPlayer attached;
    private String lastError;
    private volatile boolean vizPlaying;

    private final Player.Listener listener = new Player.Listener() {
        private int reason = -1;

        @Override
        public void onMediaItemTransition(MediaItem mediaItem, int r) {
            reason = r;
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            lastError = error.getErrorCodeName();
        }

        @Override
        public void onEvents(Player p, Player.Events events) {
            vizPlaying = p.isPlaying();
            if (!events.containsAny(
                Player.EVENT_MEDIA_ITEM_TRANSITION,
                Player.EVENT_IS_PLAYING_CHANGED,
                Player.EVENT_PLAYBACK_STATE_CHANGED,
                Player.EVENT_PLAY_WHEN_READY_CHANGED,
                Player.EVENT_POSITION_DISCONTINUITY,
                Player.EVENT_PLAYER_ERROR,
                Player.EVENT_REPEAT_MODE_CHANGED
            )) return;
            int r = events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION) ? reason : -1;
            notifyListeners("player", state(p, false, r));
            lastError = null;
        }
    };

    private void attach(ExoPlayer p) {
        AuroreService.onExternalQueue = () -> main.post(() -> {
            JSObject o = new JSObject();
            o.put("gen", AuroreService.gen);
            notifyListeners("external", o);
        });
        if (attached == p) return;
        if (attached != null) attached.removeListener(listener);
        p.addListener(listener);
        attached = p;
        vizPlaying = p.isPlaying();
    }

    /** lance le service de lecture si besoin, puis exécute op sur le fil principal */
    private void withPlayer(final PluginCall call, final Op op) {
        main.post(() -> tryRun(call, op, 0));
    }

    private void tryRun(final PluginCall call, final Op op, final int tries) {
        AuroreService s = AuroreService.instance;
        if (s != null && s.player != null) {
            attach(s.player);
            try {
                op.run(s.player);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Erreur du lecteur", "PLAYER");
            }
            return;
        }
        if (tries == 0) {
            try {
                getContext().startService(new Intent(getContext(), AuroreService.class));
            } catch (Exception e) {
                call.reject("Service de lecture indisponible", "NO_SERVICE");
                return;
            }
        }
        if (tries > 80) {
            call.reject("Service de lecture indisponible", "NO_SERVICE");
            return;
        }
        main.postDelayed(() -> tryRun(call, op, tries + 1), 50);
    }

    private JSObject state(Player p, boolean withIds, int reason) {
        JSObject o = new JSObject();
        MediaItem m = p.getCurrentMediaItem();
        o.put("gen", AuroreService.gen);
        o.put("id", m != null ? m.mediaId : "");
        o.put("index", p.getCurrentMediaItemIndex());
        o.put("count", p.getMediaItemCount());
        o.put("playing", p.isPlaying());
        o.put("want", p.getPlayWhenReady());
        o.put("state", p.getPlaybackState());
        o.put("pos", Math.max(0, p.getCurrentPosition()));
        long d = p.getDuration();
        o.put("dur", d == C.TIME_UNSET ? -1 : d);
        o.put("at", System.currentTimeMillis());
        o.put("repeat", p.getRepeatMode());
        if (reason >= 0) o.put("reason", reason);
        if (lastError != null) o.put("error", lastError);
        if (withIds) {
            JSArray ids = new JSArray();
            for (int i = 0; i < p.getMediaItemCount(); i++) ids.put(p.getMediaItemAt(i).mediaId);
            o.put("ids", ids);
        }
        return o;
    }

    private File artFile(String key) {
        return ArtProvider.file(getContext(), key);
    }

    private List<MediaItem> items(PluginCall call) throws JSONException {
        JSArray arr = call.getArray("items");
        List<MediaItem> list = new ArrayList<>();
        if (arr == null) return list;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            list.add(AuroreService.track(o.getString("id"), o.getLong("mid"), o.optString("title", ""), o.optString("artist", ""), o.optString("album", ""), o.optString("art", ""), (float) o.optDouble("gain", 0)));
        }
        return list;
    }

    /** remplace la file : titres à venir (et quelques précédents), titre de départ, position, lecture */
    @PluginMethod
    public void pload(final PluginCall call) {
        final List<MediaItem> list;
        try {
            list = items(call);
        } catch (JSONException e) {
            call.reject("File invalide", "BAD_QUEUE");
            return;
        }
        if (list.isEmpty()) {
            call.reject("File vide", "BAD_QUEUE");
            return;
        }
        final int g = call.getInt("gen", 0);
        final int index = Math.max(0, Math.min(list.size() - 1, call.getInt("index", 0)));
        final long pos = Math.max(0L, Math.round(call.getDouble("pos", 0.0)));
        final boolean play = call.getBoolean("play", true);
        final int repeat = call.getInt("repeat", Player.REPEAT_MODE_OFF);
        withPlayer(call, (p) -> {
            AuroreService.gen = g;
            lastError = null;
            p.setRepeatMode(repeat);
            p.setMediaItems(list, index, pos);
            p.prepare();
            p.setPlayWhenReady(play);
            call.resolve(state(p, false, -1));
        });
    }

    /** met à jour les titres autour de celui qui joue, sans le couper */
    @PluginMethod
    public void pupdate(final PluginCall call) {
        final List<MediaItem> list;
        try {
            list = items(call);
        } catch (JSONException e) {
            call.reject("File invalide", "BAD_QUEUE");
            return;
        }
        final String current = call.getString("currentId", "");
        final int index = call.getInt("index", 0);
        final int repeat = call.getInt("repeat", Player.REPEAT_MODE_OFF);
        withPlayer(call, (p) -> {
            MediaItem now = p.getCurrentMediaItem();
            if (now == null || index < 0 || index >= list.size() || !now.mediaId.equals(current) || !list.get(index).mediaId.equals(current)) {
                call.reject("Le titre a changé", "MISMATCH");
                return;
            }
            int ci = p.getCurrentMediaItemIndex();
            int n = p.getMediaItemCount();
            if (ci + 1 < n) p.removeMediaItems(ci + 1, n);
            if (ci > 0) p.removeMediaItems(0, ci);
            List<MediaItem> after = new ArrayList<>(list.subList(index + 1, list.size()));
            List<MediaItem> before = new ArrayList<>(list.subList(0, index));
            if (!after.isEmpty()) p.addMediaItems(after);
            if (!before.isEmpty()) p.addMediaItems(0, before);
            p.setRepeatMode(repeat);
            call.resolve(state(p, false, -1));
        });
    }

    @PluginMethod
    public void pplay(final PluginCall call) {
        withPlayer(call, (p) -> {
            if (p.getMediaItemCount() > 0) {
                if (p.getPlaybackState() == Player.STATE_IDLE) p.prepare();
                if (p.getPlaybackState() == Player.STATE_ENDED) p.seekTo(p.getCurrentMediaItemIndex(), 0);
                p.play();
            }
            call.resolve(state(p, false, -1));
        });
    }

    @PluginMethod
    public void ppause(final PluginCall call) {
        withPlayer(call, (p) -> {
            p.pause();
            call.resolve(state(p, false, -1));
        });
    }

    @PluginMethod
    public void pseek(final PluginCall call) {
        final long pos = Math.max(0L, Math.round(call.getDouble("pos", 0.0)));
        withPlayer(call, (p) -> {
            if (p.getMediaItemCount() > 0) p.seekTo(pos);
            call.resolve(state(p, false, -1));
        });
    }

    @PluginMethod
    public void prepeat(final PluginCall call) {
        final int repeat = call.getInt("repeat", Player.REPEAT_MODE_OFF);
        withPlayer(call, (p) -> {
            p.setRepeatMode(repeat);
            call.resolve(state(p, false, -1));
        });
    }

    @PluginMethod
    public void pvolume(final PluginCall call) {
        final float v = (float) Math.max(0.0, Math.min(1.0, call.getDouble("volume", 1.0)));
        withPlayer(call, (p) -> {
            p.setVolume(v);
            call.resolve();
        });
    }

    @PluginMethod
    public void pstop(final PluginCall call) {
        withPlayer(call, (p) -> {
            p.stop();
            p.clearMediaItems();
            call.resolve(state(p, false, -1));
        });
    }

    /** état du lecteur ; avec start=false, ne lance pas le service s'il ne tourne pas (démarrage de l'app) */
    @PluginMethod
    public void pstate(final PluginCall call) {
        if (!call.getBoolean("start", true)) {
            main.post(() -> {
                AuroreService s = AuroreService.instance;
                if (s != null && s.player != null) {
                    attach(s.player);
                    call.resolve(state(s.player, true, -1));
                } else {
                    JSObject o = new JSObject();
                    o.put("gen", 0);
                    o.put("id", "");
                    o.put("count", 0);
                    o.put("index", 0);
                    o.put("ids", new JSArray());
                    call.resolve(o);
                }
            });
            return;
        }
        withPlayer(call, (p) -> call.resolve(state(p, true, -1)));
    }

    /* ---- égaliseur et volume égalisé ---- */

    @PluginMethod
    public void pfx(PluginCall call) {
        JSArray eq = call.getArray("eq");
        if (eq != null) {
            float[] db = new float[6];
            for (int i = 0; i < 6 && i < eq.length(); i++) db[i] = (float) eq.optDouble(i, 0);
            AuroreFx.setEq(db, call.getBoolean("eqOn", false), (float) (double) call.getDouble("preamp", 0.0), call.getBoolean("norm", true));
        }
        Double track = call.getDouble("track");
        if (track != null) AuroreFx.setTrack((float) (double) track);
        call.resolve();
    }

    /* ---- mise à jour de l'app, entièrement dans l'app ---- */

    private volatile boolean updating;

    /** télécharge le nouvel APK (progression envoyée à l'app), puis ouvre l'installation Android */
    @PluginMethod
    public void pinstallApk(final PluginCall call) {
        final String url = call.getString("url", "");
        final String version = call.getString("version", "nouvelle").replaceAll("[^0-9.]", "");
        if (!url.startsWith("https://")) {
            call.reject("Adresse invalide");
            return;
        }
        final Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            } catch (Exception ignored) {
                // réglage introuvable : l'app propose le téléchargement par le navigateur
            }
            JSObject r = new JSObject();
            r.put("state", "permission");
            call.resolve(r);
            return;
        }
        if (updating) {
            JSObject r = new JSObject();
            r.put("state", "busy");
            call.resolve(r);
            return;
        }
        updating = true;
        new Thread(() -> {
            try {
                File dir = new File(ctx.getCacheDir(), "update");
                if (!dir.exists()) dir.mkdirs();
                File apk = new File(dir, "aurore-" + version + ".apk");
                if (!apk.exists() || apk.length() < 100000) {
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    File part = new File(dir, "aurore-" + version + ".part");
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setInstanceFollowRedirects(true);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code / 100 != 2) throw new IOException("HTTP " + code);
                    long total = c.getContentLengthLong(), done = 0;
                    int lastPct = -1;
                    try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            done += n;
                            int pct = total > 0 ? (int) (done * 100 / total) : -1;
                            if (pct != lastPct) {
                                lastPct = pct;
                                JSObject ev = new JSObject();
                                ev.put("state", "downloading");
                                ev.put("percent", Math.max(0, pct));
                                notifyListeners("update", ev);
                            }
                        }
                    } finally {
                        c.disconnect();
                    }
                    if (!part.renameTo(apk)) throw new IOException("fichier");
                }
                Uri uri = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                JSObject r = new JSObject();
                r.put("state", "installing");
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Téléchargement impossible", "DOWNLOAD");
            } finally {
                updating = false;
            }
        }, "aurore-maj").start();
    }

    /* ---- Android Auto ---- */

    /** résumé de la bibliothèque pour Android Auto (titres, albums, artistes, playlists…) */
    @PluginMethod
    public void plibrary(PluginCall call) {
        String json = call.getString("json", "");
        if (json.isEmpty()) {
            call.reject("Bibliothèque vide");
            return;
        }
        try {
            AutoLibrary.save(getContext(), json);
            call.resolve();
        } catch (Exception e) {
            call.reject("Bibliothèque non enregistrée");
        }
    }

    /** ouvre les réglages d'Android Auto (ou sa fiche, d'où l'on va dans « Paramètres supplémentaires ») */
    @PluginMethod
    public void openAuto(PluginCall call) {
        String pkg = "com.google.android.projection.gearhead";
        JSObject r = new JSObject();
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
        } catch (Exception e) {
            r.put("installed", false);
            call.resolve(r);
            return;
        }
        r.put("installed", true);
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            r.put("opened", "details");
        } catch (Exception e) {
            r.put("opened", "none");
        }
        call.resolve(r);
    }

    /* ---- pochettes pour la notification et l'écran verrouillé ---- */

    @PluginMethod
    public void partHas(PluginCall call) {
        JSArray keys = call.getArray("keys");
        JSArray missing = new JSArray();
        if (keys != null) for (int i = 0; i < keys.length(); i++) {
            String k = keys.optString(i, "");
            if (!k.isEmpty() && !artFile(k).exists()) missing.put(k);
        }
        JSObject r = new JSObject();
        r.put("missing", missing);
        call.resolve(r);
    }

    @PluginMethod
    public void part(PluginCall call) {
        String key = call.getString("key", "");
        String data = call.getString("data", "");
        if (key.isEmpty() || data.isEmpty()) {
            call.reject("Pochette invalide");
            return;
        }
        try {
            File f = artFile(key);
            File dir = f.getParentFile();
            if (dir != null && !dir.exists()) dir.mkdirs();
            if (!f.exists()) {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                File tmp = new File(dir, f.getName() + ".tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(bytes);
                }
                if (!tmp.renameTo(f)) tmp.delete();
                pruneArt(dir);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Pochette non enregistrée");
        }
    }

    private void pruneArt(File dir) {
        File[] all = dir != null ? dir.listFiles() : null;
        if (all == null || all.length <= 800) return;
        Arrays.sort(all, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        for (int i = 0; i < all.length - 600; i++) all[i].delete();
    }

    /* ---- visualiseurs : spectre et onde calculés ici, envoyés ~30 fois par seconde quand l'app est à l'écran ---- */

    private static final int N = 4096;
    private static final int BANDS = 96;
    private HandlerThread vizThread;
    private volatile Handler vizHandler;
    private volatile boolean vizOn;
    private final float[] vbuf = new float[N];
    private final float[] re = new float[N];
    private final float[] im = new float[N];
    private final float[] smooth = new float[N / 2];
    private final float[] win = new float[N];
    private final float[] cosT = new float[N / 2];
    private final float[] sinT = new float[N / 2];
    private int[] b0, b1;
    private int bandsRate = 0;

    {
        for (int i = 0; i < N; i++) win[i] = (float) (0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N));
        for (int i = 0; i < N / 2; i++) {
            cosT[i] = (float) Math.cos(-2 * Math.PI * i / N);
            sinT[i] = (float) Math.sin(-2 * Math.PI * i / N);
        }
    }

    private final Runnable vizTick = new Runnable() {
        @Override
        public void run() {
            if (!vizOn) return;
            if (vizPlaying) {
                try {
                    computeViz();
                } catch (Exception ignored) {
                    // une image de visualiseur en moins
                }
            }
            Handler h = vizHandler;
            if (h != null && vizOn) h.postDelayed(this, 33);
        }
    };

    @PluginMethod
    public void pviz(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        AuroreService.TAP.setActive(on);
        vizOn = on;
        if (on) {
            if (vizThread == null) {
                vizThread = new HandlerThread("aurore-viz");
                vizThread.start();
                vizHandler = new Handler(vizThread.getLooper());
            }
            vizHandler.removeCallbacks(vizTick);
            vizHandler.post(vizTick);
        } else if (vizHandler != null) {
            vizHandler.removeCallbacks(vizTick);
        }
        call.resolve();
    }

    private void computeViz() {
        int sr = AuroreService.TAP.snapshot(vbuf);
        if (sr <= 0) return;
        if (sr != bandsRate) {
            bandsRate = sr;
            b0 = new int[BANDS];
            b1 = new int[BANDS];
            double binHz = sr / (double) N;
            for (int i = 0; i < BANDS; i++) {
                double f0 = 32 * Math.pow(16000.0 / 32, i / (double) BANDS), f1 = 32 * Math.pow(16000.0 / 32, (i + 1) / (double) BANDS);
                b0[i] = (int) Math.floor(f0 / binHz);
                b1[i] = Math.max(b0[i] + 1, (int) Math.ceil(f1 / binHz));
            }
            Arrays.fill(smooth, 0f);
        }
        for (int i = 0; i < N; i++) {
            re[i] = vbuf[i] * win[i];
            im[i] = 0f;
        }
        fft(re, im);
        for (int k = 0; k < N / 2; k++) {
            float m = (float) Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
            smooth[k] = 0.5f * smooth[k] + 0.5f * m;
        }
        byte[] bands = new byte[BANDS];
        for (int i = 0; i < BANDS; i++) {
            float mx = 0f;
            for (int b = b0[i]; b < b1[i] && b < N / 2; b++) if (smooth[b] > mx) mx = smooth[b];
            int v = 0;
            if (mx > 0f) v = (int) Math.round((20 * Math.log10(mx) + 100) * 255 / 70);
            bands[i] = (byte) Math.max(0, Math.min(255, v));
        }
        byte[] wave = new byte[512];
        for (int i = 0; i < 512; i++) {
            int v = Math.round(128 + 128 * vbuf[i * 8]);
            wave[i] = (byte) Math.max(0, Math.min(255, v));
        }
        JSObject o = new JSObject();
        o.put("b", Base64.encodeToString(bands, Base64.NO_WRAP));
        o.put("w", Base64.encodeToString(wave, Base64.NO_WRAP));
        o.put("sr", sr);
        notifyListeners("viz", o);
    }

    /** transformée de Fourier rapide (radix 2, sur place) */
    private void fft(float[] xr, float[] xi) {
        int n = xr.length;
        for (int i = 1, j = 0; i < n; i++) {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                float t = xr[i];
                xr[i] = xr[j];
                xr[j] = t;
                t = xi[i];
                xi[i] = xi[j];
                xi[j] = t;
            }
        }
        for (int len = 2; len <= n; len <<= 1) {
            int half = len >> 1, step = n / len;
            for (int i = 0; i < n; i += len) {
                for (int k = 0; k < half; k++) {
                    float wr = cosT[k * step], wi = sinT[k * step];
                    int a = i + k, b = a + half;
                    float tr = xr[b] * wr - xi[b] * wi, ti = xr[b] * wi + xi[b] * wr;
                    xr[b] = xr[a] - tr;
                    xi[b] = xi[a] - ti;
                    xr[a] += tr;
                    xi[a] += ti;
                }
            }
        }
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
