package io.github.pazuluda.aurore;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuroreMusicPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
