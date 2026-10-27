package io.github.pazuluda.aurore;

import android.media.AudioFormat;
import android.media.AudioTrack;
import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.audio.TeeAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/**
 * Reçoit le son décodé juste avant qu'il parte vers le haut-parleur et en garde la dernière seconde
 * (en mono), pour que les visualiseurs d'aurore bougent avec la musique. Aucun micro, aucune autorisation.
 */
@OptIn(markerClass = UnstableApi.class)
final class VizTap implements TeeAudioProcessor.AudioBufferSink {

    private static final int RING = 1 << 18;
    private final float[] ring = new float[RING];
    private long written;
    private int rate = 44100;
    private int channels = 2;
    private int encoding = C.ENCODING_PCM_16BIT;
    /** avance du son décodé sur ce qu'on entend (tampon de la sortie audio) */
    private int lead = 44100 / 4;
    private volatile boolean active;

    synchronized void setActive(boolean on) {
        if (on && !active) {
            Arrays.fill(ring, 0f);
            written = 0;
        }
        active = on;
    }

    @Override
    public synchronized void flush(int sampleRateHz, int channelCount, int pcmEncoding) {
        rate = sampleRateHz > 0 ? sampleRateHz : 44100;
        channels = Math.max(1, channelCount);
        encoding = pcmEncoding;
        lead = estimateLead();
        Arrays.fill(ring, 0f);
        written = 0;
    }

    /** même calcul que le lecteur (4 fois le tampon minimal, entre 250 et 750 ms) + un peu pour le système */
    private int estimateLead() {
        int frames;
        try {
            int cfg = channels == 1 ? AudioFormat.CHANNEL_OUT_MONO : AudioFormat.CHANNEL_OUT_STEREO;
            int min = AudioTrack.getMinBufferSize(rate, cfg, AudioFormat.ENCODING_PCM_16BIT);
            frames = min > 0 ? (min / (2 * Math.min(channels, 2))) * 4 : rate / 4;
        } catch (Exception e) {
            frames = rate / 4;
        }
        frames = Math.max(rate / 4, Math.min(frames, rate * 3 / 4));
        return Math.min(frames + rate / 40, RING - 8192);
    }

    @Override
    public void handleBuffer(ByteBuffer buffer) {
        if (!active) return;
        ByteBuffer b = buffer.duplicate().order(ByteOrder.nativeOrder());
        int start = b.position(), end = b.limit();
        synchronized (this) {
            int ch = channels;
            if (encoding == C.ENCODING_PCM_16BIT) {
                int fb = 2 * ch;
                float k = 1f / (32768f * ch);
                for (int i = start; i + fb <= end; i += fb) {
                    float s = 0;
                    for (int c = 0; c < ch; c++) s += b.getShort(i + 2 * c);
                    ring[(int) (written++ & (RING - 1))] = s * k;
                }
            } else if (encoding == C.ENCODING_PCM_FLOAT) {
                int fb = 4 * ch;
                float k = 1f / ch;
                for (int i = start; i + fb <= end; i += fb) {
                    float s = 0;
                    for (int c = 0; c < ch; c++) s += b.getFloat(i + 4 * c);
                    ring[(int) (written++ & (RING - 1))] = s * k;
                }
            }
        }
    }

    /** Copie les derniers échantillons entendus dans out ; renvoie la fréquence d'échantillonnage, ou 0 s'il n'y a rien. */
    synchronized int snapshot(float[] out) {
        long end = written - lead;
        if (end < out.length) return 0;
        long from = end - out.length;
        for (int i = 0; i < out.length; i++) out[i] = ring[(int) ((from + i) & (RING - 1))];
        return rate;
    }
}
