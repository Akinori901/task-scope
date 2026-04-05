/**
 * 外部モジュールの ambient 型宣言
 *
 * Docker 内でビルド・実行するため、ローカルに node_modules をインストールしない。
 * VSCode の TypeScript エラーを抑制するために、外部モジュールの存在だけを宣言する。
 * 実際の型定義は Docker 内の node_modules から解決される。
 */

declare module "@tanstack/react-query";
declare module "@mui/material";
declare module "@mui/material/styles";
declare module "@mui/icons-material";
declare module "@mui/icons-material/*";
declare module "react";
declare module "react-dom/client";
declare module "react-router-dom";
declare module "recharts";
declare module "zustand";
declare module "axios";
