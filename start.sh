#!/usr/bin/env bash
# =============================================================================
#  灵犀模型网关 · 一键启动脚本
# -----------------------------------------------------------------------------
#  用法：
#    ./start.sh                  启动后端(3001) + 前端开发服务器(5173)
#    ./start.sh stop             停止本脚本启动的两个进程
#    ./start.sh restart          重启
#    ./start.sh status           查看运行状态与健康检查
#    ./start.sh --backend-only   只启动后端（只调试 API 时使用）
#
#  可覆盖的环境变量：
#    BACKEND_PORT   后端端口，默认 3001
#    FRONTEND_PORT  前端端口，默认 5173
#
#  说明：
#    - Node.js 需 >= 22（后端使用内置 node:sqlite，Node 22 之前没有该模块）
#    - 依赖缺失时自动安装（backend 用 npm ci，frontend 无 lock 时用 npm install）
#    - 进程以独立会话（setsid）在后台运行，日志写入 .run/logs/，PID 写入 .run/
# =============================================================================
set -euo pipefail

# ------------------------------ 路径与常量 ------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
NODE_MIN_MAJOR=22

# npm 缓存放到项目内，避免污染用户目录（.gitignore 已忽略 .npm-cache）
export npm_config_cache="$ROOT_DIR/.npm-cache"

# ------------------------------ 彩色输出 ------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''
fi

info() { printf '%s\n' "${C_CYAN}▸${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GREEN}✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YELLOW}!${C_RESET} $*"; }
err()  { printf '%s\n' "${C_RED}✗${C_RESET} $*" >&2; }
die()  { err "$*"; exit 1; }

# ------------------------------ 参数解析 ------------------------------
ACTION="start"
BACKEND_ONLY=0
for arg in "$@"; do
  case "$arg" in
    start|stop|restart|status) ACTION="$arg" ;;
    --backend-only|-b)         BACKEND_ONLY=1 ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "未知参数：$arg（可用：start | stop | restart | status | --backend-only）" ;;
  esac
done

# ------------------------------ 工具函数 ------------------------------

# 端口是否已被占用（有服务在监听）
port_busy() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

# 进程是否存活
pid_alive() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# 等待 HTTP 接口可用：wait_http <url> <秒数>
wait_http() {
  local url="$1" limit="${2:-60}" i=0
  while [ "$i" -lt "$limit" ]; do
    if command -v curl >/dev/null 2>&1; then
      curl -fsS -m 2 -o /dev/null "$url" 2>/dev/null && return 0
    else
      node -e 'fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' "$url" 2>/dev/null && return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# 取本机局域网 IP（用于在其它设备上访问），失败则回退 127.0.0.1
lan_ip() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || ip=""
  fi
  [ -n "$ip" ] && printf '%s' "$ip" || printf '127.0.0.1'
}

# 在后台以独立会话启动进程：launch <工作目录> <日志文件> <PID 文件> <命令...>
# 用 setsid 建立独立进程组，stop 时可用 kill -TERM -<pid> 连同子进程一起结束
launch() {
  local dir="$1" log="$2" pidfile="$3"
  shift 3
  command -v setsid >/dev/null 2>&1 || die "系统缺少 setsid（util-linux），无法在独立会话中启动进程"
  mkdir -p "$(dirname "$log")" "$(dirname "$pidfile")"
  # 内层 bash 先把自己的 PID 写入文件，再 exec 目标命令 —— PID 保持不变
  ( cd "$dir" && setsid bash -c 'echo $$ >"$1"; shift; exec "$@"' _ "$pidfile" "$@" ) >>"$log" 2>&1 &
  local i=0
  while [ ! -s "$pidfile" ] && [ "$i" -lt 20 ]; do sleep 0.1; i=$((i + 1)); done
  pid_alive "$(cat "$pidfile" 2>/dev/null)" || { err "进程启动失败，日志如下："; tail -n 20 "$log" >&2 || true; return 1; }
}

# 停止一个由 launch 启动的进程组：stop_pid <名称> <PID 文件> <日志>
stop_pid() {
  local name="$1" pidfile="$2" log="${3:-}"
  if [ ! -s "$pidfile" ]; then
    return 0
  fi
  local pid; pid="$(cat "$pidfile")"
  if ! pid_alive "$pid"; then
    warn "$name 未在运行（清理残留 PID 文件）"
    rm -f "$pidfile"
    return 0
  fi
  # 优先终止整个进程组（setsid 使该 PID 同时是组长），失败再退回单进程
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  local i=0
  while pid_alive "$pid" && [ "$i" -lt 20 ]; do sleep 0.25; i=$((i + 1)); done
  if pid_alive "$pid"; then
    warn "$name 未在 5 秒内退出，强制结束"
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
  ok "$name 已停止${log:+（日志：${log#$ROOT_DIR/}）}"
}

