import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('请先安装 Node.js 24 LTS：https://nodejs.org/，安装后重新双击启动。');
  process.exit(1);
}
if (existsSync('.env')) process.loadEnvFile('.env');
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1–65535 的整数');
const free = await new Promise(resolve => {
  const probe = createServer();
  probe.once('error', () => resolve(false));
  probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});
if (!free) {
  console.error(`端口 ${port} 已被占用。请关闭原服务，或在 .env 中设置其他 PORT。`);
  process.exit(1);
}
function runNpm(args) {
  const command = process.env.npm_execpath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandArgs = process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32' && !process.env.npm_execpath });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync('node_modules/tsx/dist/cli.mjs')) {
  console.log('首次启动：按锁定版本安装依赖……');
  runNpm(['ci']);
}
runNpm(['run', 'doctor']);
runNpm(['run', 'build']);
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
});
const url = `http://127.0.0.1:${port}`;
if (process.env.TRAVEL_NO_OPEN !== '1') {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) break;
    const ready = await fetch(`${url}/api/health`).then(r => r.ok).catch(() => false);
    if (ready) {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
      const browser = spawn(command, args, { stdio: 'ignore', detached: true });
      browser.on('error', () => console.log(`请用浏览器打开 ${url}`));
      browser.unref();
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', code => process.exit(code || 0));
