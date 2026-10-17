# 第三方来源

- `public/maps/travel-atlas.json` 基于 [OpenFreeMap Liberty](https://tiles.openfreemap.org/styles/liberty) 自定义配色，使用 OpenMapTiles / OpenStreetMap 地理数据、Natural Earth 地形和在线字形 / 符号。地图保留源归属；具体说明见 `public/maps/README.md`。地图服务及其数据遵循各自条款。
- 随机陆地掩码来自 npm `world-atlas` 的 Natural Earth 1:10m 数据；城市搜索来自 `all-the-cities`。它们由包管理器下载，不包含私人地点记录。
- 纸页分段与边缘卷曲思路参考 [turngl](https://github.com/oguzhanT/turngl)（MIT）。本项目独立实现内容排版、材质、镜头与交互；亦调研过 book-flip 与 StPageFlip。
- 随拍规则吸收 [AI Cinematic Prompt](https://github.com/Leo414x/AI_Cinematic_Prompt) 和 [realistic-image](https://github.com/jax-explorer/sjinn-professional-skills) 的物理成像思想，来源链接保留于规则中。风光文字规则为场景摄影方法；公共包不分发原始第三方摄影作品或用户截图。
- React、Three.js、MapLibre、Vite、Express、Codex SDK 等依赖遵循各 npm 包的许可证，完整锁定列表见 `package-lock.json`。
- `public/demo/window.svg` 为项目自制插画预览，不是真实旅行照片。
