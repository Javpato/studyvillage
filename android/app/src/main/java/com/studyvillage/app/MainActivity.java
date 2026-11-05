package com.studyvillage.rebuild;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ContactSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
