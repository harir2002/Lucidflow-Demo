#!/usr/bin/env bash
#
# IRDAI Dark Pattern Scanner — ONE-COMMAND SETUP & RUN
# ======================================================
# This single script:
#   1. Checks/installs all prerequisites (Node.js check, Ollama check)
#   2. Pulls the local AI model (ONE-TIME internet use, then never again)
#   3. Installs backend + frontend dependencies
#   4. Starts Ollama (if not running), the backend API, and the frontend UI
#   5. Reports final RUNNING status with URLs to open
#
# Usage:
#   chmod +x start.sh
#   ./start.sh
#
# Re-running this script is safe — it skips steps already completed.

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
MODEL_NAME="${OLLAMA_MODEL:-gemma3:4b}"
BACKEND_PORT=4500
FRONTEND_PORT=5173

line() { echo "─────────────────────────────────────────────────────────────"; }
step() { echo -e "\n${BLUE}▸ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
err()  { echo -e "  ${RED}✗${NC} $1"; }

echo -e "${BOLD}"
line
echo "  IRDAI DARK PATTERN SCANNER — SETUP & LAUNCH"
echo "  Fully Local · No External API · No Recurring Internet Use"
line
echo -e "${NC}"

# ── STEP 1: Check Node.js ─────────────────────────────────────────────────
step "STEP 1 — Checking Node.js"
if ! command -v node &> /dev/null; then
  err "Node.js not found."
  echo "  Install Node.js 18+ from: https://nodejs.org (one-time, needs internet)"
  echo "  Then re-run this script."
  exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js version $NODE_VERSION found, but 18+ is required."
  echo "  Upgrade at: https://nodejs.org"
  exit 1
fi
ok "Node.js $NODE_VERSION found"

# ── STEP 2: Check / guide Ollama installation ─────────────────────────────
step "STEP 2 — Checking Ollama (local AI runtime)"
if ! command -v ollama &> /dev/null; then
  err "Ollama not found — this is required to run the AI model locally."
  echo ""
  echo "  Install Ollama (one-time, needs internet):"
  echo "    macOS/Linux : curl -fsSL https://ollama.com/install.sh | sh"
  echo "    Windows     : download installer from https://ollama.com/download"
  echo ""
  echo "  After installing, re-run this script: ./start.sh"
  exit 1
fi
ok "Ollama is installed"

# ── STEP 3: Start Ollama server if not already running ───────────────────
step "STEP 3 — Starting Ollama server"
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  ok "Ollama server already running on port 11434"
else
  echo "  Starting Ollama in the background..."
  nohup ollama serve > /tmp/ollama.log 2>&1 &
  OLLAMA_PID=$!
  sleep 3
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    ok "Ollama server started (PID $OLLAMA_PID)"
  else
    err "Ollama server failed to start. Check /tmp/ollama.log for details."
    exit 1
  fi
fi

# ── STEP 4: Pull the vision model (one-time, needs internet THIS ONE TIME) ──
step "STEP 4 — Checking local AI model: $MODEL_NAME"
if ollama list | grep -q "$(echo $MODEL_NAME | cut -d: -f1)"; then
  ok "Model $MODEL_NAME already downloaded"
else
  warn "Model not found locally — downloading now (one-time, ~3-4 GB, needs internet)"
  echo "  This only happens once. After this, the app runs fully offline."
  ollama pull "$MODEL_NAME"
  ok "Model $MODEL_NAME downloaded"
fi

# ── STEP 5: Install Playwright browser (one-time, needs internet THIS ONE TIME) ──
step "STEP 5 — Checking Playwright browser (for taking screenshots)"
cd "$BACKEND_DIR"
if [ ! -d "node_modules" ]; then
  echo "  Installing backend dependencies (one-time, needs internet)..."
  npm install --silent
  ok "Backend dependencies installed"
else
  ok "Backend dependencies already installed"
fi

if [ ! -d "$HOME/.cache/ms-playwright" ] && [ ! -d "$HOME/Library/Caches/ms-playwright" ]; then
  echo "  Downloading Chromium for Playwright (one-time, ~150MB, needs internet)..."
  npx playwright install chromium
  ok "Chromium installed"
else
  ok "Chromium already installed"
fi

# ── STEP 6: Install frontend dependencies ─────────────────────────────────
step "STEP 6 — Installing frontend dependencies"
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  echo "  Installing frontend dependencies (one-time, needs internet)..."
  npm install --silent
  ok "Frontend dependencies installed"
else
  ok "Frontend dependencies already installed"
fi

# ── STEP 7: Start backend server ──────────────────────────────────────────
step "STEP 7 — Starting backend API server"
cd "$BACKEND_DIR"
if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
  ok "Backend already running on port $BACKEND_PORT"
else
  nohup npm start > /tmp/irdai-backend.log 2>&1 &
  BACKEND_PID=$!
  echo "  Waiting for backend to become ready..."
  for i in {1..15}; do
    sleep 1
    if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
      ok "Backend started (PID $BACKEND_PID) — logs at /tmp/irdai-backend.log"
      break
    fi
    if [ "$i" -eq 15 ]; then
      err "Backend did not start in time. Check /tmp/irdai-backend.log"
      exit 1
    fi
  done
fi

# ── STEP 8: Start frontend server ─────────────────────────────────────────
step "STEP 8 — Starting frontend UI"
cd "$FRONTEND_DIR"
if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
  ok "Frontend already running on port $FRONTEND_PORT"
else
  nohup npm run dev > /tmp/irdai-frontend.log 2>&1 &
  FRONTEND_PID=$!
  echo "  Waiting for frontend to become ready..."
  for i in {1..15}; do
    sleep 1
    if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
      ok "Frontend started (PID $FRONTEND_PID) — logs at /tmp/irdai-frontend.log"
      break
    fi
    if [ "$i" -eq 15 ]; then
      err "Frontend did not start in time. Check /tmp/irdai-frontend.log"
      exit 1
    fi
  done
fi

# ── FINAL STATUS REPORT ────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
line
echo "  ✅  ALL SYSTEMS RUNNING"
line
echo -e "${NC}"
echo -e "  ${BOLD}Frontend (open this in your browser):${NC}"
echo -e "    ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
echo ""
echo -e "  ${BOLD}Backend API:${NC}     http://localhost:$BACKEND_PORT/api/health"
echo -e "  ${BOLD}Ollama:${NC}          http://localhost:11434"
echo -e "  ${BOLD}Model:${NC}           $MODEL_NAME"
echo ""
echo -e "  ${BOLD}Mode:${NC}            Fully local — zero API cost, zero token billing,"
echo "                  zero internet required from this point forward."
echo ""
echo "  Logs:"
echo "    Backend  : /tmp/irdai-backend.log"
echo "    Frontend : /tmp/irdai-frontend.log"
echo "    Ollama   : /tmp/ollama.log"
echo ""
echo "  To stop everything:"
echo "    pkill -f 'node src/server.js'   # backend"
echo "    pkill -f 'vite'                  # frontend"
echo "    # Ollama can keep running in the background — it's harmless idle"
line
