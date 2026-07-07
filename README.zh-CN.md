# Neo Chat

<p align="center">
  <img src="public/logo.png" width="96" alt="Neo Chat logo" />
</p>

<p align="center">
  <strong>本地优先的 AI 对话工作台，集成模型、助理、技能、插件、搜索、RAG、语音、记忆和产物。</strong>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/u14app/neo-chat/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/u14app/neo-chat/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/u14app/neo-chat/actions/workflows/docker.yml"><img alt="Docker" src="https://github.com/u14app/neo-chat/actions/workflows/docker.yml/badge.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6" />
</p>

Neo Chat 是一个可自托管、本地优先的 AI 对话应用，基于 Next.js、React、TypeScript 和 Zustand 构建。它把多供应商模型、助理预设、纯文本技能、OpenAPI 风格插件工具、联网搜索、知识库 RAG、本地记忆、语音、生成媒体、富消息渲染、引用和可编辑产物整合到一个干净的工作台中。

它适合想使用现代 AI 工作台、同时保持本地数据所有权的用户。默认情况下，对话历史、工作区元数据、技能、插件配置、记忆和文件都保存在浏览器内；服务端路由作为受控代理，连接模型供应商、搜索、RAG、文档解析、语音、插件执行和部署健康检查。

## 功能特性

- 支持 Gemini、OpenAI 和 OpenAI-compatible endpoint 的多供应商对话。
- 对 metadata 声明支持图片输出/输入的模型提供原生图片生成和图片编辑，图文混排会按模型输出顺序渲染，并使用 OPFS + Blob URL 做图片显示缓存。
- 本地优先的会话、分支、置顶对话、工作区、工作区文件和助理指令。
- 支持 LobeHub Agent Registry 助理预设，也支持本地自定义助理。
- 支持纯文本技能：本地化公共目录、安装/卸载、编辑内置技能、本地自定义技能、自动选择和工作区预设。
- 支持 OpenAPI 风格插件工具、插件鉴权和服务端执行。
- 内置网页阅读、天气、Unsplash 搜索、Agnes 图片生成、Agnes 视频生成工具。Agnes 仍是插件路径，和模型原生图片输出分开。
- 支持 Gemini 原生 Google Search，以及 Tavily、Firecrawl、Exa、Bocha、SearXNG 等外部搜索。
- 知识库 RAG 支持 OPFS 文件存储、Mineru/LlamaParse 文档解析和可选向量索引。
- 支持本地记忆、可选记忆搜索、后台记忆提取和记忆整合。
- 支持浏览器语音 API、ElevenLabs、Mimo 或兼容配置的语音输入输出。
- 支持 Markdown、安全内联 HTML 视觉块、GFM 表格、数学公式、代码高亮、Mermaid 图、思维导图、引用、推理、工具调用、图片、音频和产物渲染。
- 用户输入的模型、插件、搜索、RAG、语音密钥会以本地 BYOK envelope 加密。
- 支持部署健康检查，覆盖 BYOK、访问密码、共享存储、默认模型、搜索、RAG 和语音配置状态。
- 支持 Docker 和 Cloudflare Workers 部署。

## 截图

![Neo Chat 桌面端](public/desktop.png)

![Neo Chat 移动端](public/mobile.png)

## 快速开始

### 环境要求

- Node.js 22
- pnpm 10.30.3

### 本地运行

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`，然后在设置里配置至少一个模型供应商。

如需部署级默认配置，可以复制环境变量模板：

```bash
cp .env.example .env.local
```

大多数设置都可以在浏览器中管理。服务端环境变量适用于共享默认模型供应商、托管部署安全、访问密码保护、共享运行时存储，或统一管理搜索、RAG、文档解析、语音、记忆和 HTML 视觉渲染等默认能力。

## 部署

### Docker Compose

```bash
docker compose up --build
```

Compose 会在 `http://localhost:3000` 暴露 Neo Chat，并使用本地/自托管安全默认值。生产 Docker 部署应设置稳定的 BYOK 值，托管或多实例部署应使用共享存储，并且只有在代理会剥离伪造转发头时才启用 `TRUST_PROXY_HEADERS`。

