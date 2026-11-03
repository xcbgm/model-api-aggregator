# 灵犀模型网关 · AI 模型 API 聚合平台

> 一处密钥，通达百种模型。  
> 统一接入、统一计费、统一监控 —— 为团队与个人提供稳定、透明、可审计的大模型调用能力。

---

## ✨ 核心功能

| 模块 | 说明 |
|------|------|
| **多厂商统一接入** | 支持 OpenAI、Anthropic、DeepSeek、通义千问、智谱、Google Gemini 等任意兼容 OpenAI 协议的上游；填写地址与密钥即可接入 |
| **上游模型自动拉取** | 点击「拉取模型」自动从上游 `GET /v1/models` 获取可用模型列表，一键勾选批量导入 |
| **模型分组与差异化定价** | 分组名称全局唯一、一个模型仅归属一个分组；分组可设置计费倍率（如 0.8× 折扣、1.5× 溢价） |
| **多维度定价策略** | 支持 **Token 计费**（输入/输出分别定价，单位：元/1K tokens）与 **按次计费**（固定单价/次） |
| **模型广场** | 所有登录用户可见；展示模型名称、厂商、分组、输入/输出/按次价格；提供 cURL 调用示例 |
| **用户体系 & 模拟充值** | 支持注册/登录、JWT 鉴权、余额扣减、充值记录；演示环境下充值即到账（无真实支付） |
| **仪表盘统计** | 今日/累计调用次数、Token 用量、消费金额、成功率、14 天趋势图、Top 模型、最近失败记录 |
| **调用日志审计** | 记录每次请求的模型、Token 明细、费用、耗时、状态、错误信息；支持按状态/模型筛选 |
| **OpenAI 兼容代理** | 标准 `/v1/chat/completions`、`/v1/completions`、`/v1/embeddings`、`/v1/messages`；鉴权：`Authorization: Bearer sk-xxx`（用户 API Key） |
| **双主题 UI** | 青瓷绿·鎏金配色；浅色（米白底+青绿主色）与深色（墨黑底+青碧主色）一键切换，符合中式审美 |

---

## 🏗 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                 │
│  React + Ant Design (Vite/esbuild)  端口 5173                    │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP /api, /v1
┌────────────────────────────▼────────────────────────────────────┐
│                     Node.js + Express (3001)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Auth/JWT   │  │  Vendors/   │  │  Proxy Handler          │  │
│  │  Users/Keys │  │  Models/    │  │  - 鉴权用户 Key           │  │
│  │  Billing    │  │  Groups     │  │  - 选模型/厂商/分组       │  │
│  │  Logs/Dash  │  │  Market     │  │  - 余额检查/预扣费        │  │
│  └─────────────┘  └─────────────┘  │  - 转发上游/记录日志/结算 │  │
│                                     └─────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌─────────┐    ┌───────────┐  ┌──────────┐
        │DeepSeek │    │ 阿里通义   │  │  其他…   │
        │ api...  │    │ dashscope │  │ OpenAI兼 │
        └─────────┘    └───────────┘  └──────────┘
```

**数据层**：SQLite（内置 `node:sqlite`，Node ≥ 22），单文件 `backend/data/app.db`，WAL 模式支持并发读写。

---

## 🚀 快速开始

### 环境要求
- **Node.js ≥ 22**（必须，后端使用内置 `node:sqlite` 模块）
- npm（随 Node 安装）

### 方式一：一键启动脚本（推荐）

```bash
cd model-api-aggregator

# 启动后端(3001) + 前端(5173)
./start.sh

# 查看状态
./start.sh status

# 停止
./start.sh stop

# 重启
./start.sh restart
```

启动成功后，浏览器访问：
- **前端界面**：http://localhost:5173
- **后端 API**：http://localhost:3001/api/health

**默认账号**：
| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | `admin` | `admin123` |
| 普通用户 | `demo` | `demo123` |

---

### 方式二：手动分步启动

```bash
# 1. 后端
cd backend
npm install          # 首次运行
node server.js       # 默认端口 3001

