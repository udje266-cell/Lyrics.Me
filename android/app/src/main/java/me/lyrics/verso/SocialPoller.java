package me.lyrics.verso;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/**
 * Notifications des comptes Verso (demandes d'ami, messages, amitiés acceptées) quand
 * l'application n'est pas à l'écran. Sans serveur payant : Verso interroge lui-même
 * Firestore (API REST, mêmes règles de sécurité) avec le jeton de l'utilisateur connecté,
 * toutes les 15 minutes (planificateur Android) et plus souvent quand le service de
 * détection musicale est actif.
 */
final class SocialPoller {
    static final String CHANNEL = "social";
    private static final String API_KEY = "AIzaSyBAwAt4yDkWGv8M9kBrtmZvjqEBewV3GoE";
    private static final String DOCS = "https://firestore.googleapis.com/v1/projects/verso-a040a/databases/(default)/documents";
    private static final int JOB_ID = 4242;
    private static final Object LOCK = new Object();

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("social", Context.MODE_PRIVATE); }

    /** Appelé par l'application web à la connexion (uid + jeton) ou à la déconnexion (vides). */
    static void setSession(Context c, String uid, String refreshToken) {
        SharedPreferences p = prefs(c);
        if (uid == null || uid.isEmpty()) {
            p.edit().clear().apply();
            ((JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(JOB_ID);
            return;
        }
        SharedPreferences.Editor e = p.edit();
        if (!uid.equals(p.getString("uid", ""))) e.clear();
        e.putString("uid", uid).putString("refresh", refreshToken).apply();
        schedule(c);
    }

    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js.getPendingJob(JOB_ID) != null) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, SocialJobService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000L)
            .setPersisted(true)
            .build());
    }

    /** Vérifie les nouveautés (hors du fil principal). */
    static void poll(Context c) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            String uid = p.getString("uid", "");
            if (uid.isEmpty()) return;
            try {
                String token = idToken(c, p);
                if (token == null) return;
                boolean first = !p.getBoolean("init", false);
                boolean quiet = MainActivity.visible; // l'application affiche déjà ses propres alertes
                SharedPreferences.Editor e = p.edit();

                // Demandes d'ami reçues
                Set<String> seen = new HashSet<>(p.getStringSet("reqs", new HashSet<>()));
                Set<String> now = new HashSet<>();
                for (JSONObject d : query(token, "friendRequests", "to", "EQUAL", uid)) {
                    String id = d.getString("name"); id = id.substring(id.lastIndexOf('/') + 1);
                    now.add(id);
                    if (!first && !quiet && !seen.contains(id)) {
                        String from = str(d, "from");
                        notify(c, id.hashCode(), "Nouvelle demande d'ami", "@" + handle(token, from) + " veut vous ajouter en ami", "#/amis");
                    }
                }
                e.putStringSet("reqs", now);

                // Amitiés et derniers messages
                Set<String> pairs = new HashSet<>(p.getStringSet("pairs", new HashSet<>()));
                Set<String> nowPairs = new HashSet<>();
                for (JSONObject d : query(token, "friendships", "members", "ARRAY_CONTAINS", uid)) {
                    String id = d.getString("name"); id = id.substring(id.lastIndexOf('/') + 1);
                    nowPairs.add(id);
                    String other = id.startsWith(uid + "_") ? id.substring(uid.length() + 1) : id.substring(0, id.length() - uid.length() - 1);
                    if (!first && !quiet && !pairs.contains(id) && !seen.contains(other + "_" + uid)) {
                        // Nouvelle amitié qui ne vient pas d'une demande reçue : l'autre a accepté la nôtre.
                        notify(c, ("f" + id).hashCode(), "Demande acceptée", "@" + handle(token, other) + " a accepté votre demande d'ami", "#/u/" + other);
                    }
                    String lastAt = ts(d, "lastAt");
                    String key = "at_" + id;
                    if (lastAt != null && !lastAt.equals(p.getString(key, ""))) {
                        if (!first && !quiet && !uid.equals(str(d, "lastFrom")))
                            notify(c, ("m" + id).hashCode(), "@" + handle(token, other), str(d, "lastText"), "#/discussion/" + id);
                        e.putString(key, lastAt);
                    }
                }
                e.putStringSet("pairs", nowPairs).putBoolean("init", true).apply();
            } catch (Exception ignored) { }
        }
    }

    // --- Firestore REST ---------------------------------------------------------

    private static String idToken(Context c, SharedPreferences p) throws Exception {
        String refresh = p.getString("refresh", "");
        if (refresh.isEmpty()) return null;
        HttpURLConnection h = open("https://securetoken.googleapis.com/v1/token?key=" + API_KEY, "POST");
        h.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        write(h, "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8"));
        int code = h.getResponseCode();
        if (code == 400) { p.edit().remove("refresh").apply(); return null; } // compte supprimé ou jeton révoqué
        if (code != 200) return null;
        JSONObject r = new JSONObject(read(h));
        String nr = r.optString("refresh_token", "");
        if (!nr.isEmpty() && !nr.equals(refresh)) p.edit().putString("refresh", nr).apply();
        return r.getString("id_token");
    }

    private static JSONObject[] query(String token, String coll, String field, String op, String value) throws Exception {
        JSONObject q = new JSONObject().put("structuredQuery", new JSONObject()
            .put("from", new JSONArray().put(new JSONObject().put("collectionId", coll)))
            .put("where", new JSONObject().put("fieldFilter", new JSONObject()
                .put("field", new JSONObject().put("fieldPath", field)).put("op", op)
                .put("value", new JSONObject().put("stringValue", value)))));
        HttpURLConnection h = open(DOCS + ":runQuery", "POST");
        h.setRequestProperty("Authorization", "Bearer " + token);
        h.setRequestProperty("Content-Type", "application/json");
        write(h, q.toString());
        if (h.getResponseCode() != 200) throw new Exception("HTTP " + h.getResponseCode());
        JSONArray arr = new JSONArray(read(h));
        java.util.List<JSONObject> out = new java.util.ArrayList<>();
        for (int i = 0; i < arr.length(); i++) { JSONObject o = arr.getJSONObject(i).optJSONObject("document"); if (o != null) out.add(o); }
        return out.toArray(new JSONObject[0]);
    }

    private static String handle(String token, String uid) {
        try {
            HttpURLConnection h = open(DOCS + "/profiles/" + uid, "GET");
            h.setRequestProperty("Authorization", "Bearer " + token);
            if (h.getResponseCode() == 200) { String v = str(new JSONObject(read(h)), "handle"); if (!v.isEmpty()) return v; }
        } catch (Exception ignored) { }
        return "un utilisateur";
    }

    private static String str(JSONObject doc, String f) {
        JSONObject v = doc.optJSONObject("fields") == null ? null : doc.optJSONObject("fields").optJSONObject(f);
        return v == null ? "" : v.optString("stringValue", "");
    }
    private static String ts(JSONObject doc, String f) {
        JSONObject v = doc.optJSONObject("fields") == null ? null : doc.optJSONObject("fields").optJSONObject(f);
        return v == null ? null : v.optString("timestampValue", null);
    }

    private static HttpURLConnection open(String url, String method) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setRequestMethod(method); h.setConnectTimeout(10000); h.setReadTimeout(15000);
        if ("POST".equals(method)) h.setDoOutput(true);
        return h;
    }
    private static void write(HttpURLConnection h, String body) throws Exception {
        try (OutputStream o = h.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
    }
    private static String read(HttpURLConnection h) throws Exception {
        try (InputStream in = h.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } finally { h.disconnect(); }
    }

    // --- Notification -------------------------------------------------------------

    private static void notify(Context c, int id, String title, String text, String route) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Amis et messages", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Demandes d'ami et messages de vos amis");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(c, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_ROUTE, route);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_notif).setContentTitle(title).setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setContentIntent(pi).setAutoCancel(true).setCategory(Notification.CATEGORY_MESSAGE);
        try { nm.notify(id, b.build()); } catch (SecurityException ignored) { }
    }
}