### Docker 镜像

```bash
docker build -t neo-chat:local .
docker run --rm -p 3000:3000 -e BYOK_ALLOW_EPHEMERAL_KEY=true neo-chat:local
```

Docker workflow 会为 pull request 构建镜像，并将 `main` / `v*` 标签发布到 GitHub Container Registry：

```text
ghcr.io/u14app/neo-chat:latest
```

### Vercel

把仓库导入为 Next.js 项目。Vercel 可以根据 `pnpm-lock.yaml` 和
`packageManager` 字段识别 pnpm，并使用 Next.js framework preset，因此
不需要自定义输出目录。

推荐项目设置：

```text
Framework Preset: Next.js
Install Command: default，或 corepack pnpm install --frozen-lockfile
Build Command: pnpm build
Output Directory: default
```

公开 Vercel 部署应在项目设置中配置生产环境变量：

```bash
DEPLOYMENT_MODE=hosted
RATE_LIMIT_STORE=upstash
DOCUMENT_PARSE_JOB_STORE=upstash
PLUGIN_REGISTRY_STORE=upstash
BYOK_ALLOW_EPHEMERAL_KEY=false
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

部署密码、供应商 key、BYOK 材料和共享存储凭据应按 Production、Preview
或 Development 作用域配置为 Vercel environment variables，不要提交到仓库。
当 `NEXT_PUBLIC_*` 会影响 metadata 或公开链接生成时，需要在会构建这些部署的
环境中配置它。

### Cloudflare Workers

```bash
pnpm build:worker
pnpm preview:worker
pnpm deploy:worker
```

Workers 应运行在 hosted 模式，并使用公开 HTTPS 上游。使用 Cloudflare
Workers Builds 时，建议把构建和部署命令分开，确保部署前已经生成
OpenNext 产物：

```bash
# Build command
pnpm build:worker

# Deploy command
pnpm exec opennextjs-cloudflare deploy -- --keep-vars
```

`--keep-vars` 会保留 Cloudflare dashboard 中配置的运行时变量和密钥，
避免部署时只使用仓库里 `wrangler.jsonc` 的值覆盖它们。

生产 Workers 应在 Cloudflare dashboard 的 **Settings -> Variables and
Secrets** 中配置运行时变量。非敏感部署默认值使用普通变量：

```bash
DEPLOYMENT_MODE=hosted
RATE_LIMIT_STORE=upstash
DOCUMENT_PARSE_JOB_STORE=upstash
PLUGIN_REGISTRY_STORE=upstash
BYOK_ALLOW_EPHEMERAL_KEY=false
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

部署密码、供应商 key、BYOK 材料和共享存储凭据应使用 secrets：

```bash
wrangler secret put BYOK_PRIVATE_KEY_PEM
wrangler secret put BYOK_KEY_ID
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put ACCESS_PASSWORD
```

使用 Cloudflare Workers Builds 时，如果某个变量需要在 `next build`
期间可用，尤其是 `NEXT_PUBLIC_*`，还需要在 **Settings -> Builds ->
Variables and Secrets** 中配置。运行时变量不会自动出现在构建步骤中。

不要把个人 API key 或部署密钥提交到 `wrangler.jsonc`。例如
`DEFAULT_PROVIDER_API_KEY` 是部署级默认 key，会被该 Worker 实例的所有
用户共享；如果希望用户在浏览器里使用自己的 key，就保持为空。

生产配置建议见 [Deployment Hardening](docs/deployment-hardening.md)。

## 配置

Neo Chat 默认本地优先：

