package me.lyrics.verso;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Son activation (Réglages Android → Accès aux notifications) autorise Verso à lire le titre
 * en cours de lecture dans les autres applications (Spotify, YouTube Music…). Quand un nouveau
 * titre démarre, Verso affiche une notification indiquant si ses paroles existent.
 * Verso ne lit ni ne conserve aucune notification des autres applications.
 */
public class NowPlayingService extends NotificationListenerService {
    static final String CHANNEL = "now_playing";
    static final int NOTIF_ID = 1001;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<MediaController> watched = new ArrayList<>();
    private MediaSessionManager msm;
    private String lastKey = "";

    private final MediaController.Callback callback = new MediaController.Callback() {
        @Override public void onMetadataChanged(MediaMetadata md) { check(); }
        @Override public void onPlaybackStateChanged(PlaybackState st) { check(); }
    };

    private final MediaSessionManager.OnActiveSessionsChangedListener sessions = list -> rewatch(list);

    @Override
    public void onListenerConnected() {
        try {
            msm = (MediaSessionManager) getSystemService(MEDIA_SESSION_SERVICE);
            ComponentName me = new ComponentName(this, NowPlayingService.class);
            msm.addOnActiveSessionsChangedListener(sessions, me, main);
            rewatch(msm.getActiveSessions(me));
        } catch (SecurityException ignored) { }
    }

    /** Appelé quand on quitte Verso : notifie le titre en cours s'il ne l'a pas encore été. */
    static NowPlayingService instance;
    static void recheck() { NowPlayingService s = instance; if (s != null) s.main.post(s::check); }

    @Override
    public void onCreate() { super.onCreate(); instance = this; }

    @Override
    public void onDestroy() { instance = null; super.onDestroy(); }

    @Override
    public void onListenerDisconnected() {
        if (msm != null) msm.removeOnActiveSessionsChangedListener(sessions);
        for (MediaController c : watched) c.unregisterCallback(callback);
        watched.clear();
    }

    private void rewatch(List<MediaController> list) {
        for (MediaController c : watched) c.unregisterCallback(callback);
        watched.clear();
        if (list != null) for (MediaController c : list) { c.registerCallback(callback, main); watched.add(c); }
        check();
    }

    private void check() {
        MediaController playing = null;
        for (MediaController c : watched) {
            PlaybackState st = c.getPlaybackState();
            if (c.getMetadata() != null && st != null && st.getState() == PlaybackState.STATE_PLAYING) { playing = c; break; }
        }
        if (playing == null) return;
        MediaMetadata md = playing.getMetadata();
        String title = md.getString(MediaMetadata.METADATA_KEY_TITLE);
        String artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
        if (artist == null) artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
        if (title == null || title.trim().isEmpty()) return;
        String key = title + "|" + artist;
        if (key.equals(lastKey)) return;
        // Verso à l'écran : titre déjà affiché sur l'accueil ; on ne le marque pas comme
        // notifié pour que la notification parte dès que l'on quitte l'application.
        if (MainActivity.visible) return;
        lastKey = key;
        String app = playing.getPackageName();
        try { app = getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(app, 0)).toString(); } catch (PackageManager.NameNotFoundException ignored) { }
        final String t = title, a = artist == null ? "" : artist, src = app;
        new Thread(() -> {
            Boolean has = hasLyrics(t, a);
            main.post(() -> { if (key.equals(lastKey)) notify(t, a, src, has); });
        }).start();
    }

    /** Recherche sur LRCLIB : true/false, ou null sans connexion. */
    private Boolean hasLyrics(String title, String artist) {
        String main = artist.split(",|&| feat\\.? | ft\\.? ")[0].trim();
        HttpURLConnection c = null;
        try {
            URL u = new URL("https://lrclib.net/api/search?track_name=" + Uri.encode(title) + "&artist_name=" + Uri.encode(main));
            c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(8000); c.setReadTimeout(8000);
            c.setRequestProperty("User-Agent", "Verso/1.9 (application personnelle)");
            if (c.getResponseCode() != 200) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                String l; while ((l = r.readLine()) != null) sb.append(l);
            }
            JSONArray arr = new JSONArray(sb.toString());
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (!o.optBoolean("instrumental") && !o.optString("plainLyrics", "").trim().isEmpty() && !o.isNull("plainLyrics")) return true;
            }
            return false;
        } catch (Exception e) {
            return null;
        } finally { if (c != null) c.disconnect(); }
    }

    private void notify(String title, String artist, String app, Boolean has) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Musique détectée", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Le titre que vous écoutez et ses paroles");
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_NOW_PLAYING, true);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String what = has == null ? "Touchez pour voir les paroles" : has ? "Paroles disponibles · touchez pour les lire" : "(paroles manquantes) · touchez pour les ajouter";
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_notif)
            .setContentTitle(title + (artist.isEmpty() ? "" : " · " + artist))
            .setContentText(what)
            .setSubText("En écoute sur " + app)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_RECOMMENDATION);
        try { nm.notify(NOTIF_ID, b.build()); } catch (SecurityException ignored) { }
    }
}