# 2. 前端（新终端）
cd frontend
npm install          # 首次运行
npm run build        # 用 esbuild 构建到 dist/
npm run start        # 静态服务器 + API 代理，端口 5173
```

---

## 📖 使用指南

### 1. 添加上游厂商并拉取模型
1. 以 **admin** 登录 → 进入「厂商接入」
2. 点击「添加厂商」填写：
   - **名称**：如 `DeepSeek`
   - **API 地址**：如 `https://api.deepseek.com`（必须以 `http://` 或 `https://` 开头）
   - **API 密钥**：上游厂商提供的 Key
   - **协议**：`OpenAI 兼容` / `Anthropic` / `Gemini` / `自定义`
3. 保存后，点击该行「拉取模型」→ 系统自动请求上游 `/v1/models` 并列出可用模型
4. 勾选需导入的模型 → 选择归属分组 → 设置输入/输出价格 → 「导入所选」

> ✅ **核心需求 2**：输入密钥和地址后，支持从上游拉取可用模型（兼容 `/v1/models` 与 `/models` 两种路径）。

### 2. 管理分组与定价（核心需求 3）
1. 进入「模型分组」→ 「新建分组」
   - 名称唯一（如「旗舰模型」「高性价比」）
   - **计费倍率**：最终费用 = 模型单价 × 分组倍率 × 用量
2. 进入「模型与定价」
   - 可手动添加模型、修改价格、调整分组
   - **输入价/输出价**：单位 **元 / 1K tokens**
   - **按次价**：大于 0 时优先按次计费，忽略 Token 价格
   - **一个模型只能分配一个分组**（数据库唯一约束 + 前端校验）

### 3. 模型广场（核心需求 5）
- 所有登录用户访问「模型广场」
- 可按厂商、分组筛选；搜索模型名称
- 价格清晰可见；右上角显示账户余额
- 页面底部提供 **cURL 调用示例**，复制即用

### 4. 充值与账单（核心需求 5）
- 进入「充值与账单」
- 选择预设金额或自定义 → 「立即充值」
- **演示环境**：点击即视为支付成功，金额实时到账
- 记录包含时间、金额、方式、状态

### 5. 获取 API Key 并调用
1. 进入「API 密钥」→ 「创建密钥」→ 密钥**仅显示一次**，请立即复制保存
2. 调用示例：
```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer sk-xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```
- 所有请求按模型实际 Token 用量 × 分组倍率从余额扣除
- 余额不足返回 `402`，无效 Key 返回 `401`，上游错误返回 `502`

### 6. 仪表盘查看统计（核心需求 4）
- 「仪表盘」实时展示：
  - 今日/累计：**调用次数**、**Token 用量**、**消费金额**
  - **成功率**、**失败次数**
  - 14 天趋势图（调用次数 + Token 双轴面积图）
  - Top 8 热门模型（横向柱状图）
  - 最近失败记录（含错误信息、用户、时间）
- 管理员看到全平台数据，普通用户仅看自己

---

## 🗂 目录结构

