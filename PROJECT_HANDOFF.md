# Lumière 项目交接文档

> 最后核对：2026-07-28（Asia/Shanghai）  
> 本文不包含任何 API Key、OAuth Token、数据库密钥或其他密钥值。

## 1. 项目概览

Lumière 是一套面向个人使用的 AI 陪伴平台。它本身不训练模型，而是通过统一后端连接 Claude 官方订阅、Claude API、OpenAI、DeepSeek 和 OpenAI-compatible 中转站，并提供会话、长期记忆、朋友圈、日记、健康数据、语音、通话、主动推送和 PWA 手机端界面。

当前技术栈：

- 前端：原生 HTML、CSS、JavaScript，PWA/Service Worker。
- 后端：Node.js ESM，原生 HTTP Server。
- AI：Anthropic Claude Agent SDK、Anthropic Messages、OpenAI Responses、OpenAI-compatible Chat Completions。
- 主业务数据库：Supabase/PostgreSQL。
- 健康数据：Node 内置 SQLite，默认文件 `/opt/lumiere/data/health.sqlite`。
- 长期记忆：Ombre Brain + Obsidian Vault，并保留项目自身的会话记忆接口。
- 语音：ElevenLabs TTS；浏览器录音和后端 STT/通话接口。
- 网关与 TLS：Caddy。
- 进程管理：systemd。

## 2. 项目结构与代码目录

本地工作目录：`E:\Lumiere\claura`

```text
claura/
├─ index.html                 # PWA 主页面和页面结构
├─ app.js                     # 基础页面、会话和交互逻辑
├─ api.js                     # API 客户端、聊天、流式事件和前端数据调用
├─ real-ui.js / real-ui.css   # 首页、记忆、朋友圈、日记等主要定制 UI
├─ voice-call.js / .css       # 语音条、录音、字幕、通话页、主动来电 UI
├─ pet.js / pet.css           # 桌面/页面小宠物
├─ moments*.css               # 朋友圈页面样式
├─ multi-bubble.css           # AI 多气泡回复
├─ service-worker.js          # PWA 离线缓存；部署静态文件后需要递增缓存版本
├─ manifest.webmanifest       # PWA 配置
├─ server/
│  ├─ index.js                # HTTP 服务、鉴权、所有 API 路由
│  ├─ config.js               # 环境变量解析、模型供应商注册
│  ├─ model.js                # 各 AI 供应商调用、流式回复与上下文拼装
│  ├─ store.js                # Supabase/内存会话、消息、设置和记忆存储
│  ├─ ombre.js                # Ombre Brain MCP 请求
│  ├─ ombre-vault.js          # Vault 文件解析、记忆日历数据
│  ├─ health-store.js         # Apple Health SQLite 写入、查询和保留策略
│  ├─ elevenlabs.js           # ElevenLabs TTS、语音文件缓存
│  ├─ voice-cache.js          # 已备份语音缓存清理
│  ├─ moments.js              # 朋友圈数据与交互
│  ├─ diary.js                # AI 日记读取、锁定和解锁
│  ├─ shadow-push.js          # AI 主动消息/Bark 推送
│  ├─ call-invites.js         # 主动来电邀请和通话记录
│  ├─ call-tone.js            # 通话声音特征辅助
│  ├─ attachments.js          # 图片/文件附件验证与多模态内容
│  ├─ thinking.js             # 思考摘要协议解析与防泄露
│  ├─ claude-usage.js         # Claude 五小时/周额度读取
│  └─ drivesoid.js            # 首页情绪/状态模块
├─ supabase/migrations/
│  └─ 001_initial.sql         # Supabase 初始表、RLS 和默认设置
├─ deploy/
│  ├─ Caddyfile               # HTTPS、反向代理和 SSE 配置
│  ├─ lumiere-push.service    # 主动消息检查服务
│  └─ lumiere-push.timer      # 主动消息定时器
├─ automation/
│  └─ Sync-LumiereVoice.ps1   # VPS 语音缓存自动备份到本机
├─ scripts/build.js           # 静态前端构建到 dist/
├─ test/                      # Lumière 自有 Node 测试
├─ data/                      # 本地运行数据/配置样例
├─ dist/                      # 构建产物，不是源文件
├─ third-party/               # 集成的第三方前端资源
├─ pet-assets/                # 小宠物动画资源
└─ 语音备份/                  # 从 VPS 自动同步回本机的语音文件
```

