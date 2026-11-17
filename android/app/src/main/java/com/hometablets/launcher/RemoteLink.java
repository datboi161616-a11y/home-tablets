package com.hometablets.launcher;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Keeps one connection open to your admin hub (Cloudflare Worker), so you can
 * see this tablet, watch its screen, drive a hidden copy, and change settings.
 *
 * The hub address comes from <site>/remote.json ({"hub": "wss://..."}), so it
 * can be set or changed without a new app version. Empty = remote admin off.
 * This tablet does nothing remotely until you approve it in the dashboard.
 */
final class RemoteLink {
    private static final String TAG = "HomeTablet";
    private static final long STATUS_EVERY_MS = 10 * 60 * 1000L;
    private static final long PING_EVERY_MS = 30 * 1000L;
    private static final int MAX_QUEUED_BYTES = 1024 * 1024;

    /** What MainActivity provides: status, screen pictures and commands. */
    interface Host {
        void status(Callback<JSONObject> cb);
        /** mode "mirror" = their screen, "control" = hidden copy. hd = full size. */
        void capture(String mode, boolean hd, Callback<String> base64Jpeg);
        void streamChanged(boolean mirror, boolean control);
        /** Run a command; call done(ok, message). */
        void command(String cmd, JSONObject args, Callback2 done);
    }
    interface Callback<T> { void got(T value); }
    interface Callback2 { void done(boolean ok, String message); }

