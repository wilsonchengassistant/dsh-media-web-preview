# dsh-media-web-preview

在 **DSH 右侧栏**里直接播放视频和音频。远程浏览器打开时，不必再点 **Open** 让
Mac 上的 QuickTime / 音乐 App 打开。

[![npm](https://img.shields.io/npm/v/dsh-media-web-preview)](https://www.npmjs.com/package/dsh-media-web-preview)
[![license](https://img.shields.io/npm/l/dsh-media-web-preview)](LICENSE)

## 解决什么问题

DSH 的文档预览支持文本、Markdown、代码、图片、PDF、HTML、Office 和表格，但没有
音视频渲染器；`mp4`、`mp3`、`wav`、`flac`、`ogg`、`m4a`、`aac`、`wma`、`opus`
都被当作“无渲染器的二进制容器”。打开这类文件只会看到：

> Preview is not available for this file type yet. **Open**

`Open` 是在 **Host 所在的那台 Mac** 上启动原生播放器。人在另一台电脑、手机或
Tailscale 节点上时，画面会出现在你看不到的屏幕上。

## 这个插件做了什么

插件注册 `video` 与 `audio` 两个 document preview 渲染器，在预览面板中画浏览器
原生播放器；配套的 Host 路由支持 HTTP `Range`，所以可以拖动进度，也不会把整段
视频读进内存或对话上下文。

- 原生控件：播放/暂停、拖动、音量、全屏（视频）、画中画（浏览器支持时）。
- 支持 `206 Partial Content` + `Content-Range`，按需读取字节。
- URL 相对 `document.baseURI` 生成，loopback、LAN、MagicDNS、`tailscale serve`
  都不用额外配置。
- 播放器下方有“下载”和“在新标签页打开”。
- 中英文界面；零运行时依赖。

## 支持格式

| 类型 | 后缀 |
| --- | --- |
| 视频 | `mp4` `m4v` `webm` `ogv` `mov` `mkv` `avi` `mpg` `mpeg` `3gp` `3g2` `ts` `m2ts` |
| 音频 | `mp3` `m4a` `m4b` `aac` `wav` `flac` `ogg` `oga` `opus` `weba` `aiff` `aif` `wma` `mid` `midi` |

能否解码取决于浏览器：Chromium 通常能播 H.264/AAC MP4、WebM、Ogg 和大多数音频，
但一般不能解码 Matroska（`.mkv`）和 AVI。编解码不支持时播放器会显示说明和下载
链接，而不是静默失败。

## 安装

从 npm：

```sh
dsh plugin --profile web add dsh-media-web-preview
```

从本地目录：

```sh
dsh plugin --profile web add file:/absolute/path/to/dsh-media-web-preview
```

`dsh plugin add` 会写入依赖**并**把包名加进 `dsh.profile.bundles`；本包自带
`dsh.bundle.patch`，所以不需要在 profile 的 `cordis.patch.yml` 里手写 `insert:`
那一行。

Host 部分会热挂载进正在运行的 `dsh web`；**刷新一次页面**让浏览器 bundle 进入
模块图。如果你的版本只在启动时组合插件，则改为重启 `dsh web`。

然后在右侧栏 **Files** 标签打开任意支持的文件即可。顶部仍保留原生 **Open** 菜单。

## 为什么需要第二条文件路由

DSH 已有 `GET /api/file`，图片和 Markdown 预览都用它。它总是返回完整 `200`，
**忽略 `Range`**，上限是附件图片限制（默认 20 MB）。图片够用，视频不够：不能拖动，
大文件直接 `413`。

本插件不改共享路由，而是并排新增 `/api/media`：

| | `/api/file` | `/api/media` |
| --- | --- | --- |
| 完整响应 | `200` | `200` |
| `Range` 请求 | 忽略（返回完整 `200`） | `206` + `Content-Range` |
| 拖动进度 | 必须整段下载后 | 立即 |
| 字节上限 | 约 20 MB | 受文件系统本身限制 |
| 读取方式 | 整文件缓冲 | 1 MiB 分块 `ctx.fs.readByteRange` |

两条路由都在 `/api` 下，因此 Connection 服务会先做 Host/Origin 校验和浏览器
cookie 认证。

## 实现

```
lib/index.js      Host：GET/HEAD /api/media、Range 解析、分块流
lib/client.js     浏览器：documentPreviews + sidebar.right.tab.document
cordis.patch.yml  bundle 插入行
```

浏览器部分用 `ctx.documentPreviews` 注册，`loading: 'renderer'`，并把后缀声明为
binary，避免回退到纯文本预览。播放器从
`useResource(resourceAddress).value.absolutePath` 取绝对路径，基于
`document.baseURI` 拼出 `api/media?path=…`，最后调用一次
`content.loaded(version)` 结束加载态。

Host 部分用 `ctx.connection.fetch.register({ path: '/api/media', methods:
['GET', 'HEAD'] })` 注册。请求经 `ctx.fs` 解析，所以 Host 的文件策略仍然生效；
`parseRange` 把 `Range` 转成闭区间。`416` 带 `bytes */<size>`；`HEAD` 只返回头；
`download=1` 添加附件 `Content-Disposition`。

## 安全

- 路由在 `/api` 下，与其它 DSH API 使用同样的认证和 Host/Origin 校验。未认证
  返回 `401`，不受信任的 Host 返回 `403`。
- 只接受绝对路径；不提供目录列表，也不会绕过文件系统 provider 的解析与访问策略。
- 响应带 `Cache-Control: private, no-store` 和 `X-Content-Type-Options: nosniff`。
- 无遥测、无外部网络请求、无运行时依赖。

## 已验证

- 59.6 秒 MP4 在 Tailscale MagicDNS URL 下播放并拖动到 40 秒。
- 28.6 MB MP4：`/api/file` 返回 `413`，`/api/media` 返回 `200` / `206`。
- `Range: bytes=0-1023` 返回 `206`、`Content-Length: 1024`、
  `Content-Range: bytes 0-1023/<size>`。
- 未认证请求返回 `401`；非法范围返回 `416` 和 `bytes */<size>`。
- MP3 能读取元数据并拖动到 30 秒。

## 兼容性

- DSH `0.2.0-rc.2` web 组合，以及继续提供 `ctx.documentPreviews`、
  `sidebar.right.tab.document`、`ctx.connection.fetch`、`ctx.fs.readByteRange`
  的后续版本。
- Node 22+。
- DSH 桌面 App 也可用：应用内路由是 document-relative。

## 范围

本插件专注于 **stock 右侧栏** 与 **远程浏览器播放**。不提供播放列表、字幕轨道、
倍速控件或聊天内嵌媒体卡片；这些由其它社区插件覆盖。播放行为以浏览器原生控件为准。

## 开发

```sh
npm test        # node --test：Range 解析与 MIME 映射
```

没有构建步骤。`lib/client.js` 是手写的 module-loader bundle
（`window.__ModuleLoader__.load`），只请求 `react` 和 `react/jsx-runtime`，因此
使用 Host 自带的 React。

端到端检查：在装好插件的 DSH web 里打开一个支持的文件，确认
`<video>`/`<audio>` 的 `readyState` 到 `4`，拖动后 `currentTime` 跟着变化。

## License

[MIT](LICENSE) © 2026 Wilson Cheng
