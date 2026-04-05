.PHONY: help up down build logs restart \
       backend-shell frontend-shell mysql \
       migrate makemigrations test-backend lint format format-check type-check quality \
       test-frontend lint-frontend build-frontend \
       eval-proxy eval-proxy-bg eval-proxy-stop eval-proxy-status sync-backlog \
       seed setup

# ===========================
# Docker
# ===========================

help: ## コマンド一覧を表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## コンテナ起動 + AI評価プロキシ起動
	docker compose up -d
	@$(MAKE) eval-proxy-bg
	@echo ""
	@echo "  eval-proxy も起動しました (port $${EVAL_PROXY_PORT:-19001})"
	@echo "  停止: make eval-proxy-stop"

down: ## コンテナ停止 + AI評価プロキシ停止
	docker compose down
	@$(MAKE) eval-proxy-stop

build: ## コンテナビルド
	docker compose build

logs: ## 全コンテナのログ表示
	docker compose logs -f

logs-backend: ## バックエンドのログ表示
	docker compose logs -f backend

logs-frontend: ## フロントエンドのログ表示
	docker compose logs -f frontend

logs-db: ## DBのログ表示
	docker compose logs -f db

restart: ## 全コンテナ再起動
	docker compose restart

ps: ## コンテナ状態確認
	docker compose ps

# ===========================
# Shell接続
# ===========================

backend-shell: ## バックエンドコンテナに入る
	docker compose exec backend bash

frontend-shell: ## フロントエンドコンテナに入る
	docker compose exec frontend sh

mysql: ## MySQLに接続
	docker compose exec db mysql -u $${MYSQL_USER:-ts_user} -p$${MYSQL_PASSWORD:-changeme} $${MYSQL_DATABASE:-task_scope}

# ===========================
# Backend
# ===========================

migrate: ## マイグレーション実行
	docker compose exec backend uv run python manage.py migrate

makemigrations: ## マイグレーションファイル作成
	docker compose exec backend uv run python manage.py makemigrations

test-backend: ## バックエンドテスト実行
	docker compose exec backend uv run python -m pytest -v

lint: ## Ruff Lint実行
	docker compose exec backend uv run ruff check .

format: ## Ruff Format実行
	docker compose exec backend uv run ruff format .

format-check: ## Ruff Formatチェック（修正なし）
	docker compose exec backend uv run ruff format --check .

type-check: ## mypy型チェック実行
	docker compose exec backend uv run mypy .

quality: lint format-check type-check ## コード品質チェック（lint + format-check + type-check）

createsuperuser: ## Django管理ユーザー作成
	docker compose exec backend uv run python manage.py createsuperuser

shell: ## Django shell起動
	docker compose exec backend uv run python manage.py shell

# ===========================
# Frontend
# ===========================

test-frontend: ## フロントエンドテスト実行
	docker compose exec frontend npm test

lint-frontend: ## フロントエンドLint実行
	docker compose exec frontend npm run lint

build-frontend: ## フロントエンドビルド
	docker compose exec frontend npm run build

# ===========================
# Tools
# ===========================

logs-phpmyadmin: ## phpMyAdminのログ表示
	docker compose logs -f phpmyadmin

# ===========================
# AI Evaluation Proxy
# ===========================

eval-proxy: ## AI評価プロキシ起動（ホスト上で実行、Claude Code サブスク利用）
	python3 scripts/eval_proxy.py --port $${EVAL_PROXY_PORT:-19001}

eval-proxy-bg: ## AI評価プロキシをバックグラウンド起動
	nohup python3 scripts/eval_proxy.py --port $${EVAL_PROXY_PORT:-19001} > /tmp/eval-proxy.log 2>&1 & echo $$! > /tmp/eval-proxy.pid
	@echo "eval-proxy started (PID: $$(cat /tmp/eval-proxy.pid), log: /tmp/eval-proxy.log)"

eval-proxy-stop: ## AI評価プロキシ停止
	@if [ -f /tmp/eval-proxy.pid ]; then kill $$(cat /tmp/eval-proxy.pid) 2>/dev/null; rm /tmp/eval-proxy.pid; echo "eval-proxy stopped"; else echo "eval-proxy not running"; fi

eval-proxy-status: ## AI評価プロキシの状態確認
	@curl -s http://localhost:$${EVAL_PROXY_PORT:-19001}/health 2>/dev/null && echo "" || echo "eval-proxy is not running"

sync-backlog: ## Backlog同期実行
	docker compose exec backend uv run python manage.py sync_backlog

# ===========================
# Setup
# ===========================

setup: ## 初期セットアップ（env作成→ビルド→起動→マイグレーション）
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from .env.example"; fi
	@$(MAKE) build
	@docker compose up -d
	@$(MAKE) migrate
	@echo ""
	@echo "========================================"
	@echo " Setup complete!"
	@echo " Backend:     http://localhost:19000/api/"
	@echo " Frontend:    http://localhost:3100"
	@echo " Admin:       http://localhost:19000/admin/"
	@echo " phpMyAdmin:  http://localhost:19080"
	@echo " MySQL:       localhost:13307"
	@echo ""
	@echo " AI評価機能を使う場合: make eval-proxy-bg"
	@echo "========================================"
