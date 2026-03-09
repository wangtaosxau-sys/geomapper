# GeoMapper Pro

> 专业级批量地理编码工具

## 关于项目

GeoMapper Pro 是一款完全免费的开源工具，由作者利用业余时间独立开发维护，专注于中文地址与 POI 场景下的批量地理编码、双源交叉验证、地图可视化和人工修正。

它适合需要批量导入地址数据、进行高精度坐标匹配、复核异常点位，并导出标准化结果的工作场景。

## 核心功能

- `双源竞价验证`：同时调用高德、百度双引擎，交叉验证确保坐标精准。
- `批量处理`：支持 Excel/CSV 导入导出，智能列映射，一键处理。
- `地图可视化`：实时预览点位分布，支持聚合、筛选、卫星图切换。
- `手动定位`：支持 POI 搜索、拖拽移动，灵活修正异常点位。
- `智能调度`：支持多 Key 轮询、自动限流、指数退避，提升稳定性。
- `本地缓存`：查询结果自动缓存，避免重复消耗 API 配额。

## 技术栈

- React 19
- TypeScript
- Vite
- Electron
- Tauri（仓库内保留了桌面端骨架）

## 本地开发

### 环境要求

- Node.js 18+
- npm

### 安装依赖

```bash
npm install
```

### 启动 Web 开发环境

```bash
npm run dev
```

### 启动 Electron 开发环境

```bash
npm run electron:dev
```

## 构建

### 构建前端静态资源

```bash
npm run build
```

### 打包 Electron 桌面版

```bash
npm run electron:build
```

### 打包 Windows 便携版

```bash
npm run electron:build:win
```

打包产物默认输出到 `release/`。

## 使用说明

首次运行后，先在应用内配置：

- 高德 Web 服务 Key
- 百度服务端 AK（可选，但建议开启用于交叉验证）
- 高德 JS API Key 和 Security Code（地图预览需要）

核心配置项都在应用的设置面板中完成，不依赖 README 里手动写环境变量。

## 目录结构

```text
components/    React 组件
contexts/      状态上下文
hooks/         业务 Hook
services/      地理编码、缓存、策略层
electron/      Electron 主进程
public/        静态资源
src-tauri/     Tauri 工程骨架
```

## 当前仓库说明

- 当前版本：`1.0.0`
- 当前主打运行方式是 `Vite + Electron`
- `src-tauri/` 仍保留，可作为后续 Tauri 桌面化方案基础
- 部分历史目录如打包输出、备份目录不属于源码主体，不建议提交到仓库

## License

当前仓库未单独附带许可证文件；如果准备公开分发，建议补充 `LICENSE`。
