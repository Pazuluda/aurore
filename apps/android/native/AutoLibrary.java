package io.github.pazuluda.aurore;

import android.content.Context;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * La bibliothèque d'aurore vue par Android Auto. L'app en écrit un résumé (titres, albums, artistes,
 * playlists, likes, plus écoutés) dans un fichier ; Android Auto la parcourt même app fermée.
 *
 * Identifiants : "root", "home", "albums", "artists", "playlists", "album:<clé>", "artist:<clé>",
 * "pl:<id>", "likes", "top", "recent", "shuffle" ; titre dans une liste : "<liste>|<id du titre>".
 */
final class AutoLibrary {

    static final String SHUFFLE = "shuffle";
    static final String FILE = "aurore-library.json";

    static final class Track {
        String id, title, artist, album, art;
        long mid;
        float gain;
    }

    static final class Group {
        String key, title, subtitle, art;
        List<String> ids = new ArrayList<>();
    }

    static final class Queue {
        final List<MediaItem> items;
        final int start;

        Queue(List<MediaItem> items, int start) {
            this.items = items;
            this.start = start;
        }
    }

    private final Context ctx;
    private long loadedAt = -1;
    private final Map<String, Track> tracks = new HashMap<>();
    private final List<String> order = new ArrayList<>();
    private final List<Group> albums = new ArrayList<>(), artists = new ArrayList<>(), playlists = new ArrayList<>();
    private final List<String> likes = new ArrayList<>(), top = new ArrayList<>(), recent = new ArrayList<>();

    AutoLibrary(Context ctx) {
        this.ctx = ctx;
    }

    static void save(Context ctx, String json) throws Exception {
        File f = new File(ctx.getFilesDir(), FILE), tmp = new File(ctx.getFilesDir(), FILE + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
        }
        if (!tmp.renameTo(f)) throw new Exception("écriture impossible");
    }

