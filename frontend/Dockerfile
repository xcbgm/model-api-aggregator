# 前端 Dockerfile：多阶段构建
# Stage 1: 用 node:22-alpine 用 esbuild 构建（兼容无 AVX2 CPU）
FROM node:22-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# 复制源码与构建脚本
COPY src/ ./src/
COPY index.html build.mjs ./

# 构建到 dist/
RUN node build.mjs

# Stage 2: nginx 托管静态资源 + 反代 /api /v1 到 backend
FROM nginx:alpine AS runner

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置（反代 /api /v1）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]