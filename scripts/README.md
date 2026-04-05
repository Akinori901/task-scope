# scripts/

Docker 外（ホストマシン上）で動作する補助スクリプト群。

## eval_proxy.py

AI 評価プロキシサーバー。ホスト上の Claude Code CLI をラップし、Docker 内の Django バックエンドから HTTP 経由で呼び出せるようにする。

### 役割

- チケットの AI 評価（工数・難易度の自動判定）
- 方針書の自動生成（対象リポジトリのコードを読み取って作成）

### 仕組み

```
Django (Docker内)  --HTTP POST-->  eval_proxy.py (ホスト)  --CLI-->  Claude Code
```

Django から直接 Claude Code CLI を呼べないため（CLI はホストにインストールされている）、このプロキシが中継する。

### 前提条件

- ホストに [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) がインストールされていること
- 有効な Claude サブスクリプション（Max プラン等）でログイン済みであること

### 起動方法

```bash
# デフォルト（ポート 19001）
python scripts/eval_proxy.py

# ポート指定
python scripts/eval_proxy.py --port 19002
```

### エンドポイント

| メソッド | パス | 用途 |
|---------|------|------|
| GET | `/health` | ヘルスチェック |
| POST | `/evaluate` | チケット評価 |
| POST | `/generate-spec` | 方針書生成 |
| POST | `/browse-dirs` | ローカルディレクトリ一覧取得 |

### 設定

`.env` の以下の値でバックエンドからの接続先を制御する:

```
EVAL_PROXY_URL=http://host.docker.internal:19001
EVAL_PROXY_PORT=19001
```
