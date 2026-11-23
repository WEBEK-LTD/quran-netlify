package net.nuralquran.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.View;
import android.view.ViewParent;
import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * The app's own small plugin (JS: src/native/nqNative.js).
 *  - setBackgroundColor: window + WebView-parent colour (seen behind the system bars
 *    on WebViews that Capacitor pads instead of drawing edge-to-edge).
 *  - openChannelSettings: the system screen where the user may let the adhan channel
 *    override Do Not Disturb (an app cannot do that itself without policy access).
 *  - mediaUpdate / mediaClear: mirror the page's Media Session into a native one and
 *    keep a media-playback foreground service while the Mushaf recitation or the
 *    radio plays, so playback survives a locked screen and the controls show on the
 *    lock screen, in the notification shade and on Bluetooth devices.
 */
@CapacitorPlugin(name = "NQNative")
public class NQNativePlugin extends Plugin {

    private static NQNativePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        NQMediaService.clear(getContext());
    }

    /** Called by NQMediaService when a control is used (notification, lock screen, headset). */
    static void dispatchMediaAction(String action, long seekToMs) {
        NQNativePlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        if (seekToMs >= 0) data.put("seekTime", seekToMs);
        p.notifyListeners("mediaAction", data);
    }

    @PluginMethod
    public void setBackgroundColor(PluginCall call) {
        String value = call.getString("color", "#060D0A");
        final int color;
        try {
            color = Color.parseColor(value);
        } catch (IllegalArgumentException e) {
            call.reject("Invalid color");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            try {
                getActivity().getWindow().getDecorView().setBackgroundColor(color);
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    webView.setBackgroundColor(color);
                    ViewParent parent = webView.getParent();
                    if (parent instanceof View) ((View) parent).setBackgroundColor(color);
                }
            } catch (Exception ignored) {}
            call.resolve();
        });
    }

    @PluginMethod
    public void openChannelSettings(PluginCall call) {
        String channelId = call.getString("channelId");
        String pkg = getContext().getPackageName();
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && channelId != null && !channelId.isEmpty()) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                .putExtra(Settings.EXTRA_CHANNEL_ID, channelId);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { getContext().startActivity(fallback); } catch (Exception ignored) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void mediaUpdate(PluginCall call) {
        NQMediaService.State s = new NQMediaService.State();
        s.title = call.getString("title", "");
        s.artist = call.getString("artist", "");
        s.album = call.getString("album", "");
        s.playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        Double duration = call.getDouble("duration", -1.0);
        Double position = call.getDouble("position", -1.0);
        Double rate = call.getDouble("rate", 1.0);
        s.durationMs = duration == null ? -1 : duration.longValue();
        s.positionMs = position == null ? -1 : position.longValue();
        s.rate = rate == null ? 1f : rate.floatValue();
        List<String> actions = new ArrayList<>();
        JSArray arr = call.getArray("actions", new JSArray());
        for (int i = 0; i < arr.length(); i++) {
            try { actions.add(arr.getString(i)); } catch (JSONException ignored) {}
        }
        s.actions = actions;
        try {
            NQMediaService.update(getContext(), s);
            call.resolve();
        } catch (Exception e) {
            // e.g. ForegroundServiceStartNotAllowedException when asked to start from the background
            call.reject("media service not started: " + e.getMessage());
        }
    }

    @PluginMethod
    public void mediaClear(PluginCall call) {
        NQMediaService.clear(getContext());
        call.resolve();
    }
}
