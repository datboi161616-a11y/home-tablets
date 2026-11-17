package com.hometablets.launcher;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * The whole "OS": a full-screen WebView showing the hosted web app.
 *
 * Grown-up menu: press and hold the top-left corner of the screen for 5 seconds,
 * then enter the PIN (default 2512; change it with adb, see android/SETUP.md).
 */
public class MainActivity extends Activity {

    static final String PREFS = "tablet";
    private static final long UPDATE_EVERY_MS = 6 * 60 * 60 * 1000L; // 6 hours
    private static final long CORNER_HOLD_MS = 5000;
    private static final int CORNER_PX = 160;

    /** Hosts the web app may fetch through the native bridge (they block browser requests). */
    private static final Set<String> NATIVE_FETCH_HOSTS = new HashSet<>(Arrays.asList(
            "api.adsb.lol", "opendata.adsb.fi"));

    /** Virtual path the web app uses to show this tablet's photos: <site>/__tablet/photos/<id> */
    private static final String PHOTO_PATH = "/__tablet/photos/";

    private WebView web;
    private SharedPreferences prefs;
    private PhotoStore photos;
    private PhotoServer photoServer;
    private String pendingScreen;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable cornerHold = this::askPin;
    private final Runnable updateCheck = new Runnable() {
        @Override public void run() {
            Updater.check(MainActivity.this, false);
            handler.postDelayed(this, UPDATE_EVERY_MS);
        }
    };

    // ---------------------------------------------------------------- lifecycle

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        applyExtras(getIntent());

