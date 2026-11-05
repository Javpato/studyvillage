import { defineConfig } from '@playwright/test';
/** WebKit tablet automation is useful coverage, not physical Safari/Pencil certification. */
export default defineConfig({
 testDir:'./tests/e2e',workers:1,timeout:45000,reporter:'list',
 use:{browserName:'webkit',baseURL:'http://127.0.0.1:3101',headless:true,viewport:{width:1024,height:768},hasTouch:true,isMobile:true},
 webServer:{command:'npx vite preview --config app/vite.config.ts --host 127.0.0.1 --port 3101',url:'http://127.0.0.1:3101',reuseExistingServer:true,timeout:30000},
});
