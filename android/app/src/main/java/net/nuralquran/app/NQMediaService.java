package net.nuralquran.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.List;

/**
 * Media-playback foreground service + MediaSession for the WebView's audio (Mushaf
 * recitation, radio). The audio itself keeps playing inside the WebView; this service
 * (a) keeps the process in the foreground while something plays, so Android does not
 * freeze or kill it with the screen off, and (b) publishes a MediaSession and a
 * MediaStyle notification, which Android shows in the shade, on the lock screen and
 * routes headset / Bluetooth buttons to. Every control goes back to the page through
 * NQNativePlugin → 'mediaAction' → navigator.mediaSession handlers.
 *
 * Framework APIs only (android.media.session, Notification.MediaStyle): no extra
 * dependencies.
 */
public class NQMediaService extends Service {

    static final class State {
        String title = "";
        String artist = "";
        String album = "";
        boolean playing = false;
        long durationMs = -1;
        long positionMs = -1;
        float rate = 1f;
        List<String> actions = new ArrayList<>();
    }

    private static final String CHANNEL_ID = "media_playback_v1";
    private static final int NOTIFICATION_ID = 7301;
    private static final String ACTION = "net.nuralquran.app.MEDIA_ACTION";
    private static final String EXTRA_ACTION = "action";

    private static NQMediaService running;
    private static State pending;

    private MediaSession session;
    private State state = new State();
    private boolean foreground = false;
    private Bitmap art;

    // ── called by the plugin ────────────────────────────────────────────────
    static void update(Context ctx, State s) {
        NQMediaService svc = running;
        if (svc != null) {
            svc.apply(s);
            return;
        }
        if (!s.playing) return;          // nothing to show until something plays
        pending = s;
        Intent intent = new Intent(ctx, NQMediaService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent);
        else ctx.startService(intent);
    }

    static void clear(Context ctx) {
        NQMediaService svc = running;
        pending = null;
        if (svc != null) svc.shutdown();
    }

    // ── service lifecycle ───────────────────────────────────────────────────
    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        createChannel();
        session = new MediaSession(this, "NurAlQuran");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { NQNativePlugin.dispatchMediaAction("play", -1); }
            @Override public void onPause() { NQNativePlugin.dispatchMediaAction("pause", -1); }
            @Override public void onStop() { NQNativePlugin.dispatchMediaAction("stop", -1); }
            @Override public void onSkipToNext() { NQNativePlugin.dispatchMediaAction("nexttrack", -1); }
            @Override public void onSkipToPrevious() { NQNativePlugin.dispatchMediaAction("previoustrack", -1); }
            @Override public void onFastForward() { NQNativePlugin.dispatchMediaAction("seekforward", -1); }
            @Override public void onRewind() { NQNativePlugin.dispatchMediaAction("seekbackward", -1); }
            @Override public void onSeekTo(long pos) { NQNativePlugin.dispatchMediaAction("seekto", pos); }
        });
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            session.setSessionActivity(PendingIntent.getActivity(this, 1, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        try { art = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher); } catch (Exception ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION.equals(intent.getAction())) {
            String a = intent.getStringExtra(EXTRA_ACTION);
            if (a != null) NQNativePlugin.dispatchMediaAction(a, -1);
            // "play" arrives through startForegroundService (see actionIntent): honour its contract
            if (!foreground && "play".equals(a)) promote();
            return START_NOT_STICKY;
        }
        State s = pending != null ? pending : state;
        pending = null;
        apply(s);
        if (!foreground) promote();
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // The app was swiped away: the WebView (and its audio) is gone too.
        shutdown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (running == this) running = null;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIFICATION_ID);   // no orphaned controls once the service is gone
        if (session != null) { session.setActive(false); session.release(); session = null; }
        super.onDestroy();
    }

    // ── state → session + notification ──────────────────────────────────────
    private void apply(State s) {
        state = s;
        if (session == null) return;
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, s.title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, s.artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, s.album);
        if (s.durationMs > 0) meta.putLong(MediaMetadata.METADATA_KEY_DURATION, s.durationMs);
        if (art != null) meta.putBitmap(MediaMetadata.METADATA_KEY_ART, art);
        session.setMetadata(meta.build());

        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP;
        if (s.actions.contains("nexttrack")) actions |= PlaybackState.ACTION_SKIP_TO_NEXT;
        if (s.actions.contains("previoustrack")) actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        if (s.actions.contains("seekforward")) actions |= PlaybackState.ACTION_FAST_FORWARD;
        if (s.actions.contains("seekbackward")) actions |= PlaybackState.ACTION_REWIND;
        if (s.actions.contains("seekto") && s.durationMs > 0) actions |= PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(actions)
            .setState(s.playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                s.positionMs >= 0 ? s.positionMs : PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                s.playing ? s.rate : 0f, SystemClock.elapsedRealtime())
            .build());
        session.setActive(true);

        Notification n = buildNotification(s);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (s.playing) {
            promote(n);
        } else {
            // paused: keep the controls, let the system reclaim the process if it must
            if (foreground) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_DETACH);
                else stopForeground(false);
                foreground = false;
            }
            if (nm != null) nm.notify(NOTIFICATION_ID, n);
        }
    }

    private void promote() { promote(buildNotification(state)); }

    private void promote(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            foreground = true;
        } catch (Exception e) {
            // Android 12+: not allowed from the background — show the controls anyway
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, n);
        }
    }

    private void shutdown() {
        if (session != null) session.setActive(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        foreground = false;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIFICATION_ID);
        stopSelf();
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent i = new Intent(this, NQMediaService.class).setAction(ACTION).putExtra(EXTRA_ACTION, action);
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        // Resuming may have to bring the (stopped, paused) service back from the background.
        if ("play".equals(action) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return PendingIntent.getForegroundService(this, requestCode, i, flags);
        }
        return PendingIntent.getService(this, requestCode, i, flags);
    }

    private Notification buildNotification(State s) {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_nq)
            .setContentTitle(s.title)
            .setContentText(s.artist)
            .setSubText(s.album)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(s.playing)
            .setDeleteIntent(actionIntent("stop", 10));
        if (art != null) b.setLargeIcon(art);
        if (session != null && session.getController().getSessionActivity() != null) {
            b.setContentIntent(session.getController().getSessionActivity());
        }
        List<Integer> compact = new ArrayList<>();
        int idx = 0;
        if (s.actions.contains("previoustrack")) {
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, getString(R.string.media_previous), actionIntent("previoustrack", 11)).build());
            compact.add(idx++);
        }
        if (s.playing) {
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause, getString(R.string.media_pause), actionIntent("pause", 12)).build());
        } else {
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_play, getString(R.string.media_play), actionIntent("play", 13)).build());
        }
        compact.add(idx++);
        if (s.actions.contains("nexttrack")) {
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, getString(R.string.media_next), actionIntent("nexttrack", 14)).build());
            compact.add(idx++);
        }
        int[] compactArr = new int[compact.size()];
        for (int i = 0; i < compactArr.length; i++) compactArr[i] = compact.get(i);
        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(compactArr);
        if (session != null) style.setMediaSession(session.getSessionToken());
        b.setStyle(style);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return b.build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, getString(R.string.media_channel_name), NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(getString(R.string.media_channel_description));
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
}
