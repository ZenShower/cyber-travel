import { existsSync } from 'node:fs';
import path from 'node:path';
import { codexStatus } from '../server/codexRuntime.js';
import { skillsRoot } from '../server/config.js';

const status = codexStatus();
const profiles = ['chill-snapshot/SKILL.md', 'links-photography/SKILL.md', 'links-photography/references/reference-atlas.md'];
const profilesOK = profiles.every(file => existsSync(path.join(skillsRoot, file)));
const nodeOK = Number(process.versions.node.split('.')[0]) === 24;
console.log(`Node.js 24：${nodeOK ? 'OK' : '需要安装'}`);
console.log(`内置随拍 / 风光摄影规则：${profilesOK ? 'OK' : '缺少文件'}`);
console.log(`Codex：${status.version || '未就绪'}；${status.message}`);
console.log('网页可独立打开；真实旅行需要自己的 Codex 登录、联网检索及内置 image_gen 权限。');
console.log('验证真实 AI 链路：npm run verify:ai（会实际检索和生成 4 张图片，使用账号额度）。');
if (!nodeOK || !profilesOK) process.exitCode = 1;
