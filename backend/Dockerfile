# 后端 Dockerfile：多阶段构建（只安装生产依赖）
# 基础镜像使用 node:22-alpine（内置 node:sqlite，体积小）
FROM node:22-alpine AS base

# 安装生产依赖需要的系统库（sqlite3 不需要额外库，node:sqlite 内置）
# 仅为健康检查 curl 安装
RUN apk add --no-cache curl

WORKDIR /app

# 先复制 package 文件利用缓存层
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 复制源码
COPY server.js db.js auth.js upstream.js ./

# 创建数据目录并设置权限（非 root 运行）
RUN mkdir -p /app/data && chown -R node:node /app

# 切换到非 root 用户
USER node

# 暴露端口
EXPOSE 3001

# 健康检查（Docker 原生）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', r => { if (r.statusCode !== 200) process.exit(1) }).on('error', () => process.exit(1))"

# 启动
CMD ["node", "server.js"]