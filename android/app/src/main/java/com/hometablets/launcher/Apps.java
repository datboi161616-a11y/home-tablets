package com.hometablets.launcher;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Regular Android apps (YouTube, Spotify, ...) shown as tiles inside our system.
 * Only apps you allow (from the dashboard) appear and are allowed to run in
 * kiosk mode. Popular apps are allowed automatically once installed, unless
 * you've turned them off.
 */
final class Apps {
    /** Friendly defaults: allowed automatically when installed. Package -> friendly name. */
    static final Map<String, String> SUGGESTED = new LinkedHashMap<>();
    static {
        SUGGESTED.put("com.google.android.youtube", "YouTube");
        SUGGESTED.put("com.google.android.apps.youtube.kids", "YouTube Kids");
        SUGGESTED.put("com.spotify.music", "Spotify");
        SUGGESTED.put("com.netflix.mediaclient", "Netflix");
        SUGGESTED.put("com.disney.disneyplus", "Disney+");
        SUGGESTED.put("com.amazon.avod.thirdpartyclient", "Prime Video");
        SUGGESTED.put("com.pandora.android", "Pandora");
        SUGGESTED.put("com.audible.application", "Audible");
        SUGGESTED.put("com.amazon.kindle", "Kindle");
        SUGGESTED.put("us.zoom.videomeetings", "Zoom");
        SUGGESTED.put("com.google.android.apps.tachyon", "Google Meet");
        SUGGESTED.put("com.whatsapp", "WhatsApp");
        SUGGESTED.put("com.facebook.orca", "Messenger");
    }

    /** Never shown as tiles (system tools, our own app). */
    private static final Set<String> HIDDEN = new HashSet<>(Arrays.asList(
            "com.android.settings", "com.android.vending", "com.google.android.gms",
            "com.android.documentsui", "com.android.stk"));

    private final Context ctx;
    private final SharedPreferences prefs;
    private final Map<String, String> iconCache = new HashMap<>();

    Apps(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.prefs = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
    }

    /** Every launchable app on the tablet: package -> label. */
    Map<String, String> installed() {
        PackageManager pm = ctx.getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> found = pm.queryIntentActivities(main, 0);
        Map<String, String> out = new LinkedHashMap<>();
        for (ResolveInfo r : found) {
            String pkg = r.activityInfo.packageName;
            if (pkg.equals(ctx.getPackageName()) || HIDDEN.contains(pkg)) continue;
            out.put(pkg, String.valueOf(r.loadLabel(pm)));
        }
        return out;
    }

    /** Packages you've switched on or off in the dashboard. */
    private Set<String> setting(String key) {
        return new HashSet<>(prefs.getStringSet(key, new HashSet<>()));
    }

    /** Apps the household installed themselves (from the Play Store), not ones that came with the tablet. */
    private Set<String> userInstalled() {
        PackageManager pm = ctx.getPackageManager();
        Set<String> out = new HashSet<>();
        for (String pkg : installed().keySet()) {
            try {
                int flags = pm.getApplicationInfo(pkg, 0).flags;
                if ((flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) == 0) out.add(pkg);
            } catch (PackageManager.NameNotFoundException ignored) { }
        }
        return out;
    }

    /**
     * Installed apps that are allowed: the well-known ones (YouTube, Netflix...: some come
     * with the tablet), every app the household installed from the Play Store, and your "on"
     * list, minus anything you turned off.
     */
    List<String> allowed() {
        Map<String, String> inst = installed();
        Set<String> on = setting("appsOn"), off = setting("appsOff");
        Set<String> mine = userInstalled();
        List<String> out = new ArrayList<>();
        for (String pkg : SUGGESTED.keySet()) if (inst.containsKey(pkg) && !off.contains(pkg)) out.add(pkg);
        for (String pkg : inst.keySet()) if ((mine.contains(pkg) || on.contains(pkg)) && !off.contains(pkg) && !out.contains(pkg)) out.add(pkg);
        return out;
    }

    boolean isAllowed(String pkg) {
        return allowed().contains(pkg);
    }

    /** Dashboard switch for one app. */
    void setAllowed(String pkg, boolean allow) {
        Set<String> on = setting("appsOn"), off = setting("appsOff");
        if (allow) { on.add(pkg); off.remove(pkg); } else { on.remove(pkg); off.add(pkg); }
        prefs.edit().putStringSet("appsOn", on).putStringSet("appsOff", off).apply();
    }

    /** For the Apps screen: [{pkg, label, icon (data URL)}] of allowed apps. */
    JSONArray tiles() {
        Map<String, String> inst = installed();
        JSONArray out = new JSONArray();
        for (String pkg : allowed()) {
            try {
                out.put(new JSONObject().put("pkg", pkg).put("label", inst.get(pkg)).put("icon", icon(pkg)));
            } catch (Exception ignored) { }
        }
        return out;
    }

    /** For the dashboard: every installed app with its on/off state, plus suggestions not installed yet. */
    JSONArray inventory() {
        Map<String, String> inst = installed();
        List<String> allowed = allowed();
        JSONArray out = new JSONArray();
        try {
            for (Map.Entry<String, String> e : inst.entrySet()) {
                out.put(new JSONObject().put("pkg", e.getKey()).put("label", e.getValue())
                        .put("installed", true).put("allowed", allowed.contains(e.getKey())));
            }
            for (Map.Entry<String, String> e : SUGGESTED.entrySet()) {
                if (!inst.containsKey(e.getKey())) {
                    out.put(new JSONObject().put("pkg", e.getKey()).put("label", e.getValue())
                            .put("installed", false).put("allowed", false));
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    String label(String pkg) {
        String l = installed().get(pkg);
        return l != null ? l : SUGGESTED.getOrDefault(pkg, pkg);
    }

    /** 128px PNG icon as a data URL (cached). */
    String icon(String pkg) {
        String cached = iconCache.get(pkg);
        if (cached != null) return cached;
        try {
            Drawable d = ctx.getPackageManager().getApplicationIcon(pkg);
            Bitmap b = Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, 128, 128);
            d.draw(c);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
            b.recycle();
            String url = "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            iconCache.put(pkg, url);
            return url;
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Packages kiosk mode lets run: ours, Settings, the allowed apps, and the Play Store with
     * Google's sign-in (the household signs in and installs and updates what they like).
     */
    String[] lockTaskPackages() {
        // System UI hosts Android's (silently approved) screen-capture permission step.
        List<String> pkgs = new ArrayList<>(Arrays.asList(ctx.getPackageName(), "com.android.settings", "com.android.systemui",
                "com.android.vending", "com.google.android.gms", "com.google.android.gsf"));
        pkgs.addAll(allowed());
        return pkgs.toArray(new String[0]);
    }
}
