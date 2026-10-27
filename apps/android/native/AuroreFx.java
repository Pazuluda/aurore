package io.github.pazuluda.aurore;

import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.util.UnstableApi;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Égaliseur 6 bandes + volume égalisé, appliqués au son avant qu'il parte vers le haut-parleur.
 * Mêmes réglages et mêmes formules (RBJ) que la version ordinateur de l'app.
 */
@OptIn(markerClass = UnstableApi.class)
final class AuroreFx extends BaseAudioProcessor {

    static final double[] FREQS = { 60, 170, 600, 1500, 4000, 11000 };

    static volatile float[] eqDb = new float[6];
    static volatile boolean eqOn = false;
    static volatile boolean normOn = true;
    static volatile float preampDb = 0f;
    static volatile float trackDb = 0f;
    static volatile int version = 0;

    static void setEq(float[] db, boolean on, float preamp, boolean norm) {
        eqDb = db.clone();
        eqOn = on;
        preampDb = preamp;
        normOn = norm;
        version++;
    }

    static void setTrack(float db) {
        trackDb = db;
        version++;
    }

    private int seen = -1;
    private int channels = 2, encoding = C.ENCODING_PCM_16BIT, rate = 44100;
    private double[][] coef = new double[0][];
    private double[][] st = new double[0][];
    private double gain = 1, target = 1;

    @Override
    protected AudioFormat onConfigure(AudioFormat in) throws UnhandledAudioFormatException {
        if (in.encoding != C.ENCODING_PCM_16BIT && in.encoding != C.ENCODING_PCM_FLOAT) return AudioFormat.NOT_SET;
        channels = Math.max(1, in.channelCount);
        encoding = in.encoding;
        rate = in.sampleRate > 0 ? in.sampleRate : 44100;
        seen = -1;
        return in;
    }

    private void update() {
        seen = version;
        float[] db = eqDb;
        boolean on = eqOn;
        java.util.List<double[]> cs = new java.util.ArrayList<>();
        if (on) for (int b = 0; b < FREQS.length; b++) {
            double[] c = biquad(b, FREQS[b], db.length > b ? db[b] : 0, rate);
            if (c != null) cs.add(c);
        }
        double[][] next = cs.toArray(new double[0][]);
        if (st.length != next.length * channels) st = new double[next.length * channels][4];
        coef = next;
        float total = (on ? preampDb : 0) + (normOn ? trackDb : 0);
        target = Math.pow(10, total / 20.0);
    }

    static double[] biquad(int b, double f0, double db, int sr) {
        if (db == 0 || f0 >= sr * 0.45) return null;
        double A = Math.pow(10, db / 40), w = 2 * Math.PI * f0 / sr, cs = Math.cos(w), sn = Math.sin(w);
        double b0, b1, b2, a0, a1, a2;
        if (b == 0 || b == FREQS.length - 1) {
            double al = sn / 2 * Math.sqrt(2), sq = 2 * Math.sqrt(A) * al;
            if (b == 0) {
                b0 = A * ((A + 1) - (A - 1) * cs + sq); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - sq);
                a0 = (A + 1) + (A - 1) * cs + sq; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - sq;
            } else {
                b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq);
                a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq;
            }
        } else {
            double al = sn / (2 * 1.1);
            b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
        }
        return new double[] { b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0 };
    }

    /** au-delà de ±0,9, la courbe s'arrondit au lieu de saturer */
    private static double soft(double x) {
        double a = Math.abs(x);
        if (a <= 0.9) return x;
        double y = 0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1);
        return x < 0 ? -y : y;
    }

    @Override
    public void queueInput(ByteBuffer input) {
        int rem = input.remaining();
        if (rem == 0) return;
        if (seen != version) update();
        ByteBuffer in = input.duplicate().order(ByteOrder.nativeOrder());
        ByteBuffer out = replaceOutputBuffer(rem);
        out.order(ByteOrder.nativeOrder());
        boolean pass = coef.length == 0 && Math.abs(target - 1) < 1e-4 && Math.abs(gain - 1) < 1e-4;
        if (pass) {
            out.put(input);
            out.flip();
            return;
        }
        int bps = encoding == C.ENCODING_PCM_FLOAT ? 4 : 2, frame = bps * channels;
        int frames = rem / frame;
        double step = (target - gain) / Math.max(1, frames);
        int pos = in.position();
        for (int f = 0; f < frames; f++) {
            gain += step;
            for (int c = 0; c < channels; c++) {
                int at = pos + f * frame + c * bps;
                double x = bps == 2 ? in.getShort(at) / 32768.0 : in.getFloat(at);
                for (int k = 0; k < coef.length; k++) {
                    double[] q = coef[k], s = st[k * channels + c];
                    double y = q[0] * x + q[1] * s[0] + q[2] * s[1] - q[3] * s[2] - q[4] * s[3];
                    s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y;
                    x = y;
                }
                x = soft(x * gain);
                if (bps == 2) out.putShort((short) Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
                else out.putFloat((float) x);
            }
        }
        gain = target;
        input.position(input.limit());
        out.flip();
    }

    @Override
    protected void onFlush() {
        for (double[] s : st) java.util.Arrays.fill(s, 0);
        gain = target;
    }

    @Override
    protected void onReset() {
        st = new double[0][];
        coef = new double[0][];
        seen = -1;
        gain = 1;
        target = 1;
    }
}
