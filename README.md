# GeoMapper Pro

GeoMapper Pro 是一个面向中文地址和 POI 场景的批量地理编码工具，支持 Excel/CSV 导入、双地图服务比对、地图人工修正，以及多种结果导出格式。

## 主要功能

- 批量导入 `CSV`、`XLSX`、`XLS`
- 使用高德、百度进行地理编码和 POI 搜索
- 支持并发竞价、瀑布回退、单服务模式
- 支持失败重试、Key 轮换、缓存和限流保护
- 在地图中手动定位、拖拽修正坐标
- 导出 `CSV`、`Excel`、`GeoJSON`

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

- 当前主打运行方式是 `Vite + Electron`
- `src-tauri/` 仍保留，可作为后续 Tauri 桌面化方案基础
- 部分历史目录如打包输出、备份目录不属于源码主体，不建议提交到仓库

## License

当前仓库未单独附带许可证文件；如果准备公开分发，建议补充 `LICENSE`。
