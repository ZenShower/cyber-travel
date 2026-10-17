import './config.js';
import { Codex } from '@openai/codex-sdk';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Use the same runtime for status checks and agent work; never copy credentials.
export function resolveCodexPath(): string {
  const explicit = process.env.TRAVEL_CODEX_PATH;
  if (explicit) {
    if (!existsSync(explicit)) throw new Error('TRAVEL_CODEX_PATH 指向的文件不存在');
    return path.resolve(explicit);
  }
  const desktopPaths = process.platform === 'darwin' ? [
    '/Applications/Codex.app/Contents/Resources/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
  ] : [];
  for (const candidate of desktopPaths) if (existsSync(candidate)) return candidate;
  const names = process.platform === 'win32' ? ['codex.exe'] : ['codex'];
  for (const folder of (process.env.PATH || '').split(path.delimiter)) {
    if (!folder) continue;
    for (const name of names) {
      const candidate = path.join(folder, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  const require = createRequire(import.meta.url);
  const triples: Record<string, string> = {
    'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin',
    'linux-arm64': 'aarch64-unknown-linux-musl', 'linux-x64': 'x86_64-unknown-linux-musl',
    'win32-arm64': 'aarch64-pc-windows-msvc', 'win32-x64': 'x86_64-pc-windows-msvc',
  };
  const key = `${process.platform}-${process.arch}`;
  if (triples[key]) {
    try {
      const packageRoot = path.dirname(require.resolve(`@openai/codex-${key}/package.json`));
      const candidate = path.join(packageRoot, 'vendor', triples[key], 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
      if (existsSync(candidate)) return candidate;
    } catch { /* Standalone CLI and desktop installations are also supported. */ }
  }
  throw new Error('未找到 Codex。请安装官方 Codex CLI 或桌面版，再运行 npm run doctor');
}

export function codexStatus(): { available: boolean; loggedIn: boolean; version: string | null; message: string; imageGeneration: 'unverified' } {
  try {
    const executable = resolveCodexPath();
    const version = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    const login = spawnSync(executable, ['login', 'status'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
    const available = version.status === 0;
    return { available, loggedIn: available && login.status === 0, version: available ? version.stdout.trim().slice(0, 100) : null,
      message: !available ? 'Codex 无法运行，请检查安装' : login.status !== 0 ? '请先使用自己的账号登录 Codex' : 'Codex 已登录；生图权限需实际探针确认', imageGeneration: 'unverified' };
  } catch {
    return { available: false, loggedIn: false, version: null, message: '未找到可运行的 Codex，请先安装或设置 TRAVEL_CODEX_PATH', imageGeneration: 'unverified' };
  }
}

export function createTravelThread() {
  const codex = new Codex({ codexPathOverride: resolveCodexPath() });
  return codex.startThread({
    workingDirectory: process.cwd(), skipGitRepoCheck: true,
    sandboxMode: 'read-only', approvalPolicy: 'never', webSearchMode: 'live', modelReasoningEffort: 'medium',
    ...(process.env.TRAVEL_CODEX_MODEL ? { model: process.env.TRAVEL_CODEX_MODEL } : {}),
  });
}
