package io.github.pazuluda.aurore;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.audio.TeeAudioProcessor;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/**
 * aurore : la lecture se fait ici, dans un service Android (comme les autres lecteurs de musique).
 * La musique continue quand on quitte l'app, écran éteint ou verrouillé, avec la notification
 * et les commandes de l'écran verrouillé, du casque et de la montre. Pause automatique pendant
 * un appel ou quand on débranche le casque.
 */
@OptIn(markerClass = UnstableApi.class)
public class AuroreService extends MediaSessionService {

    /** Copie du son décodé, pour animer les visualiseurs de l'app. */
    static final VizTap TAP = new VizTap();

    static AuroreService instance;

    ExoPlayer player;
    private MediaSession session;

    @Override
    public void onCreate() {
        super.onCreate();
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this) {
            @Override
            protected AudioSink buildAudioSink(Context context, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                return new DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(enableFloatOutput)
                    .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                    .setAudioProcessors(new AudioProcessor[] { new TeeAudioProcessor(TAP) })
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

        MediaSession.Builder b = new MediaSession.Builder(this, player);
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
    }

    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
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
    }
}
