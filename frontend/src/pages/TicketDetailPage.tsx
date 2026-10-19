import CancelIcon from "@mui/icons-material/Cancel";
import DescriptionIcon from "@mui/icons-material/Description";
import GradingIcon from "@mui/icons-material/Grading";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import SearchIcon from "@mui/icons-material/Search";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import AssignmentIcon from "@mui/icons-material/Assignment";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { BackgroundTask } from "../api/client";
import { fetchBackgroundTasks } from "../api/client";
import { exportQaExcel } from "../utils/exportQaExcel";
import { isQaDownloaded, markQaDownloaded } from "../utils/taskState";
import type { CustomField, TicketComment } from "../api/types";
import DifficultyRadarChart from "../components/DifficultyRadarChart";
import PriorityChip from "../components/PriorityChip";
import StatusChip from "../components/StatusChip";
import {
  useEvaluateTicket,
  useGenerateDocument,
  useGenerateQa,
  useGenerateSpec,
  useTicketDetail,
} from "../hooks/useTicketDetail";
import CommentSection from "./ticket-detail/CommentSection";
import EvaluationSection from "./ticket-detail/EvaluationSection";
import TicketHeader from "./ticket-detail/TicketHeader";

const DOC_BUTTONS: {
  kind: "survey" | "plan" | "record" | "completion";
  label: string;
  tooltip: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
}[] = [
  { kind: "survey", label: "調査報告書", tooltip: "チケット内容と関連コードから調査報告書を AI で作成します", icon: <SearchIcon /> },
  { kind: "plan", label: "実装計画書", tooltip: "チケット内容と関連コードから実装計画書を AI で作成します", icon: <GradingIcon /> },
  { kind: "record", label: "実行記録", tooltip: "チケット内容から実行記録のドラフトを AI で作成します", icon: <HistoryEduIcon /> },
  { kind: "completion", label: "完了報告", tooltip: "依頼者へ返す完了報告のドラフトを AI で作成します", icon: <AssignmentIcon /> },
];

