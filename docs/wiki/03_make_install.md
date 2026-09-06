# Make のインストール方法

Task Scope では `Makefile` を使って Docker 操作や開発タスクを簡単に実行できます。
`make` コマンドを使用するために、OS ごとのインストール手順を説明します。

---

## macOS

macOS には Xcode Command Line Tools に `make` が含まれています。

### 確認方法

ターミナルで以下を実行します:

```bash
make --version
```

バージョンが表示されれば、既にインストール済みです。

### インストール

`make` が見つからない場合、以下のいずれかの方法でインストールします。

#### 方法 1: Xcode Command Line Tools（推奨）

```bash
xcode-select --install
```

ダイアログが表示されたら「インストール」をクリックします。
数分でダウンロード・インストールが完了します。

#### 方法 2: Homebrew

Homebrew が導入済みの場合:

```bash
brew install make
```

> Homebrew 版は `gmake` としてインストールされます。
> `make` として使いたい場合は、`~/.zshrc` に以下を追加してください:
>
> ```bash
> export PATH="/opt/homebrew/opt/make/libexec/gnubin:$PATH"
> ```

---

## Windows

Windows では標準で `make` が入っていません。以下のいずれかの方法でインストールします。

### 方法 1: Git Bash 付属の make を使う（推奨）

Git for Windows をインストール済みの場合、Git Bash から `make` が使える場合があります。

Git for Windows のダウンロード:
https://gitforwindows.org/

### 方法 2: Chocolatey でインストール

Chocolatey（Windows 用パッケージマネージャー）を使う方法です。

1. **Chocolatey をインストール**（未導入の場合）

   PowerShell を **管理者として実行** し、以下を入力:

   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **make をインストール**

   ```powershell
   choco install make
   ```

3. **確認**

   PowerShell を再起動してから:

   ```powershell
   make --version
   ```

### 方法 3: winget でインストール

Windows 11 / Windows 10 (最新版) では winget が使えます:

```powershell
winget install GnuWin32.Make
```

> インストール後、環境変数 PATH に `C:\Program Files (x86)\GnuWin32\bin` を追加する必要がある場合があります。

### 方法 4: WSL 2 を使う

WSL 2 (Windows Subsystem for Linux) を使っている場合、Linux 環境で `make` が使えます:

```bash
# WSL のターミナルで
sudo apt update && sudo apt install make
```

> Docker Desktop を WSL 2 バックエンドで使用している場合、この方法が最も自然です。

---

## 動作確認

いずれの OS でも、Task Scope のプロジェクトディレクトリに移動して以下を実行します:

```bash
cd task-scope
make help
```

以下のようなコマンド一覧が表示されれば正常です:

```
backend-shell        バックエンドコンテナに入る
build                コンテナビルド
down                 コンテナ停止 + AI評価プロキシ停止
format               Ruff Format実行
help                 コマンド一覧を表示
lint                 Ruff Lint実行
logs                 全コンテナのログ表示
migrate              マイグレーション実行
...
```

---

## make が使えない場合の代替手段

`make` をインストールできない環境では、Makefile 内のコマンドを直接実行できます。
例えば:

| make コマンド | 直接実行 |
|--------------|---------|
| `make up` | `docker compose up -d` |
| `make down` | `docker compose down` |
| `make build` | `docker compose build` |
| `make migrate` | `docker compose exec backend uv run python manage.py migrate` |
| `make logs` | `docker compose logs -f` |

Makefile の中身を確認したい場合は、プロジェクトルートの `Makefile` を直接参照してください。
