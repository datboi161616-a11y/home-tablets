package com.hometablets.launcher;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.provider.Settings;

/**
 * Kiosk mode. Only active once the app is "device owner", which is set once per
 * tablet over USB:  adb shell dpm set-device-owner com.hometablets.launcher/.AdminReceiver
 * Undo from the grown-up menu ("Turn off kiosk mode") or with a factory reset.
 */
final class Kiosk {
    private Kiosk() {}

    static boolean isOwner(Context c) {
        DevicePolicyManager dpm = c.getSystemService(DevicePolicyManager.class);
        return dpm != null && dpm.isDeviceOwnerApp(c.getPackageName());
    }

    static ComponentName admin(Context c) {
        return new ComponentName(c, AdminReceiver.class);
    }

    /** Lock-down settings, re-applied on every start (cheap and idempotent). */
    static void applyPolicies(Activity a) {
        if (!isOwner(a)) return;
        DevicePolicyManager dpm = a.getSystemService(DevicePolicyManager.class);
        ComponentName admin = admin(a);
        String pkg = a.getPackageName();
        try {
            allowApps(a);
            // Keep the power menu, and the Home button so other apps (YouTube...) lead back here.
            dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
                    | DevicePolicyManager.LOCK_TASK_FEATURE_HOME);

            // Always our app as the home screen.
            IntentFilter home = new IntentFilter(Intent.ACTION_MAIN);
            home.addCategory(Intent.CATEGORY_HOME);
            home.addCategory(Intent.CATEGORY_DEFAULT);
            dpm.addPersistentPreferredActivity(admin, home, new ComponentName(a, MainActivity.class));

            dpm.setKeyguardDisabled(admin, true);     // no lock screen
            dpm.setStatusBarDisabled(admin, true);    // no pull-down shade
            // Screen stays on while charging (AC | USB | wireless).
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "7");

            for (String p : new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.RECORD_AUDIO,
                    Manifest.permission.CAMERA }) {
                dpm.setPermissionGrantState(admin, pkg, p, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED);
            }
        } catch (SecurityException e) {
            e.printStackTrace();
        }
    }

    /** Which apps may run in kiosk mode: ours, Settings, the Play Store and the household's apps. */
    static void allowApps(Context c) {
        if (!isOwner(c)) return;
        DevicePolicyManager dpm = c.getSystemService(DevicePolicyManager.class);
        try {
            dpm.setLockTaskPackages(admin(c), new Apps(c).lockTaskPackages());
        } catch (SecurityException e) {
            e.printStackTrace();
        }
    }

    static boolean isPaused(Context c) {
        return System.currentTimeMillis() < c.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
                .getLong("kioskPausedUntil", 0);
    }

    /** Temporarily lets a grown-up leave the app (e.g. to set up Wi-Fi). */
    static void pause(Activity a, int minutes) {
        a.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE).edit()
                .putLong("kioskPausedUntil", System.currentTimeMillis() + minutes * 60_000L).apply();
        if (isOwner(a)) {
            DevicePolicyManager dpm = a.getSystemService(DevicePolicyManager.class);
            dpm.setStatusBarDisabled(admin(a), false);
        }
        try { a.stopLockTask(); } catch (Exception ignored) { }
    }

    /** Gives the tablet back to normal Android (grown-up menu → Turn off kiosk mode). */
    @SuppressWarnings("deprecation")
    static void removeOwner(Activity a) {
        if (!isOwner(a)) return;
        DevicePolicyManager dpm = a.getSystemService(DevicePolicyManager.class);
        ComponentName admin = admin(a);
        try { a.stopLockTask(); } catch (Exception ignored) { }
        dpm.setStatusBarDisabled(admin, false);
        dpm.setKeyguardDisabled(admin, false);
        dpm.clearPackagePersistentPreferredActivities(admin, a.getPackageName());
        dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "0");
        dpm.clearDeviceOwnerApp(a.getPackageName());
    }

    static void enterLockTask(Activity a) {
        if (!isOwner(a) || isPaused(a)) return;
        ActivityManager am = a.getSystemService(ActivityManager.class);
        if (am != null && am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
            applyPolicies(a);
            try { a.startLockTask(); } catch (Exception e) { e.printStackTrace(); }
        }
    }
}
