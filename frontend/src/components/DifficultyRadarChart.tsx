import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ScheduleIcon from "@mui/icons-material/Schedule";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Popover,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";
import { useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { TicketEvaluation } from "../api/types";
import { useViewStore } from "../stores/viewStore";

interface Props {
  evaluation: TicketEvaluation;
}

const AXES = [
  {
    key: "impact_scope_score",
    label: "影響範囲",
    short: "影響範囲",
    description: "変更が波及するシステム・機能の広さ",
    low: "単一画面・テーブルの修正",
    mid: "複数テーブル・画面にまたがる修正",
    high: "外部連携・基幹処理への変更",
  },
  {
    key: "query_complexity_score",
    label: "クエリ複雑度",
    short: "クエリ",
    description: "SQL・データ操作の難しさ",
    low: "単純CRUD、1テーブルの操作",
    mid: "複数JOIN・集計・GROUP BY",
    high: "チューニング・大量データ処理・複雑な移行",
  },
  {
    key: "ambiguity_score",
    label: "仕様曖昧度",
    short: "曖昧度",
    description: "要件・仕様の不明確さ",
    low: "受入条件が明確、手順レベルで記載あり",
    mid: "方向性は分かるが細部は未定",
    high: "何をすべきかすら不明確",
  },
  {
    key: "verification_difficulty_score",
    label: "テスト・検証難度",
    short: "検証難度",
    description: "動作確認・テストの難しさ",
    low: "目視で即確認、数パターン",
    mid: "複数条件の組み合わせテストが必要",
    high: "本番同等データ必須、回帰テスト範囲が広大",
  },
  {
    key: "coordination_cost_score",
    label: "調整コスト",
    short: "調整",
    description: "他者との調整・確認の手間",
    low: "単独で完結",
    mid: "チーム内のレビュー・承認が必要",
    high: "複数部署・顧客との仕様協議が必要",
  },
  {
    key: "regression_risk_score",
    label: "リグレッションリスク",
    short: "リグレ",
    description: "既存機能を壊すリスク",
    low: "新規追加のみ、既存に影響なし",
    mid: "既存ロジックの改修",
    high: "基幹処理・共通部品・決済等の変更",
  },
] as const;

function getDifficultyColor(score: number): string {
  if (score >= 70) return "#ff8a80";
  if (score >= 40) return "#ffb74d";
  return "#69f0ae";
}

const RESOLUTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  data_fix: { label: "データ修正", color: "#42a5f5", icon: "DB" },
  code_fix: { label: "コード修正", color: "#ff8a80", icon: "Code" },
  config_change: { label: "設定変更", color: "#ffb74d", icon: "Conf" },
  investigation: { label: "調査のみ", color: "#69f0ae", icon: "Q&A" },
  mixed: { label: "複合", color: "#ce93d8", icon: "Mix" },
  unknown: { label: "判定不可", color: "#78909c", icon: "?" },
};

