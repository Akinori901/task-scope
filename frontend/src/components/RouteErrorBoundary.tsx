/**
 * ルート単位のエラー画面。
 *
 * 描画中に例外が起きると React Router 既定の
 * "Unexpected Application Error!" (スタックトレース) が全画面に出てしまうため、
 * 何が起きたかと復旧の導線を出す。
 */
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useRouteError } from "react-router-dom";

export default function RouteErrorBoundary() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error ?? "不明なエラー");

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Paper elevation={3} sx={{ p: 4, maxWidth: 520, width: "100%" }}>
        <Typography variant="h6" gutterBottom>
          画面の表示に失敗しました
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
一時的な通信エラーであれば、再読み込みで復旧することがあります。
        </Typography>
        <Typography
          variant="caption"
          component="pre"
          sx={{
            display: "block",
            p: 1.5,
            mb: 3,
            bgcolor: "action.hover",
            borderRadius: 1,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message}
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            再読み込み
          </Button>
          <Button variant="outlined" onClick={() => window.location.assign("/")}>
            ホームへ
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
