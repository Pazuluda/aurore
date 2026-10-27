package io.github.pazuluda.aurore;

import android.app.PendingIntent;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.audio.TeeAudioProcessor;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.LibraryResult;
import androidx.media3.session.MediaLibraryService;
import androidx.media3.session.MediaSession;
import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.ArrayList;
import java.util.List;

/**
 * aurore : la lecture se fait ici, dans un service Android (comme les autres lecteurs de musique).
 * La musique continue quand on quitte l'app, écran éteint ou verrouillé, avec la notification
 * et les commandes de l'écran verrouillé, du casque et de la montre. Pause automatique pendant
 * un appel ou quand on débranche le casque. Le même service sert la bibliothèque à Android Auto.
 */
@OptIn(markerClass = UnstableApi.class)
public class AuroreService extends MediaLibraryService {

    /** Copie du son décodé, pour animer les visualiseurs de l'app. */
    static final VizTap TAP = new VizTap();
    static final String ART_AUTHORITY = "io.github.pazuluda.aurore.art";

    static AuroreService instance;
    /** numéro de la file en cours : positif = envoyée par l'app, négatif = choisie depuis Android Auto */
    static volatile int gen = 0;
    /** appelé quand Android Auto lance une nouvelle file (l'app la reprend) */
    static volatile Runnable onExternalQueue;

    ExoPlayer player;
    private MediaLibrarySession session;
    private AutoLibrary library;

    @Override
    public void onCreate() {
        super.onCreate();
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this) {
            @Override
            protected AudioSink buildAudioSink(Context context, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                return new DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(enableFloatOutput)
                    .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                    .setAudioProcessors(new AudioProcessor[] { new AuroreFx(), new TeeAudioProcessor(TAP) })
                    .build();
            }
        };
        AudioAttributes music = new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build();
        player = new ExoPlayer.Builder(this, renderers)
            .setAudioAttributes(music, true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build();

        library = new AutoLibrary(this);
        MediaLibrarySession.Builder b = new MediaLibrarySession.Builder(this, player, new LibraryCallback());
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            b.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        session = b.build();

        DefaultMediaNotificationProvider notif = new DefaultMediaNotificationProvider.Builder(this).build();
        notif.setSmallIcon(R.drawable.ic_aurore_note);
        setMediaNotificationProvider(notif);
        addSession(session);
        instance = this;
        // widget de l'écran d'accueil : suit le titre et la lecture
        player.addListener(new androidx.media3.common.Player.Listener() {
            @Override
            public void onMediaItemTransition(MediaItem item, int reason) {
                // volume égalisé : chaque titre arrive avec son propre réglage
                android.os.Bundle x = item != null ? item.mediaMetadata.extras : null;
                AuroreFx.setTrack(x != null ? x.getFloat("gain", 0f) : 0f);
            }

            @Override
            public void onEvents(androidx.media3.common.Player p, androidx.media3.common.Player.Events e) {
                if (e.containsAny(
                    androidx.media3.common.Player.EVENT_MEDIA_ITEM_TRANSITION,
                    androidx.media3.common.Player.EVENT_PLAY_WHEN_READY_CHANGED,
                    androidx.media3.common.Player.EVENT_PLAYBACK_STATE_CHANGED,
                    androidx.media3.common.Player.EVENT_MEDIA_METADATA_CHANGED,
                    androidx.media3.common.Player.EVENT_TIMELINE_CHANGED
                )) AuroreWidget.refresh(AuroreService.this);
            }
        });
        AuroreWidget.refresh(this);
    }

    /* boucle A-B : on revient au point A dès qu'on dépasse le point B */
    private final android.os.Handler loopHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private long loopA = -1, loopB = -1;
    private String loopId = null;
    private final Runnable loopTick = new Runnable() {
        @Override
        public void run() {
            if (loopB < 0 || player == null) return;
            MediaItem m = player.getCurrentMediaItem();
            if (m == null || !m.mediaId.equals(loopId)) { loopA = loopB = -1; return; }
            long pos = player.getCurrentPosition();
            if (pos >= loopB || pos < loopA - 1000) player.seekTo(loopA);
            loopHandler.postDelayed(this, 40);
        }
    };

    void setLoop(long a, long b) {
        loopHandler.removeCallbacks(loopTick);
        MediaItem m = player != null ? player.getCurrentMediaItem() : null;
        if (a < 0 || b <= a || m == null) { loopA = loopB = -1; loopId = null; return; }
        loopA = a; loopB = b; loopId = m.mediaId;
        loopHandler.post(loopTick);
    }