export default function DifficultyRadarChart({ evaluation }: Props) {
  const bc = useViewStore((s) => s.bufferConfig);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [openAxisKey, setOpenAxisKey] = useState<string | null>(null);

  const handleHelpClick = (event: React.MouseEvent<HTMLElement>, key: string) => {
    setAnchorEl(event.currentTarget);
    setOpenAxisKey(key);
  };

  const handleHelpClose = () => {
    setAnchorEl(null);
    setOpenAxisKey(null);
  };

  const openAxis = AXES.find((a) => a.key === openAxisKey);

  const chartData = AXES.map((axis) => ({
    axis: axis.short,
    value: evaluation[axis.key],
    fullMark: 100,
  }));

  const overallColor = getDifficultyColor(evaluation.overall_difficulty_score);

  const [overallHelpEl, setOverallHelpEl] = useState<HTMLElement | null>(null);
  const [estimateHelpEl, setEstimateHelpEl] = useState<HTMLElement | null>(null);

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="h6">難易度評価</Typography>
            <IconButton
              size="small"
              onClick={(e: { currentTarget: HTMLElement }) => setOverallHelpEl(e.currentTarget)}
              sx={{ p: 0.25, color: "text.disabled" }}
            >
              <HelpOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Popover
              open={!!overallHelpEl}
              anchorEl={overallHelpEl}
              onClose={() => setOverallHelpEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              slotProps={{ paper: { sx: { p: 2, maxWidth: 380 } } }}
            >
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                難易度評価とは
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                AIがチケットの内容・コメントを分析し、実装・調整の難しさを6軸で評価したものです。
                総合スコアは6軸の加重評価で、最もリスクの高い軸を重視して算出されます。
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                対処区分
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {Object.entries(RESOLUTION_LABELS).map(([key, v]) => (
                  <Box key={key} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <Chip label={v.label} size="small" sx={{ bgcolor: v.color, color: "#000", fontWeight: 700, minWidth: 80 }} />
                    <Typography variant="caption">
                      {key === "data_fix" && "SQLやマスタデータの直接修正で対処可能"}
                      {key === "code_fix" && "アプリケーションのソースコード修正が必要"}
                      {key === "config_change" && "環境設定・パラメータの変更で対処可能"}
                      {key === "investigation" && "調査・回答のみで実装作業は不要"}
                      {key === "mixed" && "複数種類の作業が必要（例: データ修正＋コード修正）"}
                      {key === "unknown" && "情報不足で判定できない"}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                スコアの目安
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Chip label="低" size="small" sx={{ bgcolor: "#69f0ae", color: "#000", fontWeight: 700, minWidth: 36 }} />
                  <Typography variant="caption">0〜39: 軽微な対応、リスク低</Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Chip label="中" size="small" sx={{ bgcolor: "#ffb74d", color: "#000", fontWeight: 700, minWidth: 36 }} />
                  <Typography variant="caption">40〜69: 一定の複雑さ・リスクあり</Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Chip label="高" size="small" sx={{ bgcolor: "#ff8a80", color: "#000", fontWeight: 700, minWidth: 36 }} />
                  <Typography variant="caption">70〜100: 複雑・リスク高、慎重な対応が必要</Typography>
                </Box>
              </Box>
            </Popover>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {evaluation.resolution_type && evaluation.resolution_type !== "unknown" && (() => {
              const res = RESOLUTION_LABELS[evaluation.resolution_type] || RESOLUTION_LABELS.unknown;
              return (
                <Chip
                  label={res.label}
                  size="small"
                  sx={{ bgcolor: res.color, color: "#000", fontWeight: 700 }}
                />
              );
            })()}
            <Chip
              label={`難易度 ${evaluation.overall_difficulty_score} / 100`}
              sx={{
                bgcolor: overallColor,
                color: "#000",
                fontWeight: 700,
                fontSize: "0.875rem",
              }}
            />
          </Box>
        </Box>

        {/* 対処区分コメント */}
        {evaluation.resolution_comment && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: "rgba(255,255,255,0.04)", borderRadius: 1, display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
              対処区分:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {evaluation.resolution_comment}
            </Typography>
          </Box>
        )}

        <Grid container spacing={2}>
          {/* レーダーチャート */}
          <Grid size={{ xs: 12, md: 6 }}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={chartData}>
                <PolarGrid stroke="rgba(255,255,255,0.15)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                  tickCount={5}
                />
                <Radar
                  name="難易度"
                  dataKey="value"
                  stroke="#90caf9"
                  fill="#90caf9"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </Grid>

          {/* 各軸スコア */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {AXES.map((axis) => {
                const score = evaluation[axis.key];
                return (
                  <Box key={axis.key}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                        <Typography variant="body2">{axis.label}</Typography>
                        <IconButton
                          size="small"
                          onClick={(e) => handleHelpClick(e, axis.key)}
                          sx={{ p: 0.25, color: "text.disabled" }}
                        >
                          <HelpOutlineIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Box>
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={{ color: getDifficultyColor(score) }}
                      >
                        {score}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={score}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: "rgba(255,255,255,0.08)",
                        "& .MuiLinearProgress-bar": {
                          bgcolor: getDifficultyColor(score),
                          borderRadius: 3,
                        },
                      }}
                    />
                  </Box>
                );
              })}

              {/* 指標説明ポップオーバー */}
              <Popover
                open={!!anchorEl}
                anchorEl={anchorEl}
                onClose={handleHelpClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                slotProps={{ paper: { sx: { p: 2, maxWidth: 320 } } }}
              >
                {openAxis && (
                  <>
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                      {openAxis.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      {openAxis.description}
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                        <Chip label="低" size="small" sx={{ bgcolor: "#69f0ae", color: "#000", fontWeight: 700, minWidth: 36 }} />
                        <Typography variant="caption">0-30: {openAxis.low}</Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                        <Chip label="中" size="small" sx={{ bgcolor: "#ffb74d", color: "#000", fontWeight: 700, minWidth: 36 }} />
                        <Typography variant="caption">40-69: {openAxis.mid}</Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                        <Chip label="高" size="small" sx={{ bgcolor: "#ff8a80", color: "#000", fontWeight: 700, minWidth: 36 }} />
                        <Typography variant="caption">70-100: {openAxis.high}</Typography>
                      </Box>
                    </Box>
                  </>
                )}
              </Popover>
            </Box>
          </Grid>
        </Grid>

        {/* 難易度コメント */}
        {evaluation.difficulty_comment && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: "rgba(255,255,255,0.04)", borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {evaluation.difficulty_comment}
            </Typography>
          </Box>
        )}

        {/* 推定工数 */}
        {evaluation.estimated_days > 0 && (() => {
          const uncertaintyScore =
            evaluation.ambiguity_score * bc.ambiguityWeight +
            evaluation.verification_difficulty_score * bc.verificationWeight +
            evaluation.coordination_cost_score * bc.coordinationWeight;
          const coeffRange = bc.maxCoeff - bc.minCoeff; // default: 0.8
          const bufferCoeff = bc.minCoeff + (uncertaintyScore / 100) * coeffRange;
          const bufferedDays = Math.ceil(evaluation.estimated_days * bufferCoeff * 2) / 2;
          return (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
              <ScheduleIcon color="primary" fontSize="small" />
              <Typography variant="subtitle1" fontWeight={600}>
                推定工数
              </Typography>
              <IconButton
                size="small"
                onClick={(e: { currentTarget: HTMLElement }) => setEstimateHelpEl(e.currentTarget)}
                sx={{ p: 0.25, color: "text.disabled" }}
              >
                <HelpOutlineIcon sx={{ fontSize: 18 }} />
              </IconButton>
              <Popover
                open={!!estimateHelpEl}
                anchorEl={estimateHelpEl}
                onClose={() => setEstimateHelpEl(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                slotProps={{ paper: { sx: { p: 2, maxWidth: 400 } } }}
              >
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  推定工数とバッファ係数
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  AI が見積もった最短工数に、不確実性を考慮したバッファ係数（×{bc.minCoeff}〜{bc.maxCoeff}）を掛けた値を併記しています。
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  <strong>係数の算出:</strong> 以下3軸の加重平均から自動計算
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  <Typography component="li" variant="body2" color="text.secondary">
                    曖昧度（×{bc.ambiguityWeight}）— 仕様が曖昧なほど手戻りリスク大
                  </Typography>
                  <Typography component="li" variant="body2" color="text.secondary">
                    検証難度（×{bc.verificationWeight}）— テストが難しいほど工数膨張
                  </Typography>
                  <Typography component="li" variant="body2" color="text.secondary">
                    調整コスト（×{bc.coordinationWeight}）— 関係者調整が多いほど待ち時間増
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
                  <strong>係数の目安:</strong>
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  <Typography component="li" variant="body2" color="text.secondary">
                    ×1.2 — 仕様明確・既知領域
                  </Typography>
                  <Typography component="li" variant="body2" color="text.secondary">
                    ×1.5 — 多少の不確実性あり
                  </Typography>
                  <Typography component="li" variant="body2" color="text.secondary">
                    ×2.0 — 未知の領域・外部依存多数
                  </Typography>
                </Box>
              </Popover>
              <Chip
                label={`${evaluation.estimated_days} 人日`}
                color="primary"
                size="small"
                sx={{ fontWeight: 700 }}
              />
              <Typography variant="body2" color="text.secondary">→</Typography>
              <Chip
                label={`バッファ込み ${bufferedDays} 人日`}
                color="warning"
                size="small"
                sx={{ fontWeight: 700 }}
              />
              <Chip
                label={`バッファ係数 ×${bufferCoeff.toFixed(1)}`}
                variant="outlined"
                size="small"
              />
            </Box>
            {evaluation.estimated_breakdown.length > 0 && (
              <Table size="small">
                <TableBody>
                  {evaluation.estimated_breakdown.map((row, i) => (
                    <TableRow key={i} sx={{ "&:last-child td": { borderBottom: 0 } }}>
                      <TableCell sx={{ pl: 0, width: 140 }}>
                        <Typography variant="body2">{row.phase}</Typography>
                      </TableCell>
                      <TableCell sx={{ width: 80 }}>
                        <Typography variant="body2" fontWeight={700}>
                          {row.days} 日
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {row.note}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
