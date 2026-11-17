package com.hometablets.launcher;

import android.app.AppOpsManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Process;
import android.util.DisplayMetrics;
import android.util.Log;

import java.nio.ByteBuffer;

/**
 * Pictures of the WHOLE tablet screen (any app, e.g. YouTube), for your dashboard.
 *
 * Android normally asks "Start recording?" every time. If the one-time USB setup
 * command was run (android/SETUP.md, step 4):
 *     adb shell appops set com.hometablets.launcher PROJECT_MEDIA allow
 * Android grants it silently, so nobody at the tablet is ever asked. Without it,
 * we never ask either: you just get our own screens instead.
 */
public class ScreenCapture extends Service {
    private static final String TAG = "HomeTablet";
    static final String EXTRA_CODE = "code";
    static final String EXTRA_DATA = "data";

    private static volatile ScreenCapture instance;

    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private int width, height;

    static ScreenCapture get() { return instance; }

    /** True if the USB setup allowed silent screen capture. */
    static boolean allowedSilently(Context c) {
        try {
            AppOpsManager ops = c.getSystemService(AppOpsManager.class);
            int mode = ops.unsafeCheckOpNoThrow("android:project_media", Process.myUid(), c.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startInForeground();
        if (intent == null || projection != null) return START_NOT_STICKY;
        int code = intent.getIntExtra(EXTRA_CODE, 0);
        Intent data = intent.getParcelableExtra(EXTRA_DATA);
        try {
            MediaProjectionManager mpm = getSystemService(MediaProjectionManager.class);
            projection = mpm.getMediaProjection(code, data);
            if (projection == null) { stopSelf(); return START_NOT_STICKY; }
            begin();
            instance = this;
        } catch (Exception e) {
            Log.w(TAG, "Screen capture failed to start", e);
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void startInForeground() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("remote", "Remote help", NotificationManager.IMPORTANCE_MIN));
        Notification n = new Notification.Builder(this, "remote")
                .setContentTitle("Remote help is connected")
                .setSmallIcon(android.R.drawable.presence_video_online)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(42, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(42, n);
    }

    private void begin() {
        DisplayMetrics m = getResources().getDisplayMetrics();
        width = 1280;
        height = Math.round(width * Math.min(m.widthPixels, m.heightPixels) / (float) Math.max(m.widthPixels, m.heightPixels));
        if (m.heightPixels > m.widthPixels) { int t = width; width = height; height = t; }
        thread = new HandlerThread("capture");
        thread.start();
        Handler h = new Handler(thread.getLooper());
        projection.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { cleanup(); }
        }, h);
        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        display = projection.createVirtualDisplay("remote-help", width, height, m.densityDpi / 2,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, h);
    }

    /** Latest picture of the whole screen, or null if none yet. Caller recycles it. */
    Bitmap latest() {
        ImageReader r = reader;
        if (r == null) return null;
        Image img = null;
        try {
            img = r.acquireLatestImage();
            if (img == null) return lastFrame == null ? null : lastFrame.copy(Bitmap.Config.ARGB_8888, false);
            Image.Plane p = img.getPlanes()[0];
            ByteBuffer buf = p.getBuffer();
            int rowPadding = p.getRowStride() - p.getPixelStride() * width;
            Bitmap padded = Bitmap.createBitmap(width + rowPadding / p.getPixelStride(), height, Bitmap.Config.ARGB_8888);
            padded.copyPixelsFromBuffer(buf);
            Bitmap exact = Bitmap.createBitmap(padded, 0, 0, width, height);
            if (exact != padded) padded.recycle();
            if (lastFrame != null) lastFrame.recycle();
            lastFrame = exact.copy(Bitmap.Config.ARGB_8888, false);
            return exact;
        } catch (Exception e) {
            Log.w(TAG, "Screen capture frame failed", e);
            return null;
        } finally {
            if (img != null) img.close();
        }
    }
    private Bitmap lastFrame; // the screen doesn't always change; reuse the last picture

    private void cleanup() {
        instance = null;
        try { if (display != null) display.release(); } catch (Exception ignored) { }
        try { if (reader != null) reader.close(); } catch (Exception ignored) { }
        try { if (projection != null) projection.stop(); } catch (Exception ignored) { }
        if (thread != null) thread.quitSafely();
        display = null; reader = null; projection = null;
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        cleanup();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
