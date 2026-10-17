# 在别处 · 旅行图册底图

`travel-atlas.json` 基于 OpenFreeMap Liberty 样式的本地定制版本：
https://tiles.openfreemap.org/styles/liberty

样式保留其 OpenMapTiles 矢量源、Natural Earth 地形栅格、字形与符号资源，并重新定义海水、植被、砂地、道路、建筑和文字配色。地图归属信息仍由源的 attribution 显示。瓦片与字体需要网络连接，本地样式文件不代表离线地图。

`src/mapAtlas.ts` 添加画布绘制的海浪、树形与山峰印刷符号，分别限定在真实水域、森林与 mountain_peak 要素。`src/mapAtlas.css` 负责纸纹、指南针与地图上的旅行标记。插画符号仅表达地图要素类型，不代表现场天气或具体植被物种。

Natural Earth 是较粗的全球地形资料，放大后的明暗只作地貌背景，不用于高精度地形判断。旅程路线仍表示节点先后，不表示实际道路或 GPS 轨迹。
