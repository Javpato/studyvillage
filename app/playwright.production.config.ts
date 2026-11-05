import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import development from './playwright.config';
/** Build first; the production server stays stable while other agents edit source. */
export default defineConfig({...development,use:{...development.use,baseURL:'http://127.0.0.1:3101'},webServer:{command:'npx vite preview --config app/vite.config.ts --host 127.0.0.1 --port 3101',cwd:fileURLToPath(new URL('..',import.meta.url)),url:'http://127.0.0.1:3101',reuseExistingServer:true,timeout:30000}});
