# Makefile の使い方

Task Scope では `Makefile` に主要な操作コマンドをまとめています。
Docker Compose のコマンドを覚えなくても、`make <コマンド名>` で簡単に操作できます。

---

## コマンド一覧の確認

```bash
make help
```

利用可能なコマンドと説明が一覧表示されます。

---

## 初回セットアップ

```bash
make setup
```

以下を自動で実行します:

1. `.env.example` から `.env` を作成（未作成の場合のみ）
2. Docker イメージのビルド
3. コンテナの起動
4. データベースのマイグレーション

完了後、以下の URL にアクセスできます:

| サービス | URL |
|---------|-----|
| フロントエンド | http://localhost:3100 |
| バックエンド API | http://localhost:19000/api/ |
| Django 管理画面 | http://localhost:19000/admin/ |
| phpMyAdmin | http://localhost:19080 |

---

## 日常操作

### 起動と停止

| コマンド | 説明 |
|---------|------|
| `make up` | コンテナ起動 + AI評価プロキシ起動 |
| `make down` | コンテナ停止 + AI評価プロキシ停止 |
| `make restart` | コンテナ再起動 |
| `make ps` | コンテナの状態確認 |

```bash
# 朝の業務開始
make up

# 退勤時
make down
```

### ログの確認

| コマンド | 説明 |
|---------|------|
| `make logs` | 全コンテナのログをリアルタイム表示 |
| `make logs-backend` | バックエンドのログのみ |
| `make logs-frontend` | フロントエンドのログのみ |
| `make logs-db` | データベースのログのみ |

```bash
# エラーが発生した場合、まずログを確認
make logs-backend
```

Ctrl+C でログの追跡を終了します。

### ビルド

```bash
make build
```

Dockerfile や依存パッケージ（`pyproject.toml`, `package.json`）を変更した場合に実行します。通常のコード変更では不要です（ホットリロードが有効）。

---

## シェル接続

| コマンド | 説明 |
|---------|------|
| `make backend-shell` | バックエンドコンテナの bash に入る |
| `make frontend-shell` | フロントエンドコンテナの sh に入る |
| `make mysql` | MySQL に直接接続 |
| `make shell` | Django インタラクティブシェル起動 |

```bash
# Django シェルでデータ確認
make shell

# MySQL で直接クエリ実行
make mysql
```

`exit` で抜けます。

---

## バックエンド開発

### データベース操作

| コマンド | 説明 |
|---------|------|
| `make migrate` | マイグレーション実行 |
| `make makemigrations` | マイグレーションファイル作成 |
| `make createsuperuser` | Django 管理画面用ユーザー作成 |

```bash
# モデルを変更した場合の流れ
make makemigrations    # 1. マイグレーションファイル生成
make migrate           # 2. DB に適用
```

### コード品質チェック

| コマンド | 説明 |
|---------|------|
| `make lint` | Ruff リンター実行 |
| `make format` | Ruff フォーマッター実行（自動修正あり） |
| `make format-check` | フォーマットチェック（修正なし） |
| `make type-check` | mypy 型チェック実行 |
| `make quality` | lint + format-check + type-check を一括実行 |
| `make test-backend` | pytest テスト実行 |

```bash
# コミット前に品質チェック
make quality

# テスト実行
make test-backend
```

---

## フロントエンド開発

| コマンド | 説明 |
|---------|------|
| `make lint-frontend` | ESLint 実行 |
| `make test-frontend` | Vitest テスト実行 |
| `make build-frontend` | 本番ビルド |

---

## データ同期

| コマンド | 説明 |
|---------|------|
| `make sync-backlog` | Backlog の全チケットを同期 |

```bash
# コマンドラインから Backlog 同期
make sync-backlog
```

> Jira の同期は Web UI の設定画面 (http://localhost:3100/settings) から実行します。

---

## AI 評価プロキシ

AI 評価機能（難易度評価・方針書生成）を使う場合に必要です。

| コマンド | 説明 |
|---------|------|
| `make eval-proxy` | AI評価プロキシ起動（フォアグラウンド） |
| `make eval-proxy-bg` | AI評価プロキシ起動（バックグラウンド） |
| `make eval-proxy-stop` | AI評価プロキシ停止 |
| `make eval-proxy-status` | AI評価プロキシの動作確認 |

```bash
# バックグラウンドで起動（推奨）
make eval-proxy-bg

# 動作確認
make eval-proxy-status

# 停止
make eval-proxy-stop
```

> `make up` を実行すると eval-proxy も自動で起動します。
> `make down` を実行すると eval-proxy も自動で停止します。

---

## よくある作業フロー

### 初回導入

```bash
git clone <リポジトリURL>
cd task-scope
make setup
```

### 日常の開発

```bash
make up                  # 起動
# ... 開発作業 ...
make logs-backend        # エラーがあればログ確認
make quality             # コード品質チェック
make down                # 退勤
```

### git pull 後の更新

```bash
git pull
make build               # Dockerfile/依存変更があればビルド
make migrate             # マイグレーションがあれば適用
make restart             # コンテナ再起動
```

### 問題が発生した場合

```bash
make ps                  # まずコンテナの状態確認
make logs                # ログでエラー内容を確認
make restart             # 再起動で解決することが多い
```