    private final Context ctx;
    private final Host host;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final OkHttpClient http = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)
            .build();

    private WebSocket socket;
    private boolean connected, approved, stopped;
    private boolean mirror, control;
    private int retry;
    private boolean framePending;

    RemoteLink(Context ctx, Host host) {
        this.ctx = ctx.getApplicationContext();
        this.host = host;
        this.prefs = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------ identity

    /** This tablet's id + secret, made once on the tablet. */
    private String id() {
        String id = prefs.getString("remoteId", null);
        if (id == null) {
            id = PhotoStore.randomId(12);
            prefs.edit().putString("remoteId", id).putString("remoteSecret", PhotoStore.randomId(40)).apply();
        }
        return id;
    }

    private String secret() {
        id();
        return prefs.getString("remoteSecret", "");
    }

    // ------------------------------------------------------------ connection

    void start() {
        stopped = false;
        connectSoon(2000);
        main.postDelayed(statusLoop, STATUS_EVERY_MS);
        main.postDelayed(pingLoop, PING_EVERY_MS);
    }

    void stop() {
        stopped = true;
        main.removeCallbacksAndMessages(null);
        if (socket != null) socket.close(1000, "bye");
    }

    private void connectSoon(long delayMs) {
        main.postDelayed(() -> io.execute(this::connect), delayMs);
    }

    private void connect() {
        if (stopped || connected) return;
        String hub;
        String override = prefs.getString("remoteHubOverride", "");
        if (!override.isEmpty()) {
            hub = override;   // set over USB for the automated test (local hub only)
        } else try {
            Response r = http.newCall(new Request.Builder()
                    .url(BuildConfig.SITE_URL + "remote.json?t=" + System.currentTimeMillis()).build()).execute();
            hub = new JSONObject(r.body().string()).optString("hub", "");
            r.close();
        } catch (Exception e) {
            hub = prefs.getString("remoteHub", "");  // offline: use the last known address
        }
        boolean local = hub.startsWith("ws://127.0.0.1:") || hub.startsWith("ws://localhost:");
        if (hub.isEmpty() || !(hub.startsWith("wss://") || local)) {
            connectSoon(30 * 60 * 1000L);         // remote admin not set up yet
            return;
        }
        if (!local) prefs.edit().putString("remoteHub", hub).apply();

        String name = "Tablet (" + prefs.getString("profile", "family") + ")";
        String url = hub + "?id=" + id() + "&secret=" + secret() + "&name=" + Uri.encode(name);
        socket = http.newWebSocket(new Request.Builder().url(url).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket ws, Response response) {
                main.post(() -> { connected = true; retry = 0; sendStatus(); });
            }
            @Override public void onMessage(WebSocket ws, String text) {
                if ("pong".equals(text)) return;
                main.post(() -> onHubMessage(text));
            }
            @Override public void onClosed(WebSocket ws, int code, String reason) { lost(code); }
            @Override public void onFailure(WebSocket ws, Throwable t, Response response) {
                Log.w(TAG, "Remote link failed: " + t.getMessage());
                lost(response != null ? response.code() : 0);
            }
        });
    }

    private void lost(int code) {
        main.post(() -> {
            connected = false;
            socket = null;
            setStream(false, false);
            if (stopped) return;
            if (code == 4003 || code == 403) {           // removed in the dashboard / secret mismatch
                connectSoon(6 * 60 * 60 * 1000L);
                return;
            }
            retry = Math.min(retry + 1, 8);
            connectSoon(Math.min(5 * 60 * 1000L, 2000L << retry)); // 4s, 8s, ... up to 5 min
        });
    }

    // ------------------------------------------------------------ hub → tablet

    private void onHubMessage(String text) {
        try {
            JSONObject m = new JSONObject(text);
            switch (m.optString("type")) {
                case "welcome":
                    approved = m.optBoolean("approved");
                    sendStatus();
                    break;
                case "stream":
                    setStream(m.optBoolean("mirror"), m.optBoolean("control"));
                    break;
                case "cmd": {
                    String cmd = m.optString("cmd");
                    JSONObject args = m.optJSONObject("args");
                    host.command(cmd, args == null ? new JSONObject() : args, (ok, message) -> {
                        try {
                            send(new JSONObject().put("type", "result").put("cmd", cmd).put("ok", ok).put("message", message));
                        } catch (Exception ignored) { }
                    });
                    break;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Bad hub message", e);
        }
    }

    private void setStream(boolean mirrorOn, boolean controlOn) {
        boolean wasOn = mirror || control;
        mirror = mirrorOn;
        control = controlOn;
        host.streamChanged(mirror, control);
        if (!wasOn && (mirror || control)) main.post(frameLoop);
    }

    // ------------------------------------------------------------ tablet → hub

    void sendStatus() {
        if (!connected) return;
        host.status(status -> {
            try { send(new JSONObject().put("type", "status").put("status", status)); } catch (Exception ignored) { }
        });
    }

    /** One full-size picture of their screen (dashboard "HD screenshot"). */
    void sendShot() {
        host.capture("mirror", true, data -> sendFrame("shot", "mirror", data));
    }

    private void sendFrame(String type, String mode, String data) {
        if (data == null) return;
        try {
            send(new JSONObject().put("type", type).put("mode", mode).put("mime", "image/jpeg")
                    .put("w", 1280).put("h", 800).put("data", data));
        } catch (Exception ignored) { }
    }

    private void send(JSONObject obj) {
        WebSocket s = socket;
        if (s != null) s.send(obj.toString());
    }

    // Screen pictures while someone is watching: ~1 per second (control a bit faster).
    private final Runnable frameLoop = new Runnable() {
        @Override public void run() {
            if (!(mirror || control) || !connected || !approved) return;
            WebSocket s = socket;
            if (!framePending && s != null && s.queueSize() < MAX_QUEUED_BYTES) {
                framePending = true;
                final boolean doMirror = mirror, doControl = control;
                if (doControl) {
                    host.capture("control", false, data -> { sendFrame("frame", "control", data); framePending = false; });
                } else if (doMirror) {
                    host.capture("mirror", false, data -> { sendFrame("frame", "mirror", data); framePending = false; });
                }
                // If both are wanted, alternate: the mirror picture goes out on the next tick.
                if (doControl && doMirror) {
                    main.postDelayed(() -> host.capture("mirror", false, data -> sendFrame("frame", "mirror", data)), 400);
                }
            }
            main.postDelayed(this, control ? 600 : 1000);
        }
    };

    private final Runnable statusLoop = new Runnable() {
        @Override public void run() {
            sendStatus();
            main.postDelayed(this, STATUS_EVERY_MS);
        }
    };

    // The hub answers "ping" itself without waking up (keeps the free tier free).
    private final Runnable pingLoop = new Runnable() {
        @Override public void run() {
            WebSocket s = socket;
            if (s != null && connected) s.send("ping");
            main.postDelayed(this, PING_EVERY_MS);
        }
    };

    boolean isConnected() { return connected; }
    boolean isApproved() { return approved; }
}
