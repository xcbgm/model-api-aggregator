#!/usr/bin/env bash
# ============================================================
# 灵犀模型聚合 - 镜像发布 / 拉取脚本
# ============================================================
#
# 镜像已发布到 GHCR，通常无需再次推送。
# 仅当修改了代码需要更新镜像时才执行 push。
#
# 用法：
#   ./deploy.sh push     # 在能访问 Docker 的机器上，构建并推送镜像到 GHCR
#   ./deploy.sh pull     # 在部署机上，拉取镜像并启动
#   ./deploy.sh up       # 拉取镜像 + 启动（pull && up）
#   ./deploy.sh build    # 仅本地构建（不推送）
#
# 推送需要 GitHub Token（含 write:packages 权限）：
#   - 经典 PAT：勾选 write:packages
#   - Fine-grained PAT：Packages: Read and write + Administration: read and write
#
# Token 传递方式（任选其一）：
#   export GH_TOKEN=ghp_xxx
#   ./deploy.sh push --token ghp_xxx
# ============================================================

set -euo pipefail

REGISTRY="ghcr.io"
OWNER="xcbgm"
REPO="model-api-aggregator"
BACKEND_IMAGE="${REGISTRY}/${OWNER}/${REPO}/backend:latest"
FRONTEND_IMAGE="${REGISTRY}/${OWNER}/${REPO}/frontend:latest"

ACTION="${1:-}"
TOKEN_ARG=""
if [[ "${2:-}" == "--token" ]]; then TOKEN_ARG="${3:-}"; fi

# 从环境变量或参数读取 token
TOKEN="${TOKEN_ARG:-${GH_TOKEN:-}}"

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "✗ 未找到 docker，请先安装 Docker"
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "✗ 无法连接 Docker daemon，请确认已启动且当前用户有权限"
    exit 1
  fi
}

login_ghcr() {
  if [[ -z "$TOKEN" ]]; then
    echo "✗ 缺少 GitHub Token。请设置 GH_TOKEN 或使用 --token 参数。"
    echo "  Token 需要 write:packages 权限（经典 PAT）或 Packages: Read and write（细粒度 PAT）"
    exit 1
  fi
  echo "→ 登录 ${REGISTRY} (${OWNER})…"
  echo "$TOKEN" | docker login "${REGISTRY}" -u "${OWNER}" --password-stdin
  echo "✓ 登录成功"
}

build_images() {
  echo "→ 构建镜像…"
  docker compose build
  echo "✓ 构建完成"
}

push_images() {
  echo "→ 推送镜像…"
  docker compose push
  echo "✓ 推送完成"
  echo ""
  echo "镜像地址："
  echo "  ${BACKEND_IMAGE}"
  echo "  ${FRONTEND_IMAGE}"
}

pull_images() {
  check_docker
  echo "→ 拉取镜像…"
  docker compose pull
  echo "✓ 拉取完成"
}

up_services() {
  echo "→ 启动服务…"
  docker compose up -d
  echo "✓ 启动完成"
  echo ""
  echo "访问地址："
  echo "  http://<服务器IP>:8080"
  echo "  健康检查: http://<服务器IP>:8080/api/health"
}

case "$ACTION" in
  push)
    check_docker
    login_ghcr
    build_images
    push_images
    ;;
  pull)
    pull_images
    ;;
  up)
    pull_images
    up_services
    ;;
  build)
    check_docker
    build_images
    ;;
  *)
    echo "用法: $0 {push|pull|up|build}"
    echo ""
    echo "  push   构建并推送镜像到 GHCR（需要 Docker + GH_TOKEN）"
    echo "  pull   拉取镜像"
    echo "  up     拉取镜像并启动服务"
    echo "  build  仅本地构建"
    exit 1
    ;;
esac
