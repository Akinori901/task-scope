import AddCommentIcon from "@mui/icons-material/AddComment";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import ChatIcon from "@mui/icons-material/Chat";
import CodeIcon from "@mui/icons-material/Code";
import DescriptionIcon from "@mui/icons-material/Description";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import GavelIcon from "@mui/icons-material/Gavel";
import PushPinIcon from "@mui/icons-material/PushPin";
import GradingIcon from "@mui/icons-material/Grading";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import SendIcon from "@mui/icons-material/Send";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  LinearProgress,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Popover,
  Snackbar,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PinnedTicketData } from "../api/client";
import { fetchPinnedTickets, pinTicket, unpinTicket } from "../api/client";
import type { CustomField, TicketComment } from "../api/types";
import DifficultyRadarChart from "../components/DifficultyRadarChart";
import PriorityChip from "../components/PriorityChip";
import StatusChip from "../components/StatusChip";
import {
  useCreateComment,
  useDeleteComment,
  useEvaluateTicket,
  useGenerateSpec,
  usePostCommentToBacklog,
  useTicketDetail,
  useUpdateComment,
  useUpdateCommentTags,
} from "../hooks/useTicketDetail";
import { useViewStore } from "../stores/viewStore";

const READINESS_LABELS = {
  ready: { label: "作成可能", color: "success" as const },
  partial: { label: "一部不足", color: "warning" as const },
  not_ready: { label: "情報不足", color: "error" as const },
};

