package me.lyrics.verso;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Iterator;

/**
 * Mise à jour de l'application web sans réinstaller l'APK.
 * Les fichiers publiés sur GitHub Pages (version.json + fichiers listés) sont téléchargés
 * en arrière-plan dans un dossier complet, vérifiés (empreinte SHA-256), puis utilisés au
 * lancement suivant. L'adresse reste https://verso.local : les données ne changent pas.
 * Sans connexion ou en cas d'erreur, Verso garde la version en place (ou celle de l'APK).
 */
final class WebUpdater {
    static final String REMOTE = "https://udje266-cell.github.io/Lyrics.Me/";
    private static final String PREFS = "webUpdate";

    private final Context ctx;
    private final SharedPreferences prefs;
    /** Dossier de la version active (null : fichiers de l'APK). */
    private File active;

    WebUpdater(Context ctx) {
        this.ctx = ctx;
        prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int build = prefs.getInt("build", 0);
        File dir = new File(ctx.getFilesDir(), "web/" + build);
        // Une version téléchargée n'est utilisée que si elle est plus récente que celle de l'APK.
        active = build > bundledBuild() && new File(dir, "index.html").exists() ? dir : null;
    }

    int activeBuild() { return active != null ? prefs.getInt("build", 0) : bundledBuild(); }

    /** Fichier de l'application web : version téléchargée, sinon celle de l'APK. */
    InputStream open(String path) throws IOException {
        if (active != null) {
            File f = new File(active, path);
            if (f.getCanonicalPath().startsWith(active.getCanonicalPath()) && f.isFile()) return new FileInputStream(f);
        }
        return ctx.getAssets().open("www/" + path);
    }

    private int bundledBuild() {
        try (InputStream in = ctx.getAssets().open("www/version.json")) {
            return new JSONObject(new String(readAll(in), StandardCharsets.UTF_8)).optInt("build", 0);
        } catch (Exception e) { return 0; }
    }

    private long apkVersion() {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return android.os.Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return 0; }
    }

    /**
     * Vérifie et prépare une mise à jour (à appeler hors du fil principal).
     * Renvoie le numéro de la version prête, 0 si rien de nouveau, -1 si l'APK est trop ancien.
     */
    int check() {
        try {
            JSONObject remote = new JSONObject(new String(download("version.json?t=" + System.currentTimeMillis()), StandardCharsets.UTF_8));
            int build = remote.getInt("build");
            if (build <= activeBuild()) return 0;
            if (remote.optLong("minApk", 0) > apkVersion()) return -1;
            if (build == prefs.getInt("build", 0) && new File(ctx.getFilesDir(), "web/" + build + "/index.html").exists()) return build;

            JSONObject current = currentManifest();
            JSONObject files = remote.getJSONObject("files");
            File tmp = new File(ctx.getFilesDir(), "web/" + build + ".tmp");
            deleteTree(tmp);
            for (Iterator<String> it = files.keys(); it.hasNext(); ) {
                String path = it.next(), sum = files.getString(path);
                byte[] data = null;
                if (current != null && sum.equals(current.optString(path))) {
                    try (InputStream in = open(path)) { data = readAll(in); } catch (IOException ignored) { }
                }
                if (data == null) data = download(path + "?v=" + sum);
                if (!sha(data).startsWith(sum)) throw new IOException("Empreinte incorrecte : " + path);
                File out = new File(tmp, path);
                out.getParentFile().mkdirs();
                try (OutputStream o = new FileOutputStream(out)) { o.write(data); }
            }
            try (OutputStream o = new FileOutputStream(new File(tmp, "version.json"))) { o.write(remote.toString().getBytes(StandardCharsets.UTF_8)); }
            File dest = new File(ctx.getFilesDir(), "web/" + build);
            deleteTree(dest);
            if (!tmp.renameTo(dest)) throw new IOException("Installation impossible");
            int old = prefs.getInt("build", 0);
            prefs.edit().putInt("build", build).apply();
            // Garde la version en cours d'utilisation, supprime les plus anciennes.
            File[] all = new File(ctx.getFilesDir(), "web").listFiles();
            if (all != null) for (File f : all) {
                String n = f.getName();
                if (!n.equals(String.valueOf(build)) && !n.equals(String.valueOf(old))) deleteTree(f);
            }
            return build;
        } catch (Exception e) {
            return 0;
        }
    }

    private JSONObject currentManifest() {
        try (InputStream in = open("version.json")) {
            return new JSONObject(new String(readAll(in), StandardCharsets.UTF_8)).getJSONObject("files");
        } catch (Exception e) { return null; }
    }

    private static byte[] download(String path) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(REMOTE + path).openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(20000);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode() + " " + path);
            try (InputStream in = c.getInputStream()) { return readAll(in); }
        } finally { c.disconnect(); }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
        return b.toByteArray();
    }

    private static String sha(byte[] data) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (byte x : MessageDigest.getInstance("SHA-256").digest(data)) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }
}
