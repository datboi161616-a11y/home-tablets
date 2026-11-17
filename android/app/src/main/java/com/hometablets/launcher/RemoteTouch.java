package com.hometablets.launcher;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityEvent;

/**
 * "Take over" from your dashboard: real taps, swipes and Back/Home anywhere on
 * the tablet, including inside other apps. Same technique remote-support apps use.
 *
 * Switched on once over USB during setup (android/SETUP.md, step 4); nobody at
 * the tablet has to go into Settings. Also tells us which app is on screen.
 */
public class RemoteTouch extends AccessibilityService {
    private static volatile RemoteTouch instance;
    static volatile String foregroundPackage = "";

    static RemoteTouch get() { return instance; }

    @Override
    protected void onServiceConnected() {
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && e.getPackageName() != null) {
            String pkg = e.getPackageName().toString();
            if (!pkg.equals("com.android.systemui")) foregroundPackage = pkg;
        }
    }

    @Override
    public void onInterrupt() { }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    private float[] px(double x, double y) {
        DisplayMetrics m = getResources().getDisplayMetrics();
        return new float[] { (float) (clamp(x) * (m.widthPixels - 1)), (float) (clamp(y) * (m.heightPixels - 1)) };
    }

    private static double clamp(double v) {
        return Double.isNaN(v) ? 0 : Math.max(0, Math.min(1, v));
    }

    /** x, y from 0..1 of the screen. */
    boolean tap(double x, double y) {
        float[] p = px(x, y);
        Path path = new Path();
        path.moveTo(p[0], p[1]);
        return dispatchGesture(new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(path, 0, 60)).build(), null, null);
    }

    boolean swipe(double x1, double y1, double x2, double y2, int ms) {
        float[] a = px(x1, y1), b = px(x2, y2);
        Path path = new Path();
        path.moveTo(a[0], a[1]);
        path.lineTo(b[0], b[1]);
        return dispatchGesture(new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(path, 0, Math.max(100, Math.min(1500, ms)))).build(), null, null);
    }

    /** "back", "home" or "recents". */
    boolean key(String k) {
        switch (k) {
            case "back": return performGlobalAction(GLOBAL_ACTION_BACK);
            case "home": return performGlobalAction(GLOBAL_ACTION_HOME);
            case "recents": return performGlobalAction(GLOBAL_ACTION_RECENTS);
            default: return false;
        }
    }
}
