package com.studyvillage.rebuild;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONObject;

@CapacitorPlugin(name = "ContactShare")
public class ContactSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        final String json = call.getString("json");
        if (json == null || json.getBytes(StandardCharsets.UTF_8).length > 8192) {
            call.reject("Invalid contact card"); return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                // Explicit public projection; never share private keys or local nicknames.
                JSONObject source = new JSONObject(json);
                if (source.getInt("schemaVersion") != 1) throw new IllegalArgumentException();
                JSONObject identity = new JSONObject();
                for (String key : new String[]{"fingerprint", "publicKey", "displayName", "color"}) {
                    identity.put(key, source.getJSONObject("identity").getString(key));
                }
                JSONObject card = new JSONObject().put("schemaVersion", 1)
                    .put("identity", identity).put("friendCode", source.getString("friendCode"));
                File dir = new File(getContext().getCacheDir(), "contact-shares/" + UUID.randomUUID());
                if (!dir.mkdirs()) throw new java.io.IOException();
                File file = new File(dir, "studyvillage-contact.json");
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(card.toString(2).getBytes(StandardCharsets.UTF_8));
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent send = new Intent(Intent.ACTION_SEND).setType("application/json")
                    .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setClipData(ClipData.newUri(getContext().getContentResolver(), "StudyVillage", uri));
                boolean whatsapp = false;
                for (String pkg : new String[]{"com.whatsapp", "com.whatsapp.w4b"}) {
                    try {
                        getContext().getPackageManager().getPackageInfo(pkg, 0);
                        send.setPackage(pkg); whatsapp = true; break;
                    } catch (PackageManager.NameNotFoundException ignored) {}
                }
                getActivity().startActivity(whatsapp ? send : Intent.createChooser(send, "StudyVillage"));
                call.resolve();
            } catch (Exception error) { call.reject("Could not open contact sharing", error); }
        });
    }
}