不要直接修改 `dist/`。先修改根目录源文件，再执行构建。

## 3. VPS 与当前部署

### 3.1 VPS 信息

| 项目 | 当前值 |
|---|---|
| 云厂商 | 腾讯云轻量应用服务器 |
| 地域 | 新加坡 |
| 公网 IPv4 | `43.156.145.27` |
| 主机名 | `VM-0-2-ubuntu` |
| 系统 | Ubuntu Server 22.04 LTS 64 位 |
| 内核 | Linux 5.15.0-181-generic x86_64 |
| 规格 | 2 vCPU、2 GB 内存、40 GB SSD、20 Mbps |
| SSH 用户 | `root` |
| SSH 端口 | `22` |
| Node.js | `v22.23.1` |
| npm | `10.9.8` |
| 部署目录 | `/opt/lumiere` |
| 数据目录 | `/opt/lumiere/data` |
| systemd 服务 | `lumiere.service` |
| HTTPS 网关 | Caddy |

截至 2026-07-28，系统盘使用约 12 GB/40 GB（32%），`/opt/lumiere` 约 681 MB。

私钥不属于代码仓库内容。SSH 私钥路径可以记录在操作者自己的密码管理器中，但不要写入本文、Git 或聊天消息。

### 3.2 线上地址

- 正式访问地址：`https://43-156-145-27.sslip.io`
- 本机后端监听：`http://127.0.0.1:3000`
- 健康检查：`https://43-156-145-27.sslip.io/api/health`

Caddy 为 `/api/sessions/*/chat` 单独关闭代理缓冲，保证 SSE 流式回复能及时传到浏览器。

### 3.3 当前服务状态

2026-07-28 实际检查结果：

| 服务 | 开机启动 | 当前状态 |
|---|---:|---:|
| `lumiere.service` | enabled | active |
| `caddy.service` | enabled | active |
| `lumiere-push.timer` | enabled | active |

`lumiere-push.timer` 开机 5 分钟后启动，之后约每 10 分钟检查一次，并增加最多 60 秒随机延迟。

## 4. 部署流程

### 4.1 部署前检查

在 Windows PowerShell 中：

```powershell
cd E:\Lumiere\claura
npm.cmd install
node --check .\server\index.js
node --check .\api.js
node --check .\voice-call.js
npm.cmd run build
```

修改任何被 PWA 缓存的静态资源后，应先把 `service-worker.js` 顶部的缓存名从例如 `lumiere-v40` 增加为新版本，否则 iPhone 可能持续显示旧页面。

### 4.2 仅部署前端

`npm.cmd run build` 会把静态资源写入 `dist/`。线上 Node 服务以 `/opt/lumiere` 为静态根目录，因此需把 `dist` 内文件复制到该目录，而不是复制成 `/opt/lumiere/dist`。

```powershell
scp -o BatchMode=yes -i <SSH_KEY> `
  .\dist\* root@43.156.145.27:/opt/lumiere/
```

包含子目录时建议使用 `scp -r`，或制作部署压缩包后在服务器解压。只有静态文件变化时通常不需要重启 Node，但需要重新打开 PWA 或刷新一次来激活新 Service Worker。

### 4.3 部署后端

上传变更的 `server/`、`package.json`、`package-lock.json` 和必要的部署文件：

```powershell
scp -r -o BatchMode=yes -i <SSH_KEY> `
  .\server .\package.json .\package-lock.json `
  root@43.156.145.27:/opt/lumiere/
```

服务器执行：

```bash
cd /opt/lumiere
npm ci --omit=dev
node --check server/index.js
systemctl restart lumiere.service
systemctl status lumiere.service --no-pager
journalctl -u lumiere.service -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/api/health
```

不要覆盖 `/opt/lumiere/.env`、`/opt/lumiere/data` 或服务器上的语音缓存。

### 4.4 修改 Caddy

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl status caddy --no-pager
```

### 4.5 修改 systemd 服务或定时器

```bash
systemctl daemon-reload
systemctl restart lumiere.service
systemctl restart lumiere-push.timer
systemctl list-timers --all | grep lumiere
```

