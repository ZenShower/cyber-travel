# 在别处 · Cyber Travel

**我给自己做了一个分身。他负责旅游，我负责上班。**

一个本地运行的 AI for Fun 小应用：上传自己的照片，把分身放到世界的某处。它会自己查资料、安排行程、结识旅伴、因为意外改路，持续发布照片和日记。结束旅行时，把一路的故事装订成可拖动翻页的相册。

## 能做什么

- **真实世界地图**：搜索地点、点选出发地，或在全球陆地上随机降落；海上落点会重新抽取。
- **自主推进**：先有计划，再让经历和事件改写计划；事件后果、人物关系和分离重逢会延续到后续节点。
- **朋友圈式记录**：每个节点生成 4 张或 9 张照片、第一人称日记；地点可跳转 Google Maps。
- **两套摄影规则**：生活随拍与风光摄影按场景选择，内置于 `skills/`，无需安装作者的私人 Skill。
- **旅伴**：上传同伴照片，也能在路上认识新的人。
- **两种时钟**：慢慢漫游为现实一小时约旅行一天；加速旅行在当前节点的日记和整组照片完成后继续下一站，每两站算一天。
- **过程可见**：规划、检索、生成照片和相册都有真实阶段反馈、耗时与失败重试。
- **旅行手账**：全屏 Three.js 纸页卷曲、拖动翻页；支持照片与故事 ZIP、单条动态和分享图导出。

## 先准备一次

1. 安装 **[Node.js 24 LTS](https://nodejs.org/)**。内置 SQLite 需要这一版本，Node 20/22 不在支持范围内。
2. 想使用真实 AI 旅行，需要安装并登录**自己的 Codex**。官方 [CLI 安装说明](https://developers.openai.com/codex/cli)、[登录说明](https://developers.openai.com/codex/auth)。例如：

   ```bash
   npm install -g @openai/codex
   codex login
   ```

   已登录的兼容 Codex 桌面版也可使用。项目会优先发现 macOS 桌面运行时，再查找 PATH 中的 CLI。不会复制作者账号、密钥或全局配置。

**重要：启动网页不等于获得 AI 权限。** 规划依赖可用模型和联网检索；照片依赖运行时实际提供内置 `image_gen` 及可读取的生成目录。仅安装通用 CLI、或仅有 API Key，不能保证它有相同的生图能力。`doctor` 只检查安装与登录，不冒充验证生图；可运行下文的真实探针确认。此仓库没有云端代生图或共享账号服务。

## 一键启动

[下载 ZIP](https://github.com/ZenShower/cyber-travel/archive/refs/heads/main.zip)，解压后：

| 系统 | 启动方式 |
| --- | --- |
| macOS | 双击 `Start.command`。若 ZIP 未保留执行权限，在终端运行 `chmod +x Start.command` 后重试，或直接 `npm start`。 |
| Windows | 双击 `Start.bat`。Codex 原生运行时兼容性需以本机探针为准；也可在 WSL 的完整 Node/Codex 环境内使用 Linux 方式。 |
| Linux / WSL | 在项目文件夹运行 `sh start.sh`。 |
| 所有系统 | 在项目文件夹运行 `npm start`。 |

首次启动自动安装锁定依赖、检查环境、构建网页并打开 **http://127.0.0.1:5173**。后续启动会重新构建，关闭终端或按 Ctrl+C 停止。首次安装和地图瓦片需要联网。

也可以克隆：

```bash
git clone https://github.com/ZenShower/cyber-travel.git
cd cyber-travel
npm start
```

## 开始旅行

1. 上传 2–8 张外貌参考图，填写旅行者名称；同伴可选，每位一张参考图。
2. 在地图选点、搜索城市或随机降落，选择慢慢漫游 / 加速旅行。
3. 出发后保持电脑和服务运行；网页关闭不影响后台，电脑休眠或服务关闭会停止实际执行。
4. 随时点击地图足迹，阅读当时的日记、事件和整组照片；支持暂停、继续与失败重试。
5. 主动结束后打开全屏相册，拖动翻页，导出故事与照片。

加速模式仍然真实调用 AI，不会瞬间生成。通常一站需要多次检索与 4–9 次生图；耗时和额度取决于自己的账号、模型与网络。暂停后已开始的照片仍可能完成。

## 验证与开发

```bash
npm run doctor        # Node、Codex登录、两套摄影规则（不调用模型）
npm test              # 调度、事件后果、地图聚合、照片、翻页与实况等测试
npm run build         # TypeScript 检查与正式构建
npm run dev           # 开发服务（同一个本地端口）
npm run test:smoke    # 启动后检查页面、API、地图资源、落点与来源保护
npm run verify:ai     # 实际检索、规划一站、生成4张照片、整理相册；使用账号额度
```

真实探针用无个人参考照的测试旅人，运行结束即停止；记录写入被 Git 忽略的 `data/` 与 `public/media/`。它验证结构化 AI、两种摄影分支和图片落盘，不等同于多日稳定性或真人身份一致性保证。若 `image_gen` 不可用会明确失败，不用示意图伪装结果。

## 配置（可选）

默认不需要 `.env`。有需要时将 `.env.example` 复制为 `.env`：

| 变量 | 作用 |
| --- | --- |
| `PORT` | 默认 `5173`，端口冲突时修改。服务始终只监听本机。 |
| `TRAVEL_CODEX_PATH` | 自己的 Codex 可执行文件绝对路径。 |
| `TRAVEL_CODEX_MODEL` | 自己账号可用的模型名；默认继承自己的 Codex 配置。 |
| `TRAVEL_SKILLS_DIR` | 可选的自有摄影 Skill 根目录；默认用仓库内的 `skills/`。 |
| `TRAVEL_IMAGES_DIR` | 可选的生图目录；默认当前用户 Codex Home 下的 `generated_images/`。 |
| `CODEX_HOME` | 遵循 Codex 的自定义数据目录设置。 |
| `TRAVEL_NO_OPEN` | 设为 `1` 禁用启动时自动打开浏览器。 |

公共包不附带原始参考摄影作品、真人照片或旅行历史。风光规则包含完整文字图谱；如有自己的可用图板，可放入 `skills/links-photography/assets/reference-board.jpg`，或用 `TRAVEL_SKILLS_DIR` 指向自己的资料。没有图板时仍正常运行。

## 数据与边界

- 旅程保存在本机 `data/trips.db`；头像、同伴照与生成图保存在 `public/media/`。这些目录、`.env`、日志、导出物和登录资料均被 Git 忽略。
- “本地运行”指网页、任务调度和存储在本机。提示词、参考照及所需地点资料仍会由 Codex 发送给其模型 / 工具服务处理；不是离线 AI。
- 只面向个人本机使用，无登录隔离或公网部署方案，不应直接暴露端口。服务检查本机 Host，并拒绝跨站写入。
- 地图依赖 OpenFreeMap 等在线资源。路线连线是节点顺序示意，不是导航道路或 GPS 轨迹。
- 地点会检索核实，但天气、人物、故事和照片是 AI 创作，不构成真实到访证明或已确认的实际旅行预订。

## 工程结构

```text
src/            React 地图、朋友圈、Three.js相册、分享图
server/         Express、SQLite、Codex桥接、旅程引擎、SSE进度
skills/         可随仓库分发的随拍 / 风光摄影文字规则
public/maps/    定制彩色地图样式与来源说明
public/demo/    自制插画示意，无真人或私人旅行数据
scripts/        启动、自检、发布扫描与真实AI探针
```

技术架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，验收范围见 [docs/VERIFICATION.md](docs/VERIFICATION.md)，第三方来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
