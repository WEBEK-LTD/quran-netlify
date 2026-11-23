package net.nuralquran.app;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin (system-bar colour, notification-channel settings,
        // media session + playback service) — must be registered before super.onCreate.
        registerPlugin(NQNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Edge-to-edge: the web layer pads itself with env(safe-area-inset-*)
        // (capacitor.config.json → SystemBars.insetsHandling = "native").
        EdgeToEdge.enable(this);
        // Phones: portrait. Tablets (smallest width ≥ 600dp): any orientation.
        // (Android 16 ignores orientation requests on large screens anyway.)
        if (getResources().getConfiguration().smallestScreenWidthDp < 600) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
    }
}