- 核心设置、供应商记录、已选模型和供应商 API key 存在浏览器 `localStorage`。
- 对话元数据、消息、应用设置、已安装插件、已安装/自定义技能、技能目录缓存、助理、知识库元数据和本地记忆通过 `localforage` 存在 IndexedDB。
- 上传的对话文件、工作区文件和知识库文件存在浏览器 OPFS。用户发送和模型生成的图片还会保存 OPFS 显示缓存，并在运行期通过 `blob:` URL 渲染；原始消息数据仍用于模型请求和导出。
- 用户输入的密钥会先在浏览器中加密成 BYOK envelope，再发送给 API 路由。

重要服务端配置：

```bash
# 访问门禁
ACCESS_PASSWORD="your-access-password"

# 生产环境稳定 BYOK server key
BYOK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
BYOK_KEY_ID="prod-2026-07"
BYOK_ALLOW_EPHEMERAL_KEY="false"

# 部署安全
DEPLOYMENT_MODE="local" # 或 hosted
ALLOW_LOCAL_NETWORK_PROXY=""

# 托管或多实例部署所需的共享短期状态
RATE_LIMIT_STORE="upstash"
DOCUMENT_PARSE_JOB_STORE="upstash"
PLUGIN_REGISTRY_STORE="upstash"
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
```

默认模型供应商：

```bash
DEFAULT_PROVIDER_TYPE="Gemini"
DEFAULT_PROVIDER_NAME="Google Gemini"
DEFAULT_PROVIDER_BASE_URL=""
DEFAULT_PROVIDER_API_KEY="provider-key"
DEFAULT_PROVIDER_MODELS="model-a,model-b"
```

`DEFAULT_PROVIDER_MODELS` 支持多种格式:

```bash
# Comma-separated model IDs
DEFAULT_PROVIDER_MODELS="gpt-5.5,gpt-5.4-mini"

# JSON string array
DEFAULT_PROVIDER_MODELS='["gpt-5.5","gpt-5.4-mini"]'

# JSON object array with optional display names, capability aliases, and modalities
DEFAULT_PROVIDER_MODELS='[{"id":"gpt-image-2","name":"GPT Image 2","capabilities":["image_generation"]},{"id":"gemini-3.1-flash-image","modalities":{"input":["text","image"],"output":["text","image"]}},"gpt-5.4-mini"]'
```

JSON 对象条目中的 `name` 可选，缺省时会使用 `id` 作为显示名。
`capabilities` 支持 `vision`、`attachment`、`reasoning`、`tool_call`、
`image_generation`、`image_output`、`image_editing` 等 aliases。显式
`modalities.input` / `modalities.output` 存在时优先生效。

默认任务模型：

```bash
DEFAULT_MODEL_TITLE_GENERATION="model-a"
DEFAULT_MODEL_RELATED_QUESTIONS="model-a"
DEFAULT_MODEL_CONTEXT_COMPRESSION="model-a"
DEFAULT_MODEL_PROMPT_OPTIMIZATION="model-a"
DEFAULT_MODEL_RAG_QUERY="model-a"
DEFAULT_MODEL_MEMORY="model-a"
```

搜索、RAG、文档解析和语音默认值：

```bash
DEFAULT_SEARCH_PROVIDER="firecrawl"
# Firecrawl search works without an API key; set one for higher rate limits.
DEFAULT_SEARCH_API_KEY=""
DEFAULT_SEARCH_BASE_URL="https://search.example"

DEFAULT_RAG_BASE_URL="https://rag.example"
DEFAULT_RAG_TOKEN="rag-token"
DEFAULT_RAG_TOP_K="10"
DEFAULT_RAG_CHUNK_SIZE="512"
DEFAULT_RAG_NAMESPACE="default"
DEFAULT_DOCUMENT_PARSE_PROVIDER="mineru"
DEFAULT_MINERU_API_TOKEN=""
DEFAULT_LLAMA_PARSE_API_KEY="llama-parse-key"

DEFAULT_VOICE_PROVIDER="elevenlabs"
DEFAULT_ELEVENLABS_API_KEY="elevenlabs-key"
DEFAULT_ELEVENLABS_STT_MODEL="scribe_v2"
DEFAULT_ELEVENLABS_TTS_MODEL="eleven_flash_v2_5"
DEFAULT_ELEVENLABS_TTS_VOICE_ID="bIHbv24MWmeRgasZH58o"

DEFAULT_MIMO_API_KEY="mimo-key"
DEFAULT_MIMO_STT_MODEL="mimo-v2.5-asr"
DEFAULT_MIMO_TTS_MODEL="mimo-v2.5-tts"
DEFAULT_MIMO_TTS_VOICE_ID="mimo_default"
```

