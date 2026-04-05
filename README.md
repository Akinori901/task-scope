# Task Scope

Backlog / Jira Cloud のチケットを複数スペースから収集し、横断的に進捗・難易度・工数を可視化するダッシュボードツール。

## 対応サービス

- **[Backlog](https://backlog.com/)** — プロジェクト管理ツール
  - Backlog API v2 を使用してチケット（課題）を同期
  - 複数スペース（backlog.jp / backlog.com）に対応
  - チケットのステータス・担当者・期限・コメントを取得
- **[Jira Cloud](https://www.atlassian.com/software/jira)** — プロジェクト管理ツール
  - Jira Cloud REST API v3 を使用してチケット（課題）を同期
  - 複数サイトに対応
  - チケットのステータス・担当者・期限・コメントを取得
  - ADF（Atlassian Document Format）でのコメント投稿に対応

## 主な機能

| 機能 | 説明 |
|------|------|
| ダッシュボード | Backlog / Jira 横断で未完了・未対応チケット数、ステータス分布、担当者別負荷をグラフ表示 |
| チケット一覧 | 全スペース横断のチケットリスト。フィルタ・ソート・完了除外 |
| AI 難易度評価 | 6軸レーダーチャート（影響範囲・クエリ複雑度・曖昧度・検証難度・調整コスト・リグレッションリスク） |
| AI 工数見積 | フェーズ別の推定人日を自動算出 |
| AI 方針書生成 | チケット情報から実装方針書（Markdown）を自動生成。`docs/policies/` にも保存 |
| 対処区分判定 | データ修正 / コード修正 / 設定変更 / 調査のみ / 複合 を自動分類 |
| 要注意チケット | 遅延・停滞チケットを自動検出してアラート表示 |
| 除外ステータス設定 | プロジェクトごとに「完了扱い」のステータスを設定可能 |
| 自分の紐づけ設定 | スペースごとに自分のユーザーを紐づけ、「自分向け」フィルタで使用 |

## 技術スタック

### バックエンド

| 項目 | バージョン |
|------|-----------|
| Python | 3.13 |
| Django | 6.0 |
| Django REST Framework | 3.16 |
| MySQL | 8.0 |
| パッケージ管理 | uv |
| HTTP クライアント | httpx 0.28 |
| フィルタ | django-filter 25.0 |

### フロントエンド

| 項目 | バージョン |
|------|-----------|
| Node.js | 22 |
| React | 19 |
| TypeScript | 5.7 |
| Vite | 6.0 |
| UI ライブラリ | MUI 7 (Material UI) |
| 状態管理 | Zustand 5 |
| データフェッチ | TanStack React Query 5 |
| チャート | Recharts 3 |
| ルーティング | React Router 7 |

### インフラ

| 項目 | 説明 |
|------|------|
| コンテナ | Docker Compose |
| DB 管理 UI | phpMyAdmin |
| AI プロキシ | eval-proxy（Claude Code CLI ラッパー） |

## ポート一覧

| サービス | ポート | 環境変数 |
|---------|--------|---------|
| フロントエンド | 3100 | `FRONTEND_PORT` |
| バックエンド API | 19000 | `BACKEND_PORT` |
| MySQL | 13307 | `DB_PORT` |
| phpMyAdmin | 19080 | `PHPMYADMIN_PORT` |
| AI eval-proxy | 19001 | `EVAL_PROXY_PORT` |

## セットアップ

### 前提条件

- Docker / Docker Compose
- Claude Code CLI（AI 評価機能を使う場合）

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd task-scope
```

### 2. 環境変数の設定

```bash
cp .env.example .env
# .env を編集して SECRET_KEY や DB パスワードを設定
```

`.env` の主要項目:

```env
SECRET_KEY=your-secret-key-change-this-in-production
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

MYSQL_ROOT_PASSWORD=secret
MYSQL_DATABASE=task_scope
MYSQL_USER=user
MYSQL_PASSWORD=secret

EVAL_PROXY_URL=http://host.docker.internal:19001
```

### 3. 初回セットアップ（ワンコマンド）

```bash
make setup
```

これは以下を順に実行します:
1. Docker イメージのビルド
2. コンテナの起動
3. DB マイグレーション

### 手動セットアップ

```bash
# イメージビルド
make build

# コンテナ起動
make up

# DB マイグレーション
make migrate

# （任意）Django 管理画面用スーパーユーザー作成
make createsuperuser
```

### 4. スペースの登録

1. http://localhost:3100/settings を開く
2. **Backlog** の場合: 「スペース追加」でスペースキー・ドメイン・API キーを登録
3. **Jira Cloud** の場合: 「Jira スペース追加」でサイト URL・メールアドレス・API トークンを登録
4. 同期ボタンでチケットデータを取得

### 5. AI 評価機能の有効化（任意）

AI 評価機能（難易度評価・方針書生成）を使用するには、ホスト上で eval-proxy を起動します:

```bash
# バックグラウンドで起動
make eval-proxy-bg

# ステータス確認
make eval-proxy-status

# 停止
make eval-proxy-stop
```

> eval-proxy は Claude Code CLI をラップした軽量 HTTP サーバーです。
> Docker コンテナから `host.docker.internal:19001` 経由で呼び出されます。

## 日常の操作

### コンテナ起動 / 停止

```bash
make up      # 起動（eval-proxy も自動起動）
make down    # 停止（eval-proxy も自動停止）
make restart # 再起動
make ps      # ステータス確認
```

### データ同期

```bash
# Backlog 同期（コマンドライン）
make sync-backlog

# Jira 同期は Web UI の設定画面から同期ボタンをクリック
```

### DB マイグレーション

```bash
# マイグレーションファイル作成
make makemigrations

# マイグレーション適用
make migrate
```

### シェルアクセス

```bash
make backend-shell    # バックエンドコンテナに入る
make frontend-shell   # フロントエンドコンテナに入る
make mysql            # MySQL に直接接続
make shell            # Django インタラクティブシェル
```

## コード品質

### バックエンド

```bash
make lint          # Ruff リンター
make format        # Ruff フォーマッター（自動修正）
make format-check  # フォーマットチェック（修正なし）
make type-check    # mypy 型チェック
make quality       # lint + format-check + type-check を一括実行
make test-backend  # pytest 実行
```

### フロントエンド

```bash
make lint-frontend   # ESLint
make test-frontend   # Vitest
make build-frontend  # 本番ビルド
```

## ログとトラブルシューティング

### ログの確認

```bash
# 全コンテナのログ
make logs

# 個別のコンテナログ
docker compose logs -f backend    # バックエンド
docker compose logs -f frontend   # フロントエンド
docker compose logs -f db         # MySQL
```

### ログの出力先

| ログ | 場所 | 備考 |
|-----|------|------|
| Django アプリログ | `docker compose logs backend` | コンソール出力（StreamHandler） |
| Django エラーログ | 同上 | `apps` ロガーは DEBUG レベル |
| Vite 開発サーバー | `docker compose logs frontend` | HMR・ビルドエラー |
| MySQL | `docker compose logs db` | クエリログ・起動エラー |
| eval-proxy | ターミナル標準出力 | `make eval-proxy` でフォアグラウンド実行時 |
| 方針書ファイル | `docs/policies/*.md` | AI 生成方針書の保存先 |

### よくあるエラーと対処

| 症状 | 原因 | 対処 |
|------|------|------|
| DB 接続エラー | MySQL コンテナ未起動 | `make up` で起動し、ヘルスチェック完了を待つ |
| マイグレーションエラー | 新しいモデル変更未適用 | `make migrate` |
| フロントが表示されない | node_modules 未インストール | `make build` で再ビルド |
| API 504 タイムアウト | eval-proxy 未起動 or CLI タイムアウト | `make eval-proxy-status` で確認、`make eval-proxy-bg` で起動 |
| 同期で 0 件 | API キー無効 or スペースキー誤り | 設定画面で接続情報を確認 |
| 「自分向け」が 0 件 | is_myself 未設定 | 設定画面の「自分の紐づけ設定」でユーザーを選択 |

### phpMyAdmin

http://localhost:19080 から DB を直接参照・操作できます。

### Django 管理画面

http://localhost:19000/admin/ （要スーパーユーザー作成）

## プロジェクト構成

```
task-scope/
├── backend/
│   ├── apps/core/              # メインアプリ
│   │   ├── models.py           # データモデル
│   │   ├── views.py            # API ビュー
│   │   ├── serializers.py      # DRF シリアライザ
│   │   ├── filters.py          # チケットフィルタ
│   │   ├── urls.py             # URL ルーティング
│   │   ├── admin.py            # Django 管理画面
│   │   ├── services/           # ビジネスロジック
│   │   │   ├── sync_service.py         # Backlog API 同期
│   │   │   ├── jira_sync_service.py    # Jira Cloud API 同期
│   │   │   ├── backlog_client.py       # Backlog HTTP クライアント
│   │   │   ├── jira_client.py          # Jira Cloud HTTP クライアント
│   │   │   └── evaluation_service.py   # AI 評価・方針書生成
│   │   └── management/commands/
│   │       └── sync_backlog.py # 同期コマンド
│   ├── config/settings/        # Django 設定
│   │   ├── base.py             # 共通設定
│   │   ├── development.py      # 開発環境
│   │   └── testing.py          # テスト環境
│   └── pyproject.toml          # Python 依存関係
├── frontend/
│   ├── src/
│   │   ├── pages/              # ページコンポーネント
│   │   ├── components/         # 共通コンポーネント
│   │   ├── hooks/              # カスタムフック
│   │   ├── api/                # API クライアント・型定義
│   │   └── stores/             # Zustand ストア
│   ├── public/                 # 静的ファイル・アイコン
│   ├── package.json
│   └── index.html
├── docker/
│   ├── backend/Dockerfile
│   ├── frontend/Dockerfile
│   └── mysql/
│       ├── Dockerfile
│       └── init/               # DB 初期化スクリプト
├── scripts/
│   └── eval_proxy.py           # AI 評価プロキシサーバー
├── docs/
│   └── policies/               # AI 生成方針書
├── docker-compose.yml
├── Makefile
├── .env.example
└── .gitignore
```

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/dashboard/stats/` | ダッシュボード統計 |
| GET | `/api/tickets/` | チケット一覧（フィルタ・ページネーション対応） |
| GET | `/api/tickets/:id/` | チケット詳細（評価・方針書含む） |
| POST | `/api/tickets/:id/evaluate/` | AI 難易度評価実行 |
| POST | `/api/tickets/:id/generate-spec/` | AI 方針書生成 |
| GET | `/api/projects/` | プロジェクト一覧 |
| GET | `/api/users/` | ユーザー一覧 |
| PATCH | `/api/users/:id/` | ユーザー更新（is_myself トグル） |
| GET | `/api/status-names/` | ステータス名一覧 |
| GET/POST | `/api/spaces/` | スペース一覧・登録 |
| PUT/DELETE | `/api/spaces/:id/` | スペース更新・削除 |
| GET/POST | `/api/excluded-statuses/` | 除外ステータス一覧・登録 |
| DELETE | `/api/excluded-statuses/:id/` | 除外ステータス削除 |
| POST | `/api/sync/` | Backlog 同期トリガー |
| GET/POST | `/api/jira-spaces/` | Jira スペース一覧・登録 |
| PUT/DELETE | `/api/jira-spaces/:id/` | Jira スペース更新・削除 |
| POST | `/api/jira-spaces/:id/sync/` | Jira 同期トリガー |

## ライセンス

Private
