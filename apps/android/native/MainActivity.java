package io.github.pazuluda.aurore;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuroreMusicPlugin.class);
        super.onCreate(savedInstanceState);
        // Retour : referme d'abord ce qui est ouvert dans aurore, puis passe l'app en arrière-plan
        // au lieu de la fermer (la musique continue, comme dans les autres lecteurs).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = bridge != null ? bridge.getWebView() : null;
                if (wv != null && wv.canGoBack()) wv.goBack();
                else moveTaskToBack(true);
            }
        });
    }
}