        // Phones on the same Wi-Fi add photos through this (QR code on the tablet).
        photos = new PhotoStore(this);
        photoServer = new PhotoServer(this, photos, () -> runOnUiThread(() ->
                web.evaluateJavascript("window.dispatchEvent(new Event('tablet-photos'))", null)));
        photoServer.start();

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " HomeTablet/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new NativeBridge(), "TabletNative");

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, true); // only our own site is ever loaded
            }
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources())); // microphone for dictation
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // Stay inside our site; never wander off to other websites.
                Uri site = Uri.parse(BuildConfig.SITE_URL);
                return !site.getHost().equals(req.getUrl().getHost());
            }
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                // Serve this tablet's photos to the web app from local storage.
                String path = req.getUrl().getPath();
                int at = path == null ? -1 : path.indexOf(PHOTO_PATH);
                if (at < 0) return null;
                java.io.File f = photos.file(path.substring(at + PHOTO_PATH.length()));
                try {
                    if (f != null) return new WebResourceResponse("image/jpeg", null, new java.io.FileInputStream(f));
                } catch (java.io.IOException ignored) { }
                return new WebResourceResponse("text/plain", null, 404, "Not Found",
                        java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                // No Wi-Fi on the very first start (before anything is cached): retry.
                if (req.isForMainFrame()) handler.postDelayed(() -> web.loadUrl(siteUrl()), 15000);
            }
        });

        requestRuntimePermissions();
        Kiosk.applyPolicies(this);
        web.loadUrl(siteUrl());

        handler.postDelayed(updateCheck, 60 * 1000); // first check a minute after boot
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (applyExtras(intent)) web.loadUrl(siteUrl());
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        web.onResume();
        Kiosk.enterLockTask(this);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); // never leave the launcher
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        photoServer.stop();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- helpers

    String siteUrl() {
        String url = BuildConfig.SITE_URL + "?profile=" + Uri.encode(prefs.getString("profile", "family"));
        if (pendingScreen != null) {
            url += "#/" + pendingScreen;
            pendingScreen = null;
        }
        return url;
    }

    /**
     * Settings sent with adb, e.g.
     *   adb shell am start -n com.hometablets.launcher/.MainActivity --es profile tom --es pin 4321
     * Returns true if something changed that needs a reload.
     */
    private boolean applyExtras(Intent intent) {
        if (intent == null) return false;
        boolean changed = false;
        String profile = intent.getStringExtra("profile");
        if (profile != null && (profile.equals("family") || profile.equals("tom"))) {
            prefs.edit().putString("profile", profile).apply();
            changed = true;
        }
        String pin = intent.getStringExtra("pin");
        if (pin != null && pin.matches("\\d{4,8}")) prefs.edit().putString("pin", pin).apply();
        // Fixed photo-upload key (used by the automated emulator test).
        String uploadKey = intent.getStringExtra("uploadKey");
        if (uploadKey != null && uploadKey.matches("[a-z0-9-]{6,32}")) prefs.edit().putString("uploadKey", uploadKey).apply();
        // Open a particular screen, e.g. --es screen photos
        String screen = intent.getStringExtra("screen");
        if (screen != null && screen.matches("[a-z]{1,20}")) {
            pendingScreen = screen;
            changed = true;
        }
        return changed;
    }

    private void requestRuntimePermissions() {
        String[] perms = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.RECORD_AUDIO };
        for (String p : perms) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(perms, 1); // device owner tablets are auto-granted instead
                return;
            }
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    // ---------------------------------------------------------------- grown-up menu

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (e.getX() < CORNER_PX && e.getY() < CORNER_PX) handler.postDelayed(cornerHold, CORNER_HOLD_MS);
                break;
            case MotionEvent.ACTION_MOVE:
                if (e.getX() > CORNER_PX || e.getY() > CORNER_PX) handler.removeCallbacks(cornerHold);
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                handler.removeCallbacks(cornerHold);
                break;
        }
        return super.dispatchTouchEvent(e);
    }

    private void askPin() {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        input.setHint("PIN");
        new AlertDialog.Builder(this)
                .setTitle("Grown-up menu")
                .setView(input)
                .setPositiveButton("OK", (d, w) -> {
                    if (input.getText().toString().equals(prefs.getString("pin", "2512"))) showAdminMenu();
                    else Toast.makeText(this, "Wrong PIN", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showAdminMenu() {
        String profile = prefs.getString("profile", "family");
        String[] items = {
                "Wi-Fi settings",
                "Switch to " + (profile.equals("tom") ? "Family" : "Tom's") + " screens",
                "Reload",
                "Check for app update",
                "Unlock tablet for 10 minutes",
                "Turn off kiosk mode permanently",
                "New photo upload code (old QR codes stop working)",
                "About: app " + BuildConfig.VERSION_NAME + (Kiosk.isOwner(this) ? ", kiosk on" : ", kiosk off")
                        + ", WebView " + webViewVersion(),
        };
        new AlertDialog.Builder(this)
                .setTitle("Grown-up menu")
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 0:
                            Kiosk.pause(this, 10);
                            startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));
                            break;
                        case 1:
                            prefs.edit().putString("profile", profile.equals("tom") ? "family" : "tom").apply();
                            web.loadUrl(siteUrl());
                            break;
                        case 2:
                            web.clearCache(false);
                            web.loadUrl(siteUrl());
                            break;
                        case 3:
                            Updater.check(this, true);
                            break;
                        case 4:
                            Kiosk.pause(this, 10);
                            Toast.makeText(this, "Unlocked for 10 minutes", Toast.LENGTH_LONG).show();
                            break;
                        case 5:
                            new AlertDialog.Builder(this)
                                    .setTitle("Turn off kiosk mode?")
                                    .setMessage("The tablet becomes a normal Android tablet again. To turn kiosk mode back on you need a factory reset and the USB setup.")
                                    .setPositiveButton("Turn off", (d2, w2) -> {
                                        Kiosk.removeOwner(this);
                                        Toast.makeText(this, "Kiosk mode is off", Toast.LENGTH_LONG).show();
                                    })
                                    .setNegativeButton("Cancel", null)
                                    .show();
                            break;
                        case 6:
                            PhotoServer.resetKey(this);
                            web.evaluateJavascript("window.dispatchEvent(new Event('tablet-photos'))", null);
                            Toast.makeText(this, "New QR code ready on the Add photos screen", Toast.LENGTH_LONG).show();
                            break;
                        default:
                            break;
                    }
                })
                .show();
    }

    /** e.g. "131.0.6778.39". Should be 100+ for everything to look exactly right. */
    static String webViewVersion() {
        android.content.pm.PackageInfo p = WebView.getCurrentWebViewPackage();
        return p != null ? p.versionName : "unknown";
    }

    // ---------------------------------------------------------------- JS bridge

    /** window.TabletNative in the web app. */
    class NativeBridge {
        @JavascriptInterface
        public String appVersion() { return BuildConfig.VERSION_NAME; }

        /** JSON array of this tablet's photos, newest first: [{id, name, caption, added}] */
        @JavascriptInterface
        public String photoList() { return photos.list().toString(); }

        /** Base URL for <img src>: append a photo id. */
        @JavascriptInterface
        public String photoBase() { return PHOTO_PATH; }

        /** Address phones open (shown as a QR code), or "" when not on Wi-Fi. */
        @JavascriptInterface
        public String uploadUrl() { return PhotoServer.uploadUrl(MainActivity.this); }

        @JavascriptInterface
        public boolean deletePhoto(String id) { return photos.delete(id); }

        /** Fetch an allow-listed URL and call window[callback](ok, text). */
        @JavascriptInterface
        public void fetchText(String url, String callback) {
            if (callback == null || !callback.matches("[A-Za-z0-9_]{1,64}")) return;
            new Thread(() -> {
                boolean ok = false;
                String body;
                try {
                    Uri u = Uri.parse(url);
                    if (!"https".equals(u.getScheme()) || !NATIVE_FETCH_HOSTS.contains(u.getHost())) {
                        throw new SecurityException("host not allowed");
                    }
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    c.setRequestProperty("User-Agent", "HomeTablet/" + BuildConfig.VERSION_NAME);
                    int code = c.getResponseCode();
                    if (code >= 400) {
                        body = "HTTP " + code;
                    } else {
                        body = readAll(c.getInputStream());
                        ok = true;
                    }
                    c.disconnect();
                } catch (Exception ex) {
                    body = String.valueOf(ex.getMessage());
                }
                String js = "window['" + callback + "']&&window['" + callback + "'](" + ok + "," + JSONObject.quote(body) + ")";
                runOnUiThread(() -> web.evaluateJavascript(js, null));
            }).start();
        }
    }

    static String readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }
}
