package com.hometablets.launcher;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.SystemClock;
import android.util.Base64;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.PixelCopy;
import android.view.ViewGroup;
import android.widget.FrameLayout;
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

    private WebView web;          // their screen
    private WebView ghost;        // hidden copy you drive remotely (only while controlling)
    private FrameLayout root;
    private View viewingDot;      // small dot in the corner while their screen is mirrored
    // Shared by the whole app (not per screen instance): Android can occasionally create
    // a second copy of this screen (e.g. when Home is pressed), and two photo servers or
    // two hub connections would fight each other.
    private static RemoteLink remote;
    private static MainActivity current;          // the copy that's alive and showing
    final RemoteHost hostImpl = new RemoteHost();
    private String currentScreen = "";
    private Apps apps;
    private String foregroundApp;   // label of an app (YouTube...) they opened from our Apps screen
    private boolean resumed;
    private boolean requestingProjection;
    private static final int REQ_PROJECTION = 77;
    private final Runnable projectionStop = () -> { if (!wantMirror) stopService(new Intent(this, ScreenCapture.class)); };
    private static volatile boolean wantMirror; // is anyone watching their screen right now?
    private android.content.BroadcastReceiver packageWatcher;
    private final java.util.concurrent.ExecutorService encoder = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final Runnable ghostCleanup = this::destroyGhost;
    private SharedPreferences prefs;
    private PhotoStore photos;
    private static PhotoServer photoServer;
    private static FamilyStore family;          // settings + message-board notes (set up from a phone)
    private String pendingScreen;
    // The page's process dying (see restartScreens): how often lately.
    private static final long PAGE_RESTART_WINDOW_MS = 2 * 60 * 1000L;
    private long lastPageRestart;
    private int pageRestarts;
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
        current = this;
        photos = new PhotoStore(this);
        if (family == null) family = new FamilyStore(this);
        if (photoServer == null) {
            photoServer = new PhotoServer(this, photos, family, new PhotoServer.Listener() {
                @Override public void onPhotosChanged() { tell("tablet-photos"); }
                @Override public void onFamilyChanged(String what) {
                    tell("settings".equals(what) ? "tablet-family" : "recipes".equals(what) ? "tablet-recipes" : "tablet-notes");
                }
                @Override public void onShoppingAction(JSONObject action) {
                    // action is built by FamilyStore.shoppingAction (plain JSON, safe as a JS literal).
                    MainActivity a = current;
                    if (a != null) a.runOnUiThread(() -> a.web.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('tablet-shopping',{detail:" + action + "}))", null));
                }
                private void tell(String event) {
                    MainActivity a = current;
                    if (a != null) a.runOnUiThread(() ->
                            a.web.evaluateJavascript("window.dispatchEvent(new Event('" + event + "'))", null));
                }
            });
            photoServer.start();
        }

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        configureWebView(web, false);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        requestRuntimePermissions();
        Kiosk.applyPolicies(this);
        web.loadUrl(siteUrl());

        handler.postDelayed(updateCheck, 60 * 1000); // first check a minute after boot

        // Regular apps (YouTube, Spotify...) shown as tiles; refresh when apps are installed/removed.
        apps = new Apps(this);
        packageWatcher = new android.content.BroadcastReceiver() {
            @Override public void onReceive(android.content.Context c, Intent i) { appsChanged(); }
        };
        android.content.IntentFilter pf = new android.content.IntentFilter();
        pf.addAction(Intent.ACTION_PACKAGE_ADDED);
        pf.addAction(Intent.ACTION_PACKAGE_REMOVED);
        pf.addAction(Intent.ACTION_PACKAGE_CHANGED);
        pf.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(packageWatcher, pf, android.content.Context.RECEIVER_EXPORTED);
        else registerReceiver(packageWatcher, pf);

        // Remote admin (your dashboard). Does nothing until you approve this tablet.
        if (remote == null) {
            remote = new RemoteLink(this, new HostProxy());
            remote.start();
        } else {
            remote.sendStatus();
        }
    }

    /** Sends the hub's requests to whichever copy of this screen is current. */
    static final class HostProxy implements RemoteLink.Host {
        private static RemoteHost h() {
            MainActivity a = current;
            return a == null || a.isDestroyed() ? null : a.hostImpl;
        }
        @Override public void status(RemoteLink.Callback<JSONObject> cb) {
            RemoteHost x = h();
            if (x == null) cb.got(new JSONObject()); else x.status(cb);
        }
        @Override public void capture(String mode, boolean hd, RemoteLink.Callback<String> cb) {
            RemoteHost x = h();
            if (x == null) cb.got(null); else x.capture(mode, hd, cb);
        }
        @Override public void streamChanged(boolean mirror, boolean control) {
            RemoteHost x = h();
            if (x != null) x.streamChanged(mirror, control);
        }
        @Override public void command(String cmd, JSONObject args, RemoteLink.Callback2 done) {
            RemoteHost x = h();
            if (x == null) done.done(false, "The tablet app is restarting; try again in a moment");
            else x.command(cmd, args, done);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView w, boolean isGhost) {
        w.setBackgroundColor(Color.BLACK);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(isGhost); // the hidden copy never plays sound
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " HomeTablet/" + BuildConfig.VERSION_NAME);

        w.addJavascriptInterface(new NativeBridge(w, isGhost), "TabletNative");

        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, true); // only our own site is ever loaded
            }
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (isGhost) { runOnUiThread(request::deny); return; } // no microphone for the hidden copy
                runOnUiThread(() -> request.grant(request.getResources())); // microphone for dictation
            }
        });

        w.setWebViewClient(new WebViewClient() {
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
                String mediaId = path.substring(at + PHOTO_PATH.length());
                java.io.File f = photos.file(mediaId);
                try {
                    if (f != null) return new WebResourceResponse(photos.contentType(mediaId), null, new java.io.FileInputStream(f));
                } catch (java.io.IOException ignored) { }
                return new WebResourceResponse("text/plain", null, 404, "Not Found",
                        java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                // No Wi-Fi on the very first start (before anything is cached): retry.
                if (req.isForMainFrame() && !isGhost) handler.postDelayed(() -> web.loadUrl(siteUrl()), 15000);
            }
            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                // The page runs in a process of its own. Android closes that process when
                // memory runs short (these tablets have 2 GB), and it can crash by itself.
                // Unless this answers "handled", the whole app goes down with it.
                android.util.Log.w("HomeTablet", "Page process gone ("
                        + (detail.didCrash() ? "it crashed" : "Android closed it to free memory") + "); "
                        + (isGhost ? "dropping the hidden copy" : "starting the screens again"));
                // Not from inside this call: the dead page is still being taken apart.
                handler.post(() -> {
                    if (view == ghost) destroyGhost();
                    else if (view == web) restartScreens();
                });
                return true;
            }
        });
    }

    /**
     * The page's process is gone (see onRenderProcessGone): throw the dead page away and
     * start the screens again on a fresh one, back where they were. Timers, lists, notes
     * and photos are kept on the tablet, so nothing is lost.
     */
    private void restartScreens() {
        if (isDestroyed()) return;
        long now = SystemClock.elapsedRealtime();
        if (now - lastPageRestart > PAGE_RESTART_WINDOW_MS) pageRestarts = 0;
        lastPageRestart = now;
        pageRestarts++;

        WebView dead = web;
        // Back to the screen they were on; if it has only just died there, to Home instead.
        String back = null;
        if (pageRestarts == 1) {
            try {
                String url = dead.getUrl();
                if (url != null && url.startsWith(BuildConfig.SITE_URL)) back = url;
            } catch (Exception ignored) { }
        }
        int at = root.indexOfChild(dead);
        root.removeView(dead);
        dead.destroy();

        web = new WebView(this);
        configureWebView(web, false);
        root.addView(web, Math.max(at, 0),
                new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (!resumed) web.onPause(); // they are in another app (YouTube...): stay quiet until they come back
        final String url = back != null ? back : siteUrl();
        // Dying again and again means memory is still short: give Android a moment between tries.
        handler.postDelayed(() -> { if (!isDestroyed()) web.loadUrl(url); }, pageRestarts > 2 ? 15000 : 300);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (applyExtras(intent)) web.loadUrl(siteUrl());
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = this;
        resumed = true;
        if (foregroundApp != null) {
            foregroundApp = null;               // back from YouTube etc.
            if (remote != null) remote.sendStatus();
        }
        hideSystemBars();
        web.onResume();
        Kiosk.enterLockTask(this);
    }

    @Override
    protected void onPause() {
        resumed = false;
        web.onPause();
        // We just left for another app (or the Play Store): tell the dashboard promptly.
        if (foregroundApp != null && remote != null) remote.sendStatus();
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
        // The photo server and hub connection are shared and keep running for the next copy.
        if (current == this) current = null;
        destroyGhost();
        if (packageWatcher != null) unregisterReceiver(packageWatcher);
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
        // Settings (profile, PIN, keys) are only accepted during USB setup. The setup
        // script switches USB debugging off at the end, so no other app can change them.
        boolean setupOverUsb = Settings.Global.getInt(getContentResolver(), Settings.Global.ADB_ENABLED, 0) == 1;
        if (!setupOverUsb) {
            String screen = intent.getStringExtra("screen");
            if (screen != null && screen.matches("[a-z]{1,20}")) { pendingScreen = screen; return true; }
            return false;
        }
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
        // Local test hub for the automated emulator test, e.g. --es hub ws://127.0.0.1:8787/ws/device
        String hub = intent.getStringExtra("hub");
        if (hub != null && hub.matches("ws://(127\\.0\\.0\\.1|localhost):\\d{2,5}/ws/device")) {
            prefs.edit().putString("remoteHubOverride", hub).apply();
        }
        // Open a particular screen, e.g. --es screen photos
        String screen = intent.getStringExtra("screen");
        if (screen != null && screen.matches("[a-z]{1,20}")) {
            pendingScreen = screen;
            changed = true;
        }
        // Automated emulator test only: make the page's process die the way it does when
        // memory runs out, to check the app brings the screens back (--es test page-crash).
        if ("page-crash".equals(intent.getStringExtra("test"))) {
            handler.postDelayed(() -> { if (web != null) web.loadUrl("chrome://crash"); }, 500);
        }
        return changed;
    }

    private void requestRuntimePermissions() {
        String[] perms = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.CAMERA };
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
                "Apps screen: " + (featureOn("apps") ? "ON (tap to hide)" : "OFF (tap to show)"),
                "Camera: " + (featureOn("camera") ? "ON (tap to hide)" : "OFF (tap to show)"),
                "Tutorial: show again (for a new owner)",
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
                        case 7:
                            setFeature("apps", !featureOn("apps"));
                            break;
                        case 8:
                            setFeature("camera", !featureOn("camera"));
                            break;
                        case 9:
                            // Starts the hands-on tutorial now, and again at every start until someone finishes or skips it.
                            web.evaluateJavascript("localStorage.removeItem('welcome.done.v1');location.hash='#/welcome'", null);
                            Toast.makeText(this, "The tutorial will show until someone finishes it", Toast.LENGTH_LONG).show();
                            break;
                        default:
                            break;
                    }
                })
                .show();
    }

    /**
     * Optional features (Apps screen, Camera). Defaults match js/services/features.js:
     * on for Family tablets, off for Tom's. Only switches you change are stored.
     */
    boolean featureOn(String name) {
        try {
            JSONObject f = new JSONObject(prefs.getString("features", "{}"));
            if (f.has(name)) return f.getBoolean(name);
        } catch (Exception ignored) { }
        return !"tom".equals(prefs.getString("profile", "family"));
    }

    void setFeature(String name, boolean on) {
        try {
            JSONObject f = new JSONObject(prefs.getString("features", "{}"));
            f.put(name, on);
            prefs.edit().putString("features", f.toString()).apply();
        } catch (Exception ignored) { }
        destroyGhost();
        web.loadUrl(siteUrl()); // redraw with the change
        Toast.makeText(this, (name.equals("apps") ? "Apps screen" : "Camera") + (on ? " is now shown" : " is now hidden"), Toast.LENGTH_LONG).show();
    }

    /** e.g. "131.0.6778.39". Should be 100+ for everything to look exactly right. */
    static String webViewVersion() {
        android.content.pm.PackageInfo p = WebView.getCurrentWebViewPackage();
        return p != null ? p.versionName : "unknown";
    }

    // ---------------------------------------------------------------- remote admin
    //
    // "Their screen": pictures of exactly what's on the display (view only).
    // "Control": a hidden second copy of the app sits underneath their screen.
    // Your taps go to that copy, so whatever they're doing is never disturbed.
    // Settings and data are shared, so changes you make there stick.

    private static final int FRAME_W = 1280;

    /** Open an allowed app (YouTube...) on their screen. Home brings them back here. */
    boolean openApp(String pkg) {
        if (pkg == null || !apps.isAllowed(pkg)) return false;
        Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) return false;
        Kiosk.allowApps(this);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(launch);
        } catch (Exception e) {
            return false;
        }
        foregroundApp = apps.label(pkg);
        if (remote != null) {
            remote.sendStatus();
            // Also report once the other app is actually in front (onPause fires then).
            handler.postDelayed(() -> { if (foregroundApp != null) remote.sendStatus(); }, 1200);
        }
        return true;
    }

    private void notifyPhotos() {
        web.evaluateJavascript("window.dispatchEvent(new Event('tablet-photos'))", null);
    }

    /** Bring our own screen forward (back from any app) and open the camera on it. */
    private void openCamera() {
        if (foregroundApp != null) {
            startActivity(new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
        }
        if (!"camera".equals(currentScreen)) web.evaluateJavascript("location.hash='#/camera'", null);
    }

    private void appsChanged() {
        Kiosk.allowApps(this);
        web.evaluateJavascript("window.dispatchEvent(new Event('tablet-apps'))", null);
        if (ghost != null) ghost.evaluateJavascript("window.dispatchEvent(new Event('tablet-apps'))", null);
        if (remote != null) remote.sendStatus();
    }

    private static boolean validPackage(String p) {
        return p != null && p.matches("[A-Za-z0-9_.]{3,120}");
    }

    /**
     * Start whole-screen capture, only if the USB setup allowed it silently.
     * We never trigger Android's "Start recording?" prompt on their screen.
     */
    private void ensureProjection() {
        handler.removeCallbacks(projectionStop);
        if (ScreenCapture.get() != null || requestingProjection || !ScreenCapture.allowedSilently(this)) return;
        requestingProjection = true;
        try {
            android.media.projection.MediaProjectionManager mpm =
                    getSystemService(android.media.projection.MediaProjectionManager.class);
            startActivityForResult(mpm.createScreenCaptureIntent(), REQ_PROJECTION);
        } catch (Exception e) {
            requestingProjection = false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_PROJECTION) return;
        requestingProjection = false;
        if (resultCode != RESULT_OK || data == null) return;
        if (!wantMirror) return; // watching stopped while Android was answering: don't start capture
        Intent svc = new Intent(this, ScreenCapture.class)
                .putExtra(ScreenCapture.EXTRA_CODE, resultCode)
                .putExtra(ScreenCapture.EXTRA_DATA, data);
        startForegroundService(svc);
    }

    /** Label of whatever other app is on screen, or null when our system is showing. */
    private String otherAppOnScreen() {
        if (resumed) return null;
        return foregroundApp;
    }

    private boolean remoteViewAllowed() {
        return prefs.getBoolean("remoteView", true);
    }

    /** Small faint dot in the top-right corner while their screen is being mirrored. */
    private void showViewingDot(boolean on) {
        if (on && viewingDot == null) {
            float dp = getResources().getDisplayMetrics().density;
            GradientDrawable dot = new GradientDrawable();
            dot.setShape(GradientDrawable.OVAL);
            dot.setColor(0x88C2491F);
            viewingDot = new View(this);
            viewingDot.setBackground(dot);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams((int) (9 * dp), (int) (9 * dp), Gravity.TOP | Gravity.END);
            lp.setMargins(0, (int) (8 * dp), (int) (8 * dp), 0);
            root.addView(viewingDot, lp);
        } else if (!on && viewingDot != null) {
            root.removeView(viewingDot);
            viewingDot = null;
        }
    }

    private WebView ensureGhost() {
        handler.removeCallbacks(ghostCleanup);
        if (ghost == null) {
            ghost = new WebView(this);
            configureWebView(ghost, true);
            // Index 0 = underneath their screen, same size, never visible or touchable by them.
            root.addView(ghost, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            String start = currentScreen.isEmpty() ? "" : "#/" + currentScreen;
            ghost.loadUrl(BuildConfig.SITE_URL + "?profile=" + Uri.encode(prefs.getString("profile", "family")) + start);
        }
        return ghost;
    }

    private void destroyGhost() {
        handler.removeCallbacks(ghostCleanup);
        if (ghost == null) return;
        root.removeView(ghost);
        ghost.destroy();
        ghost = null;
    }

    private int frameHeight(View v) {
        return v.getWidth() > 0 ? Math.round(FRAME_W * v.getHeight() / (float) v.getWidth()) : 800;
    }

    /** Picture of their real screen (the whole window). */
    private void captureMirror(boolean hd, RemoteLink.Callback<String> cb) {
        ScreenCapture sc = ScreenCapture.get();
        if (sc != null) {                        // whole screen, any app
            Bitmap whole = sc.latest();
            if (whole != null) { encode(whole, hd ? 80 : 55, cb); return; }
        }
        if (!resumed) { cb.got(null); return; } // in another app and whole-screen view isn't set up
        // HD is capped at 1600px wide so it fits through the hub (1 MiB per message).
        int w = hd ? Math.min(1600, root.getWidth()) : FRAME_W;
        int h = root.getWidth() > 0 ? Math.round(w * root.getHeight() / (float) root.getWidth()) : 800;
        if (w <= 0 || h <= 0) { cb.got(null); return; }
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        try {
            PixelCopy.request(getWindow(), bmp, result -> {
                if (result == PixelCopy.SUCCESS) encode(bmp, hd ? 75 : 55, cb);
                else { bmp.recycle(); cb.got(null); }
            }, handler);
        } catch (Exception e) {
            bmp.recycle();
            cb.got(null);
        }
    }

    /** Picture of the hidden copy. */
    private void captureGhost(RemoteLink.Callback<String> cb) {
        WebView g = ensureGhost();
        if (g.getWidth() <= 0 || g.getHeight() <= 0) { cb.got(null); return; }
        Bitmap bmp = Bitmap.createBitmap(FRAME_W, frameHeight(g), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        c.scale(FRAME_W / (float) g.getWidth(), bmp.getHeight() / (float) g.getHeight());
        try {
            g.draw(c);
        } catch (Throwable e) {
            android.util.Log.w("HomeTablet", "Hidden copy picture failed", e);
            bmp.recycle();
            cb.got(null);
            return;
        }
        encode(bmp, 60, cb);
    }

    private void encode(Bitmap bmp, int quality, RemoteLink.Callback<String> cb) {
        encoder.execute(() -> {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, out);
            bmp.recycle();
            String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            handler.post(() -> cb.got(b64));
        });
    }

    private void ghostTouch(int action, double x, double y, long downTime) {
        WebView g = ensureGhost();
        MotionEvent ev = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action,
                (float) (clamp01(x) * g.getWidth()), (float) (clamp01(y) * g.getHeight()), 0);
        ev.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        g.dispatchTouchEvent(ev);
        ev.recycle();
    }

    private static double clamp01(double v) {
        return Double.isNaN(v) ? 0 : Math.max(0, Math.min(1, v));
    }

    private static boolean validScreen(String s) {
        return s != null && s.matches("[a-z]{1,20}");
    }

    class RemoteHost implements RemoteLink.Host {
        @Override
        public void status(RemoteLink.Callback<JSONObject> cb) {
            JSONObject st = new JSONObject();
            try {
                st.put("app", BuildConfig.VERSION_NAME)
                  .put("webview", webViewVersion())
                  .put("profile", prefs.getString("profile", "family"))
                  .put("screen", otherAppOnScreen() != null ? "app: " + otherAppOnScreen() : currentScreen)
                  .put("inApp", otherAppOnScreen() == null ? JSONObject.NULL : otherAppOnScreen())
                  .put("fullView", ScreenCapture.allowedSilently(MainActivity.this))
                  .put("features", new JSONObject(prefs.getString("features", "{}")))
                  .put("apps", apps.inventory())
                  .put("ip", PhotoServer.wifiIp())
                  .put("photos", photos.count())
                  .put("storageFreeMB", getFilesDir().getUsableSpace() / (1024 * 1024))
                  .put("kiosk", Kiosk.isOwner(MainActivity.this))
                  .put("mirrorAllowed", remoteViewAllowed())
                  .put("model", Build.MANUFACTURER + " " + Build.MODEL)
                  .put("android", Build.VERSION.RELEASE)
                  .put("uptimeMin", SystemClock.elapsedRealtime() / 60000);
                Intent b = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (b != null) {
                    int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                    if (level >= 0) st.put("battery", Math.round(level * 100f / scale));
                    st.put("charging", b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0);
                }
                WifiManager wm = getApplicationContext().getSystemService(WifiManager.class);
                if (wm != null && wm.getConnectionInfo() != null) {
                    String ssid = wm.getConnectionInfo().getSSID();
                    if (ssid != null && !ssid.contains("unknown")) st.put("wifi", ssid.replace("\"", ""));
                }
            } catch (Exception ignored) { }
            cb.got(st);
        }

        @Override
        public void capture(String mode, boolean hd, RemoteLink.Callback<String> cb) {
            if (!remoteViewAllowed()) { cb.got(null); return; }
            if ("control".equals(mode)) captureGhost(cb);
            else captureMirror(hd, cb);
        }

        @Override
        public void streamChanged(boolean mirror, boolean control) {
            boolean allowed = remoteViewAllowed();
            showViewingDot(mirror && allowed);
            wantMirror = mirror && allowed;
            if (wantMirror) ensureProjection();
            else { handler.removeCallbacks(projectionStop); handler.postDelayed(projectionStop, 2 * 60 * 1000); }
            if (control && allowed) ensureGhost();
            else if (ghost != null) handler.postDelayed(ghostCleanup, 2 * 60 * 1000); // keep briefly in case you come back
        }

        @Override
        public void command(String cmd, JSONObject a, RemoteLink.Callback2 done) {
            switch (cmd) {
                // --- hidden copy (doesn't touch their screen) ---
                case "tap": {
                    if (!remoteViewAllowed()) { done.done(false, "Remote viewing is turned off on this tablet"); return; }
                    long down = SystemClock.uptimeMillis();
                    double x = a.optDouble("x"), y = a.optDouble("y");
                    ghostTouch(MotionEvent.ACTION_DOWN, x, y, down);
                    handler.postDelayed(() -> ghostTouch(MotionEvent.ACTION_UP, x, y, down), 60);
                    done.done(true, "Tapped");
                    return;
                }
                case "swipe": {
                    if (!remoteViewAllowed()) { done.done(false, "Remote viewing is turned off on this tablet"); return; }
                    long down = SystemClock.uptimeMillis();
                    double x1 = a.optDouble("x1"), y1 = a.optDouble("y1"), x2 = a.optDouble("x2"), y2 = a.optDouble("y2");
                    int ms = Math.max(100, Math.min(1000, a.optInt("ms", 300)));
                    int steps = 12;
                    ghostTouch(MotionEvent.ACTION_DOWN, x1, y1, down);
                    for (int i = 1; i <= steps; i++) {
                        final double f = i / (double) steps;
                        handler.postDelayed(() -> ghostTouch(MotionEvent.ACTION_MOVE, x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, down), (long) (ms * f));
                    }
                    handler.postDelayed(() -> ghostTouch(MotionEvent.ACTION_UP, x2, y2, down), ms + 20);
                    done.done(true, "Swiped");
                    return;
                }
                case "nav": {
                    String screen = a.optString("screen");
                    if (!validScreen(screen)) { done.done(false, "Unknown screen"); return; }
                    ensureGhost().evaluateJavascript("location.hash='#/" + screen + "'", null);
                    done.done(true, "Hidden session opened " + screen);
                    return;
                }
                case "back":
                    ensureGhost().evaluateJavascript("history.back()", null);
                    done.done(true, "Back");
                    return;
                case "type": {
                    String js = "(function(t){var e=document.activeElement;"
                            + "if(!e||!('value' in e))return 'Tap a text box first';"
                            + "e.value+=t;e.dispatchEvent(new Event('input',{bubbles:true}));return 'Typed';})("
                            + JSONObject.quote(a.optString("text")) + ")";
                    ensureGhost().evaluateJavascript(js, r -> done.done(r != null && r.contains("Typed"), r == null ? "" : r.replace("\"", "")));
                    return;
                }

                // --- their screen ---
                case "show": {
                    String screen = a.optString("screen");
                    if (!validScreen(screen)) { done.done(false, "Unknown screen"); return; }
                    web.evaluateJavascript("location.hash='#/" + screen + "'", null);
                    done.done(true, "Their screen now shows " + screen);
                    return;
                }
                case "reload":
                    web.loadUrl(siteUrl());
                    done.done(true, "Their screen reloaded");
                    return;
                case "profile": {
                    String p = a.optString("name");
                    if (!p.equals("family") && !p.equals("tom")) { done.done(false, "Unknown profile"); return; }
                    prefs.edit().putString("profile", p).apply();
                    destroyGhost();
                    web.loadUrl(siteUrl());
                    remote.sendStatus();
                    done.done(true, "Switched to " + (p.equals("tom") ? "Tom's" : "Family") + " screens");
                    return;
                }
                case "restart":
                    done.done(true, "Restarting the app");
                    handler.postDelayed(MainActivity.this::recreate, 500);
                    return;

                // --- camera (on their real screen; never the hidden session) ---
                case "camera":
                    openCamera();
                    done.done(true, "Camera opened on their screen");
                    return;
                case "cameraShoot": {
                    int countdown = Math.max(0, Math.min(10, a.optInt("countdown", 3)));
                    boolean wasOpen = "camera".equals(currentScreen);
                    openCamera();
                    // If the camera wasn't up yet, give it a moment to start before the countdown.
                    handler.postDelayed(() -> web.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('tablet-camera-shoot',{detail:{countdown:" + countdown + "}}))", null),
                            wasOpen ? 100 : 2000);
                    done.done(true, "Taking a photo on their screen (" + countdown + "s countdown)");
                    return;
                }
                case "cameraRecord": {
                    boolean on = a.optBoolean("on");
                    boolean wasOpen = "camera".equals(currentScreen);
                    if (on) openCamera();
                    handler.postDelayed(() -> web.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('tablet-camera-record',{detail:{on:" + on + "}}))", null),
                            on && !wasOpen ? 2000 : 100);
                    done.done(true, on ? "Recording started on their screen" : "Recording stopped");
                    return;
                }

                // --- optional features (Apps screen, Camera) per tablet ---
                case "feature": {
                    String name = a.optString("name");
                    if (!name.equals("apps") && !name.equals("camera")) { done.done(false, "Unknown feature"); return; }
                    try {
                        JSONObject f = new JSONObject(prefs.getString("features", "{}"));
                        f.put(name, a.optBoolean("on"));
                        prefs.edit().putString("features", f.toString()).apply();
                    } catch (Exception e) { done.done(false, "Couldn't save"); return; }
                    destroyGhost();
                    web.loadUrl(siteUrl()); // redraw their screen with the change
                    remote.sendStatus();
                    done.done(true, (name.equals("apps") ? "Apps" : "Camera") + (a.optBoolean("on") ? " switched on" : " switched off"));
                    return;
                }

                // --- settings & updates ---
                case "update":
                    Updater.check(MainActivity.this, false);
                    done.done(true, "Checking for an app update; it installs by itself if there's a newer one");
                    return;
                case "pin": {
                    String pin = a.optString("pin");
                    if (!pin.matches("\\d{4,8}")) { done.done(false, "PIN must be 4-8 digits"); return; }
                    prefs.edit().putString("pin", pin).apply();
                    done.done(true, "Grown-up PIN changed");
                    return;
                }
                case "newPhotoCode":
                    PhotoServer.resetKey(MainActivity.this);
                    web.evaluateJavascript("window.dispatchEvent(new Event('tablet-photos'))", null);
                    done.done(true, "New photo QR code made; old ones stop working");
                    return;
                case "apps": {
                    String pkg = a.optString("pkg");
                    if (!validPackage(pkg)) { done.done(false, "Unknown app"); return; }
                    boolean allow = a.optBoolean("allow");
                    apps.setAllowed(pkg, allow);
                    appsChanged();
                    done.done(true, apps.label(pkg) + (allow ? " is now on their Apps screen" : " removed from their Apps screen"));
                    return;
                }
                case "openApp": {
                    String pkg = a.optString("pkg");
                    boolean ok = validPackage(pkg) && openApp(pkg);
                    done.done(ok, ok ? "Opened " + apps.label(pkg) + " on their screen" : "That app isn't installed or allowed");
                    return;
                }
                case "playStore": {
                    String pkg = a.optString("pkg");
                    if (!validPackage(pkg)) { done.done(false, "Unknown app"); return; }
                    // Let the Play Store run in kiosk mode for 15 minutes so the app can be installed.
                    prefs.edit().putLong("playStoreUntil", System.currentTimeMillis() + 15 * 60 * 1000L).apply();
                    Kiosk.allowApps(MainActivity.this);
                    Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg))
                            .setPackage("com.android.vending").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try {
                        startActivity(store);
                        foregroundApp = "Play Store";
                        done.done(true, "Play Store opened on their screen for " + apps.label(pkg) + " (tap Install there, or ask them to)");
                    } catch (Exception e) {
                        done.done(false, "Play Store isn't available (is a Google account added?)");
                    }
                    return;
                }
                case "home": {
                    Intent home = new Intent(MainActivity.this, MainActivity.class)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    startActivity(home);
                    done.done(true, "Brought them back to the home screen");
                    return;
                }
                case "status":
                    remote.sendStatus();
                    done.done(true, "Info refreshed");
                    return;
                case "shot":
                    if (!remoteViewAllowed()) { done.done(false, "Remote viewing is turned off on this tablet"); return; }
                    remote.sendShot();
                    done.done(true, "HD screenshot sent");
                    return;
                default:
                    done.done(false, "Unknown command: " + cmd);
            }
        }
    }

    // ---------------------------------------------------------------- JS bridge

    /** window.TabletNative in the web app. */
    class NativeBridge {
        private final WebView owner;
        private final boolean isGhost;
        NativeBridge(WebView owner, boolean isGhost) { this.owner = owner; this.isGhost = isGhost; }

        /** Allowed apps as tiles: [{pkg, label, icon}] */
        @JavascriptInterface
        public String appList() { return apps.tiles().toString(); }

        /** Open an allowed app. The hidden remote copy never opens apps on their screen. */
        @JavascriptInterface
        public boolean openApp(String pkg) {
            if (isGhost) return false;
            runOnUiThread(() -> MainActivity.this.openApp(pkg));
            return true;
        }

        /** True in the hidden remote-control copy (the web app keeps it silent). */
        @JavascriptInterface
        public boolean isGhost() { return isGhost; }

        /** The web app reports which screen it's on (shown in your dashboard). */
        @JavascriptInterface
        public void screenChanged(String name) {
            if (isGhost || name == null) return;
            runOnUiThread(() -> {
                if (name.equals(currentScreen)) return;
                currentScreen = name;
                if (remote != null) remote.sendStatus();
            });
        }

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

        /** Save a JPEG from the tablet's camera into its album. */
        @JavascriptInterface
        public boolean savePhoto(String base64, String caption) {
            try {
                String id = photos.saveMedia(base64, false, caption);
                android.util.Log.i("HomeTablet", "savePhoto saved " + id + " (" + base64.length() + " b64 chars)");
                runOnUiThread(MainActivity.this::notifyPhotos); // WebView calls must be on the UI thread
                return true;
            } catch (Exception e) { android.util.Log.w("HomeTablet", "savePhoto failed", e); return false; }
        }

        /** Save a video clip from the tablet's camera into its album. */
        @JavascriptInterface
        public boolean saveVideo(String base64, String caption) {
            try {
                String id = photos.saveMedia(base64, true, caption);
                android.util.Log.i("HomeTablet", "saveVideo saved " + id + " (" + base64.length() + " b64 chars)");
                runOnUiThread(MainActivity.this::notifyPhotos);
                return true;
            } catch (Exception e) { android.util.Log.w("HomeTablet", "saveVideo failed", e); return false; }
        }

        // ---- family settings, notes and calendars (set up from a phone) ----

        /** {familyName, people, dates, calendars, units} */
        @JavascriptInterface
        public String familySettings() { return family.settings().toString(); }

        /** Message-board notes, newest first. */
        @JavascriptInterface
        public String notes() { return family.notes().toString(); }

        /** The family's own recipes (as typed: one ingredient / step per line). */
        @JavascriptInterface
        public String myRecipes() { return family.myRecipes().toString(); }

        /** Add or update a recipe (JSON). Returns the saved recipe as JSON, or an {"error"} object. */
        @JavascriptInterface
        public String saveMyRecipe(String json) {
            if (isGhost) return "{\"error\":\"not here\"}";
            try { return family.saveRecipe(new JSONObject(json)).toString(); }
            catch (Exception e) {
                try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "{}"; }
            }
        }

        @JavascriptInterface
        public boolean deleteMyRecipe(String id) {
            if (isGhost) return false;
            try { return family.deleteRecipe(id); } catch (Exception e) { return false; }
        }

        /** The screens save the current shopping list here so the phone page can show it. */
        @JavascriptInterface
        public boolean setShoppingList(String json) {
            if (isGhost) return false;
            try { family.saveShopping(json); return true; } catch (Exception e) { return false; }
        }

        /** photoBase64 (JPEG) and replyTo may be empty. Returns the new note's id, or "". */
        @JavascriptInterface
        public String addNote(String who, String text, String photoBase64, String replyTo) {
            if (isGhost) return "";
            try {
                String photoId = null;
                if (photoBase64 != null && !photoBase64.isEmpty()) {
                    photoId = photos.saveMedia(photoBase64.replaceFirst("^data:[^,]+,", ""), false, "From the message board");
                    runOnUiThread(MainActivity.this::notifyPhotos);
                }
                String id = family.addNote(who, text, photoId, replyTo).optString("id");
                runOnUiThread(() -> web.evaluateJavascript("window.dispatchEvent(new Event('tablet-notes'))", null));
                return id;
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public boolean loveNote(String id) {
            try { return family.updateNote(id, new JSONObject().put("love", true)); } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void markNotesRead() {
            if (isGhost) return;
            try { family.markAllRead(); } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public boolean deleteNote(String id) {
            try { return family.deleteNote(id); } catch (Exception e) { return false; }
        }

        /** Downloads the saved calendar links; calls window[callback](jsonArray of {name, ics, ok, error}). */
        @JavascriptInterface
        public void fetchCalendars(String callback) {
            if (callback == null || !callback.matches("[A-Za-z0-9_]{1,64}")) return;
            new Thread(() -> {
                String json = family.fetchCalendars().toString();
                String js = "window['" + callback + "']&&window['" + callback + "'](" + json + ")";
                runOnUiThread(() -> owner.evaluateJavascript(js, null));
            }, "calendars").start();
        }

        /** Feature switches you set from the dashboard: {"apps":true,...} (only the ones you changed). */
        @JavascriptInterface
        public String features() { return prefs.getString("features", "{}"); }

        /** Screen backlight for the night screens: 0..1, or -1 for the normal setting. */
        @JavascriptInterface
        public void setBrightness(float level) {
            if (isGhost) return; // the hidden copy shares their window: never dim their screen
            runOnUiThread(() -> {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = level < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : Math.max(0.01f, Math.min(1f, level));
                getWindow().setAttributes(lp);
            });
        }

        /** Camera screen diagnostics (shows in logcat). */
        @JavascriptInterface
        public void log(String msg) { android.util.Log.i("HomeTablet", "camera: " + msg); }

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
                runOnUiThread(() -> owner.evaluateJavascript(js, null));
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
