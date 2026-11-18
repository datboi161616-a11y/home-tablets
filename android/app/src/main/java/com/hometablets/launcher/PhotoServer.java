package com.hometablets.launcher;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A tiny web server on the tablet so phones on the same Wi-Fi can add photos.
 * The tablet shows a QR code with http://<tablet-ip>:8080/?k=<key>. The key is
 * random per tablet, so only someone who can see the tablet's screen can upload.
 *
 *   GET  /                 upload page (assets/upload.html)
 *   GET  /api/photos       list (JSON)
 *   GET  /api/photo/<id>   one photo
 *   POST /api/upload       raw image body; ?name=&caption=
 *   POST /api/delete       ?id=
 */
final class PhotoServer {
    static final int PORT = 8080;
    private static final String TAG = "HomeTablet";

    interface Listener {
        void onPhotosChanged();
        /** what: "settings" or "notes" */
        void onFamilyChanged(String what);
        /** A tick or new item from the phone's shopping list (see FamilyStore.shoppingAction). */
        void onShoppingAction(JSONObject action);
    }

    private static final int MAX_JSON_BODY = 64 * 1024;

    private final Context ctx;
    private final PhotoStore store;
    private final FamilyStore family;
    private final Listener listener;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private ServerSocket server;
    private volatile boolean running;

    PhotoServer(Context ctx, PhotoStore store, FamilyStore family, Listener listener) {
        this.ctx = ctx.getApplicationContext();
        this.store = store;
        this.family = family;
        this.listener = listener;
    }

    /** Per-tablet upload key (stays the same unless reset). */
    static String key(Context c) {
        SharedPreferences p = c.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        String k = p.getString("uploadKey", null);
        if (k == null) {
            k = PhotoStore.randomId(10);
            p.edit().putString("uploadKey", k).apply();
        }
        return k;
    }

