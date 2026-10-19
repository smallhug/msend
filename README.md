# msend

> 🚀 **msend** 是一款轻量、无干扰且兼具强提醒能力的跨屏即时消息接收工具。基于 **Tauri 2 + React 19 + TypeScript** 构建，手机端无需安装任何 App，只需扫码即可将文字极速推送到电脑桌面，配合独立全屏透明告警窗、语音播报与提示音，确保重要通知绝不错过。

---

## ✨ 核心特性

- 📱 **免安装扫码即用**：基于开源的 [ntfy.sh](https://ntfy.sh) 服务，客户端自动生成独立的 12 位随机安全主题（Topic）。手机相机扫码即可直达网页端发送文字，支持一键复制链接、自定义/编辑主题。
- 🖥️ **独立全屏强提醒窗口 (Overlay Alert)**：
  - 收到消息时自动唤醒独立的置顶透明全屏窗口，呈现毛玻璃与呼吸光效的高对比度卡片。
  - 多条消息自动队列化追加显示（带有序号与时间戳），旧消息未关闭前绝不覆盖丢失。
  - 智能字号适配：根据文本长度与条数动态调整字体大小，兼顾视觉冲击与长文本可读性。
  - 键盘友好：按下 `ESC` 键即可一键关闭弹窗并中断当前语音播报。
- 🔊 **多感官听觉通知**：
  - **Web Audio 纯算法提示音**：内置三音交替（叮-咚-叮）清脆提示音，无需引入外部音频资源文件。
  - **Web Speech TTS 语音朗读**：支持接收时自动语音朗读消息内容（默认关闭，可在标题栏一键开关）。
- 🛡️ **高可靠长连接与休眠感知**：
  - 采用 Server-Sent Events (SSE) 毫秒级长连接。
  - 支持网络状态（Online/Offline）智能感知与自动恢复。
  - **休眠唤醒检测**：内置心跳探针，智能识别电脑休眠/挂起恢复并秒级重建连接，彻底杜绝网络半开假死连接。
- 🪟 **系统托盘与静默开机自启**：
  - 400×600 精致无边框窗口设计，拖拽平滑。
  - 点击关闭按钮自动最小化隐藏至系统托盘，后台持续守候。
  - 深度集成系统托盘菜单，支持**开机自启动**切换及 `--autostart` 静默启动（开机不弹主界面，静默常驻托盘）。
- 📝 **历史记录与便捷管理**：
  - 自动保留最近 15 条接收记录，支持长文本点击就地展开/折叠。
  - 支持对历史记录单条朗读、单条删除与一键清空。

---

## 🛠️ 技术架构

- **桌面运行时**：[Tauri 2](https://v2.tauri.app/) (Rust)
  - 插件：`tauri-plugin-autostart`（开机自启动管理）、`tauri-plugin-opener`
  - 窗口管理：双窗口架构（`main` 主控制台窗口 + `alert` 独立透明置顶告警窗口）
- **前端技术栈**：[React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **音频与合成**：原生 Web Audio API + Web Speech API (TTS)
- **二维码生成**：[qrcode](https://www.npmjs.com/package/qrcode)

---

## 📂 核心代码结构

```text
├── src/
│   ├── App.tsx               # 主应用逻辑（MainWindow 控制台与 AlertWindow 告警窗口）
│   ├── App.css               # 样式定义（无边框窗口、毛玻璃告警层、响应式布局）
│   ├── main.tsx              # 前端入口
│   └── utils/
│       ├── sound.ts          # Web Audio 音效算法与 Web Speech 语音朗读工具
│       └── windowControl.ts  # Tauri 窗口控制与多窗口全局事件通信
├── src-tauri/
│   ├── Cargo.toml            # Rust 依赖配置
│   ├── tauri.conf.json       # Tauri 窗口、插件及打包配置
│   └── src/
│       ├── lib.rs            # 托盘菜单、开机自启动初始化及原生生命周期
│       └── main.rs           # Rust 入口
├── package.json
└── README.md
```

---

## 🚀 快速上手

### 环境准备

确保本机已安装：
1. [Node.js](https://nodejs.org/) (推荐 18+) 或 [Bun](https://bun.sh/)
2. [Rust 工具链与 Cargo](https://rustup.rs/)
3. 当前操作系统对应的 [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)

### 安装依赖

```bash
# 使用 Bun
bun install

# 或使用 npm / pnpm
npm install
```

### 开发模式

启动前端服务并拉起 Tauri 桌面端调试窗口：

```bash
# 使用 Bun
bun run tauri dev

# 或使用 npm
npm run tauri dev
```

### 生产打包

构建正式发布的桌面端安装包与可执行程序：

```bash
# 使用 Bun
bun run tauri build

# 或使用 npm
npm run tauri build
```

编译生成的文件将存放在 `src-tauri/target/release/bundle/` 目录下。

---

## 📖 使用指南

1. **启动程序**：打开 `msend`，主界面将展示当前主题对应的二维码及状态标识（在线）。
2. **手机发送**：
   - 使用微信、手机浏览器或任意扫码工具扫描主界面的二维码；
   - 网页打开后，在输入框中输入文字并点击发送。
3. **桌面响应**：
   - 电脑屏幕将立即浮现全屏半透明告警卡片；
   - 扬声器播放提示音（若开启语音朗读开关，还将同步播报文字内容）；
   - 查阅完毕后，轻按键盘 `ESC` 键或点击卡片下方的“关闭”按钮即可关闭告警。
4. **主题定制**：
   - 点击主题右侧的 **编辑** 按钮可自定义专属 12 位主题名称；
   - 点击 **刷新** 按钮可一键随机生成全新的 12 位主题。
5. **后台常驻**：
   - 点击右上角关闭按钮不会退出程序，而是隐藏至托盘；
   - 在右下角托盘图标右键可选择“显示主界面”、“开机自启动”或“退出”。

---

## 📄 许可证

本项目遵循 MIT 协议开源。