    /** relit le fichier s'il a changé */
    private synchronized void load() {
        File f = new File(ctx.getFilesDir(), FILE);
        long m = f.exists() ? f.lastModified() : 0;
        if (m == loadedAt) return;
        loadedAt = m;
        tracks.clear(); order.clear(); albums.clear(); artists.clear(); playlists.clear(); likes.clear(); top.clear(); recent.clear();
        if (m == 0) return;
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int n = 0;
            while (n < buf.length) {
                int r = in.read(buf, n, buf.length - n);
                if (r < 0) break;
                n += r;
            }
            JSONObject o = new JSONObject(new String(buf, 0, n, StandardCharsets.UTF_8));
            JSONArray ts = o.optJSONArray("tracks");
            if (ts != null) for (int i = 0; i < ts.length(); i++) {
                JSONArray a = ts.getJSONArray(i);
                Track t = new Track();
                t.id = a.getString(0); t.mid = a.getLong(1); t.title = a.optString(2, ""); t.artist = a.optString(3, ""); t.album = a.optString(4, ""); t.art = a.optString(5, ""); t.gain = (float) a.optDouble(6, 0);
                tracks.put(t.id, t);
                order.add(t.id);
            }
            groups(o.optJSONArray("albums"), albums);
            groups(o.optJSONArray("artists"), artists);
            groups(o.optJSONArray("playlists"), playlists);
            ids(o.optJSONArray("likes"), likes);
            ids(o.optJSONArray("top"), top);
            ids(o.optJSONArray("recent"), recent);
        } catch (Exception ignored) {
            // fichier illisible : bibliothèque vide jusqu'à la prochaine ouverture de l'app
        }
    }

    private void groups(JSONArray arr, List<Group> out) throws Exception {
        if (arr == null) return;
        for (int i = 0; i < arr.length(); i++) {
            JSONArray a = arr.getJSONArray(i);
            Group g = new Group();
            g.key = a.getString(0); g.title = a.optString(1, ""); g.subtitle = a.optString(2, ""); g.art = a.optString(3, "");
            ids(a.optJSONArray(4), g.ids);
            out.add(g);
        }
    }

    private void ids(JSONArray arr, List<String> out) throws Exception {
        if (arr == null) return;
        for (int i = 0; i < arr.length(); i++) {
            String id = arr.getString(i);
            if (tracks.containsKey(id)) out.add(id);
        }
    }

    private static MediaItem folder(String id, String title, String subtitle, String art, int type, boolean playable) {
        MediaMetadata.Builder md = new MediaMetadata.Builder()
            .setTitle(title)
            .setIsBrowsable(true)
            .setIsPlayable(playable)
            .setMediaType(type);
        if (subtitle != null && !subtitle.isEmpty()) md.setSubtitle(subtitle).setArtist(subtitle);
        if (art != null && !art.isEmpty()) md.setArtworkUri(AuroreService.artUri(art));
        return new MediaItem.Builder().setMediaId(id).setMediaMetadata(md.build()).build();
    }

    MediaItem root() {
        return folder("root", "aurore", null, null, MediaMetadata.MEDIA_TYPE_FOLDER_MIXED, false);
    }

    private MediaItem trackIn(String parent, String id) {
        Track t = tracks.get(id);
        MediaItem base = AuroreService.track(t.id, t.mid, t.title, t.artist, t.album, t.art, t.gain);
        return base.buildUpon().setMediaId(parent + "|" + t.id).build();
    }

    private MediaItem playableTrack(String id) {
        Track t = tracks.get(id);
        return t == null ? null : AuroreService.track(t.id, t.mid, t.title, t.artist, t.album, t.art, t.gain);
    }

    private static String firstArt(Map<String, Track> tracks, List<String> ids) {
        for (String id : ids) {
            Track t = tracks.get(id);
            if (t != null && t.art != null && !t.art.isEmpty()) return t.art;
        }
        return "";
    }

    synchronized List<MediaItem> children(String parent) {
        load();
        List<MediaItem> out = new ArrayList<>();
        switch (parent) {
            case "root":
                out.add(folder("home", "Pour toi", null, null, MediaMetadata.MEDIA_TYPE_FOLDER_MIXED, false));
                out.add(folder("playlists", "Playlists", null, null, MediaMetadata.MEDIA_TYPE_FOLDER_PLAYLISTS, false));
                out.add(folder("albums", "Albums", null, null, MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS, false));
                out.add(folder("artists", "Artistes", null, null, MediaMetadata.MEDIA_TYPE_FOLDER_ARTISTS, false));
                return out;
            case "home":
                if (!order.isEmpty()) {
                    MediaMetadata md = new MediaMetadata.Builder().setTitle("Lecture aléatoire").setSubtitle(order.size() + " titres").setIsBrowsable(false).setIsPlayable(true).setMediaType(MediaMetadata.MEDIA_TYPE_PLAYLIST).build();
                    out.add(new MediaItem.Builder().setMediaId(SHUFFLE).setMediaMetadata(md).build());
                }
                if (!top.isEmpty()) out.add(folder("top", "Les plus écoutés", top.size() + " titres", firstArt(tracks, top), MediaMetadata.MEDIA_TYPE_PLAYLIST, true));
                if (!likes.isEmpty()) out.add(folder("likes", "Titres likés", likes.size() + " titres", firstArt(tracks, likes), MediaMetadata.MEDIA_TYPE_PLAYLIST, true));
                if (!recent.isEmpty()) out.add(folder("recent", "Ajoutés récemment", recent.size() + " titres", firstArt(tracks, recent), MediaMetadata.MEDIA_TYPE_PLAYLIST, true));
                return out;
            case "albums":
                for (Group g : albums) out.add(folder("album:" + g.key, g.title, g.subtitle, g.art, MediaMetadata.MEDIA_TYPE_ALBUM, true));
                return out;
            case "artists":
                for (Group g : artists) out.add(folder("artist:" + g.key, g.title, g.subtitle, g.art, MediaMetadata.MEDIA_TYPE_ARTIST, true));
                return out;
            case "playlists":
                for (Group g : playlists) out.add(folder("pl:" + g.key, g.title, g.subtitle, g.art != null && !g.art.isEmpty() ? g.art : firstArt(tracks, g.ids), MediaMetadata.MEDIA_TYPE_PLAYLIST, true));
                return out;
            default:
                List<String> ids = list(parent);
                if (ids != null) for (String id : ids) out.add(trackIn(parent, id));
                return out;
        }
    }

    /** titres d'une liste parcourable */
    private List<String> list(String parent) {
        if (parent.equals("likes")) return likes;
        if (parent.equals("top")) return top;
        if (parent.equals("recent")) return recent;
        if (parent.equals(SHUFFLE)) { List<String> all = new ArrayList<>(order); Collections.shuffle(all); return all; }
        List<Group> src = parent.startsWith("album:") ? albums : parent.startsWith("artist:") ? artists : parent.startsWith("pl:") ? playlists : null;
        if (src == null) return null;
        String key = parent.substring(parent.indexOf(':') + 1);
        for (Group g : src) if (g.key.equals(key)) return g.ids;
        return null;
    }

    synchronized MediaItem item(String mediaId) {
        load();
        if (mediaId.equals("root")) return root();
        int bar = mediaId.indexOf('|');
        if (bar >= 0) { String id = mediaId.substring(bar + 1); return tracks.containsKey(id) ? trackIn(mediaId.substring(0, bar), id) : null; }
        if (tracks.containsKey(mediaId)) return playableTrack(mediaId);
        for (MediaItem m : children("root")) if (m.mediaId.equals(mediaId)) return m;
        for (String p : new String[] { "home", "albums", "artists", "playlists" }) for (MediaItem m : children(p)) if (m.mediaId.equals(mediaId)) return m;
        return null;
    }

    synchronized MediaItem playable(String mediaId) {
        load();
        int bar = mediaId.indexOf('|');
        return playableTrack(bar >= 0 ? mediaId.substring(bar + 1) : mediaId);
    }

    /** ce qu'on joue quand on touche un élément : toute la liste, en commençant par le titre touché */
    synchronized Queue queueFor(String mediaId) {
        load();
        String parent = mediaId, start = null;
        int bar = mediaId.indexOf('|');
        if (bar >= 0) { parent = mediaId.substring(0, bar); start = mediaId.substring(bar + 1); }
        List<String> ids = list(parent);
        if (ids == null) {
            MediaItem one = playableTrack(start != null ? start : mediaId);
            if (one == null) return null;
            List<MediaItem> l = new ArrayList<>();
            l.add(one);
            return new Queue(l, 0);
        }
        List<MediaItem> items = new ArrayList<>();
        int s = 0;
        for (String id : ids) {
            if (id.equals(start)) s = items.size();
            MediaItem m = playableTrack(id);
            if (m != null) items.add(m);
            if (items.size() >= 500) break;
        }
        return items.isEmpty() ? null : new Queue(items, s);
    }

    private static String norm(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }

    /** recherche (à la voix : « joue … sur aurore ») : artiste, album, playlist ou titre */
    synchronized List<MediaItem> search(String query) {
        load();
        String q = norm(query);
        List<MediaItem> out = new ArrayList<>();
        if (q.isEmpty()) return out;
        for (Group g : artists) if (norm(g.title).contains(q)) out.add(folder("artist:" + g.key, g.title, g.subtitle, g.art, MediaMetadata.MEDIA_TYPE_ARTIST, true));
        for (Group g : albums) if (norm(g.title).contains(q)) out.add(folder("album:" + g.key, g.title, g.subtitle, g.art, MediaMetadata.MEDIA_TYPE_ALBUM, true));
        for (Group g : playlists) if (norm(g.title).contains(q)) out.add(folder("pl:" + g.key, g.title, g.subtitle, g.art != null && !g.art.isEmpty() ? g.art : firstArt(tracks, g.ids), MediaMetadata.MEDIA_TYPE_PLAYLIST, true));
        for (String id : order) {
            Track t = tracks.get(id);
            if (norm(t.title).contains(q) || norm(t.artist).contains(q)) out.add(trackIn("search", id));
            if (out.size() >= 100) break;
        }
        return out;
    }

    synchronized Queue queueForSearch(String query) {
        load();
        String q = norm(query);
        if (q.isEmpty()) return queueFor(SHUFFLE);
        for (Group g : artists) if (norm(g.title).equals(q)) return queueFor("artist:" + g.key);
        for (Group g : playlists) if (norm(g.title).equals(q)) return queueFor("pl:" + g.key);
        for (Group g : albums) if (norm(g.title).equals(q)) return queueFor("album:" + g.key);
        for (Group g : artists) if (norm(g.title).contains(q)) return queueFor("artist:" + g.key);
        for (Group g : playlists) if (norm(g.title).contains(q)) return queueFor("pl:" + g.key);
        for (Group g : albums) if (norm(g.title).contains(q)) return queueFor("album:" + g.key);
        List<MediaItem> items = new ArrayList<>();
        for (String id : order) {
            Track t = tracks.get(id);
            if (norm(t.title).contains(q) || norm(t.artist + " " + t.title).contains(q)) items.add(playableTrack(id));
        }
        return items.isEmpty() ? queueFor(SHUFFLE) : new Queue(items, 0);
    }
}