// 画面のボタン並び順 = 実際の作業順。
// 採点 → 調査報告書 → 方針書 → 実装計画書 → 実行記録 → QA項目作成 → 完了報告。
// "spec"(方針書) と "qa" は専用のミューテーションを持つのでここでは印だけ置き、
// 描画時に個別のボタンへ差し替える。
const ACTION_ORDER = [
  "evaluate",
  "survey",
  "spec",
  "plan",
  "record",
  "qa",
  "completion",
] as const;

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ticketId = Number(id);
  const { data: ticket, isLoading, error } = useTicketDetail(ticketId);
  const evalMutation = useEvaluateTicket(ticketId);
  const specMutation = useGenerateSpec(ticketId);
  const qaMutation = useGenerateQa(ticketId);
  const docMutation = useGenerateDocument(ticketId);

  const [snackMessage, setSnackMessage] = useState("");

  // QA 生成タスクの完了を監視し、完了したら Excel を自動ダウンロードする
  const { data: bgTasks } = useQuery({
    queryKey: ["background-tasks"],
    queryFn: () =>
      fetchBackgroundTasks().then((r: { data: BackgroundTask[] }) =>
        Array.isArray(r.data) ? r.data : [],
      ),
    refetchInterval: (query) => {
      const data = query.state.data as BackgroundTask[] | undefined;
      return data?.some((t) => t.status === "running") ? 3000 : false;
    },
  });
  // 生成完了した QA 項目を保持し、手動で再ダウンロードできるようにする
  // （バックグラウンド完了後の自動DLはブラウザにブロックされることがあるため）
  const [pendingQaDownload, setPendingQaDownload] = useState<{
    issueKey: string;
    summary: string;
    items: NonNullable<BackgroundTask["qa_items"]>;
  } | null>(null);
  useEffect(() => {
    if (!bgTasks) return;
    for (const task of bgTasks) {
      if (
        task.task_type === "qa" &&
        task.status === "completed" &&
        task.ticket_id === ticketId &&
        task.qa_items &&
        // localStorage に記録するので、リロードしても再ダウンロードしない
        !isQaDownloaded(task.task_id)
      ) {
        markQaDownloaded(task.task_id);
        const items = task.qa_items;
        const issueKey = task.issue_key;
        const summary = task.summary ?? "";
        // 自動DLを試みる。ブロックされても手動DLできるよう、成否にかかわらず項目を保持する。
        exportQaExcel(issueKey, summary, items)
          .then(() =>
            setSnackMessage(
              `QA項目（${items.length}件）を生成しました。Excelが開始されない場合は下の「ダウンロード」を押してください`,
            ),
          )
          .catch(() => setSnackMessage("QA項目のExcel生成に失敗しました"))
          .finally(() => setPendingQaDownload({ issueKey, summary, items }));
      }
    }
  }, [bgTasks, ticketId]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !ticket) {
    return <Alert severity="error">チケットの読み込みに失敗しました</Alert>;
  }

  const evaluation = ticket.evaluation;
  const needsReEval = ticket.needs_re_evaluation;
  const hasSpec = ticket.comments?.some((c: TicketComment) => c.tags?.includes("spec"));
  const qaRunning =
    qaMutation.isPending ||
    (bgTasks?.some(
      (t) => t.task_type === "qa" && t.ticket_id === ticketId && t.status === "running",
    ) ??
      false);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <TicketHeader ticket={ticket} ticketId={ticketId} />

      {/* Basic Info */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {ticket.summary}
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                プロジェクト
              </Typography>
              <Typography>
                {ticket.project_key}: {ticket.project_name}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                担当者
              </Typography>
              <Typography>{ticket.assignee_name ?? "未割当"}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                期限
              </Typography>
              <Typography>{ticket.due_date ?? "未設定"}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                優先度
              </Typography>
              <PriorityChip priority={ticket.priority_name} />
            </Grid>
          </Grid>
          {/* カスタム属性 */}
          {ticket.custom_fields && ticket.custom_fields.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {ticket.custom_fields.map((cf: CustomField) => (
                  <Grid key={cf.id} size={{ xs: 6, md: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      {cf.name}
                    </Typography>
                    {Array.isArray(cf.value) ? (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                        {cf.value.map((v: string) => (
                          <Chip key={v} label={v} size="small" variant="outlined" />
                        ))}
                      </Box>
                    ) : (
                      <Typography>{String(cf.value)}</Typography>
                    )}
                  </Grid>
                ))}
              </Grid>
            </>
          )}

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary" gutterBottom>
            説明
          </Typography>
          <Typography
            variant="body1"
            sx={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}
          >
            {ticket.description || "(説明なし)"}
          </Typography>
        </CardContent>
      </Card>

      {/* 子チケット */}
      {ticket.children && ticket.children.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              子チケット ({ticket.children.length}件)
            </Typography>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { py: 0.5, px: 1, fontSize: 13 } }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>キー</th>
                  <th style={{ textAlign: "left" }}>件名</th>
                  <th style={{ textAlign: "left" }}>ステータス</th>
                  <th style={{ textAlign: "left" }}>担当者</th>
                </tr>
              </thead>
              <tbody>
                {ticket.children.map((child) => (
                  <Box
                    component="tr"
                    key={child.id}
                    sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                    onClick={() => navigate(`/tickets/${child.id}`)}
                  >
                    <td>
                      <Typography variant="body2" fontWeight={600} color="primary">
                        {child.issue_key}
                      </Typography>
                    </td>
                    <td>{child.summary}</td>
                    <td><StatusChip status={child.status_name} /></td>
                    <td>{child.assignee_name ?? "未割当"}</td>
                  </Box>
                ))}
              </tbody>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 再評価ヒント */}
      {needsReEval && (
        <Alert severity="info" variant="outlined">
          評価後に {ticket.new_comment_count} 件の新しいコメントがあります — 再採点で最新情報を反映できます
        </Alert>
      )}

      {/* Actions */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {ACTION_ORDER.map((action) => {
          if (action === "evaluate") {
            return (
              <Button
                key={action}
                variant="contained"
                color={needsReEval ? "error" : "primary"}
                startIcon={
                  evalMutation.isPending ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <GradingIcon />
                  )
                }
                onClick={() => evalMutation.mutate()}
                disabled={evalMutation.isPending}
              >
                {needsReEval ? "再採点（推奨）" : evaluation ? "再採点" : "採点"}
              </Button>
            );
          }

          if (action === "spec") {
            return (
              <Tooltip
                key={action}
                title={
                  ticket.matched_repositories?.length
                    ? `コード参照: ${ticket.matched_repositories.map((r: { name: string }) => r.name).join(", ")}`
                    : "コード参照なし — テキスト情報のみで生成"
                }
              >
                <Button
                  variant="outlined"
                  startIcon={
                    specMutation.isPending || specMutation.isSuccess ? (
                      <CircularProgress size={16} />
                    ) : (
                      <DescriptionIcon />
                    )
                  }
                  onClick={() => {
                    specMutation.mutate(undefined, {
                      onSuccess: () => setSnackMessage("方針書の生成を開始しました（バックグラウンドで実行中）"),
                      onError: () => setSnackMessage("方針書生成の開始に失敗しました"),
                    });
                  }}
                  disabled={specMutation.isPending || specMutation.isSuccess}
                >
                  {specMutation.isSuccess ? "生成中…" : `方針書${hasSpec ? "再生成" : "生成"}`}
                </Button>
              </Tooltip>
            );
          }

          if (action === "qa") {
            return (
              <Tooltip key={action} title="チケット内容から QA テスト項目を AI で作成し、Excel でダウンロードします">
                <Button
                  variant="outlined"
                  startIcon={qaRunning ? <CircularProgress size={16} /> : <FactCheckIcon />}
                  onClick={() => {
                    qaMutation.mutate(undefined, {
                      onSuccess: () =>
                        setSnackMessage("QA項目の作成を開始しました（完了後に自動でExcelをダウンロードします）"),
                      onError: () => setSnackMessage("QA項目作成の開始に失敗しました"),
                    });
                  }}
                  disabled={qaRunning}
                >
                  {qaRunning ? "作成中…" : "QA項目作成"}
                </Button>
              </Tooltip>
            );
          }

          const b = DOC_BUTTONS.find((d) => d.kind === action);
          if (!b) return null;
          const running = docMutation.isPending && docMutation.variables === b.kind;
          return (
            <Tooltip key={b.kind} title={b.tooltip}>
              <Button
                variant="outlined"
                startIcon={running ? <CircularProgress size={16} /> : b.icon}
                onClick={() => {
                  docMutation.mutate(b.kind, {
                    onSuccess: () => setSnackMessage(`${b.label}の生成を開始しました（バックグラウンドで実行中）`),
                    onError: () => setSnackMessage(`${b.label}生成の開始に失敗しました`),
                  });
                }}
                disabled={docMutation.isPending}
              >
                {running ? "生成中…" : b.label}
              </Button>
            </Tooltip>
          );
        })}
      </Box>

      {/* QA項目 手動ダウンロード（自動DLがブロックされた場合の保険） */}
      {pendingQaDownload && (
        <Alert
          severity="success"
          icon={<FactCheckIcon />}
          action={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<DescriptionIcon />}
                onClick={() => {
                  exportQaExcel(
                    pendingQaDownload.issueKey,
                    pendingQaDownload.summary,
                    pendingQaDownload.items,
                  ).catch(() => setSnackMessage("Excel生成に失敗しました"));
                }}
              >
                ダウンロード
              </Button>
              <IconButton size="small" onClick={() => setPendingQaDownload(null)}>
                <CancelIcon fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          QA項目（{pendingQaDownload.items.length}件）を生成しました。Excelが自動で開始されない場合は「ダウンロード」を押してください。
        </Alert>
      )}

      {/* Difficulty Radar Chart (メイン) */}
      {evaluation && evaluation.overall_difficulty_score > 0 && (
        <DifficultyRadarChart evaluation={evaluation} />
      )}

      <EvaluationSection evaluation={evaluation} />

      <CommentSection ticket={ticket} ticketId={ticketId} setSnackMessage={setSnackMessage} />

      <Snackbar
        open={!!snackMessage}
        autoHideDuration={3000}
        onClose={() => setSnackMessage("")}
        message={snackMessage}
      />
    </Box>
  );
}
