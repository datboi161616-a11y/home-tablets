package com.hometablets.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After a self-update replaces the app, bring the home screen straight back. */
public class UpdatedReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent start = new Intent(context, MainActivity.class);
        start.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(start);
    }
}