    @Override
    public MediaLibrarySession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        if (session != null) {
            session.getPlayer().release();
            session.release();
            session = null;
        }
        player = null;
        super.onDestroy();
        AuroreWidget.refresh(this);
    }

    /** pochette servie aux autres apps (Android Auto, écran verrouillé) par ArtProvider */
    static Uri artUri(String key) {
        return new Uri.Builder().scheme("content").authority(ART_AUTHORITY).appendPath(ArtProvider.safe(key)).build();
    }

    /** titre jouable : mediaId = identifiant du titre dans aurore */
    static MediaItem track(String id, long mid, String title, String artist, String album, String art) {
        return track(id, mid, title, artist, album, art, 0f);
    }

    static MediaItem track(String id, long mid, String title, String artist, String album, String art, float gainDb) {
        android.os.Bundle extras = new android.os.Bundle();
        extras.putFloat("gain", gainDb);
        MediaMetadata.Builder md = new MediaMetadata.Builder()
            .setExtras(extras)
            .setTitle(title)
            .setArtist(artist)
            .setAlbumTitle(album)
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC);
        if (art != null && !art.isEmpty()) md.setArtworkUri(artUri(art));
        return new MediaItem.Builder()
            .setMediaId(id)
            .setUri(ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, mid))
            .setMediaMetadata(md.build())
            .build();
    }

    /** Android Auto : parcourir la bibliothèque, chercher (voix), lancer une liste */
    private final class LibraryCallback implements MediaLibrarySession.Callback {

        @Override
        public ListenableFuture<LibraryResult<MediaItem>> onGetLibraryRoot(MediaLibrarySession s, MediaSession.ControllerInfo browser, LibraryParams params) {
            return Futures.immediateFuture(LibraryResult.ofItem(library.root(), params));
        }

        @Override
        public ListenableFuture<LibraryResult<MediaItem>> onGetItem(MediaLibrarySession s, MediaSession.ControllerInfo browser, String mediaId) {
            MediaItem it = library.item(mediaId);
            return Futures.immediateFuture(it != null ? LibraryResult.ofItem(it, null) : LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE));
        }

        @Override
        public ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetChildren(MediaLibrarySession s, MediaSession.ControllerInfo browser, String parentId, int page, int pageSize, LibraryParams params) {
            List<MediaItem> all = library.children(parentId);
            int from = Math.min(all.size(), Math.max(0, page) * Math.max(1, pageSize));
            int to = Math.min(all.size(), from + Math.max(1, pageSize));
            return Futures.immediateFuture(LibraryResult.ofItemList(all.subList(from, to), params));
        }

        @Override
        public ListenableFuture<LibraryResult<Void>> onSearch(MediaLibrarySession s, MediaSession.ControllerInfo browser, String query, LibraryParams params) {
            s.notifySearchResultChanged(browser, query, library.search(query).size(), params);
            return Futures.immediateFuture(LibraryResult.ofVoid());
        }

        @Override
        public ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetSearchResult(MediaLibrarySession s, MediaSession.ControllerInfo browser, String query, int page, int pageSize, LibraryParams params) {
            List<MediaItem> all = library.search(query);
            int from = Math.min(all.size(), Math.max(0, page) * Math.max(1, pageSize));
            int to = Math.min(all.size(), from + Math.max(1, pageSize));
            return Futures.immediateFuture(LibraryResult.ofItemList(all.subList(from, to), params));
        }

        @Override
        public ListenableFuture<List<MediaItem>> onAddMediaItems(MediaSession s, MediaSession.ControllerInfo controller, List<MediaItem> mediaItems) {
            List<MediaItem> out = new ArrayList<>();
            for (MediaItem m : mediaItems) {
                if (m.localConfiguration != null) { out.add(m); continue; }
                MediaItem t = library.playable(m.mediaId);
                if (t != null) out.add(t);
            }
            return Futures.immediateFuture(out);
        }

        @Override
        public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onSetMediaItems(MediaSession s, MediaSession.ControllerInfo controller, List<MediaItem> mediaItems, int startIndex, long startPositionMs) {
            AutoLibrary.Queue q = null;
            if (mediaItems.size() == 1) {
                MediaItem m = mediaItems.get(0);
                String query = m.requestMetadata.searchQuery;
                if (m.mediaId.isEmpty() && query != null) q = library.queueForSearch(query);
                else q = library.queueFor(m.mediaId);
            }
            if (q == null) {
                List<MediaItem> list = new ArrayList<>();
                for (MediaItem m : mediaItems) {
                    MediaItem t = m.localConfiguration != null ? m : library.playable(m.mediaId);
                    if (t != null) list.add(t);
                }
                q = new AutoLibrary.Queue(list, Math.max(0, Math.min(startIndex, list.size() - 1)));
            }
            if (controller.getPackageName().equals(getPackageName())) {
                // l'app elle-même : elle gère sa file
            } else {
                gen = -(int) ((System.currentTimeMillis() / 1000) % 1000000000L) - 1;
                Runnable r = onExternalQueue;
                if (r != null) r.run();
            }
            return Futures.immediateFuture(new MediaSession.MediaItemsWithStartPosition(q.items, q.start, q.start == 0 && startPositionMs > 0 ? startPositionMs : C.TIME_UNSET));
        }

        @Override
        public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onPlaybackResumption(MediaSession s, MediaSession.ControllerInfo controller) {
            AutoLibrary.Queue q = library.queueFor(AutoLibrary.SHUFFLE);
            if (q == null || q.items.isEmpty()) return Futures.immediateFailedFuture(new UnsupportedOperationException());
            gen = -(int) ((System.currentTimeMillis() / 1000) % 1000000000L) - 1;
            return Futures.immediateFuture(new MediaSession.MediaItemsWithStartPosition(q.items, 0, C.TIME_UNSET));
        }
    }
}
