import {defineConfig} from '@playwright/test';
/** Both engines exercise real panels/rules through Vite module fixtures. */
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'controller-games.spec.ts',workers:1,timeout:45000,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3100',headless:true,viewport:{width:1280,height:900}},
 projects:[{name:'chromium',use:{browserName:'chromium',launchOptions:{args:['--no-sandbox']}}},{name:'webkit',use:{browserName:'webkit'}}],
 webServer:{command:'npm run dev',url:'http://127.0.0.1:3100',reuseExistingServer:true,timeout:30000},
});