## 5. 已完成功能

### 5.1 AI 与聊天

- Claude Code 官方订阅后端，通过 Claude Agent SDK 使用个人订阅凭据。
- Claude 官方 API（Anthropic Messages API）适配。
- OpenAI Responses API 适配。
- DeepSeek/OpenAI-compatible Chat Completions 适配。
- 自定义中转站接口和自定义模型列表。
- 聊天页精确模型选择，包含 Sonnet、Opus、Haiku 等具体模型。
- SSE 流式输出。
- 长回复按普通聊天形式拆成多个气泡。
- 思考模式开关和供应商思考摘要展示。
- 不展示隐藏推理；供应商未提供摘要时不伪造摘要。
- 会话新建、切换、重命名、长按删除。
- 每条消息时间戳，用户消息靠右、AI 消息靠左。
- 自动滚动到最后一条消息和一键回到底部。
- 图片/文件附件和多模态提示构建。
- 自定义 AI/用户头像、背景和主题持久化。
- iPhone PWA 安全区、键盘遮挡和移动端布局适配。

### 5.2 数据与长期记忆

- Supabase 持久化会话、消息、设置和项目记忆。
- Supabase RLS 已启用；浏览器不接触 Service Role Key。
- Ombre Brain 已部署并连接 Obsidian Vault。
- 聊天前自动召回 Ombre Brain 记忆；中转 API 模型也由后端注入记忆。
- 记忆日历，可按日期打开、查看并编辑具体记忆。
- 记忆页移除了会无限增长的日历下方记忆块列表。
- 会话压缩和长期记忆参数设置。
- AI 日记本：按日期查看，AI 可将日记保持锁定，也可之后解锁给用户查看。
- 对重复记忆做了基础限制，但语义级向量去重尚未完成。

### 5.3 朋友圈

- 独立朋友圈底部入口。
- 朋友圈发布、列表、点赞、评论和回复接口。
- 朋友圈视觉风格与其他页面统一。
- AI 可参与朋友圈内容和互动。

### 5.4 主动消息与通知

- 影子推送/主动消息。
- 随机等待范围默认 30–120 分钟。
- Bark 推送，标题和 Lumière 图标可配置。
- `lumiere-push.timer` 定时检查。
- 主动来电邀请：长期无对话后可由 AI 决定是否发起，支持 Bark 和应用内来电卡片。

### 5.5 语音与通话

- ElevenLabs TTS。
- AI 可自行选择某条回复是否使用语音条，不强制每条转语音。
- 语音条波形、播放状态动画和中文翻译框。
- 相同文本/音色/模型/输出格式使用服务器缓存，只合成一次。
- 最新语音条后台预生成，减少点击后的等待。
- 服务器语音缓存按年月日存储。
- 语音自动备份到本机 `E:\Lumiere\claura\语音备份`。
- Windows 计划任务 `Lumiere Voice Backup`：登录时及约每 3 小时同步。
- 服务器仅清理已经成功备份并带 `.backed-up` 标记的旧 MP3。
- 通话独立页面：AI 头像、圆形声波、挂断按钮、文字输入栏。
- 通话时 AI 英语/法语语音，界面字幕只显示中文。
- 浏览器录音、静音检测、最长约 20 秒录制，停顿约 1.8 秒自动提交。
- 通话结束后在聊天页写入通话时长记录。
- 通话字幕已使用深色高对比背景。

### 5.6 Apple 健康数据

- `POST /api/health/sync` 接收 Health Auto Export 的 JSON。
- `GET /api/health/latest` 查询全部类型或指定类型最新记录。
- `GET /api/health/range` 按类型和时间范围查询。
- 固定 Token 鉴权，无效 Token 返回 401。
- SQLite 存储类型、数值、单位、时间戳和原始 JSON。
- 默认只保留最近 3 天，清理在同步流程中执行。
- 支持心率、步数、睡眠、血氧等 Health Auto Export 指标。
- 用户说“早”或“早安”时，提示模型分析昨晚睡眠和健康数据。
- 健康接口由 Lumière 后端统一调用，因此 Claude 官方订阅和 API/中转模型都可通过同一后端获得健康上下文。

