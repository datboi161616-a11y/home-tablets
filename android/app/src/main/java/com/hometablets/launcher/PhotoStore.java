package com.hometablets.launcher;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.SecureRandom;
import java.util.Arrays;

/**
 * The tablet's own photo album, kept in the app's private storage.
 * Photos never leave the tablet: each tablet has its own album.
 *
 * Each photo is <id>.jpg plus <id>.json with { name, caption, added }.
 */
final class PhotoStore {
    static final int MAX_PHOTOS = 500;
    static final long MAX_BYTES = 15L * 1024 * 1024; // per photo (phones resize before sending)

    private final File dir;

    PhotoStore(Context c) {
        dir = new File(c.getFilesDir(), "photos");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    /** Newest first. */
    synchronized JSONArray list() {
        File[] files = dir.listFiles((d, n) -> n.endsWith(".jpg"));
        if (files == null) return new JSONArray();
        Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        JSONArray out = new JSONArray();
        for (File f : files) {
            String id = f.getName().substring(0, f.getName().length() - 4);
            JSONObject meta = readMeta(id);
            try {
                out.put(new JSONObject()
                        .put("id", id)
                        .put("name", meta.optString("name", ""))
                        .put("caption", meta.optString("caption", ""))
                        .put("added", meta.optLong("added", f.lastModified())));
            } catch (Exception ignored) { }
        }
        return out;
    }

    synchronized int count() {
        String[] n = dir.list((d, name) -> name.endsWith(".jpg"));
        return n == null ? 0 : n.length;
    }

    /** Saves exactly `length` bytes from `in`. Returns the new id. */
    String save(InputStream in, long length, String name, String caption) throws Exception {
        if (length <= 0 || length > MAX_BYTES) throw new Exception("Photo too large");
        if (count() >= MAX_PHOTOS) throw new Exception("Album is full (" + MAX_PHOTOS + " photos). Delete some first.");
        String id = Long.toString(System.currentTimeMillis(), 36) + randomId(4);
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
        if (!looksLikeImage(tmp)) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw new Exception("Not a photo");
        }
        JSONObject meta = new JSONObject()
                .put("name", clip(name, 40))
                .put("caption", clip(caption, 120))
                .put("added", System.currentTimeMillis());
        synchronized (this) {
            try (OutputStream out = new FileOutputStream(new File(dir, id + ".json"))) {
                out.write(meta.toString().getBytes("UTF-8"));
            }
            if (!tmp.renameTo(new File(dir, id + ".jpg"))) throw new Exception("Couldn't save photo");
        }
        return id;
    }

    synchronized boolean delete(String id) {
        if (!validId(id)) return false;
        //noinspection ResultOfMethodCallIgnored
        new File(dir, id + ".json").delete();
        return new File(dir, id + ".jpg").delete();
    }

    /** The photo file, or null. Only plain ids are accepted (no paths). */
    File file(String id) {
        if (!validId(id)) return null;
        File f = new File(dir, id + ".jpg");
        return f.isFile() ? f : null;
    }

    static boolean validId(String id) {
        return id != null && id.matches("[a-z0-9]{4,32}");
    }

    private JSONObject readMeta(String id) {
        try (InputStream in = new java.io.FileInputStream(new File(dir, id + ".json"))) {
            return new JSONObject(MainActivity.readAll(in));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** JPEG, PNG, WebP or GIF magic bytes. */
    private static boolean looksLikeImage(File f) {
        byte[] b = new byte[12];
        try (InputStream in = new java.io.FileInputStream(f)) {
            if (in.read(b) < 12) return false;
        } catch (Exception e) {
            return false;
        }
        boolean jpeg = (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8;
        boolean png = (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
        boolean gif = b[0] == 'G' && b[1] == 'I' && b[2] == 'F';
        boolean webp = b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
        return jpeg || png || gif || webp;
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
