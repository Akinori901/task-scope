# Docker の使い方

Task Scope で使用する Docker / Docker Compose の基本操作を説明します。

---

## Docker とは

Docker は、アプリケーションの動作環境を「コンテナ」という単位で管理するツールです。
Task Scope では以下の 4 つのコンテナが連携して動作します:

| コンテナ名 | 役割 | ポート |
|-----------|------|--------|
| `ts-backend` | Django REST API サーバー | 19000 |
| `ts-frontend` | React 開発サーバー (Vite) | 3100 |
| `ts-db` | MySQL データベース | 13307 |
| `ts-phpmyadmin` | DB 管理画面 | 19080 |

これらの構成は `docker-compose.yml` に定義されています。

---

## 基本コマンド

### コンテナの起動

```bash
docker compose up -d
```

`-d` はバックグラウンド起動のオプションです。全コンテナが起動し、以下のURLにアクセスできるようになります:

| サービス | URL |
|---------|-----|
| フロントエンド | http://localhost:3100 |
| バックエンド API | http://localhost:19000/api/ |
| phpMyAdmin | http://localhost:19080 |

### コンテナの停止

```bash
docker compose down
```

コンテナを停止・削除します。データベースのデータは `mysql_data` ボリュームに永続化されているため、停止しても消えません。

### コンテナの再起動

```bash
docker compose restart
```

コードを変更した場合など、コンテナを再起動したいときに使います。
ただし、Django と Vite は開発サーバーのホットリロードが有効なため、通常のコード変更では再起動不要です。

### コンテナの状態確認

```bash
docker compose ps
```

各コンテナの状態（起動中・停止中）を一覧表示します。

### コンテナのビルド

```bash
docker compose build
```

Dockerfile が変更された場合や、依存パッケージ（`pyproject.toml`, `package.json`）が変更された場合に実行します。

---

## ログの確認

### 全コンテナのログ

```bash
docker compose logs -f
```

`-f` は tail（リアルタイム追跡）のオプションです。Ctrl+C で終了します。

### 特定コンテナのログ

```bash
# バックエンド
docker compose logs -f backend

# フロントエンド
docker compose logs -f frontend

# データベース
docker compose logs -f db
```

---

## コンテナに入る

コンテナ内でコマンドを直接実行したい場合:

```bash
# バックエンドコンテナに入る
docker compose exec backend bash

# フロントエンドコンテナに入る
docker compose exec frontend sh

# MySQLに接続
docker compose exec db mysql -u user -psecret task_scope
```

コンテナ内では通常のLinuxコマンドが使えます。`exit` で抜けます。

---

## データの管理

### データベースのデータ

Docker ボリューム `mysql_data` に保存されます。`docker compose down` してもデータは残ります。

データを完全にリセットしたい場合:

```bash
docker compose down -v
```

`-v` オプションでボリュームも削除されます。**全データが消えるので注意してください。**

### node_modules

フロントエンドの `node_modules` は `frontend_node_modules` ボリュームで管理されます。
パッケージの問題が発生した場合は以下でリセットできます:

```bash
docker compose down -v
docker compose build frontend
docker compose up -d
```

---

## よく使う操作パターン

### 朝の起動

```bash
docker compose up -d
```

### 退勤時の停止

```bash
docker compose down
```

### 依存パッケージを追加した後

```bash
# バックエンド (pyproject.toml を変更した場合)
docker compose build backend
docker compose up -d backend

# フロントエンド (package.json を変更した場合)
docker compose build frontend
docker compose up -d frontend
```

### DB スキーマを変更した後

```bash
docker compose exec backend uv run python manage.py migrate
```

### 全部作り直す（問題が解決しない場合の最終手段）

```bash
docker compose down -v       # コンテナとボリュームを全削除
docker compose build --no-cache  # キャッシュなしで再ビルド
docker compose up -d         # 起動
docker compose exec backend uv run python manage.py migrate  # DB再構築
```

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| ポートが既に使われている | `.env` でポート番号を変更（例: `BACKEND_PORT=19100`） |
| コンテナが起動しない | `docker compose logs <サービス名>` でエラーを確認 |
| DB接続エラー | `docker compose ps` で db コンテナの状態を確認。`healthy` でなければ再起動 |
| ディスク容量不足 | `docker system prune` で不要なイメージ・コンテナを削除 |
| コンテナが遅い | Docker Desktop の Settings → Resources でメモリを増やす |

---

## 参考: Docker Compose のサービス構成図

```
┌──────────────────────────────────────────────────┐
│  ホストマシン                                     │
│                                                  │
│  ┌──────────┐  :3100   ┌──────────┐  :19000     │
│  │ ブラウザ  │ ───────> │ frontend │ ──────────> │
│  └──────────┘          └──────────┘   proxy     │
│                                         │        │
│                                  ┌──────┴─────┐  │
│                                  │  backend   │  │
│                                  └──────┬─────┘  │
│                                         │        │
│                                  ┌──────┴─────┐  │
│                                  │    db      │  │
│                                  │  (MySQL)   │  │
│                                  └────────────┘  │
│                                                  │
│  :19080  ┌──────────┐                            │
│  ───────>│phpMyAdmin │────── db に接続            │
│          └──────────┘                            │
└──────────────────────────────────────────────────┘
```
