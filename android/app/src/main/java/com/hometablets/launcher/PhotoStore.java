package com.hometablets.launcher;

import android.content.Context;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.SecureRandom;
import java.util.Arrays;

/**
 * The tablet's own album (photos and short videos), in the app's private storage.
 * Media never leaves the tablet: each tablet has its own album.
 *
 * Each item is <id>.json ({ name, caption, added, ext, video }) plus the media
 * file <id>.<ext> (jpg for photos, webm/mp4 for videos).
 */
final class PhotoStore {
    static final int MAX_ITEMS = 500;
    static final long MAX_PHOTO_BYTES = 15L * 1024 * 1024;
    static final long MAX_VIDEO_BYTES = 60L * 1024 * 1024; // short family clips

    private final File dir;

    PhotoStore(Context c) {
        dir = new File(c.getFilesDir(), "photos");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    /** Newest first: each item's meta plus id. */
    synchronized JSONArray list() {
        File[] metas = dir.listFiles((d, n) -> n.endsWith(".json"));
        if (metas == null) return new JSONArray();
        Arrays.sort(metas, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        JSONArray out = new JSONArray();
        for (File f : metas) {
            String id = f.getName().substring(0, f.getName().length() - 5);
            JSONObject meta = readMeta(id);
            if (file(id) == null) continue; // meta without media: skip
            try {
                out.put(new JSONObject()
                        .put("id", id)
                        .put("name", meta.optString("name", ""))
                        .put("caption", meta.optString("caption", ""))
                        .put("added", meta.optLong("added", f.lastModified()))
                        .put("video", meta.optBoolean("video", false))
                        .put("ext", meta.optString("ext", "jpg")));
            } catch (Exception ignored) { }
        }
        return out;
    }

    synchronized int count() {
        String[] n = dir.list((d, name) -> name.endsWith(".json"));
        return n == null ? 0 : n.length;
    }

    /** Photo upload from a phone (streamed, exact length). Returns the new id. */
    String save(InputStream in, long length, String name, String caption) throws Exception {
        if (length <= 0 || length > MAX_PHOTO_BYTES) throw new Exception("Photo too large");
        if (count() >= MAX_ITEMS) throw new Exception("Album is full (" + MAX_ITEMS + " items). Delete some first.");
        String id = newId();
        File tmp = new File(dir, id + ".part");
        try (OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[65536];
            long left = length;
            while (left > 0) {
                int n = in.read(buf, 0, (int) Math.min(buf.length, left));
                if (n < 0) throw new Exception("Upload cut off");
                out.write(buf, 0, n);
                left -= n;
            }
        }
        if (!looksLikeImage(tmp)) { tmp.delete(); throw new Exception("Not a photo"); }
        commit(id, tmp, "jpg", false, name, caption);
        return id;
    }

    /** Photo or video from the tablet's own camera (base64 from the web app). */
    String saveMedia(String base64, boolean video, String caption) throws Exception {
        if (count() >= MAX_ITEMS) throw new Exception("Album is full");
        byte[] data = Base64.decode(base64, Base64.DEFAULT);
        long max = video ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
        if (data.length == 0 || data.length > max) throw new Exception((video ? "Video" : "Photo") + " too large");
        String ext = video ? guessVideoExt(data) : "jpg";
        if (!video && !looksLikeImage(data)) throw new Exception("Not a photo");
        String id = newId();
        File tmp = new File(dir, id + ".part");
        try (OutputStream out = new FileOutputStream(tmp)) { out.write(data); }
        commit(id, tmp, ext, video, "", caption);
        return id;
    }

    private synchronized void commit(String id, File tmp, String ext, boolean video, String name, String caption) throws Exception {
        JSONObject meta = new JSONObject()
                .put("name", clip(name, 40))
                .put("caption", clip(caption, 120))
                .put("added", System.currentTimeMillis())
                .put("ext", ext)
                .put("video", video);
        try (OutputStream out = new FileOutputStream(new File(dir, id + ".json"))) {
            out.write(meta.toString().getBytes("UTF-8"));
        }
        if (!tmp.renameTo(new File(dir, id + "." + ext))) { tmp.delete(); throw new Exception("Couldn't save"); }
    }

    synchronized boolean delete(String id) {
        if (!validId(id)) return false;
        File media = file(id);
        new File(dir, id + ".json").delete();
        return media != null && media.delete();
    }

    /** The media file, or null. Only plain ids are accepted (no paths). */
    File file(String id) {
        if (!validId(id)) return null;
        for (String ext : new String[] { "jpg", "webm", "mp4", "png", "gif" }) {
            File f = new File(dir, id + "." + ext);
            if (f.isFile()) return f;
        }
        return null;
    }

    String contentType(String id) {
        File f = file(id);
        if (f == null) return "application/octet-stream";
        String n = f.getName();
        if (n.endsWith(".webm")) return "video/webm";
        if (n.endsWith(".mp4")) return "video/mp4";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".gif")) return "image/gif";
        return "image/jpeg";
    }

    static boolean validId(String id) {
        return id != null && id.matches("[a-z0-9]{4,32}");
    }

    private static String newId() {
        return Long.toString(System.currentTimeMillis(), 36) + randomId(4);
    }

    private JSONObject readMeta(String id) {
        try (InputStream in = new java.io.FileInputStream(new File(dir, id + ".json"))) {
            return new JSONObject(MainActivity.readAll(in));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static boolean looksLikeImage(File f) {
        byte[] b = new byte[12];
        try (InputStream in = new java.io.FileInputStream(f)) {
            if (in.read(b) < 12) return false;
        } catch (Exception e) { return false; }
        return looksLikeImage(b);
    }

    /** JPEG, PNG, WebP or GIF magic bytes. */
    private static boolean looksLikeImage(byte[] b) {
        if (b.length < 12) return false;
        boolean jpeg = (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8;
        boolean png = (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
        boolean gif = b[0] == 'G' && b[1] == 'I' && b[2] == 'F';
        boolean webp = b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
        return jpeg || png || gif || webp;
    }

    /** WebM (EBML) or MP4 (ftyp) → file extension. */
    private static String guessVideoExt(byte[] b) {
        if (b.length >= 4 && (b[0] & 0xFF) == 0x1A && (b[1] & 0xFF) == 0x45 && (b[2] & 0xFF) == 0xDF && (b[3] & 0xFF) == 0xA3) return "webm";
        if (b.length >= 8 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p') return "mp4";
        return "webm";
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    static String randomId(int len) {
        String chars = "abcdefghijkmnpqrstuvwxyz23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) sb.append(chars.charAt(r.nextInt(chars.length())));
        return sb.toString();
    }
}
