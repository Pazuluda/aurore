package io.github.pazuluda.aurore;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.exoplayer.ExoPlayer;
import java.io.File;

/** Widget de l'écran d'accueil : pochette, titre, artiste, précédent / lecture / suivant. */
public class AuroreWidget extends AppWidgetProvider {

    static final String ACT_TOGGLE = "io.github.pazuluda.aurore.widget.TOGGLE";
    static final String ACT_NEXT = "io.github.pazuluda.aurore.widget.NEXT";
    static final String ACT_PREV = "io.github.pazuluda.aurore.widget.PREV";

    private static String lastArt = null;
    private static Bitmap lastBitmap = null;

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        refresh(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (!ACT_TOGGLE.equals(a) && !ACT_NEXT.equals(a) && !ACT_PREV.equals(a)) return;
        new Handler(Looper.getMainLooper()).post(() -> {
            AuroreService s = AuroreService.instance;
            ExoPlayer p = s != null ? s.player : null;
            if (p == null || p.getMediaItemCount() == 0) {
                refresh(ctx);
                return;
            }
            if (ACT_TOGGLE.equals(a)) {
                if (p.isPlaying()) p.pause();
                else {
                    if (p.getPlaybackState() == androidx.media3.common.Player.STATE_IDLE) p.prepare();
                    if (p.getPlaybackState() == androidx.media3.common.Player.STATE_ENDED) p.seekTo(p.getCurrentMediaItemIndex(), 0);
                    p.play();
                }
            } else if (ACT_NEXT.equals(a)) {
                if (p.hasNextMediaItem()) p.seekToNextMediaItem();
            } else {
                if (p.getCurrentPosition() > 3000 || !p.hasPreviousMediaItem()) p.seekTo(0);
                else p.seekToPreviousMediaItem();
            }
        });
    }

    private static PendingIntent broadcast(Context ctx, String action, int code) {
        Intent i = new Intent(ctx, AuroreWidget.class).setAction(action);
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static Bitmap cover(Context ctx, Uri art) {
        if (art == null) return null;
        String key = art.getLastPathSegment();
        if (key == null) return null;
        if (key.equals(lastArt)) return lastBitmap;
        Bitmap b = null;
        try {
            File f = ArtProvider.file(ctx, key);
            if (f.exists()) {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(f.getPath(), o);
                int s = 1;
                while (Math.max(o.outWidth, o.outHeight) / (s * 2) >= 192) s *= 2;
                o = new BitmapFactory.Options();
                o.inSampleSize = s;
                b = BitmapFactory.decodeFile(f.getPath(), o);
            }
        } catch (Exception ignored) {
            b = null;
        }
        if (b != null) {
            lastArt = key;
            lastBitmap = b;
        }
        return b;
    }

    /** redessine tous les widgets d'après le lecteur (appelé à chaque changement) */
    static void refresh(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, AuroreWidget.class));
            if (ids == null || ids.length == 0) return;
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_aurore);
            AuroreService s = AuroreService.instance;
            ExoPlayer p = s != null ? s.player : null;
            MediaItem m = p != null ? p.getCurrentMediaItem() : null;
            Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            PendingIntent openApp = open == null ? null : PendingIntent.getActivity(ctx, 7, open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            if (openApp != null) v.setOnClickPendingIntent(R.id.w_root, openApp);
            if (m == null) {
                v.setTextViewText(R.id.w_title, "aurore");
                v.setTextViewText(R.id.w_artist, "Touche pour lancer ta musique");
                v.setImageViewResource(R.id.w_play, R.drawable.ic_w_play);
                v.setImageViewResource(R.id.w_cover, R.drawable.ic_aurore_note);
                // lecteur arrêté : les boutons ouvrent l'app
                if (openApp != null) {
                    v.setOnClickPendingIntent(R.id.w_play, openApp);
                    v.setOnClickPendingIntent(R.id.w_next, openApp);
                    v.setOnClickPendingIntent(R.id.w_prev, openApp);
                }
            } else {
                MediaMetadata md = m.mediaMetadata;
                v.setTextViewText(R.id.w_title, md.title != null ? md.title : "aurore");
                v.setTextViewText(R.id.w_artist, md.artist != null ? md.artist : "");
                boolean playing = p.getPlayWhenReady() && p.getPlaybackState() != androidx.media3.common.Player.STATE_ENDED && p.getPlaybackState() != androidx.media3.common.Player.STATE_IDLE;
                v.setImageViewResource(R.id.w_play, playing ? R.drawable.ic_w_pause : R.drawable.ic_w_play);
                v.setContentDescription(R.id.w_play, playing ? "Pause" : "Lecture");
                Bitmap b = cover(ctx, md.artworkUri);
                if (b != null) v.setImageViewBitmap(R.id.w_cover, b);
                else v.setImageViewResource(R.id.w_cover, R.drawable.ic_aurore_note);
                v.setOnClickPendingIntent(R.id.w_play, broadcast(ctx, ACT_TOGGLE, 1));
                v.setOnClickPendingIntent(R.id.w_next, broadcast(ctx, ACT_NEXT, 2));
                v.setOnClickPendingIntent(R.id.w_prev, broadcast(ctx, ACT_PREV, 3));
            }
            mgr.updateAppWidget(ids, v);
        } catch (Exception ignored) {
            // pas de widget à mettre à jour
        }
    }
}
