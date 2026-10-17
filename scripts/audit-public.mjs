import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('请先 git add 待发布源码，再运行公开包检查');
const findings = [];
const rules = [
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ['openai-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ['aws-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['credential-url', /https?:\/\/[^\s/:]+:[^\s/@]+@/g],
  ['personal-home', /(?:\/Users\/|\/home\/)[a-zA-Z0-9._-]+/g],
  ['email', /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g],
];
const terms = (process.env.PUBLIC_AUDIT_TERMS || '').split(',').map(x => x.trim()).filter(Boolean);
let bytes = 0;
for (const file of files) {
  if (/(^|\/)(?:data|node_modules|dist|exports|uploads|artifacts|\.codex|\.agents)(\/|$)|^public\/media\/|(^|\/)\.env(?:\.|$)(?!example$)|\.(?:db|sqlite|pem|key|p12|pfx|mp4|mov|jpe?g|png|webp|zip)$/i.test(file)) findings.push({ file, rule: 'private-or-runtime-file' });
  const buffer = readFileSync(file); bytes += buffer.length;
  if (buffer.includes(0)) { findings.push({ file, rule: 'unreviewed-binary' }); continue; }
  const text = buffer.toString('utf8');
  for (const [rule, regex] of rules) {
    for (const match of text.matchAll(regex)) {
      if (rule === 'email' && match[0].endsWith('@users.noreply.github.com')) continue;
      findings.push({ file, rule, line: text.slice(0, match.index).split('\n').length });
    }
  }
  for (const term of terms) if (text.toLowerCase().includes(term.toLowerCase())) findings.push({ file, rule: 'personal-audit-term' });
}
console.log(JSON.stringify({ files: files.length, bytes, findings }, null, 2));
if (findings.length) process.exitCode = 1;