### 5.7 其他 UI

- 首页相伴天数从 6 月 27 日开始自动按日期增加。
- 首页情绪/状态模块（Drivesoid 风格），点击可查看完整信息。
- 集成 `clawd-on-desk` 小宠物及动画资源。
- 聊天页独立导航逻辑，右滑返回首页。
- 记忆、朋友圈、设置等页面保留统一底部导航。

## 6. 外部服务配置状态

状态来自 2026-07-28 VPS 环境变量名称和健康检查，不展示任何值。

| 服务 | 当前状态 | 说明 |
|---|---|---|
| Supabase | 已配置、正在使用 | `/api/health` 返回 `storage: "supabase"` |
| Ombre Brain | 已配置、已连接 | 健康检查返回 `configured: true, connected: true` |
| Claude Code 官方订阅 | 已配置 | VPS 存在 OAuth Token、模型和预算变量 |
| 自定义 API 中转站 | 已配置 | VPS 存在 URL、Key、模型和标签变量 |
| ElevenLabs | 已配置 | VPS 存在 API Key、Voice ID、模型和输出格式变量 |
| Health Auto Export | 已配置 | VPS 存在同步 Token 和 SQLite 路径 |
| Bark | 已配置 | VPS 存在 Bark URL、标题和图标变量 |
| OpenAI 官方 API | 当前 VPS 未发现配置 | 代码支持，配置后即可启用 |
| Anthropic API Key | 当前 VPS 未发现配置 | 与 Claude Code 订阅是两条独立通道 |
| DeepSeek | 当前 VPS 未发现配置 | 代码支持，当前线上未配置 |
| Gemini Embedding | 未启用 | 目前没有稳定的 Embedding/向量去重链路 |

## 7. 环境变量

所有生产环境变量放在 `/opt/lumiere/.env`，权限应限制为仅 root 可读。不要把该文件下载到公开位置，也不要提交到 Git。

### 7.1 基础与安全

| 名称 | 用途 |
|---|---|
| `PORT` | Node 监听端口，当前为 3000 |
| `HOST` | 监听地址；生产环境通常为 `0.0.0.0` |
| `NODE_ENV` | `production`/`development` |
| `ALLOWED_ORIGINS` | 允许跨域来源，逗号分隔 |
| `APP_ACCESS_TOKEN` | Lumière 内部 API Bearer Token |
| `PUBLIC_APP_URL` | 对外访问地址 |

### 7.2 Supabase

| 名称 | 用途 |
|---|---|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端 Service Role Key |

### 7.3 Claude Code 官方订阅

