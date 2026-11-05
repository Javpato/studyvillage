/**
 * Serves the app over HTTPS on the local network (iPad / phone). iOS only enables
 * WebCrypto, the microphone and the screen APIs in a secure context, so plain
 * http://<ip> is not enough. Creates a self-signed certificate for this computer's
 * LAN addresses in app/.cert (kept out of git) and starts Vite on port 3443.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
const dir = 'app/.cert'; mkdirSync(dir, { recursive: true });
const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map(ip => `IP:${ip}`)].join(',');
const stamp = `${dir}/san.txt`;
if (!existsSync(`${dir}/cert.pem`) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== san) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '397', '-subj', '/CN=StudyVillage local',
    '-addext', `subjectAltName=${san}`, '-keyout', `${dir}/key.pem`, '-out', `${dir}/cert.pem`], { stdio: 'ignore' });
  writeFileSync(stamp, san);
}
console.log('\nStudyVillage on your network (accept the certificate warning once on each device):');
for (const ip of ips) console.log(`  https://${ip}:3443`);
spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'app/vite.config.ts', '--host', '0.0.0.0', '--port', '3443'], { stdio: 'inherit', env: { ...process.env, SV_HTTPS: '1' } });
