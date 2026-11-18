package com.hometablets.launcher;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * This tablet's family settings and message-board notes, kept on the tablet.
 * Set up from a phone (the same QR page that adds photos), shown by the screens.
 *
 * settings.json: { familyName, people:[name], dates:[{name, month, day, kind}],
 *                  calendars:[{name, url}], units: "fahrenheit"|"celsius" }
 * notes.json:    [{ id, who, text, at, love, read, photo }]  (newest first)
 */
final class FamilyStore {
    static final int MAX_NOTES = 200;
    static final int MAX_CALENDARS = 6;
    private static final long MAX_ICS_BYTES = 3L * 1024 * 1024;

    private static final int MAX_SHOPPING_CHARS = 256 * 1024;

    private final File settingsFile, notesFile, calendarCache, shoppingFile;

    FamilyStore(Context c) {
        settingsFile = new File(c.getFilesDir(), "settings.json");
        notesFile = new File(c.getFilesDir(), "notes.json");
        shoppingFile = new File(c.getFilesDir(), "shopping.json");
        calendarCache = new File(c.getFilesDir(), "calendars");
        //noinspection ResultOfMethodCallIgnored
        calendarCache.mkdirs();
    }

    // ------------------------------------------------------------ settings

    synchronized JSONObject settings() {
        try { return new JSONObject(read(settingsFile, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    /** Saves the phone page's settings, keeping only known fields with sane sizes. */
    synchronized JSONObject saveSettings(JSONObject in) throws Exception {
        JSONObject out = new JSONObject();
        out.put("familyName", clip(in.optString("familyName", ""), 40));
        out.put("units", "celsius".equals(in.optString("units")) ? "celsius" : "fahrenheit");

        JSONArray people = new JSONArray();
        JSONArray pin = in.optJSONArray("people");
        for (int i = 0; pin != null && i < pin.length() && people.length() < 16; i++) {
            String p = clip(pin.optString(i, ""), 30);
            if (!p.isEmpty()) people.put(p);
        }
        out.put("people", people);

        JSONArray dates = new JSONArray();
        JSONArray din = in.optJSONArray("dates");
        for (int i = 0; din != null && i < din.length() && dates.length() < 60; i++) {
            JSONObject d = din.optJSONObject(i);
            if (d == null) continue;
            int month = d.optInt("month"), day = d.optInt("day");
            String name = clip(d.optString("name", ""), 50);
            if (name.isEmpty() || month < 1 || month > 12 || day < 1 || day > 31) continue;
            String kind = "birthday".equals(d.optString("kind")) ? "birthday" : "event";
            dates.put(new JSONObject().put("name", name).put("month", month).put("day", day).put("kind", kind));
        }
        out.put("dates", dates);

        JSONArray cals = new JSONArray();
        JSONArray cin = in.optJSONArray("calendars");
        for (int i = 0; cin != null && i < cin.length() && cals.length() < MAX_CALENDARS; i++) {
            JSONObject c = cin.optJSONObject(i);
            if (c == null) continue;
            String url = normalizeCalendarUrl(c.optString("url", ""));
            if (url == null) continue;
            cals.put(new JSONObject().put("name", clip(c.optString("name", "Calendar"), 30)).put("url", url));
        }
        out.put("calendars", cals);

        write(settingsFile, out.toString());
        return out;
    }

    /** webcal:// links (iPhone) become https://. Anything else must already be https. */
    static String normalizeCalendarUrl(String url) {
        if (url == null) return null;
        url = url.trim();
        if (url.startsWith("webcal://")) url = "https://" + url.substring(9);
        if (!url.startsWith("https://") || url.length() > 600 || url.contains(" ")) return null;
        return url;
    }

    // ------------------------------------------------------------ calendars

    /**
     * Downloads every saved calendar link (ICS). Returns [{name, ics, ok, error}].
     * Falls back to the last good copy when offline. Call off the UI thread.
     */
    JSONArray fetchCalendars() {
        JSONArray out = new JSONArray();
        JSONArray cals = settings().optJSONArray("calendars");
        for (int i = 0; cals != null && i < cals.length(); i++) {
            JSONObject c = cals.optJSONObject(i);
            String url = c == null ? null : c.optString("url", null);
            if (url == null) continue;
            File cache = new File(calendarCache, Integer.toHexString(url.hashCode()) + ".ics");
            JSONObject item = new JSONObject();
            try {
                item.put("name", c.optString("name", "Calendar"));
                try {
                    String ics = download(url);
                    if (!ics.contains("BEGIN:VCALENDAR")) throw new Exception("That link isn't a calendar");
                    write(cache, ics);
                    item.put("ics", ics).put("ok", true);
                } catch (Exception e) {
                    item.put("ok", false).put("error", String.valueOf(e.getMessage()));
                    if (cache.isFile()) item.put("ics", read(cache, "")); // last good copy
                }
                out.put(item);
            } catch (Exception ignored) { }
        }
        return out;
    }

    /** Quick check for the phone page: does this link work, and how many events? */
    static JSONObject checkCalendar(String url) {
        JSONObject r = new JSONObject();
        try {
            String u = normalizeCalendarUrl(url);
            if (u == null) return r.put("ok", false).put("error", "Paste the full link (it starts with https:// or webcal://)");
            String ics = download(u);
            if (!ics.contains("BEGIN:VCALENDAR")) return r.put("ok", false).put("error", "That link isn't a calendar");
            int n = 0, at = 0;
            while ((at = ics.indexOf("BEGIN:VEVENT", at)) >= 0) { n++; at += 12; }
            return r.put("ok", true).put("events", n);
        } catch (Exception e) {
            try { return r.put("ok", false).put("error", "Couldn't open that link: " + e.getMessage()); } catch (Exception x) { return r; }
        }
    }

    private static String download(String url) throws Exception {
        for (int hops = 0; hops < 5; hops++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setRequestProperty("User-Agent", "HomeTablet/" + BuildConfig.VERSION_NAME);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = c.getHeaderField("Location");
                c.disconnect();
                if (next == null || !next.startsWith("https://")) throw new Exception("bad redirect");
                url = next;
                continue;
            }
            if (code >= 400) { c.disconnect(); throw new Exception("HTTP " + code); }
            try (InputStream in = c.getInputStream()) {
                java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                byte[] b = new byte[16384];
                int n;
                while ((n = in.read(b)) > 0) {
                    buf.write(b, 0, n);
                    if (buf.size() > MAX_ICS_BYTES) throw new Exception("calendar too large");
                }
                return buf.toString("UTF-8");
            } finally {
                c.disconnect();
            }
        }
        throw new Exception("too many redirects");
    }

    // ------------------------------------------------------------ notes

    synchronized JSONArray notes() {
        try { return new JSONArray(read(notesFile, "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    synchronized JSONObject addNote(String who, String text, String photoId, String replyTo) throws Exception {
        who = clip(who, 30);
        text = clip(text, 500);
        if (text.isEmpty()) throw new Exception("Write something first");
        JSONObject n = new JSONObject()
                .put("id", Long.toString(System.currentTimeMillis(), 36) + PhotoStore.randomId(3))
                .put("who", who.isEmpty() ? "Someone" : who)
                .put("text", text)
                .put("at", System.currentTimeMillis())
                .put("love", 0)
                .put("read", false);
        if (photoId != null && PhotoStore.validId(photoId)) n.put("photo", photoId);
        if (replyTo != null && !replyTo.trim().isEmpty()) n.put("replyTo", clip(replyTo, 30));
        JSONArray old = notes();
        JSONArray all = new JSONArray().put(n);
        for (int i = 0; i < old.length() && all.length() < MAX_NOTES; i++) all.put(old.get(i));
        write(notesFile, all.toString());
        return n;
    }

    /** patch: {"love":true} adds a heart, {"read":true} marks read. */
    synchronized boolean updateNote(String id, JSONObject patch) throws Exception {
        JSONArray all = notes();
        boolean found = false;
        for (int i = 0; i < all.length(); i++) {
            JSONObject n = all.getJSONObject(i);
            if (!n.optString("id").equals(id)) continue;
            if (patch.optBoolean("love")) n.put("love", n.optInt("love") + 1);
            if (patch.has("read")) n.put("read", patch.optBoolean("read"));
            found = true;
        }
        if (found) write(notesFile, all.toString());
        return found;
    }

    synchronized void markAllRead() throws Exception {
        JSONArray all = notes();
        for (int i = 0; i < all.length(); i++) all.getJSONObject(i).put("read", true);
        write(notesFile, all.toString());
    }

    synchronized boolean deleteNote(String id) throws Exception {
        JSONArray all = notes(), keep = new JSONArray();
        for (int i = 0; i < all.length(); i++) if (!all.getJSONObject(i).optString("id").equals(id)) keep.put(all.get(i));
        if (keep.length() == all.length()) return false;
        write(notesFile, keep.toString());
        return true;
    }

    // ------------------------------------------------------------ shopping list
    // The tablet's screens work out the list (from the week plan) and save a copy here,
    // so the phone page can show it. Ticks from the phone go back to the screens.

    synchronized JSONObject shopping() {
        try { return new JSONObject(read(shoppingFile, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    synchronized void saveShopping(String json) throws Exception {
        if (json == null || json.length() > MAX_SHOPPING_CHARS) throw new Exception("list too big");
        write(shoppingFile, new JSONObject(json).toString()); // must parse
    }

    /** A tick or a new item from the phone: {act:"got", key, kind:"item"|"extra", got} or {act:"add", text}. */
    static JSONObject shoppingAction(JSONObject b) throws Exception {
        String act = b.optString("act");
        JSONObject a = new JSONObject().put("act", act);
        if (act.equals("got")) {
            String key = clip(b.optString("key"), 100);
            if (key.isEmpty()) throw new Exception("which item?");
            a.put("key", key).put("kind", "extra".equals(b.optString("kind")) ? "extra" : "item").put("got", b.optBoolean("got"));
        } else if (act.equals("add")) {
            String text = clip(b.optString("text"), 60);
            if (text.isEmpty()) throw new Exception("Type something first");
            a.put("text", text);
        } else throw new Exception("unknown action");
        return a;
    }

    // ------------------------------------------------------------ files

    private static String read(File f, String fallback) {
        if (!f.isFile()) return fallback;
        try (InputStream in = new FileInputStream(f)) { return MainActivity.readAll(in); } catch (Exception e) { return fallback; }
    }

    private static void write(File f, String text) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) { out.write(text.getBytes("UTF-8")); }
        if (!tmp.renameTo(f)) throw new Exception("couldn't save");
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }
}