    static void resetKey(Context c) {
        c.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE).edit().remove("uploadKey").apply();
    }

    /** e.g. http://192.168.1.23:8080/?k=abc..., or "" when not on Wi-Fi. */
    static String uploadUrl(Context c) {
        String ip = wifiIp();
        return ip == null ? "" : "http://" + ip + ":" + PORT + "/?k=" + key(c);
    }

    static String wifiIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    synchronized void start() {
        if (running) return;
        running = true;
        new Thread(() -> {
            try (ServerSocket s = new ServerSocket(PORT)) {
                server = s;
                while (running) {
                    Socket client = s.accept();
                    pool.execute(() -> handle(client));
                }
            } catch (Exception e) {
                if (running) Log.w(TAG, "Photo server stopped", e);
            }
            running = false;
        }, "photo-server").start();
    }

    synchronized void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------------ requests

    private void handle(Socket socket) {
        try (Socket s = socket) {
            s.setSoTimeout(60000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();

            String requestLine = readLine(in);
            if (requestLine == null) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            Uri uri = Uri.parse("http://x" + parts[1]);
            String path = uri.getPath() == null ? "/" : uri.getPath();

            Map<String, String> headers = new HashMap<>();
            String line;
            int headerLines = 0;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                if (++headerLines > 100) return; // a real phone sends ~15; refuse anything silly
                int c = line.indexOf(':');
                if (c > 0) headers.put(line.substring(0, c).trim().toLowerCase(Locale.US), line.substring(c + 1).trim());
            }

            if (path.equals("/favicon.ico")) { send(out, 404, "text/plain", "".getBytes()); return; }

            if (!key(ctx).equals(uri.getQueryParameter("k"))) {
                send(out, 403, "text/html; charset=utf-8", (
                        "<!doctype html><meta name=viewport content='width=device-width'>"
                        + "<body style='font:18px system-ui;padding:32px;text-align:center'>"
                        + "<h2>This link has expired</h2><p>Scan the QR code on the tablet again.</p>").getBytes("UTF-8"));
                return;
            }

            if (method.equals("GET") && path.equals("/")) {
                send(out, 200, "text/html; charset=utf-8", readAsset("upload.html"));
            } else if (method.equals("GET") && path.equals("/api/photos")) {
                sendJson(out, 200, new JSONObject().put("photos", store.list()).put("max", PhotoStore.MAX_ITEMS));
            } else if (method.equals("GET") && path.startsWith("/api/photo/")) {
                File f = store.file(path.substring("/api/photo/".length()));
                if (f == null) send(out, 404, "text/plain", "Not found".getBytes());
                else sendFile(out, f, store.contentType(path.substring("/api/photo/".length())));
            } else if (method.equals("POST") && path.equals("/api/upload")) {
                long len = Long.parseLong(headers.getOrDefault("content-length", "0"));
                try {
                    String id = store.save(in, len, uri.getQueryParameter("name"), uri.getQueryParameter("caption"));
                    sendJson(out, 200, new JSONObject().put("ok", true).put("id", id));
                    listener.onPhotosChanged();
                } catch (Exception e) {
                    sendJson(out, 400, new JSONObject().put("ok", false).put("error", String.valueOf(e.getMessage())));
                }
            } else if (method.equals("POST") && path.equals("/api/delete")) {
                boolean ok = store.delete(uri.getQueryParameter("id"));
                sendJson(out, ok ? 200 : 404, new JSONObject().put("ok", ok));
                if (ok) listener.onPhotosChanged();
            // ---- tablet settings (family name, people, dates, calendar links) ----
            } else if (method.equals("GET") && path.equals("/api/settings")) {
                sendJson(out, 200, family.settings());
            } else if (method.equals("POST") && path.equals("/api/settings")) {
                try {
                    JSONObject saved = family.saveSettings(new JSONObject(readBody(in, headers)));
                    sendJson(out, 200, new JSONObject().put("ok", true).put("settings", saved));
                    listener.onFamilyChanged("settings");
                } catch (Exception e) {
                    sendJson(out, 400, new JSONObject().put("ok", false).put("error", String.valueOf(e.getMessage())));
                }
            } else if (method.equals("GET") && path.equals("/api/calendar-check")) {
                sendJson(out, 200, FamilyStore.checkCalendar(uri.getQueryParameter("url")));
            // ---- message board notes ----
            } else if (method.equals("GET") && path.equals("/api/notes")) {
                sendJson(out, 200, new JSONObject().put("notes", family.notes()));
            } else if (method.equals("POST") && path.equals("/api/notes")) {
                try {
                    JSONObject b = new JSONObject(readBody(in, headers));
                    JSONObject n = family.addNote(b.optString("who"), b.optString("text"), b.optString("photo", null), b.optString("replyTo", null));
                    sendJson(out, 200, new JSONObject().put("ok", true).put("note", n));
                    listener.onFamilyChanged("notes");
                } catch (Exception e) {
                    sendJson(out, 400, new JSONObject().put("ok", false).put("error", String.valueOf(e.getMessage())));
                }
            } else if (method.equals("GET") && path.equals("/api/shopping")) {
                sendJson(out, 200, family.shopping());
            } else if (method.equals("POST") && path.equals("/api/shopping")) {
                try {
                    JSONObject a = FamilyStore.shoppingAction(new JSONObject(readBody(in, headers)));
                    listener.onShoppingAction(a);
                    sendJson(out, 200, new JSONObject().put("ok", true));
                } catch (Exception e) {
                    sendJson(out, 400, new JSONObject().put("ok", false).put("error", String.valueOf(e.getMessage())));
                }
            } else if (method.equals("POST") && path.equals("/api/notes/delete")) {
                boolean ok = family.deleteNote(uri.getQueryParameter("id"));
                sendJson(out, ok ? 200 : 404, new JSONObject().put("ok", ok));
                if (ok) listener.onFamilyChanged("notes");
            } else {
                send(out, 404, "text/plain", "Not found".getBytes());
            }
        } catch (Exception e) {
            Log.w(TAG, "Photo request failed", e);
        }
    }

    private static String readBody(InputStream in, Map<String, String> headers) throws Exception {
        int len = Integer.parseInt(headers.getOrDefault("content-length", "0"));
        if (len <= 0 || len > MAX_JSON_BODY) throw new Exception("Bad request size");
        byte[] buf = new byte[len];
        int got = 0;
        while (got < len) {
            int n = in.read(buf, got, len - got);
            if (n < 0) throw new Exception("Request cut off");
            got += n;
        }
        return new String(buf, "UTF-8");
    }

    private static String readLine(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 8192) throw new java.io.IOException("Header too long");
        }
        if (c == -1 && b.size() == 0) return null;
        return b.toString("UTF-8");
    }

    private byte[] readAsset(String name) throws java.io.IOException {
        try (InputStream in = ctx.getAssets().open(name)) {
            return MainActivity.readAll(in).getBytes("UTF-8");
        }
    }

    private static void sendJson(OutputStream out, int code, JSONObject body) throws java.io.IOException {
        send(out, code, "application/json", body.toString().getBytes("UTF-8"));
    }

    private static void send(OutputStream out, int code, String type, byte[] body) throws java.io.IOException {
        out.write(head(code, type, body.length).getBytes("UTF-8"));
        out.write(body);
        out.flush();
    }

    private static void sendFile(OutputStream out, File f, String type) throws java.io.IOException {
        out.write(head(200, type, f.length()).getBytes("UTF-8"));
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        out.flush();
    }

    private static String head(int code, String type, long len) {
        String status = code == 200 ? "OK" : code == 400 ? "Bad Request" : code == 403 ? "Forbidden" : "Not Found";
        return "HTTP/1.1 " + code + " " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + len + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
    }
}
