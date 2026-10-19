import { Alert, Box, Button, Card, CardContent, TextField, Typography } from "@mui/material";
import { DEFAULT_BUFFER_CONFIG, useViewStore } from "../../stores/viewStore";

/** バッファタブ: バッファ係数の設定 */
export default function BufferTab() {
  const { bufferConfig, setBufferConfig } = useViewStore();

  return (
    <>
      <Typography variant="h6" fontWeight={700}>バッファ係数設定</Typography>

      <Card>
        <CardContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            推定工数に掛けるバッファ係数の計算パラメータです。不確実性スコア（3軸の加重平均）に基づいて係数が自動算出されます。
          </Alert>

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            不確実性スコアの重み配分
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 3 }}>
            {([
              { key: "ambiguityWeight" as const, label: "曖昧度", help: "仕様が曖昧なほど手戻りリスク大" },
              { key: "verificationWeight" as const, label: "検証難度", help: "テストが難しいほど工数膨張" },
              { key: "coordinationWeight" as const, label: "調整コスト", help: "関係者調整が多いほど待ち時間増" },
            ]).map(({ key, label, help }) => (
              <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Typography variant="body2" sx={{ minWidth: 120 }}>
                  {label}
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  value={bufferConfig[key]}
                  onChange={(e) => setBufferConfig({ ...bufferConfig, [key]: Number(e.target.value) })}
                  inputProps={{ step: 0.05, min: 0, max: 1 }}
                  sx={{ width: 100 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {help}（default: {DEFAULT_BUFFER_CONFIG[key]}）
                </Typography>
              </Box>
            ))}
          </Box>

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            係数の範囲
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Typography variant="body2" sx={{ minWidth: 120 }}>
                最小係数
              </Typography>
              <TextField
                size="small"
                type="number"
                value={bufferConfig.minCoeff}
                onChange={(e) => setBufferConfig({ ...bufferConfig, minCoeff: Number(e.target.value) })}
                inputProps={{ step: 0.1, min: 1.0 }}
                sx={{ width: 100 }}
              />
              <Typography variant="caption" color="text.secondary">
                不確実性が最低の場合（default: {DEFAULT_BUFFER_CONFIG.minCoeff}）
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Typography variant="body2" sx={{ minWidth: 120 }}>
                最大係数
              </Typography>
              <TextField
                size="small"
                type="number"
                value={bufferConfig.maxCoeff}
                onChange={(e) => setBufferConfig({ ...bufferConfig, maxCoeff: Number(e.target.value) })}
                inputProps={{ step: 0.1, min: 1.0 }}
                sx={{ width: 100 }}
              />
              <Typography variant="caption" color="text.secondary">
                不確実性が最高の場合（default: {DEFAULT_BUFFER_CONFIG.maxCoeff}）
              </Typography>
            </Box>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Button
              size="small"
              variant="text"
              onClick={() => setBufferConfig({ ...DEFAULT_BUFFER_CONFIG })}
            >
              デフォルトに戻す
            </Button>
          </Box>
        </CardContent>
      </Card>

    </>
  );
}
