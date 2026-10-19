import AddCommentIcon from "@mui/icons-material/AddComment";
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
import GradingIcon from "@mui/icons-material/Grading";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import SearchIcon from "@mui/icons-material/Search";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import MarkChatReadIcon from "@mui/icons-material/MarkChatRead";
import SendIcon from "@mui/icons-material/Send";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Popover,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { TicketComment } from "../../api/types";
import QaItemsView from "../../components/QaItemsView";
import {
  useCreateComment,
  useDeleteComment,
  usePostCommentToBacklog,
  useUpdateComment,
  useUpdateCommentTags,
} from "../../hooks/useTicketDetail";
import { useViewStore } from "../../stores/viewStore";
import type { TicketDetail } from "../../api/types";

interface Props {
  ticket: TicketDetail;
  ticketId: number;
  /** 画面下部のスナックバーに出すメッセージ */
  setSnackMessage: (message: string) => void;
}

const TAG_DEFS: { value: string; label: string; color: "info" | "success" | "warning" | "error" | "secondary"; icon: React.ReactElement }[] = [
  // 前半は作業順（TicketDetailPage のボタンの ACTION_ORDER と揃える）。
  // 後半は AI 生成に紐づかない手動タグ。
  { value: "survey", label: "調査報告書", color: "info", icon: <SearchIcon fontSize="inherit" /> },
  { value: "spec", label: "方針書", color: "info", icon: <DescriptionIcon fontSize="inherit" /> },
  { value: "plan", label: "実装計画書", color: "info", icon: <GradingIcon fontSize="inherit" /> },
  { value: "record", label: "実行記録", color: "success", icon: <HistoryEduIcon fontSize="inherit" /> },
  { value: "qa", label: "QA項目", color: "success", icon: <FactCheckIcon fontSize="inherit" /> },
  { value: "completion", label: "完了報告", color: "success", icon: <MarkChatReadIcon fontSize="inherit" /> },
  { value: "pr", label: "PR", color: "success", icon: <CodeIcon fontSize="inherit" /> },
  { value: "report", label: "報告書", color: "secondary", icon: <AssignmentTurnedInIcon fontSize="inherit" /> },
  { value: "decision", label: "決定事項", color: "warning", icon: <GavelIcon fontSize="inherit" /> },
  { value: "blocker", label: "ブロッカー", color: "error", icon: <ReportProblemIcon fontSize="inherit" /> },
];

function getTagDef(tag: string) {
  return TAG_DEFS.find((t) => t.value === tag);
}

// AI 生成ボタン（方針書・QA以外の4種別）。kind は backend の generate/<kind>/ と一致。

/** コメント欄: タグでの絞り込み・作成・編集・削除・タグ付け・Backlog / Jira への投稿 */
export default function CommentSection({ ticket, ticketId, setSnackMessage }: Props) {
  const [searchParams] = useSearchParams();
  const postMutation = usePostCommentToBacklog(ticketId);
  const tagsMutation = useUpdateCommentTags(ticketId);
  const createMutation = useCreateComment(ticketId);
  const deleteMutation = useDeleteComment(ticketId);
  const editMutation = useUpdateComment(ticketId);

  const { defaultCommentTag } = useViewStore();
  const initialTag = searchParams.get("tag");
  const [tagFilter, setTagFilter] = useState<string | null>(
    initialTag && TAG_DEFS.some((t) => t.value === initialTag) ? initialTag : defaultCommentTag
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [commentHelpEl, setCommentHelpEl] = useState<HTMLElement | null>(null);
  const [commentSectionHelpEl, setCommentSectionHelpEl] = useState<HTMLElement | null>(null);
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
  const [postingCommentId, setPostingCommentId] = useState<number | null>(null);

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
    <>
      {/* コメント */}
      <Accordion defaultExpanded sx={{ bgcolor: "background.paper" }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ChatIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={600}>
              コメント ({ticket.comments?.length ?? 0})
            </Typography>
            {/* 見出し全体が button なので、入れ子の button にならないよう span で描画する */}
            <IconButton
              component="span"
              size="small"
              aria-label="コメントタグについて"
              onClick={(e: React.MouseEvent<HTMLElement>) => {
                e.stopPropagation();
                setCommentSectionHelpEl(e.currentTarget);
              }}
              sx={{ p: 0.25, color: "text.disabled" }}
            >
              <HelpOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </AccordionSummary>
        {/* 見出しの外に置く（ポップアップ内のクリックが見出しの開閉に伝わらないように） */}
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
              <Chip label={t.label} size="small" color={t.color} icon={t.icon} />
              <Typography variant="body2" color="text.secondary">
                {t.value === "spec" && "— 実装方針書。AI生成または手動作成"}
                {t.value === "pr" && "— PR・実装リンクの記録"}
                {t.value === "survey" && "— 調査報告書。原因調査の結果と対処案。AI生成または手動作成"}
                {t.value === "plan" && "— 実装計画書。変更対象と手順。AI生成または手動作成"}
                {t.value === "record" && "— 実行記録。実施内容の記録。AI生成または手動作成"}
                {t.value === "qa" && "— QA項目。テスト項目一覧。AI生成（Excelダウンロード可）"}
                {t.value === "completion" && "— 完了報告。依頼者への完了報告ドラフト。AI生成または手動作成"}
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
                          icon={def.icon}
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
                  ) : comment.tags?.includes("qa") ? (
                    // QA コメントの中身は生の JSON なので、そのまま出さず表に整形する
                    <QaItemsView content={comment.content} />
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
    </>
  );
}