# 安装依赖（node_modules 不存在时）
ensure_deps() {
  local dir="$1" name="$2"
  if [ -d "$dir/node_modules" ] && [ -n "$(ls -A "$dir/node_modules" 2>/dev/null)" ]; then
    info "$name 依赖已存在，跳过安装"
    return 0
  fi
  info "安装 $name 依赖（首次运行可能需要 1~3 分钟）…"
  if [ -f "$dir/package-lock.json" ]; then
    ( cd "$dir" && npm install --no-audit --no-fund )
  else
    ( cd "$dir" && npm install --no-audit --no-fund )
  fi
  ok "$name 依赖安装完成"
}

# ------------------------------ 环境检查 ------------------------------
check_env() {
  command -v node >/dev/null 2>&1 || die "未检测到 Node.js，请先安装 Node.js >= ${NODE_MIN_MAJOR}（推荐 https://nodejs.org）"
  command -v npm  >/dev/null 2>&1 || die "未检测到 npm，请检查 Node.js 安装是否完整"

  local ver major
  ver="$(node -v)"; major="${ver#v}"; major="${major%%.*}"
  if ! [ "$major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    die "Node.js 版本过低：当前 ${ver}，需要 >= ${NODE_MIN_MAJOR}.0.0（node:sqlite 内置模块要求）
  升级方式示例：
    · 官网安装包：https://nodejs.org/zh-cn/download
    · nvm：nvm install 22 && nvm use 22"
  fi

  # 二次确认 node:sqlite 可用（部分发行版打包的 Node 会裁剪该模块）
  node -e 'require("node:sqlite")' >/dev/null 2>&1 \
    || die "当前 Node.js（${ver}）缺少 node:sqlite 模块，请安装官方版本 Node.js >= 22"

  [ -f "$BACKEND_DIR/server.js" ] || die "未找到 backend/server.js，请在项目根目录运行本脚本"
  [ -d "$FRONTEND_DIR" ] || die "未找到 frontend 目录"

  ok "Node.js ${ver} / npm $(npm -v) 检查通过"
}

# ------------------------------ 启动流程 ------------------------------
start_backend() {
  local pidfile="$RUN_DIR/backend.pid" log="$LOG_DIR/backend.log"

  if [ -s "$pidfile" ] && pid_alive "$(cat "$pidfile")"; then
    warn "后端已在运行（PID $(cat "$pidfile")），跳过启动"
    return 0
  fi
  if port_busy "$BACKEND_PORT"; then
    warn "端口 ${BACKEND_PORT} 已被其它进程占用，跳过后端启动"
    warn "如需强制使用该端口，请先停止占用进程：lsof -i :${BACKEND_PORT} 或 ss -lptn 'sport = :${BACKEND_PORT}'"
    return 0
  fi

  ensure_deps "$BACKEND_DIR" "后端"
  info "启动后端（端口 ${BACKEND_PORT}）…"
  launch "$BACKEND_DIR" "$log" "$pidfile" env PORT="$BACKEND_PORT" NODE_ENV=development node server.js

  if wait_http "http://127.0.0.1:${BACKEND_PORT}/api/health" 30; then
    ok "后端启动成功（PID $(cat "$pidfile")）http://127.0.0.1:${BACKEND_PORT}/api/health"
  else
    err "后端 30 秒内未通过健康检查，最近日志："
    tail -n 30 "$log" >&2 || true
    return 1
  fi
}

start_frontend() {
  local pidfile="$RUN_DIR/frontend.pid" log="$LOG_DIR/frontend.log"

  if [ "$BACKEND_ONLY" -eq 1 ]; then
    info "已指定 --backend-only，跳过前端"
    return 0
  fi
  if [ -s "$pidfile" ] && pid_alive "$(cat "$pidfile")"; then
    warn "前端已在运行（PID $(cat "$pidfile")），跳过启动"
    return 0
  fi
  if port_busy "$FRONTEND_PORT"; then
    warn "端口 ${FRONTEND_PORT} 已被其它进程占用，跳过前端启动"
    return 0
  fi

  ensure_deps "$FRONTEND_DIR" "前端"

  # 构建产物：用 esbuild 打包（不依赖 rollup，兼容无 AVX2 的旧 CPU）
  info "构建前端静态资源（esbuild）…"
  ( cd "$FRONTEND_DIR" && node build.mjs ) >>"$LOG_DIR/build.log" 2>&1 \
    || die "前端构建失败，详见 $LOG_DIR/build.log"

  info "启动前端静态服务器（端口 ${FRONTEND_PORT}）…"
  launch "$FRONTEND_DIR" "$log" "$pidfile" node serve.mjs "$FRONTEND_PORT"

  if wait_http "http://127.0.0.1:${FRONTEND_PORT}/" 60; then
    ok "前端启动成功（PID $(cat "$pidfile")）"
  else
    err "前端 60 秒内未就绪，最近日志："
    tail -n 30 "$log" >&2 || true
    return 1
  fi
}

print_summary() {
  local ip; ip="$(lan_ip)"
  printf '\n%s\n' "${C_BOLD}══════════════════════════════════════════════════════════════${C_RESET}"
  printf '%s\n' "${C_GREEN}${C_BOLD}  灵犀模型网关 已就绪${C_RESET}"
  printf '%s\n' "${C_BOLD}══════════════════════════════════════════════════════════════${C_RESET}"
  if [ "$BACKEND_ONLY" -eq 0 ]; then
    printf '  前端界面   %shttp://localhost:%s%s\n' "$C_CYAN" "$FRONTEND_PORT" "$C_RESET"
    printf '             %shttp://%s:%s%s\n' "$C_DIM" "$ip" "$FRONTEND_PORT" "$C_RESET"
  fi
  printf '  后端接口   %shttp://localhost:%s/api%s\n' "$C_CYAN" "$BACKEND_PORT" "$C_RESET"
  printf '  健康检查   %shttp://localhost:%s/api/health%s\n' "$C_CYAN" "$BACKEND_PORT" "$C_RESET"
  printf '  API 代理   %shttp://localhost:%s/v1/chat/completions%s\n' "$C_CYAN" "$BACKEND_PORT" "$C_RESET"
  printf '\n  默认账号   管理员 admin / admin123     演示用户 demo / demo123\n'
  printf '  运行日志   %s\n' "$(printf '%s' "${LOG_DIR#$ROOT_DIR/}")/"
  printf '  停止服务   %s./start.sh stop%s\n' "$C_BOLD" "$C_RESET"
  printf '%s\n\n' "${C_BOLD}══════════════════════════════════════════════════════════════${C_RESET}"
}

do_start() {
  mkdir -p "$RUN_DIR" "$LOG_DIR"
  check_env
  start_backend
  start_frontend
  print_summary
}

do_stop() {
  info "停止服务…"
  stop_pid "前端" "$RUN_DIR/frontend.pid" "$LOG_DIR/frontend.log"
  stop_pid "后端" "$RUN_DIR/backend.pid" "$LOG_DIR/backend.log"
  # 端口仍被占用时给出提示，但不擅自结束非本脚本启动的进程
  for p in "$FRONTEND_PORT" "$BACKEND_PORT"; do
    if port_busy "$p"; then
      warn "端口 ${p} 仍有进程在监听（可能不是本脚本启动的），未自动结束"
    fi
  done
  ok "已停止"
}

do_status() {
  local bpid="" fpid=""
  [ -s "$RUN_DIR/backend.pid" ] && bpid="$(cat "$RUN_DIR/backend.pid")"
  [ -s "$RUN_DIR/frontend.pid" ] && fpid="$(cat "$RUN_DIR/frontend.pid")"

  if pid_alive "$bpid"; then
    ok "后端：运行中（PID ${bpid}，端口 ${BACKEND_PORT}）"
  else
    warn "后端：未运行（端口 ${BACKEND_PORT}）"
  fi
  if pid_alive "$fpid"; then
    ok "前端：运行中（PID ${fpid}，端口 ${FRONTEND_PORT}）"
  else
    warn "前端：未运行（端口 ${FRONTEND_PORT}）"
  fi

  if port_busy "$BACKEND_PORT" && wait_http "http://127.0.0.1:${BACKEND_PORT}/api/health" 3; then
    ok "健康检查通过：http://127.0.0.1:${BACKEND_PORT}/api/health"
  elif port_busy "$BACKEND_PORT"; then
    warn "端口 ${BACKEND_PORT} 有服务监听，但 /api/health 不通"
  fi
  printf '%s\n' "日志目录：${LOG_DIR#$ROOT_DIR/}/"
}

# ------------------------------ 入口 ------------------------------
case "$ACTION" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; do_start ;;
  status)  do_status ;;
esac