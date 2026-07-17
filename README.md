# 太阳系 · Solar System

一个追求照片级真实感的太阳系 3D 介绍页面，基于 Three.js。

**在线体验：<https://earth-simulate.vercel.app>**

![tech](https://img.shields.io/badge/Three.js-r185-blue) ![tech](https://img.shields.io/badge/Vite-8-purple) [![deploy](https://img.shields.io/badge/Vercel-live-black?logo=vercel)](https://earth-simulate.vercel.app)

## 运行

```bash
npm install
npm run dev
```

## 特性

- **真实纹理**：全部行星使用 [Solar System Scope](https://www.solarsystemscope.com/textures/)（NASA 数据，CC-BY 4.0）纹理，地球为 8K 贴图
- **地球专属 shader**：昼/夜双贴图（夜面城市灯光）、晨昏线平滑过渡、海面太阳高光、大气 Fresnel 边缘散射、独立运动云层
- **太阳 shader**：双层流动噪声模拟等离子体翻涌、米粒组织、临边昏暗，配合 Bloom 辉光与日冕
- **真实天文参数**：轨道倾角、自转轴倾角（天王星躺转、金星逆行）、公转/自转周期均为真实值；尺寸与距离做对数压缩以保证观感
- **交互**：拖拽旋转 / 滚轮缩放；点击行星或左侧导航，相机平滑飞行聚焦并跟随；Esc 返回全景
- **介绍面板**：每个天体的中文科普简介与关键数据
- **时间控制**：暂停与 1时/秒 ~ 1年/秒 五档变速，轨道线与标签可开关

## 结构

```
src/
  data.js     天体数据（真实参数 + 场景比例）
  shaders.js  地球 / 大气 / 太阳自定义 GLSL
  bodies.js   天体构建（行星、光环、月球、星空）
  ui.js       导航、信息面板、时间控制、标签
  main.js     场景、渲染循环、相机聚焦、拾取
```

## 说明

行星尺寸按 `sqrt(真实半径比)`、轨道距离按 `26 + 34·ln(1+AU)` 压缩 —— 严格真实比例下行星在屏幕上不足一个像素，这是天文可视化的通行做法（如 NASA Eyes）。