默认系统行为：

```bash
DEFAULT_SYSTEM_PROMPT=""
DEFAULT_ENABLE_AUTO_TITLE="true"
DEFAULT_ENABLE_RELATED_QUESTIONS="true"
DEFAULT_ENABLE_AUTO_COMPRESSION="true"
DEFAULT_ENABLE_CODE_COLLAPSE="true"
DEFAULT_ENABLE_HTML_VISUAL_PROMPT="true"
```

公开站点地址：

```bash
NEXT_PUBLIC_SITE_URL="https://your-domain.com"
```

完整模板见 [.env.example](.env.example)。

## 架构

```mermaid
flowchart LR
  Browser["浏览器应用\nReact + Zustand"] --> LocalStorage["localStorage\n供应商 + 设置"]
  Browser --> IndexedDB["IndexedDB\n会话 + 插件 + 技能 + 知识库 + 记忆"]
  Browser --> OPFS["OPFS\n上传 + 工作区文件"]
  Browser --> ApiRoutes["Next.js API routes"]
  ApiRoutes --> Providers["模型供应商\nGemini / OpenAI / compatible"]
  ApiRoutes --> Search["搜索供应商"]
  ApiRoutes --> Rag["RAG + 文档服务"]
  ApiRoutes --> Plugins["插件 API"]
  ApiRoutes --> Voice["语音供应商"]
  ApiRoutes --> Health["部署健康"]
  Browser -. "加密 BYOK envelopes" .-> ApiRoutes
```

应用尽量把持久用户数据保存在浏览器存储中。API 路由负责：

- 统一供应商请求和流式输出；
- 在服务端解密 BYOK；
- 为代理上游提供 URL 安全门；
- 通过已注册插件 ID 和函数名执行插件；
- 通过 `/api/health` 输出部署健康状态；
- 在 hosted 模式检查共享存储和本地网络限制。

## 技能、插件、搜索、RAG 与语音

技能是纯文本的提示词上下文模块。应用会从 `public/data/skills` 加载本地化元数据目录，只在需要时获取完整技能定义，并把已安装、已编辑和自定义技能保存在本地。活跃技能可以手动选择，也可以来自工作区预设，或在发送消息时自动选择。

插件是 OpenAPI 风格工具，可以来自 manifest 或内置定义。启用的插件函数会以 tool 形式暴露给兼容模型，再由服务端插件路由执行。工具调用编排使用较高但有边界的循环上限，既允许多步任务，也避免递归工具调用失控。

搜索可以使用 Gemini 模型的原生 Google Search，也可以对其他模型族使用外部搜索供应商。知识库 RAG 会把源文件存在 OPFS，可选使用 Mineru 或 LlamaParse 解析文档，并可把 chunks 索引到外部向量服务。

语音流程支持浏览器语音 API 和外部供应商。将 `DEFAULT_VOICE_PROVIDER` 设为 `elevenlabs` 或 `mimo` 可启用服务端默认语音供应商；留空则默认使用浏览器原生语音。默认模型值为空会禁用对应的 STT 或 TTS 能力，用户级密钥也可以由 UI 本地保存。

部署健康状态可从设置页和 `/api/health` 查看。它只返回非敏感状态，用于判断 BYOK、访问密码、hosted 模式、共享存储、默认模型、搜索、RAG 和语音配置是否可用。

## 安全模型

Neo Chat 适合自托管，但不是开箱即用的公共 SaaS 安全边界。

