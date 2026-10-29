package me.lyrics.verso;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Verso : l'application web embarquée dans l'APK, servie depuis une adresse https locale
 * (nécessaire aux modules JavaScript et à IndexedDB). Les données restent sur le téléphone.
 */
public class MainActivity extends Activity {
    private static final String HOST = "verso.local";
    private static final String BASE = "https://" + HOST + "/";
    private static final int PICK_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.parseColor("#131a11"));
        getWindow().setNavigationBarColor(Color.parseColor("#131a11"));
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " VersoAndroid/1.0");

        web.addJavascriptInterface(new Bridge(), "VersoAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null; // Deezer, LRCLIB… : réseau normal
                String path = u.getPath() == null || u.getPath().equals("/") ? "/index.html" : u.getPath();
                try {
                    InputStream in = getAssets().open("www" + path);
                    String ext = MimeTypeMap.getFileExtensionFromUrl(path);
                    String mime = mimeFor(ext);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("Cache-Control", "no-cache");
                    return new WebResourceResponse(mime, mime.startsWith("text") || mime.contains("javascript") || mime.contains("json") ? "utf-8" : null, 200, "OK", headers, in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // Liens externes (sources des paroles…) : navigateur du téléphone.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                String accept = types.length > 0 ? String.join(",", types) : "";
                i.setType(accept.contains("image") ? "image/*" : "*/*");
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "Choisir un fichier"), PICK_FILE); }
                catch (Exception e) { fileCallback = null; return false; }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(BASE + "index.html");
    }

    private static String mimeFor(String ext) {
        switch (ext == null ? "" : ext.toLowerCase()) {
            case "html": return "text/html";
            case "js": return "text/javascript";
            case "css": return "text/css";
            case "json": case "webmanifest": return "application/json";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "svg": return "image/svg+xml";
            case "woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != PICK_FILE || fileCallback == null) { super.onActivityResult(req, res, data); return; }
        Uri[] result = null;
        if (res == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int k = 0; k < n; k++) result[k] = data.getClipData().getItemAt(k).getUri();
            } else if (data.getData() != null) result = new Uri[]{data.getData()};
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /** Fonctions appelées depuis l'application web (enregistrer, partager). */
    private class Bridge {
        @JavascriptInterface
        public String saveFile(String name, String mime, String base64) {
            try {
                Uri uri = writeToMediaStore(name, mime, Base64.decode(base64, Base64.DEFAULT));
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        mime.startsWith("image") ? "Image enregistrée dans la galerie (Pictures/Verso)" : "Fichier enregistré dans Téléchargements", Toast.LENGTH_SHORT).show());
                return uri.toString();
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        @JavascriptInterface
        public String shareFile(String name, String mime, String base64) {
            try {
                Uri uri = writeToMediaStore(name, mime, Base64.decode(base64, Base64.DEFAULT));
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, "Partager la carte")));
                return "ok";
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }
    }

    private Uri writeToMediaStore(String name, String mime, byte[] bytes) throws IOException {
        boolean image = mime.startsWith("image");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, image ? Environment.DIRECTORY_PICTURES + "/Verso" : Environment.DIRECTORY_DOWNLOADS + "/Verso");
            Uri coll = image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            Uri uri = getContentResolver().insert(coll, v);
            if (uri == null) throw new IOException("Enregistrement impossible");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(bytes); }
            return uri;
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS), "Verso");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File f = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DATA, f.getAbsolutePath());
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        Uri uri = getContentResolver().insert(image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Files.getContentUri("external"), v);
        return uri != null ? uri : Uri.fromFile(f);
    }
}