```
model-api-aggregator/
├── backend/
│   ├── server.js          # Express 入口、所有路由、代理逻辑
│   ├── db.js              # SQLite 连接、建表、种子数据
│   ├── auth.js            # JWT 签发/验证、鉴权中间件
│   ├── upstream.js        # 上游 HTTP 请求、模型拉取
│   ├── package.json
│   ├── data/app.db        # SQLite 数据文件（运行时生成）
│   └── scripts/
│       └── seed-demo.js   # 生成 14 天演示日志（用于截图/演示）
├── frontend/
│   ├── src/
│   │   ├── main.jsx       # 应用入口、主题注入
│   │   ├── App.jsx        # 路由、权限守卫
│   │   ├── api.js         # axios 封装、统一错误处理
│   │   ├── theme.js       # 设计令牌（浅/深色）
│   │   ├── index.css      # 全局样式、中式排版变量
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # 用户/主题/权限全局状态
│   │   ├── components/
│   │   │   └── AppLayout.jsx    # 布局：侧栏+顶栏+内容区
│   │   └── pages/
│   │       ├── Login.jsx        # 登录/注册（印章品牌、双主题切换）
│   │       ├── Dashboard.jsx    # 仪表盘（统计卡、趋势图、失败表）
│   │       ├── Marketplace.jsx  # 模型广场（卡片网格、价格展示）
│   │       ├── Vendors.jsx      # 厂商接入（增删改、拉取模型、导入向导）
│   │       ├── Groups.jsx       # 模型分组（卡片概览+表格、倍率可视化）
│   │       ├── Models.jsx       # 模型与定价（表格、价格录入、分组下拉）
│   │       ├── Keys.jsx         # API 密钥（创建/复制/删除、一次性展示）
│   │       ├── Billing.jsx      # 充值与账单（预设金额、记录表）
│   │       ├── Logs.jsx         # 调用日志（分页、状态筛选、错误详情）
│   │       ├── Users.jsx        # 用户管理（管理员：角色/余额/状态调整）
│   │       └── Settings.jsx     # 账号设置（改密、主题切换）
│   ├── build.mjs          # esbuild 打包脚本（兼容无 AVX2 CPU）
│   ├── serve.mjs          # 静态服务器 + /api /v1 反向代理
│   ├── package.json
│   └── dist/              # 构建产物（生产部署用）
├── start.sh               # 一键启动/停止/状态脚本
├── deploy.sh              # 镜像发布/拉取脚本
├── docker-compose.yml     # 容器化部署
├── backend/Dockerfile
├── frontend/Dockerfile
├── frontend/nginx.conf
├── .gitignore
└── README.md              # 本文件
```

---

## 🐳 Docker 部署

### 方式一：拉取已发布镜像（推荐）

> ✅ 镜像已发布到 GHCR，可直接拉取部署。

```bash
git clone https://github.com/xcbgm/model-api-aggregator.git
cd model-api-aggregator

# 设置 JWT 密钥（生产环境必改）
echo 'JWT_SECRET=你的随机密钥' > .env

docker compose pull
docker compose up -d
# 访问 http://localhost:8080
```

### 方式二：本地构建

```bash
cd model-api-aggregator
docker compose up -d --build
```

### 📤 发布镜像到 GHCR（仓库维护者）

首次发布镜像，在一台装有 Docker 的机器上执行：

```bash
# 1. 创建 GitHub Token（经典 PAT 勾选 write:packages）
export GH_TOKEN=ghp_xxx

# 2. 构建并推送
./deploy.sh push
```

`deploy.sh` 会自动登录 GHCR、构建前后端镜像并推送。之后任何人都可 `docker compose pull` 部署。

**端口映射**：
- `8080` → Nginx（托管前端静态资源 + 反代 `/api` `/v1` 到 backend:3001）
- `3001` → 后端 API
- 数据卷：`./backend/data:/app/data`（持久化 SQLite）

**生产建议**：
- 修改 `backend/.env` 设置强 `JWT_SECRET`
- 配置反向代理（Nginx/Traefik）终结 HTTPS
- 启用 SQLite WAL（已默认开启）并定期备份 `data/app.db`
- 如并发高，可将后端横向扩展为多实例 + 共享数据库（需改用 PostgreSQL）

---

## ❓ 常见问题

| 问题 | 解决 |
|------|------|
| `node:sqlite` 报错 / `Module not found` | Node 版本必须 ≥ 22；`node -v` 确认 |
| 前端构建报 `Illegal instruction` | CPU 不支持 AVX2，项目已改用 **esbuild** 打包（`build.mjs`），无需 Vite/Rollup 原生模块 |
| 后端启动后前端无法访问 API | 检查 `frontend/serve.mjs` 的 `BACKEND` 环境变量，或确认后端 3001 端口可达 |
| 上游拉取模型失败 | 确认厂商地址以 `http(s)://` 开头、密钥正确、网络可达；支持 OpenAI/Anthropic/Gemini 协议 |
| 充值不生效 | 演示环境仅模拟到账；查看「充值记录」确认是否写入 |
| 修改密码/主题不生效 | 确认浏览器未禁用 localStorage；主题保存在 `lx_theme` |

---

## 📄 许可证

MIT License — 仅供学习、演示与二次开发参考。生产环境请自行评估安全性、合规性与扩展性。

---

> **灵犀模型网关** —— 让大模型调用像用水电一样简单、透明、可控。