- `DEPLOYMENT_MODE=local` 允许本地和私有网络代理目标，适合私有部署。
- `DEPLOYMENT_MODE=hosted` 默认阻止 localhost、私有网络和平文 HTTP 代理目标，除非显式覆盖。
- BYOK envelope 防止用户输入的明文密钥出现在请求体中。
- API schema 会拒绝未知高风险字段和过大的 payload。
- 插件执行仍然通过服务端代理和校验，但运行时工具调用不再弹出用户确认窗口。
- `ACCESS_PASSWORD` 是部署门禁，不是账号系统。

如果要把 Neo Chat 作为公共多用户服务提供，请先补齐账号认证、租户隔离、服务端密钥存储、配额、审计日志、滥用控制和供应商费用控制。

运行时行为和恢复说明见 [Reliability and Safety Model](docs/reliability-and-safety.md)。

## 开发

质量检查：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level low
```

常用脚本：

```bash
pnpm dev              # 启动 Next.js 开发服务器
pnpm build            # 生产构建
pnpm start            # 启动生产服务
pnpm format           # 使用 Prettier 格式化仓库
pnpm format:check     # 检查仓库格式
pnpm build:worker     # 构建 Cloudflare Workers
pnpm preview:worker   # 预览 Worker 构建
pnpm deploy:worker    # 部署 Worker 构建并保留 dashboard 变量
pnpm byok:generate    # 生成可复制的 BYOK key
```

项目结构：

```text
src/app/              Next.js routes 和 API routes
src/components/       对话 UI、设置、插件市场、知识库
src/lib/              服务端/客户端领域逻辑与安全门
src/services/         模型、搜索、语音、RAG、插件 service clients
src/store/            Zustand stores 和持久化迁移
src/__tests__/        Vitest 工具、路由和工作流测试
docs/                 部署和可靠性说明
```

项目文档：

- [环境变量](docs/environment-variables.md)
- [插件开发](docs/plugin-development.md)
- [隐私和本地数据](docs/privacy-and-local-data.md)
- [部署加固](docs/deployment-hardening.md)
- [可靠性与安全模型](docs/reliability-and-safety.md)
- [路线图](ROADMAP.md)
- [变更日志](CHANGELOG.md)

## FAQ

### Neo Chat 会把我的数据存在服务器上吗？

默认情况下，持久对话和配置数据保存在浏览器存储中。API 路由会代理外部服务；生产部署仍应按照自身隐私要求处理服务端日志、上游服务和配置的共享存储。

### 可以使用 OpenAI-compatible 供应商吗？

可以。在设置中添加 OpenAI-compatible 供应商，或通过 `DEFAULT_PROVIDER_TYPE="OpenAI Compatible"` 和兼容 `/v1` base URL 配置部署默认值。

### 为什么生产环境需要稳定的 BYOK private key？

浏览器密钥会加密到服务端 public key。如果服务端 private key 改变，已有本地 envelope 将无法解密，直到用户重新输入密钥。

### 可以直接部署成公共 SaaS 吗？

不建议。Hosted 模式会加强 URL 策略和共享状态要求，但公共 SaaS 仍需要账号、租户、配额、审计和服务端密钥管理。

### 为什么工具调用很多次后会停止？

Neo Chat 保持较高但有边界的工具调用上限。模型可以运行多步工具工作流，但递归工具循环会在配置的轮次上限处停止。

### 我如何获取之前的版本

之前的项目版本是仅基于 Gemini 生态进行开发的项目，如果您需要之前的版本可以从 `gemini-next-chat` 分支获取，**该分支代码已存档**。

## 贡献

欢迎贡献。请保持改动聚焦，保留本地优先行为，并在提交 pull request 前运行质量检查。涉及安全边界的改动应同时覆盖 local 和 hosted 部署模式。

较大改动前请阅读 [Contributing](CONTRIBUTING.md)、[Security Policy](SECURITY.md)
和 [Code of Conduct](CODE_OF_CONDUCT.md)。

## 社区支持

[LinuxDo](https://linux.do/)

## 许可证

Neo Chat 使用 [MIT License](LICENSE) 发布。