| 名称 | 用途 |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` 生成的订阅 Token |
| `CLAUDE_CODE_MODEL` | 默认 Claude Code 模型 |
| `CLAUDE_CODE_MAX_BUDGET_USD` | 单次请求预算保护 |

### 7.4 OpenAI

| 名称 | 用途 |
|---|---|
| `OPENAI_API_URL` | OpenAI API Base URL |
| `OPENAI_API_KEY` | OpenAI API Key |
| `OPENAI_MODEL` | 默认模型 |
| `OPENAI_FAST_MODEL` | 快速模型 |
| `OPENAI_PRO_MODEL` | 高性能模型 |
| `OPENAI_SAFETY_IDENTIFIER` | 稳定、非个人信息的安全标识 |

### 7.5 Anthropic API

| 名称 | 用途 |
|---|---|
| `ANTHROPIC_API_URL` | Anthropic API Base URL |
| `ANTHROPIC_API_KEY` | Anthropic API Key |
| `ANTHROPIC_MODEL` | 默认模型 |
| `ANTHROPIC_FAST_MODEL` | 快速模型 |
| `ANTHROPIC_PRO_MODEL` | 高性能模型 |

### 7.6 DeepSeek

| 名称 | 用途 |
|---|---|
| `DEEPSEEK_API_URL` | DeepSeek/OpenAI-compatible Base URL |
| `DEEPSEEK_API_KEY` | API Key |
| `DEEPSEEK_MODEL` | 普通聊天模型 |
| `DEEPSEEK_REASONER_MODEL` | 推理模型 |

### 7.7 自定义中转

| 名称 | 用途 |
|---|---|
| `CUSTOM_PROVIDER_LABEL` | 前端显示名称 |
| `CUSTOM_API_URL` | OpenAI-compatible Base URL |
| `CUSTOM_API_KEY` | 中转站 API Key |
| `CUSTOM_MODELS` | 逗号分隔的模型 ID |

### 7.8 记忆与 Ombre Brain

| 名称 | 用途 |
|---|---|
| `MEMORY_PROVIDER` | 会话压缩/记忆模型供应商 |
| `MEMORY_MODEL` | 会话压缩/记忆模型 |
| `OMBRE_BRAIN_URL` | Ombre Brain MCP 地址 |
| `OMBRE_BRAIN_VAULT_PATH` | Obsidian Vault 路径 |
| `OMBRE_BRAIN_TOKEN` | Ombre Brain 服务端鉴权 Token |
| `OMBRE_BRAIN_TIMEOUT_MS` | 请求超时 |
| `OMBRE_BRAIN_MAX_RESULTS` | 单次召回数量 |
| `OMBRE_BRAIN_CATALOG_MAX_TOKENS` | 记忆目录上下文上限 |
| `OMBRE_ALLOW_CLAUDE_HOLD` | 是否允许 Claude 延迟/自行决定召回 |

### 7.9 ElevenLabs

| 名称 | 用途 |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs API Key |
| `ELEVENLABS_VOICE_ID` | 音色 ID |
| `ELEVENLABS_MODEL_ID` | TTS 模型，默认 `eleven_flash_v2_5` |
| `ELEVENLABS_OUTPUT_FORMAT` | 音频输出格式 |
| `ELEVENLABS_CACHE_PATH` | 语音缓存目录 |
| `ELEVENLABS_CACHE_RETENTION_DAYS` | 已备份缓存保留天数，默认 14 |

### 7.10 Apple Health

| 名称 | 用途 |
|---|---|
| `HEALTH_SYNC_TOKEN` | Health Auto Export 写入 Token |
| `HEALTH_DB_PATH` | SQLite 文件路径 |
| `HEALTH_RETENTION_DAYS` | 健康数据保留天数，默认 3 |

### 7.11 主动消息/Bark

| 名称 | 用途 |
|---|---|
| `PUSH_SECRET` | 主动推送内部接口鉴权 |
| `PUSH_MODEL_SELECTION` | 生成主动消息的供应商和模型 |
| `PUSH_COOLDOWN_MIN_MINUTES` | 最短随机等待 |
| `PUSH_COOLDOWN_MAX_MINUTES` | 最长随机等待 |
| `BARK_URL` | Bark 推送地址 |
| `PUSH_TITLE` | 推送标题 |
| `BARK_ICON_URL` | 推送图标 URL |

## 8. 主要 API

所有需要登录的业务接口使用：

```http
Authorization: Bearer <APP_ACCESS_TOKEN>
```

Health Auto Export 写入使用独立的 `HEALTH_SYNC_TOKEN`。

主要路由：

```text
GET    /api/health
GET    /api/models
GET    /api/settings
PUT    /api/settings

GET    /api/sessions
POST   /api/sessions
PATCH  /api/sessions/:id
DELETE /api/sessions/:id
GET    /api/sessions/:id/messages
POST   /api/sessions/:id/chat
POST   /api/sessions/:id/clear

GET    /api/memories
GET    /api/memories/:date
PUT    /api/memories/:date
GET    /api/ombre/catalog

GET    /api/moments
POST   /api/moments
POST   /api/moments/:id/like
POST   /api/moments/:id/comments

GET    /api/diary
GET    /api/diary/:id
PUT    /api/diary/:id

POST   /api/health/sync
GET    /api/health/latest
GET    /api/health/range

GET    /api/voice/status
POST   /api/tts
POST   /api/stt
POST   /api/call/reply
GET    /api/call/invite
POST   /api/call/invite
POST   /api/call/answer
POST   /api/call/record

