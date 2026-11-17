package com.hometablets.launcher;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Self-update for the launcher app itself (the web app updates on its own).
 *
 * GitHub Actions publishes each build as a release tagged "app-<versionCode>"
 * with a home-tablets.apk attached. If that number is higher than ours, we
 * download it and install it. Device-owner tablets install silently.
 */
final class Updater {
    private Updater() {}

    private static volatile boolean running = false;

    static void check(Activity a, boolean userInitiated) {
        if (running) return;
        running = true;
        new Thread(() -> {
            try {
                JSONObject rel = new JSONObject(get("https://api.github.com/repos/" + BuildConfig.UPDATE_REPO + "/releases/latest"));
                String tag = rel.optString("tag_name", "");
                int latest = tag.startsWith("app-") ? Integer.parseInt(tag.substring(4)) : 0;
                if (latest <= BuildConfig.VERSION_CODE) {
                    toast(a, userInitiated, "App is up to date (version " + BuildConfig.VERSION_NAME + ")");
                    return;
                }
                String apkUrl = null;
                JSONArray assets = rel.getJSONArray("assets");
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.getJSONObject(i);
                    if (asset.getString("name").endsWith(".apk")) apkUrl = asset.getString("browser_download_url");
                }
                if (apkUrl == null) return;
                toast(a, userInitiated, "Downloading update 1." + latest + "…");
                install(a, apkUrl);
            } catch (Exception e) {
                Log.w("HomeTablet", "Update check failed", e);
                toast(a, userInitiated, "Couldn't check for updates");
            } finally {
                running = false;
            }
        }).start();
    }

    private static void install(Activity a, String apkUrl) throws Exception {
        PackageInstaller pi = a.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(a.getPackageName());
        int id = pi.createSession(params);
        try (PackageInstaller.Session session = pi.openSession(id)) {
            HttpURLConnection c = open(apkUrl);
            try (InputStream in = c.getInputStream(); OutputStream out = session.openWrite("app.apk", 0, -1)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                session.fsync(out);
            }
            Intent done = new Intent(a, InstallReceiver.class);
            PendingIntent pending = PendingIntent.getBroadcast(a, id, done,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            session.commit(pending.getIntentSender());
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        // GitHub release downloads redirect to another host; follow manually.
        for (int hops = 0; hops < 5; hops++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "HomeTablet/" + BuildConfig.VERSION_NAME);
            c.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                url = c.getHeaderField("Location");
                c.disconnect();
                continue;
            }
            if (code >= 400) throw new Exception("HTTP " + code + " for " + url);
            return c;
        }
        throw new Exception("Too many redirects");
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = open(url);
        try { return MainActivity.readAll(c.getInputStream()); } finally { c.disconnect(); }
    }

    private static void toast(Activity a, boolean show, String msg) {
        if (show) a.runOnUiThread(() -> Toast.makeText(a, msg, Toast.LENGTH_LONG).show());
    }
}
