#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo '请先安装 Node.js 24 LTS：https://nodejs.org/'
  read '?按回车关闭。'
  exit 1
fi
node scripts/start.mjs
if [ $? -ne 0 ]; then
  read '?启动失败，按回车关闭。'
fi