GET    /api/claude-usage
GET    /api/drives/status
GET    /api/push/status
POST   /api/push/trigger
```

## 9. 最近修改的文件

按最后修改时间整理：

| 日期 | 文件 | 最近修改内容 |
|---|---|---|
| 2026-07-27 | `voice-call.js` | 录音停顿检测、20 秒上限、语音条预生成和客户端缓存 |
| 2026-07-27 | `voice-call.css` | 通话字幕高对比样式、语音条预加载状态 |
| 2026-07-27 | `service-worker.js` | PWA 缓存升级到 `lumiere-v40` |
| 2026-07-27 | `automation/Sync-LumiereVoice.ps1` | VPS 语音自动同步到本机并回写备份标记 |
| 2026-07-27 | `server/elevenlabs.js` | TTS 文件哈希缓存，重复文本不重复合成 |
| 2026-07-27 | `server/voice-cache.js` | 仅清理已备份的过期 MP3 |
| 2026-07-27 | `server/config.js` | ElevenLabs 缓存、健康数据和推送配置 |
| 2026-07-27 | `server/index.js` | TTS/STT/通话、主动来电和每日缓存清理路由 |
| 2026-07-27 | `server/call-invites.js` | 主动来电邀请和记录 |
| 2026-07-27 | `server/shadow-push.js` | 主动消息与 Bark 推送 |
| 2026-07-27 | `api.js` | 通话、语音、流式回复和业务 API 前端调用 |
| 2026-07-27 | `index.html` | 通话 UI、语音组件和相关资源接入 |
| 2026-07-26 | `server/model.js` | 多供应商模型、上下文和记忆注入 |
| 2026-07-26 | `server/diary.js` | AI 日记和可见性控制 |
| 2026-07-26 | `server/drivesoid.js` | 首页情绪/状态模块 |
| 2026-07-26 | `server/health-store.js` | 健康数据存储、查询和 3 天保留策略 |
| 2026-07-26 | `real-ui.js` / `.css` | 记忆日历、日记、首页和页面视觉调整 |

## 10. 测试、构建与运维命令

### 10.1 本地

```powershell
cd E:\Lumiere\claura

# 安装依赖
npm.cmd install

# 当前 package.json 中的测试入口
npm.cmd test

# 构建静态文件
npm.cmd run build

# 开发模式
npm.cmd run dev

# 普通启动
node --env-file=.env server/index.js
```

单文件语法检查：

```powershell
node --check .\server\index.js
node --check .\server\model.js
node --check .\api.js
node --check .\voice-call.js
```

### 10.2 VPS

```bash
# 服务状态
systemctl status lumiere.service --no-pager
systemctl status caddy --no-pager
systemctl status lumiere-push.timer --no-pager

# 重启/重载
systemctl restart lumiere.service
systemctl reload caddy
systemctl restart lumiere-push.timer

# 日志
journalctl -u lumiere.service -n 100 --no-pager
journalctl -u lumiere.service -f
journalctl -u caddy -n 100 --no-pager
journalctl -u lumiere-push.service -n 100 --no-pager

# 健康检查
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://43-156-145-27.sslip.io/api/health

# 语法与配置
node --check /opt/lumiere/server/index.js
caddy validate --config /etc/caddy/Caddyfile

# 空间
du -sh /opt/lumiere /opt/lumiere/data
df -h /
```

### 10.3 Health Auto Export 测试

```bash
curl -X POST 'https://43-156-145-27.sslip.io/api/health/sync' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <HEALTH_SYNC_TOKEN>' \
  -d '{"data":[{"type":"heart_rate","value":80,"unit":"count/min","date":"2026-07-28T08:00:00Z"}]}'
```

查询时使用内部 `APP_ACCESS_TOKEN`：

```bash
curl -H 'Authorization: Bearer <APP_ACCESS_TOKEN>' \
  'https://43-156-145-27.sslip.io/api/health/latest?type=heart_rate'
