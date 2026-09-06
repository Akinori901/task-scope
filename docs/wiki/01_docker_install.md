# Docker のインストール方法

Task Scope の動作には **Docker** と **Docker Compose** が必要です。
OS ごとのインストール手順を説明します。

---

## Windows

### 前提条件

- Windows 10 (64bit) Pro / Enterprise / Education、または Windows 11
- BIOS で仮想化（VT-x / AMD-V）が有効であること

> **Windows Home の場合**: WSL 2 バックエンドを使用すれば Docker Desktop が利用可能です。

### 手順

1. **WSL 2 を有効化する**

   PowerShell を **管理者として実行** し、以下を入力します:

   ```powershell
   wsl --install
   ```

   完了後、PC を再起動してください。

2. **Docker Desktop をダウンロード**

   以下の公式サイトからインストーラをダウンロードします:

   https://www.docker.com/products/docker-desktop/

   「Download for Windows」をクリックしてください。

3. **インストーラを実行**

   ダウンロードした `Docker Desktop Installer.exe` を実行します。

   - 「Use WSL 2 instead of Hyper-V」にチェックを入れてください
   - その他はデフォルトのまま進めます

4. **PC を再起動**

   インストール完了後、PC を再起動します。

5. **Docker Desktop を起動**

   スタートメニューから「Docker Desktop」を起動します。
   初回起動時にサービス利用規約への同意が求められます。

6. **動作確認**

   PowerShell またはコマンドプロンプトで以下を実行します:

   ```powershell
   docker --version
   docker compose version
   ```

   バージョン番号が表示されれば成功です。

### トラブルシューティング（Windows）

| 症状 | 対処 |
|------|------|
| 「WSL 2 installation is incomplete」と表示される | PowerShell（管理者）で `wsl --update` を実行 |
| 「Hardware assisted virtualization...」エラー | BIOS 設定で VT-x / AMD-V を有効化 |
| Docker Desktop が起動しない | タスクマネージャー → サービス → 「Docker Desktop Service」を再起動 |

---

## macOS

### 前提条件

- macOS 12 (Monterey) 以降
- Apple Silicon (M1/M2/M3/M4) または Intel Mac

### 手順

1. **Docker Desktop をダウンロード**

   以下の公式サイトからインストーラをダウンロードします:

   https://www.docker.com/products/docker-desktop/

   - **Apple Silicon (M1以降)** の場合: 「Download for Mac - Apple Silicon」
   - **Intel Mac** の場合: 「Download for Mac - Intel Chip」

   > 自分の Mac がどちらか分からない場合:
   > 画面左上の  → 「この Mac について」で「チップ」欄を確認してください。
   > 「Apple M1」等と表示されれば Apple Silicon、「Intel」と表示されれば Intel です。

2. **インストール**

   ダウンロードした `.dmg` ファイルを開き、Docker アイコンを Applications フォルダにドラッグ&ドロップします。

3. **Docker Desktop を起動**

   Launchpad または Applications フォルダから「Docker」を起動します。
   初回起動時にシステム権限の許可が求められます。

4. **動作確認**

   ターミナルで以下を実行します:

   ```bash
   docker --version
   docker compose version
   ```

   バージョン番号が表示されれば成功です。

### Homebrew でインストールする場合

Homebrew を使っている場合は、ターミナルから以下でもインストール可能です:

```bash
brew install --cask docker
```

インストール後、Launchpad から Docker を起動してください。

### トラブルシューティング（macOS）

| 症状 | 対処 |
|------|------|
| 「Docker Desktop requires macOS...」と表示される | macOS を最新バージョンに更新 |
| ターミナルで `docker` コマンドが見つからない | Docker Desktop を起動してから再度試す |
| コンテナの起動が遅い | Docker Desktop → Settings → Resources でメモリ/CPU を増やす |

---

## 補足: Docker Desktop のリソース設定

Task Scope は複数のコンテナ（バックエンド・フロントエンド・DB・phpMyAdmin）を同時に起動します。
快適に動作させるために、以下のリソースを推奨します:

| 項目 | 推奨値 |
|------|--------|
| メモリ (RAM) | 4 GB 以上 |
| CPU | 2 コア以上 |
| ディスク | 20 GB 以上 |

設定場所: Docker Desktop → Settings (⚙) → Resources
