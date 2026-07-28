# Lumière 多 AI 平台

Lumière 不训练或创造模型。它通过服务端 API 连接现成的 AI，并统一保存会话、消息、设置和长期记忆。

## 已支持的连接

- OpenAI 官方 API：使用 Responses API。
- Claude 官方 API：使用 Anthropic Messages API。
- DeepSeek 官方 API：使用 OpenAI-compatible Chat Completions。
- 自定义中转站：支持 OpenAI-compatible Chat Completions。

聊天页的模型选择器只启用已经在服务端配置好的平台。API Key 不会返回浏览器。

## Claude Code 官方订阅后端

个人部署可以让后端通过 Anthropic 官方 Agent SDK 启动 Claude Code，并使用你自己的 Pro、Max、Team 或 Enterprise 订阅：

1. 在你控制的电脑上安装并登录 Claude Code。
2. 运行 `claude setup-token`，按官方页面完成授权。
3. 将生成的一年期 Token 填入部署平台的 `CLAUDE_CODE_OAUTH_TOKEN` 私密环境变量。

Token 不要发给他人、不要提交 Git，也不要放进浏览器代码。后端适配器已禁用 Claude Code 的 Bash、文件、MCP、技能和项目设置，只允许生成聊天回复；每次请求默认预算上限由 `CLAUDE_CODE_MAX_BUDGET_USD` 控制。

这不同于在产品里提供“使用 Claude.ai 登录”。未经 Anthropic 事先批准，不能向其他用户提供 Claude.ai 登录或共享订阅限额。本项目只按你的个人后端凭证运行，不抓取网页、不保存 Cookie、不伪装官方客户端。

## 本地运行

需要 Node.js 20 或更新版本。

1. 将 `.env.example` 复制为 `.env`。
2. 至少填写一个平台的 API Key。
3. 用环境变量启动，或运行 `node --env-file=.env server/index.js`。
4. 打开 `http://localhost:3000`。

未配置 Supabase 时使用临时内存数据库，服务重启后数据会消失。

## Supabase

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/migrations/001_initial.sql`。
3. 在服务端设置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。

数据库启用了 RLS 且没有公开访问策略。Service Role Key 只能放在 Render 等服务端环境变量中，不能写进 `config.js`、前端代码或聊天消息。

## 模型环境变量

### OpenAI

- `OPENAI_API_KEY`
- `OPENAI_MODEL`：默认 `gpt-5.6-terra`
- `OPENAI_FAST_MODEL`：默认 `gpt-5.6-luna`
- `OPENAI_PRO_MODEL`：默认 `gpt-5.6-sol`
- `OPENAI_SAFETY_IDENTIFIER`：可选，填写稳定且不含个人信息的用户标识

### Claude API

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_FAST_MODEL`
- `ANTHROPIC_PRO_MODEL`

### Claude Code 订阅

- `CLAUDE_CODE_OAUTH_TOKEN`
- `CLAUDE_CODE_MODEL`：默认 `sonnet`
- `CLAUDE_CODE_MAX_BUDGET_USD`：单次调用预算保护，默认 `0.25`

### DeepSeek

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_REASONER_MODEL`

### 自定义中转

- `CUSTOM_PROVIDER_LABEL`
- `CUSTOM_API_URL`
- `CUSTOM_API_KEY`
- `CUSTOM_MODELS`：用英文逗号分隔模型 ID

长期记忆压缩由 `MEMORY_PROVIDER` 和 `MEMORY_MODEL` 指定；默认优先使用 DeepSeek。

## Render 部署

将项目推送到 GitHub，在 Render 使用 `render.yaml` 创建 Blueprint。至少填写：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- 你准备使用的 AI 平台 API Key

Render 会自动生成 `APP_ACCESS_TOKEN`。Lumière 第一次连接时会询问该令牌，它只保存在当前浏览器。

## 验证

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

健康检查为 `/api/health`，模型目录为 `/api/models`。