const FEASIBILITY_LABELS = {
  feasible: { label: "妥当", color: "success" as const },
  risky: { label: "リスクあり", color: "warning" as const },
  unrealistic: { label: "非現実的", color: "error" as const },
  unknown: { label: "判定不可", color: "default" as const },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TAG_DEFS: { value: string; label: string; color: "info" | "success" | "warning" | "error" | "secondary"; icon: any }[] = [
  { value: "spec", label: "方針書", color: "info", icon: <DescriptionIcon fontSize="inherit" /> },
  { value: "pr", label: "PR", color: "success", icon: <CodeIcon fontSize="inherit" /> },
  { value: "report", label: "報告書", color: "secondary", icon: <AssignmentTurnedInIcon fontSize="inherit" /> },
  { value: "decision", label: "決定事項", color: "warning", icon: <GavelIcon fontSize="inherit" /> },
  { value: "blocker", label: "ブロッカー", color: "error", icon: <ReportProblemIcon fontSize="inherit" /> },
];

function getTagDef(tag: string) {
  return TAG_DEFS.find((t) => t.value === tag);
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ticketId = Number(id);
  const { data: ticket, isLoading, error } = useTicketDetail(ticketId);
  const evalMutation = useEvaluateTicket(ticketId);
  const specMutation = useGenerateSpec(ticketId);
  const postMutation = usePostCommentToBacklog(ticketId);
  const tagsMutation = useUpdateCommentTags(ticketId);
  const createMutation = useCreateComment(ticketId);
  const deleteMutation = useDeleteComment(ticketId);
  const editMutation = useUpdateComment(ticketId);
  const queryClient = useQueryClient();
  const { data: pinnedTickets } = useQuery({
    queryKey: ["pinned-tickets"],
    queryFn: () => fetchPinnedTickets().then((r: { data: PinnedTicketData[] }) => r.data),
  });
  const currentPin = pinnedTickets?.find((p: PinnedTicketData) => p.ticket.id === ticketId);
  const pinMutation = useMutation({
    mutationFn: () => pinTicket(ticketId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pinned-tickets"] }),
  });
  const unpinMutation = useMutation({
    mutationFn: (pinId: number) => unpinTicket(pinId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pinned-tickets"] }),
  });

  const { defaultCommentTag } = useViewStore();
  const initialTag = searchParams.get("tag");
  const [tagFilter, setTagFilter] = useState<string | null>(
    initialTag && TAG_DEFS.some((t) => t.value === initialTag) ? initialTag : defaultCommentTag
  );
  const [snackMessage, setSnackMessage] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [commentHelpEl, setCommentHelpEl] = useState<HTMLElement | null>(null);
  const [commentSectionHelpEl, setCommentSectionHelpEl] = useState<HTMLElement | null>(null);
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
  const [postingCommentId, setPostingCommentId] = useState<number | null>(null);

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

  const filteredComments = (ticket.comments || []).filter((c: TicketComment) => {
    if (!tagFilter) return true;
    return c.tags?.includes(tagFilter);
  });

  const handleToggleTag = (comment: TicketComment, tag: string) => {
    const current = comment.tags || [];
    const newTagList = current.includes(tag)
      ? current.filter((t: string) => t !== tag)
      : [...current, tag];
    tagsMutation.mutate(
      { commentId: comment.id, tags: newTagList },
      {
        onSuccess: () => setSnackMessage(`タグを更新しました`),
        onError: () => setSnackMessage("タグ更新に失敗しました"),
      },
    );
  };

  const postTarget = ticket?.source_type === "jira" ? "Jira" : "Backlog";

  const handlePostToBacklog = (commentId: number) => {
    postMutation.mutate(commentId, {
      onSuccess: () => setSnackMessage(`${postTarget} に投稿しました`),
      onError: () => setSnackMessage("投稿に失敗しました"),
      onSettled: () => setPostingCommentId(null),
    });
  };

  const handleCreateComment = (andPost = false) => {
    if (!newContent.trim()) return;
    createMutation.mutate(
      { content: newContent, tags: newTags },
      {
        onSuccess: (created: { id: number }) => {
          if (andPost && created?.id) {
            postMutation.mutate(created.id, {
              onSuccess: () => {
                setSnackMessage(`コメントを作成し ${postTarget} に投稿しました`);
                setCreateDialogOpen(false);
                setNewContent("");
                setNewTags([]);
              },
              onError: () => setSnackMessage(`作成しましたが ${postTarget} への投稿に失敗しました`),
            });
          } else {
            setSnackMessage("コメントを作成しました");
            setCreateDialogOpen(false);
            setNewContent("");
            setNewTags([]);
          }
        },
        onError: () => setSnackMessage("作成に失敗しました"),
      },
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          size="small"
        >
          戻る
        </Button>
        <Box>
          {ticket.parent_ticket_key && (
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: "pointer", display: "block", lineHeight: 1 }}
              onClick={() => {
                if (ticket.parent_ticket_id) navigate(`/tickets/${ticket.parent_ticket_id}`);
              }}
            >
              ↑ {ticket.parent_ticket_key}
            </Typography>
          )}
          <Typography variant="h5" fontWeight={700}>
            {ticket.issue_key}
          </Typography>
        </Box>
        {ticket.external_url && (
          <Tooltip title={`${ticket.source_type === "jira" ? "Jira" : "Backlog"} で開く`}>
            <IconButton
              size="small"
              component="a"
              href={ticket.external_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <OpenInNewIcon />
            </IconButton>
          </Tooltip>
        )}
        <StatusChip status={ticket.status_name} />
        {ticket.is_overdue && <Chip label="遅延" color="error" size="small" />}
        {ticket.is_stagnant && (
          <Chip
            label={`停滞${ticket.stagnant_days}日`}
            color="warning"
            size="small"
          />
        )}
        <Tooltip title={currentPin ? "ピン解除" : "ピン留め"}>
          <IconButton
            size="small"
            onClick={() => {
              if (currentPin) {
                unpinMutation.mutate(currentPin.id);
              } else {
                pinMutation.mutate();
              }
            }}
            sx={{ color: currentPin ? "primary.main" : "text.disabled", ml: "auto" }}
          >
            <PushPinIcon />
          </IconButton>
        </Tooltip>
      </Box>

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
      <Box sx={{ display: "flex", gap: 2 }}>
        <Button
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
        <Tooltip
          title={
            ticket.matched_repositories?.length
              ? `コード参照: ${ticket.matched_repositories.map((r: { name: string }) => r.name).join(", ")}`
              : "コード参照なし — テキスト情報のみで生成"
          }
        >
          <Button
            variant="outlined"
            startIcon={
              specMutation.isPending ? (
                <CircularProgress size={16} />
              ) : specMutation.isSuccess ? (
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
      </Box>

      {/* Difficulty Radar Chart (メイン) */}
      {evaluation && evaluation.overall_difficulty_score > 0 && (
        <DifficultyRadarChart evaluation={evaluation} />
      )}

      {/* 情報品質評価 (折りたたみサブセクション) */}
      {evaluation && (
        <Accordion defaultExpanded={false} sx={{ bgcolor: "background.paper" }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
              <Typography variant="subtitle1" fontWeight={600}>
                チケット品質
              </Typography>
              <Chip
                label={READINESS_LABELS[evaluation.spec_readiness].label}
                color={READINESS_LABELS[evaluation.spec_readiness].color}
                size="small"
              />
              <Chip
                label={FEASIBILITY_LABELS[evaluation.schedule_feasibility].label}
                color={FEASIBILITY_LABELS[evaluation.schedule_feasibility].color}
                size="small"
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ ml: "auto", mr: 1 }}
              >
                {new Date(evaluation.evaluated_at).toLocaleString("ja-JP")}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  情報充足度
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={evaluation.info_completeness_score}
                    sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                    color={
                      evaluation.info_completeness_score >= 70
                        ? "success"
                        : evaluation.info_completeness_score >= 40
                          ? "warning"
                          : "error"
                    }
                  />
                  <Typography variant="body2" fontWeight={700}>
                    {evaluation.info_completeness_score}%
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  方針書作成可否
                </Typography>
                <Chip
                  label={READINESS_LABELS[evaluation.spec_readiness].label}
                  color={READINESS_LABELS[evaluation.spec_readiness].color}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  日程妥当性
                </Typography>
                <Chip
                  label={FEASIBILITY_LABELS[evaluation.schedule_feasibility].label}
                  color={FEASIBILITY_LABELS[evaluation.schedule_feasibility].color}
                  size="small"
                />
              </Grid>
            </Grid>

            {/* Summary */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                サマリ
              </Typography>
              <Typography variant="body1">{evaluation.summary}</Typography>
            </Box>

            {evaluation.schedule_comment && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  日程コメント
                </Typography>
                <Typography variant="body1">{evaluation.schedule_comment}</Typography>
              </Box>
            )}

            {evaluation.missing_items.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  欠損情報
                </Typography>
                <List dense>
                  {evaluation.missing_items.map((item: string, i: number) => (
                    <ListItem key={i}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <Typography color="error" variant="body2">・</Typography>
                      </ListItemIcon>
                      <ListItemText primary={item} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {evaluation.pr_urls.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  検出された PR
                </Typography>
                <List dense>
                  {evaluation.pr_urls.map((url: string, i: number) => (
                    <ListItem key={i}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <OpenInNewIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Link href={url} target="_blank" rel="noopener">
                            {url}
                          </Link>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
                <Typography variant="caption" color="text.secondary">
                  Claude Code で /wf-review を実行し PR URL を渡すとコードレビューが可能です
                </Typography>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      )}

      {/* コメント */}
      <Accordion defaultExpanded sx={{ bgcolor: "background.paper" }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ChatIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={600}>
              コメント ({ticket.comments?.length ?? 0})
            </Typography>
            <IconButton
              size="small"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                setCommentSectionHelpEl(e.currentTarget);
              }}
              sx={{ p: 0.25, color: "text.disabled" }}
            >
              <HelpOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Popover
              open={!!commentSectionHelpEl}
              anchorEl={commentSectionHelpEl}
              onClose={() => setCommentSectionHelpEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              slotProps={{ paper: { sx: { p: 2, maxWidth: 380 } } }}
            >
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                コメントタグについて
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                各コメントにタグを付けることで、種別ごとにフィルタ・分類できます。
              </Typography>
              {TAG_DEFS.map((t) => (
                <Box key={t.value} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                  <Chip label={t.label} size="small" color={t.color} icon={<>{t.icon}</>} />
                  <Typography variant="body2" color="text.secondary">
                    {t.value === "spec" && "— 実装方針書。AI生成または手動作成"}
                    {t.value === "pr" && "— PR・実装リンクの記録"}
                    {t.value === "report" && "— 完了報告書・作業報告"}
                    {t.value === "decision" && "— 仕様決定・合意事項の記録"}
                    {t.value === "blocker" && "— 障害・ブロッカー報告"}
                  </Typography>
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                ※ タグ付きコメントはAI採点の対象外です（スコアに影響しません）
              </Typography>
            </Popover>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {/* タグフィルタ */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
            <ToggleButtonGroup
              value={tagFilter}
              exclusive
              onChange={(_: unknown, val: string | null) => setTagFilter(val)}
              size="small"
            >
              <ToggleButton value={null as unknown as string}>すべて</ToggleButton>
              {TAG_DEFS.map((t) => (
                <ToggleButton key={t.value} value={t.value}>
                  {t.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button
              size="small"
              startIcon={<AddCommentIcon />}
              onClick={() => setCreateDialogOpen(true)}
              sx={{ ml: "auto" }}
            >
              コメント作成
            </Button>
          </Box>

          {filteredComments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
              {tagFilter ? `「${getTagDef(tagFilter)?.label}」タグのコメントはありません` : "コメントはありません"}
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {filteredComments.map((comment: TicketComment) => (
                <Box
                  key={comment.id}
                  sx={{
                    p: 1.5,
                    bgcolor: comment.source !== "synced" && !comment.posted_at
                      ? "rgba(255,152,0,0.04)"
                      : "rgba(255,255,255,0.03)",
                    borderRadius: 1,
                    borderLeft: "3px solid",
                    borderLeftStyle: comment.source !== "synced" && !comment.posted_at ? "dashed" : "solid",
                    borderColor: comment.source !== "synced" && !comment.posted_at
                      ? "warning.main"
                      : comment.tags?.includes("spec")
                        ? "info.main"
                        : comment.tags?.length
                          ? "warning.main"
                          : "primary.main",
                  }}
                >
                  {/* ヘッダー行 */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
                    <Typography variant="body2" fontWeight={700}>
                      {comment.created_user_name ?? (comment.source === "ai" ? "AI" : comment.source === "manual" ? "手動" : "不明")}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(comment.backlog_created).toLocaleString("ja-JP")}
                    </Typography>
                    {comment.has_attachments && (
                      <AttachFileIcon fontSize="small" sx={{ color: "text.secondary" }} />
                    )}
                    {comment.source !== "synced" && !comment.posted_at && (
                      <Chip
                        label="未投稿"
                        size="small"
                        color="warning"
                        icon={<CloudOffIcon />}
                      />
                    )}
                    {comment.source !== "synced" && comment.posted_at && (
                      <Chip label="投稿済み" size="small" variant="outlined" color="success" />
                    )}

                    {/* タグ Chip */}
                    {(comment.tags || []).map((tag: string) => {
                      const def = getTagDef(tag);
                      return def ? (
                        <Chip
                          key={tag}
                          label={def.label}
                          size="small"
                          color={def.color}
                          icon={<>{def.icon}</>}
                        />
                      ) : null;
                    })}
                  </Box>

                  {/* 本文 (編集モード / 表示モード) */}
                  {editingCommentId === comment.id ? (
                    <Box sx={{ mt: 1 }}>
                      <TextField
                        multiline
                        fullWidth
                        minRows={4}
                        maxRows={20}
                        value={editContent}
                        onChange={(e: { target: { value: string } }) => setEditContent(e.target.value)}
                        size="small"
                      />
                      <Box sx={{ display: "flex", gap: 1, mt: 1, justifyContent: "flex-end" }}>
                        <Button
                          size="small"
                          startIcon={<CancelIcon />}
                          onClick={() => setEditingCommentId(null)}
                        >
                          キャンセル
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={editMutation.isPending ? <CircularProgress size={14} /> : <SaveIcon />}
                          disabled={editMutation.isPending || !editContent.trim()}
                          onClick={() => {
                            editMutation.mutate(
                              { commentId: comment.id, content: editContent },
                              {
                                onSuccess: () => {
                                  setSnackMessage("コメントを更新しました");
                                  setEditingCommentId(null);
                                },
                                onError: () => setSnackMessage("更新に失敗しました"),
                              },
                            );
                          }}
                        >
                          保存
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        ...(comment.tags?.includes("spec") ? { maxHeight: 600, overflow: "auto" } : {}),
                      }}
                      dangerouslySetInnerHTML={{
                        __html: comment.content
                          .replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;")
                          .replace(/"/g, "&quot;")
                          .replace(/(https?:\/\/[^\s&<>"')\]]+)/g,
                            '<a href="$1" target="_blank" rel="noopener" style="color: #90caf9">$1</a>'
                          ),
                      }}
                    />
                  )}

                  {/* アクション行 */}
                  {editingCommentId !== comment.id && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
                    {/* タグ付与トグル */}
                    {TAG_DEFS.map((t) => {
                      const active = (comment.tags || []).includes(t.value);
                      return (
                        <Tooltip key={t.value} title={`${t.label}タグを${active ? "外す" : "付ける"}`}>
                          <Chip
                            label={t.label}
                            size="small"
                            variant={active ? "filled" : "outlined"}
                            color={active ? t.color : "default"}
                            onClick={() => handleToggleTag(comment, t.value)}
                            sx={{ cursor: "pointer" }}
                          />
                        </Tooltip>
                      );
                    })}

                    {/* 未投稿の手動/AI コメントのアクション */}
                    {comment.source !== "synced" && !comment.posted_at && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: "auto" }}>
                        <Tooltip title="編集">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditingCommentId(comment.id);
                              setEditContent(comment.content);
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="削除">
                          <IconButton
                            size="small"
                            color="error"
                            disabled={deletingCommentId === comment.id}
                            onClick={() => {
                              if (window.confirm("このコメントを削除しますか？")) {
                                setDeletingCommentId(comment.id);
                                deleteMutation.mutate(comment.id, {
                                  onSuccess: () => setSnackMessage("コメントを削除しました"),
                                  onError: () => setSnackMessage("削除に失敗しました"),
                                  onSettled: () => setDeletingCommentId(null),
                                });
                              }
                            }}
                          >
                            {deletingCommentId === comment.id ? <CircularProgress size={14} /> : <DeleteIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={postingCommentId === comment.id ? <CircularProgress size={12} /> : <SendIcon />}
                          disabled={postingCommentId === comment.id}
                          onClick={() => {
                            setPostingCommentId(comment.id);
                            handlePostToBacklog(comment.id);
                          }}
                        >
                          {postTarget} に投稿
                        </Button>
                      </Box>
                    )}
                  </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </AccordionDetails>
      </Accordion>

      {/* コメント作成ダイアログ */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          コメント作成
          <IconButton
            size="small"
            onClick={(e: { currentTarget: HTMLElement }) => setCommentHelpEl(e.currentTarget)}
            sx={{ p: 0.25, color: "text.disabled" }}
          >
            <HelpOutlineIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Popover
            open={!!commentHelpEl}
            anchorEl={commentHelpEl}
            onClose={() => setCommentHelpEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            slotProps={{ paper: { sx: { p: 2, maxWidth: 360 } } }}
          >
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              コメントの投稿フロー
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              1. 「DB保存のみ」→ このシステムのDBにのみ保存されます。{postTarget} には反映されません。保存後、コメント欄で内容を確認してから「{postTarget} に投稿」できます。
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              2. 「保存して投稿」→ DB保存と同時に {postTarget} のチケットにコメントとして投稿されます。投稿後は変更できません。
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ※ タグ（方針書・PR等）を付けると、コメント一覧でフィルタ表示や分類が可能になります。
            </Typography>
          </Popover>
        </DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            minRows={8}
            maxRows={20}
            placeholder="コメント内容を入力..."
            value={newContent}
            onChange={(e: { target: { value: string } }) => setNewContent(e.target.value)}
            sx={{ mt: 1 }}
          />
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              タグ
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              {TAG_DEFS.map((t) => (
                <FormControlLabel
                  key={t.value}
                  control={
                    <Checkbox
                      checked={newTags.includes(t.value)}
                      onChange={(e: { target: { checked: boolean } }) => {
                        if (e.target.checked) {
                          setNewTags([...newTags, t.value]);
                        } else {
                          setNewTags(newTags.filter((tag: string) => tag !== t.value));
                        }
                      }}
                      size="small"
                    />
                  }
                  label={t.label}
                />
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>キャンセル</Button>
          <Button
            variant="outlined"
            disabled={!newContent.trim() || createMutation.isPending}
            onClick={() => handleCreateComment(false)}
          >
            DB保存のみ
          </Button>
          <Button
            variant="contained"
            disabled={!newContent.trim() || createMutation.isPending || postMutation.isPending}
            startIcon={(createMutation.isPending || postMutation.isPending) ? <CircularProgress size={14} /> : <SendIcon />}
            onClick={() => handleCreateComment(true)}
          >
            保存して投稿
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackMessage}
        autoHideDuration={3000}
        onClose={() => setSnackMessage("")}
        message={snackMessage}
      />
    </Box>
  );
}