```

## 11. 已知问题与风险

1. **本地测试入口目前不干净。** 2026-07-28 执行 `npm.cmd test` 时，本机 Node `v22.11.0` 不支持项目使用的 `node:sqlite`，导致健康存储及依赖它的测试失败；同时 `node --test` 会扫描 `node_modules/third-party` 内大量测试。VPS Node `v22.23.1` 可运行 `node:sqlite`。应升级本机 Node，并把测试脚本限制为 `test/` 下的项目测试文件。
2. **构建通过。** 2026-07-28 已执行 `npm.cmd run build` 成功。
3. **README 编码异常。** 当前 `README.md` 和少量源码里的中文标签存在乱码，应统一为 UTF-8 后再维护。
4. **Git 元数据不完整。** 当前目录虽然存在 `.git`，但 `git` 报告“not a git repository”。项目缺少可靠的提交历史和回滚点，应尽快初始化/修复仓库并创建私有远端。
5. **PWA 缓存容易造成“部署未生效”的错觉。** 每次静态更新必须递增 Service Worker 缓存版本，并提示 iPhone 关闭后重新打开。
6. **浏览器语音识别仍受 iOS/Safari 限制。** 已改为停顿检测和 20 秒上限，但噪声、过长停顿、系统权限或 Safari 音频会话仍可能造成截断。
7. **语音首次生成仍依赖 ElevenLabs 网络。** 相同内容后续会命中缓存；新内容无法完全消除首包延迟。
8. **主动来电不是原生 VoIP。** 当前是 Bark + PWA 内来电邀请，不能像系统电话一样保证锁屏后台实时响铃。真正的 iOS 原生来电需要 App、PushKit/CallKit 和 APNs。
9. **语音本机备份依赖电脑在线。** Windows 关机时计划任务不会运行；服务器只有带 `.backed-up` 标记的旧文件才会被定期清理。
10. **健康数据清理发生在同步时。** 如果 Health Auto Export 长期不再推送，超过 3 天的数据不会单独由定时任务清理；可增加每日清理 timer。
11. **Ombre Brain 重复记忆。** 目前只有基础去重/限制，没有 Embedding 向量相似度去重。Gemini/其他 Embedding 方案尚未正式接入。
12. **Claude 订阅额度不可精确预测。** 长上下文、未命中缓存、模型选择和工具调用都会显著影响五小时/周额度；首页额度数据依赖 Claude Code 可提供的统计。
13. **服务以 root 用户运行。** 可工作但权限过高。后续应创建专用 `lumiere` 系统用户，并限制 `/opt/lumiere`、`.env` 和数据目录权限。
14. **没有正式域名。** 当前使用 sslip.io 临时域名。购买域名后需更新 DNS、Caddyfile、`PUBLIC_APP_URL`、`ALLOWED_ORIGINS`、Bark 图标 URL 和 PWA 配置。
15. **备份范围不完整。** 当前自动备份重点是语音；Supabase、健康 SQLite、Ombre Vault、`.env` 和系统配置仍需要独立备份策略。

## 12. 建议的下一步任务

优先级从高到低：

1. 修复 Git 仓库，提交当前可运行版本并建立私有远端。
2. 升级本机 Node 到与 VPS 一致的 22.23+，把 `npm test` 限定到项目 `test/`。
3. 建立不含密钥值的自动部署脚本和可回滚发布包。
4. 为 Supabase、健康 SQLite、Ombre Vault、Caddy/systemd 配置建立定期备份。
5. 购买正式域名并替换 sslip.io。
6. 创建非 root 的 `lumiere` 服务用户并加强 SSH、防火墙和文件权限。
7. 为 Ombre Brain 加入可控的 Embedding 向量相似去重，迁移前先备份 Vault。
8. 增加独立的每日健康数据清理 timer。
9. 继续优化 iOS 录音：可考虑原生 App/WebRTC VAD，而不是完全依赖浏览器录音事件。
10. 如果必须实现真正后台主动来电，单独规划 iOS 原生壳、APNs、PushKit 和 CallKit。
11. 整理 UTF-8 编码、合并大量零散 CSS，减少后续 UI 修改产生连锁问题。
12. 为主要 API 增加集成测试、速率限制、请求体大小限制和结构化日志。

## 13. 交接安全检查

- 本文只包含环境变量名称，没有任何密钥值。
- `.env`、SSH 私钥、Claude OAuth Token、Supabase Service Role Key、ElevenLabs Key、Bark URL 和中转站 Key 都不得提交。
- 接手人首次操作前应分别确认：
  - `/opt/lumiere/.env` 权限；
  - SSH authorized keys；
  - Tencent Cloud 防火墙端口；
  - Supabase RLS；
  - Caddy 证书续期；
  - Windows 语音备份计划任务最近一次结果；
  - `/api/health` 的 Supabase 和 Ombre 状态。
