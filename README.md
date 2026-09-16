# 像素工坊 · xiangsugongfang

作者：黄光稳

浏览器本地运行的多媒体工具网站，包括图片多尺寸与多格式导出、批量命名、视频压缩、水印、裁剪拼接、多画幅、音乐混音、封面片头、字幕、合成方案和导出任务。

## 项目结构

- `dist/index.html`：批量图片、视频、文件命名工具。
- `dist/editor.html`：创作工具箱。
- `dist/*.js`、`dist/*.css`：应用逻辑、兼容处理和样式。

本项目是纯静态站点，不需要安装依赖、构建步骤、数据库或服务器密钥。`dist` 中的文件既是源代码，也是可部署的网站文件。

## Cloudflare Pages 部署

1. 在 Cloudflare 控制台打开 Workers & Pages，创建 Pages 项目，选择连接 Git。
2. 授权 Cloudflare 访问此 GitHub 仓库。
3. 使用下列配置，保存并部署：

| 设置 | 值 |
| --- | --- |
| 项目名称 | `xiangsugongfang`（以实际可用名称为准） |
| 生产分支 | `main` |
| 框架预设 | None |
| 构建命令 | 留空 |
| 构建输出目录 | `dist` |
| 根目录 | 仓库根目录 |
| 环境变量 | 无需配置 |

成功后以 Cloudflare 返回的正式生产网址为准。连接完成后，推送到 `main` 可触发自动部署。不要给正式站点额外设置登录或访问白名单，除非之后确实需要限制访问。

官方说明：https://developers.cloudflare.com/pages/get-started/git-integration/

## 本地预览

在仓库根目录运行 `python -m http.server 8000 --directory dist`，再访问 `http://localhost:8000`。

## 使用范围

文件在用户设备上处理。合成方案保存到当前浏览器，导出任务不会跨刷新保存。视频合成依赖浏览器的 MediaRecorder、Canvas 和 Web Audio 支持，需保持页面前台。视频格式为浏览器实际支持的 MP4 / WebM，不含 MOV / AVI 转码或后台云端渲染。

网站公开发布不代表任意地区、网络和内置浏览器都必然可达；国内网络、微信、QQ、百度等环境仍需实测。
