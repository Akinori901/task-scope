FROM node:22-slim

WORKDIR /app

# 依存インストール（キャッシュ活用のため先にコピー）
COPY package.json package-lock.json* ./
RUN npm install

# ソースコードコピー（開発時はvolumeマウントで上書き）
COPY . .

EXPOSE 3000

# Vite 開発サーバー起動（HMR有効、コンテナ外からアクセス可能に）
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
