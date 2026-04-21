import AddIcon from "@mui/icons-material/Add";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import PersonIcon from "@mui/icons-material/Person";
import SyncIcon from "@mui/icons-material/Sync";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Popover,
  Select,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { browseDirs } from "../api/client";
import type { BacklogSpace, BacklogSpaceInput, CodeRepository, CodeRepositoryInput, JiraSpace, JiraSpaceInput } from "../api/types";
import {
  useCreateExcludedStatus,
  useDeleteExcludedStatus,
  useExcludedStatuses,
} from "../hooks/useExcludedStatuses";
import { useProjects } from "../hooks/useProjects";
import { useStatusNames } from "../hooks/useStatusNames";
import { useToggleMyself, useUsers } from "../hooks/useUsers";
import {
  useMilestones,
  useUpdateMilestone,
} from "../hooks/useMilestones";
import {
  useCreateRepository,
  useDeleteRepository,
  useRepositories,
  useUpdateRepository,
} from "../hooks/useRepositories";
import {
  useCreateSpace,
  useDeleteSpace,
  useSpaces,
  useSyncSpace,
  useUpdateSpace,
} from "../hooks/useSpaces";
import {
  useCreateJiraSpace,
  useDeleteJiraSpace,
  useSyncJiraSpace,
  useJiraSpaces,
  useUpdateJiraSpace,
} from "../hooks/useJiraSpaces";
import {
  useTicketTags,
  useCreateTicketTag,
  useUpdateTicketTag,
  useDeleteTicketTag,
} from "../hooks/useTicketTags";
import { DEFAULT_BUFFER_CONFIG, useViewStore } from "../stores/viewStore";

const emptyForm: BacklogSpaceInput = {
  space_key: "",
  domain: "backlog.jp",
  api_key: "",
};

const emptyJiraForm: JiraSpaceInput = {
  site_name: "",
  base_url: "",
  user_email: "",
  api_token: "",
};

const COMMENT_TAG_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "すべて（フィルターなし）" },
  { value: "spec", label: "方針書" },
  { value: "pr", label: "PR" },
  { value: "report", label: "報告書" },
  { value: "decision", label: "決定事項" },
  { value: "blocker", label: "ブロッカー" },
];

/**
 * 日付入力ヘルパー: 数字のみ入力 → YYYY/MM/DD 形式に自動フォーマット
 * 8桁揃ったら YYYY-MM-DD として onCommit を呼ぶ
 */
function DateInput({
  value,
  onCommit,
  sx,
}: {
  value: string | null;
  onCommit: (date: string | null) => void;
  sx?: object;
}) {
  // 表示用: YYYY-MM-DD → YYYY/MM/DD
  const toDisplay = (v: string | null) => (v ? v.replace(/-/g, "/") : "");
  const [text, setText] = React.useState(toDisplay(value));
  // 親の value が変わったら同期
  React.useEffect(() => setText(toDisplay(value)), [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    // 自動スラッシュ挿入
    let display = raw;
    if (raw.length > 4) display = raw.slice(0, 4) + "/" + raw.slice(4);
    if (raw.length > 6) display = raw.slice(0, 4) + "/" + raw.slice(4, 6) + "/" + raw.slice(6);
    setText(display);

    if (raw.length === 8) {
      const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      onCommit(iso);
    }
  };

  const handleBlur = () => {
    const raw = text.replace(/\D/g, "");
    if (raw.length === 0) {
      setText("");
      onCommit(null);
    } else if (raw.length === 8) {
      const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      setText(toDisplay(iso));
      onCommit(iso);
    } else {
      // 不完全 → 元に戻す
      setText(toDisplay(value));
    }
  };

  return (
    <TextField
      size="small"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="YYYY/MM/DD"
      sx={{ width: 130, ...sx }}
      slotProps={{ htmlInput: { maxLength: 10 } }}
    />
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const { defaultCommentTag, setDefaultCommentTag, colorMode, setColorMode, bufferConfig, setBufferConfig } = useViewStore();
  const { data: spaces, isLoading } = useSpaces();
  const { data: excludedStatuses } = useExcludedStatuses();
  const { data: projects } = useProjects();
  const createExcludedMutation = useCreateExcludedStatus();
  const deleteExcludedMutation = useDeleteExcludedStatus();
  const [newStatus, setNewStatus] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const [myselfSpaceId, setMyselfSpaceId] = useState<number | "">("");
  const { data: spaceUsers } = useUsers(myselfSpaceId ? `b:${myselfSpaceId}` : null);
  const toggleMyselfMutation = useToggleMyself();
  const { data: statusNames } = useStatusNames(selectedProjectId || null);
  const createMutation = useCreateSpace();
  const updateMutation = useUpdateSpace();
  const deleteMutation = useDeleteSpace();
  const syncMutation = useSyncSpace();

  // Jira スペース管理
  const { data: jiraSpaces } = useJiraSpaces();
  const createJiraMutation = useCreateJiraSpace();
  const updateJiraMutation = useUpdateJiraSpace();
  const deleteJiraMutation = useDeleteJiraSpace();
  const [jiraDialogOpen, setJiraDialogOpen] = useState(false);
  const [editingJiraId, setEditingJiraId] = useState<number | null>(null);
  const [jiraForm, setJiraForm] = useState<JiraSpaceInput>(emptyJiraForm);
  const syncJiraMutation = useSyncJiraSpace();
  const [deleteJiraConfirm, setDeleteJiraConfirm] = useState<JiraSpace | null>(null);

  // マイルストーン管理
  const { data: milestones } = useMilestones();
  const updateMilestoneMutation = useUpdateMilestone();
  const [msFilterProject, setMsFilterProject] = useState<number | "">("");

  const handleJiraOpen = (space?: JiraSpace) => {
    if (space) {
      setEditingJiraId(space.id);
      setJiraForm({
        site_name: space.site_name,
        base_url: space.base_url,
        user_email: space.user_email,
        api_token: "",
      });
    } else {
      setEditingJiraId(null);
      setJiraForm(emptyJiraForm);
    }
    setJiraDialogOpen(true);
  };

  const handleJiraSave = () => {
    if (editingJiraId) {
      const data: Partial<JiraSpaceInput> = {
        site_name: jiraForm.site_name,
        base_url: jiraForm.base_url,
        user_email: jiraForm.user_email,
      };
      if (jiraForm.api_token) {
        data.api_token = jiraForm.api_token;
      }
      updateJiraMutation.mutate(
        { id: editingJiraId, data },
        { onSuccess: () => setJiraDialogOpen(false) }
      );
    } else {
      createJiraMutation.mutate(jiraForm, {
        onSuccess: () => setJiraDialogOpen(false),
      });
    }
  };

  const handleJiraDelete = () => {
    if (deleteJiraConfirm) {
      deleteJiraMutation.mutate(deleteJiraConfirm.id, {
        onSuccess: () => setDeleteJiraConfirm(null),
      });
    }
  };

  // リポジトリ管理
  const { data: repositories } = useRepositories();
  const createRepoMutation = useCreateRepository();
  const updateRepoMutation = useUpdateRepository();
  const deleteRepoMutation = useDeleteRepository();
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [editingRepoId, setEditingRepoId] = useState<number | null>(null);
  const emptyRepoForm: CodeRepositoryInput = { project: 0, name: "", local_path: "" };
  const [repoForm, setRepoForm] = useState<CodeRepositoryInput>(emptyRepoForm);
  const [deleteRepoConfirm, setDeleteRepoConfirm] = useState<CodeRepository | null>(null);

  // タグ管理
  const { data: ticketTags } = useTicketTags();
  const createTagMutation = useCreateTicketTag();
  const updateTagMutation = useUpdateTicketTag();
  const deleteTagMutation = useDeleteTicketTag();
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("default");

  // ヘルプポップオーバー
  const [helpAnchor, setHelpAnchor] = useState<{ key: string; el: HTMLElement } | null>(null);

  // ディレクトリブラウザ
  const [browseDirOpen, setBrowseDirOpen] = useState(false);
  const [browseCurrentPath, setBrowseCurrentPath] = useState("");
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [browseDirList, setBrowseDirList] = useState<string[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const loadDirs = (path?: string) => {
    setBrowseLoading(true);
    browseDirs(path)
      .then((res: { data: { current: string; parent: string | null; dirs: string[] } }) => {
        setBrowseCurrentPath(res.data.current);
        setBrowseParent(res.data.parent);
        setBrowseDirList(res.data.dirs);
      })
      .catch(() => {
        setBrowseDirList([]);
      })
      .finally(() => setBrowseLoading(false));
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BacklogSpaceInput>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<BacklogSpace | null>(null);

  const handleOpen = (space?: BacklogSpace) => {
    if (space) {
      setEditingId(space.id);
      setForm({
        space_key: space.space_key,
        domain: space.domain,
        api_key: "",
      });
    } else {
      setEditingId(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      const data: Partial<BacklogSpaceInput> = {
        space_key: form.space_key,
        domain: form.domain,
      };
      if (form.api_key) {
        data.api_key = form.api_key;
      }
      updateMutation.mutate(
        { id: editingId, data },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createMutation.mutate(form, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const handleDelete = () => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm.id, {
        onSuccess: () => setDeleteConfirm(null),
      });
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h5" fontWeight={700}>設定</Typography>
      <Tabs
        value={activeTab}
        onChange={(_: unknown, v: number) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 1 }}
      >
        <Tab label="接続設定" />
        <Tab label="プロジェクト設定" />
        <Tab label="マイルストーン" />
        <Tab label="タグ" />
        <Tab label="バッファ" />
        <Tab label="表示設定" />
      </Tabs>

      {/* === タブ0: 接続設定 === */}
      {activeTab === 0 && (<>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Backlog スペース設定
          </Typography>
          <IconButton
            size="small"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => setHelpAnchor({ key: "space", el: e.currentTarget })}
            sx={{ color: "text.disabled" }}
          >
            <HelpOutlineIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Popover
            open={helpAnchor?.key === "space"}
            anchorEl={helpAnchor?.el}
            onClose={() => setHelpAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            slotProps={{ paper: { sx: { p: 2, maxWidth: 400 } } }}
          >
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Backlog スペースとは？
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Backlog の「スペース」単位で接続情報を登録します。複数の現場（スペース）を横断管理できます。
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>スペースキー:</strong> Backlog URL の先頭部分（例: xxx.backlog.jp の xxx）
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>ドメイン:</strong> backlog.jp または backlog.com（契約プランによる）
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>API キー:</strong> Backlog &gt; 個人設定 &gt; API で発行。登録後は同期ボタンでデータ取得。
            </Typography>
          </Popover>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpen()}
        >
          スペース追加
        </Button>
      </Box>

      {spaces?.length === 0 && (
        <Alert severity="info">
          Backlog スペースが登録されていません。「スペース追加」から接続情報を登録してください。
        </Alert>
      )}

      {spaces && spaces.length > 0 && (
        <Card>
          <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>スペース</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ドメイン</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>API キー</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>自動同期</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>最終同期</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {spaces.map((space) => (
                    <TableRow key={space.id} hover>
                      <TableCell>
                        <Typography fontWeight={600}>{space.space_key}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={space.domain} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                          {space.api_key_masked}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={space.sync_interval_minutes}
                          onChange={(e) => {
                            updateMutation.mutate({
                              id: space.id,
                              data: { sync_interval_minutes: e.target.value as number },
                            });
                          }}
                          sx={{ minWidth: 100, fontSize: 13 }}
                        >
                          <MenuItem value={0}>手動のみ</MenuItem>
                          <MenuItem value={30}>30分</MenuItem>
                          <MenuItem value={60}>1時間</MenuItem>
                          <MenuItem value={120}>2時間</MenuItem>
                          <MenuItem value={240}>4時間</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {space.last_synced_at
                          ? new Date(space.last_synced_at).toLocaleString("ja-JP")
                          : "未同期"}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="このスペースを同期">
                          <IconButton
                            size="small"
                            onClick={() => syncMutation.mutate(space.id)}
                            disabled={syncMutation.isPending}
                          >
                            {syncMutation.isPending ? (
                              <CircularProgress size={18} />
                            ) : (
                              <SyncIcon />
                            )}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="編集">
                          <IconButton size="small" onClick={() => handleOpen(space)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="削除">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteConfirm(space)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId ? "スペース編集" : "スペース追加"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "16px !important" }}>
          <TextField
            label="スペースキー"
            placeholder="例: my-company"
            helperText="https://xxx.backlog.jp の xxx 部分"
            value={form.space_key}
            onChange={(e) => setForm({ ...form, space_key: e.target.value })}
            required
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>ドメイン</InputLabel>
            <Select
              value={form.domain}
              label="ドメイン"
              onChange={(e) =>
                setForm({
                  ...form,
                  domain: e.target.value as "backlog.jp" | "backlog.com",
                })
              }
            >
              <MenuItem value="backlog.jp">backlog.jp</MenuItem>
              <MenuItem value="backlog.com">backlog.com</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="API キー"
            type="password"
            placeholder={editingId ? "変更する場合のみ入力" : ""}
            helperText="Backlog の個人設定 → API から発行"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            required={!editingId}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              !form.space_key ||
              (!editingId && !form.api_key) ||
              createMutation.isPending ||
              updateMutation.isPending
            }
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <CircularProgress size={20} />
            ) : editingId ? (
              "更新"
            ) : (
              "追加"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>スペース削除の確認</DialogTitle>
        <DialogContent>
          <Typography>
            <strong>{deleteConfirm?.space_key}</strong> を削除しますか？
            このスペースに紐づく全てのプロジェクト・チケットデータも削除されます。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>キャンセル</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            削除
          </Button>
        </DialogActions>
      </Dialog>

      {/* Jira スペース設定 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Jira スペース設定
          </Typography>
          <IconButton
            size="small"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => setHelpAnchor({ key: "jira", el: e.currentTarget })}
            sx={{ color: "text.disabled" }}
          >
            <HelpOutlineIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Popover
            open={helpAnchor?.key === "jira"}
            anchorEl={helpAnchor?.el}
            onClose={() => setHelpAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            slotProps={{ paper: { sx: { p: 2, maxWidth: 400 } } }}
          >
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Jira スペースとは？
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Jira（Atlassian Cloud）の接続情報を登録します。複数サイトを横断管理できます。
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>サイト名:</strong> 管理用の識別名（例: mycompany）
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>ベース URL:</strong> Jira サイトの URL（例: https://mycompany.atlassian.net）
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>メールアドレス:</strong> Jira ログイン用のメールアドレス
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>API トークン:</strong> Atlassian &gt; アカウント設定 &gt; セキュリティ &gt; API トークン で発行
            </Typography>
          </Popover>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleJiraOpen()}
        >
          Jira サイト追加
        </Button>
      </Box>

      {jiraSpaces?.length === 0 && (
        <Alert severity="info">
          Jira サイトが登録されていません。「Jira サイト追加」から接続情報を登録してください。
        </Alert>
      )}

      {jiraSpaces && jiraSpaces.length > 0 && (
        <Card>
          <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>サイト名</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>URL</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>メール</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>API トークン</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>最終同期</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jiraSpaces.map((space) => (
                    <TableRow key={space.id} hover>
                      <TableCell>
                        <Typography fontWeight={600}>{space.site_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {space.base_url}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {space.user_email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                          {space.api_token_masked}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {space.last_synced_at
                            ? new Date(space.last_synced_at).toLocaleString("ja-JP")
                            : "未同期"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="このサイトを同期">
                          <IconButton
                            size="small"
                            onClick={() => syncJiraMutation.mutate(space.id)}
                            disabled={syncJiraMutation.isPending}
                          >
                            {syncJiraMutation.isPending ? (
                              <CircularProgress size={18} />
                            ) : (
                              <SyncIcon />
                            )}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="編集">
                          <IconButton size="small" onClick={() => handleJiraOpen(space)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="削除">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteJiraConfirm(space)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Jira Add / Edit Dialog */}
      <Dialog open={jiraDialogOpen} onClose={() => setJiraDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingJiraId ? "Jira サイト編集" : "Jira サイト追加"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "16px !important" }}>
          <TextField
            label="サイト名"
            placeholder="例: mycompany"
            helperText="管理用の識別名"
            value={jiraForm.site_name}
            onChange={(e) => setJiraForm({ ...jiraForm, site_name: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="ベース URL"
            placeholder="例: https://mycompany.atlassian.net"
            helperText="Jira サイトの URL"
            value={jiraForm.base_url}
            onChange={(e) => setJiraForm({ ...jiraForm, base_url: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="メールアドレス"
            type="email"
            placeholder="例: user@example.com"
            helperText="Jira ログイン用のメールアドレス"
            value={jiraForm.user_email}
            onChange={(e) => setJiraForm({ ...jiraForm, user_email: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="API トークン"
            type="password"
            placeholder={editingJiraId ? "変更する場合のみ入力" : ""}
            helperText="Atlassian アカウント設定 → セキュリティ → API トークン で発行"
            value={jiraForm.api_token}
            onChange={(e) => setJiraForm({ ...jiraForm, api_token: e.target.value })}
            required={!editingJiraId}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJiraDialogOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={handleJiraSave}
            disabled={
              !jiraForm.site_name ||
              !jiraForm.base_url ||
              !jiraForm.user_email ||
              (!editingJiraId && !jiraForm.api_token) ||
              createJiraMutation.isPending ||
              updateJiraMutation.isPending
            }
          >
            {createJiraMutation.isPending || updateJiraMutation.isPending ? (
              <CircularProgress size={20} />
            ) : editingJiraId ? (
              "更新"
            ) : (
              "追加"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Jira Delete Confirmation */}
      <Dialog open={!!deleteJiraConfirm} onClose={() => setDeleteJiraConfirm(null)}>
        <DialogTitle>Jira サイト削除の確認</DialogTitle>
        <DialogContent>
          <Typography>
            <strong>{deleteJiraConfirm?.site_name}</strong> を削除しますか？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteJiraConfirm(null)}>キャンセル</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleJiraDelete}
            disabled={deleteJiraMutation.isPending}
          >
            削除
          </Button>
        </DialogActions>
      </Dialog>

      </>)}

      {/* === タブ1: プロジェクト設定 === */}
      {activeTab === 1 && (<>
      {/* 除外ステータス設定 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="h6" fontWeight={700}>
          除外ステータス設定
        </Typography>
        <IconButton
          size="small"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => setHelpAnchor({ key: "excluded", el: e.currentTarget })}
          sx={{ color: "text.disabled" }}
        >
          <HelpOutlineIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <Popover
          open={helpAnchor?.key === "excluded"}
          anchorEl={helpAnchor?.el}
          onClose={() => setHelpAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{ paper: { sx: { p: 2, maxWidth: 400 } } }}
        >
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            除外ステータスとは？
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            ダッシュボードやチケット一覧の集計時に「完了」扱いとするステータスを指定します。
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Backlog 標準の「完了」以外に、プロジェクト固有の完了系ステータス（例: 対応不要、保留、クローズ等）がある場合に登録してください。
          </Typography>
          <Typography variant="body2" color="text.secondary">
            除外されたステータスのチケットは、未完了件数やスコア算出の対象外になります。
          </Typography>
        </Popover>
      </Box>

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", gap: 1, mb: 2, alignItems: "center" }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>プロジェクト</InputLabel>
              <Select
                value={selectedProjectId}
                label="プロジェクト"
                onChange={(e) => {
                  setSelectedProjectId(e.target.value as number | "");
                  setNewStatus("");
                }}
              >
                <MenuItem value="">選択してください</MenuItem>
                {(projects ?? []).map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.project_key}: {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>ステータス</InputLabel>
              <Select
                value={newStatus}
                label="ステータス"
                onChange={(e) => setNewStatus(e.target.value as string)}
                disabled={!selectedProjectId}
              >
                <MenuItem value="">選択してください</MenuItem>
                {(statusNames ?? []).map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              disabled={!selectedProjectId || !newStatus || createExcludedMutation.isPending}
              onClick={() => {
                createExcludedMutation.mutate(
                  { project: selectedProjectId as number, statusName: newStatus },
                  { onSuccess: () => setNewStatus("") },
                );
              }}
            >
              追加
            </Button>
          </Box>

          {excludedStatuses && excludedStatuses.length > 0 ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {excludedStatuses.map((s) => (
                <Chip
                  key={s.id}
                  label={`${s.project_key}: ${s.status_name}`}
                  onDelete={() => deleteExcludedMutation.mutate(s.id)}
                  variant="outlined"
                />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              除外ステータスが未登録です
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* コードリポジトリ設定 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="h6" fontWeight={700}>
            コードリポジトリ
          </Typography>
          <IconButton
            size="small"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => setHelpAnchor({ key: "repo", el: e.currentTarget })}
            sx={{ color: "text.disabled" }}
          >
            <HelpOutlineIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Popover
            open={helpAnchor?.key === "repo"}
            anchorEl={helpAnchor?.el}
            onClose={() => setHelpAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            slotProps={{ paper: { sx: { p: 2, maxWidth: 420 } } }}
          >
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              コードリポジトリとは？
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              AI 方針書生成時に実装コードを参照するための設定です。プロジェクトとローカルディレクトリを紐づけます。
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>ローカルパス:</strong> ソースコードがあるディレクトリの絶対パス。「参照」ボタンで選択可。
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>マッチ属性 / マッチ値:</strong> 1つのプロジェクトで複数アプリを管理している場合に使用。チケットの属性の値で振り分けます。空欄なら無条件マッチ。カスタム属性のほか、「カテゴリ」「マイルストーン」も使用可能です。
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>例:</strong> マッチ属性=「対象システム」、マッチ値=「フロントエンド」→ 該当チケットでのみこのリポジトリを参照。
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, p: 1, bgcolor: "action.hover", borderRadius: 1 }}>
              <strong>複数リポジトリの紐づけ:</strong> フロントとAPIなど複数リポジトリがある場合、同じマッチ値で複数登録できます。AI は該当する全リポジトリのコードを参照して方針書を生成します。
            </Typography>
          </Popover>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingRepoId(null);
            setRepoForm(emptyRepoForm);
            setRepoDialogOpen(true);
          }}
        >
          リポジトリ追加
        </Button>
      </Box>

      {repositories && repositories.length > 0 ? (
        <Card>
          <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>プロジェクト</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>リポジトリ名</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ローカルパス</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>マッチ条件</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>状態</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {repositories.map((repo: CodeRepository) => (
                    <TableRow key={repo.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {repo.project_key}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {repo.name}
                        {repo.description && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {repo.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {repo.local_path}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {repo.match_field ? (
                          <Chip
                            label={`${repo.match_field} = ${repo.match_value}`}
                            size="small"
                            variant="outlined"
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">無条件</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={repo.is_active ? "有効" : "無効"}
                          size="small"
                          color={repo.is_active ? "success" : "default"}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="編集">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditingRepoId(repo.id);
                              setRepoForm({
                                project: repo.project,
                                name: repo.name,
                                local_path: repo.local_path,
                                match_field: repo.match_field,
                                match_value: repo.match_value,
                                description: repo.description,
                                is_active: repo.is_active,
                              });
                              setRepoDialogOpen(true);
                            }}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="削除">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteRepoConfirm(repo)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      ) : (
        <Alert severity="info">
          コードリポジトリが登録されていません。方針書生成時にソースコードを参照するには、リポジトリを追加してください。
        </Alert>
      )}

      {/* リポジトリ追加/編集ダイアログ */}
      <Dialog open={repoDialogOpen} onClose={() => setRepoDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingRepoId ? "リポジトリ編集" : "リポジトリ追加"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "16px !important" }}>
          <FormControl fullWidth required>
            <InputLabel>プロジェクト</InputLabel>
            <Select
              value={repoForm.project || ""}
              label="プロジェクト"
              onChange={(e: { target: { value: unknown } }) => setRepoForm({ ...repoForm, project: e.target.value as number })}
            >
              {(projects ?? []).map((p: { id: number; project_key: string; name: string }) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.project_key}: {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="リポジトリ名"
            placeholder="例: my-app"
            value={repoForm.name}
            onChange={(e: { target: { value: string } }) => setRepoForm({ ...repoForm, name: e.target.value })}
            required
            fullWidth
          />
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
            <TextField
              label="ローカルパス"
              placeholder="例: /home/user/projects/my-app"
              helperText="ソースコードがあるローカルディレクトリの絶対パス"
              value={repoForm.local_path}
              onChange={(e: { target: { value: string } }) => setRepoForm({ ...repoForm, local_path: e.target.value })}
              required
              fullWidth
            />
            <Button
              variant="outlined"
              sx={{ mt: "8px", whiteSpace: "nowrap", minWidth: "auto" }}
              startIcon={<FolderOpenIcon />}
              onClick={() => {
                loadDirs(repoForm.local_path || undefined);
                setBrowseDirOpen(true);
              }}
            >
              参照
            </Button>
          </Box>
          <TextField
            label="マッチ属性名（任意）"
            placeholder="例: 対象システム"
            helperText="チケットのカスタム属性名。空欄なら無条件でこのリポジトリを使用"
            value={repoForm.match_field ?? ""}
            onChange={(e: { target: { value: string } }) => setRepoForm({ ...repoForm, match_field: e.target.value || null })}
            fullWidth
          />
          <TextField
            label="マッチ値（任意）"
            placeholder="例: my-app"
            helperText="上記属性の値がこれと一致するチケットでこのリポジトリを使用"
            value={repoForm.match_value ?? ""}
            onChange={(e: { target: { value: string } }) => setRepoForm({ ...repoForm, match_value: e.target.value || null })}
            fullWidth
          />
          <TextField
            label="説明（任意）"
            placeholder="例: .NET / SQL Server"
            value={repoForm.description ?? ""}
            onChange={(e: { target: { value: string } }) => setRepoForm({ ...repoForm, description: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRepoDialogOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (editingRepoId) {
                updateRepoMutation.mutate(
                  { id: editingRepoId, data: repoForm },
                  { onSuccess: () => setRepoDialogOpen(false) },
                );
              } else {
                createRepoMutation.mutate(repoForm, {
                  onSuccess: () => setRepoDialogOpen(false),
                });
              }
            }}
            disabled={
              !repoForm.project || !repoForm.name || !repoForm.local_path ||
              createRepoMutation.isPending || updateRepoMutation.isPending
            }
          >
            {createRepoMutation.isPending || updateRepoMutation.isPending ? (
              <CircularProgress size={20} />
            ) : editingRepoId ? "更新" : "追加"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* リポジトリ削除確認 */}
      <Dialog open={!!deleteRepoConfirm} onClose={() => setDeleteRepoConfirm(null)}>
        <DialogTitle>リポジトリ削除の確認</DialogTitle>
        <DialogContent>
          <Typography>
            <strong>{deleteRepoConfirm?.name}</strong>（{deleteRepoConfirm?.project_key}）を削除しますか？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRepoConfirm(null)}>キャンセル</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (deleteRepoConfirm) {
                deleteRepoMutation.mutate(deleteRepoConfirm.id, {
                  onSuccess: () => setDeleteRepoConfirm(null),
                });
              }
            }}
            disabled={deleteRepoMutation.isPending}
          >
            削除
          </Button>
        </DialogActions>
      </Dialog>

      </>)}

      {/* === タブ2: マイルストーン === */}
      {activeTab === 2 && (<>
      <Typography variant="h6" fontWeight={700}>マイルストーン期間設定</Typography>

      <Box sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>プロジェクト</InputLabel>
          <Select
            value={msFilterProject}
            label="プロジェクト"
            onChange={(e) => setMsFilterProject(e.target.value as number | "")}
          >
            <MenuItem value="">すべて</MenuItem>
            {(projects ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.project_key}: {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Card>
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>プロジェクト</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>マイルストーン</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>開始日</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>終了日</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">並び順</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(milestones ?? [])
                  .filter((ms) => !msFilterProject || ms.project === msFilterProject)
                  .map((ms) => (
                  <TableRow key={ms.id}>
                    <TableCell>
                      <Typography variant="body2">{ms.project_key}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{ms.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <DateInput
                        value={ms.start_date}
                        onCommit={(date) =>
                          updateMilestoneMutation.mutate({
                            id: ms.id,
                            data: { start_date: date },
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <DateInput
                        value={ms.end_date}
                        onCommit={(date) =>
                          updateMilestoneMutation.mutate({
                            id: ms.id,
                            data: { end_date: date },
                          })
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number"
                        size="small"
                        value={ms.sort_order}
                        onChange={(e) =>
                          updateMilestoneMutation.mutate({
                            id: ms.id,
                            data: { sort_order: parseInt(e.target.value) || 0 },
                          })
                        }
                        sx={{ width: 80 }}
                        slotProps={{ htmlInput: { min: 0 } }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {(milestones ?? []).filter((ms) => !msFilterProject || ms.project === msFilterProject).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        マイルストーンがありません。同期を実行するとBacklogのマイルストーンが自動登録されます。
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      </>)}

      {/* === タブ3: タグ === */}
      {activeTab === 3 && (<>
      <Typography variant="h6" fontWeight={700}>次工程タグ</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        チケットに付与する次工程タグを管理します。
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}>
            <TextField
              label="タグ名"
              size="small"
              value={newTagName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTagName(e.target.value)}
              sx={{ minWidth: 200 }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>色</InputLabel>
              <Select
                value={newTagColor}
                label="色"
                onChange={(e) => setNewTagColor(e.target.value)}
              >
                <MenuItem value="default">グレー</MenuItem>
                <MenuItem value="primary">ブルー</MenuItem>
                <MenuItem value="info">ライトブルー</MenuItem>
                <MenuItem value="success">グリーン</MenuItem>
                <MenuItem value="warning">オレンジ</MenuItem>
                <MenuItem value="error">レッド</MenuItem>
                <MenuItem value="secondary">パープル</MenuItem>
              </Select>
            </FormControl>
            <Chip
              label={newTagName || "プレビュー"}
              color={newTagColor as "default" | "primary" | "info" | "success" | "warning" | "error" | "secondary"}
              size="small"
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              disabled={!newTagName.trim() || createTagMutation.isPending}
              onClick={() => {
                createTagMutation.mutate(
                  { name: newTagName.trim(), color: newTagColor },
                  { onSuccess: () => { setNewTagName(""); setNewTagColor("default"); } },
                );
              }}
            >
              追加
            </Button>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>タグ名</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>色</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>プレビュー</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>並び順</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ticketTags?.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell>{tag.name}</TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={tag.color}
                        onChange={(e) => {
                          updateTagMutation.mutate({ id: tag.id, data: { color: e.target.value } });
                        }}
                        sx={{ minWidth: 100, fontSize: 13 }}
                      >
                        <MenuItem value="default">グレー</MenuItem>
                        <MenuItem value="primary">ブルー</MenuItem>
                        <MenuItem value="info">ライトブルー</MenuItem>
                        <MenuItem value="success">グリーン</MenuItem>
                        <MenuItem value="warning">オレンジ</MenuItem>
                        <MenuItem value="error">レッド</MenuItem>
                        <MenuItem value="secondary">パープル</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={tag.name}
                        color={tag.color as "default" | "primary" | "info" | "success" | "warning" | "error" | "secondary"}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={tag.sort_order}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          updateTagMutation.mutate({ id: tag.id, data: { sort_order: Number(e.target.value) } });
                        }}
                        sx={{ width: 70 }}
                        slotProps={{ htmlInput: { min: 0 } }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => deleteTagMutation.mutate(tag.id)}
                        disabled={deleteTagMutation.isPending}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {(!ticketTags || ticketTags.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary">タグがまだ登録されていません</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      </>)}

      {/* === タブ5: 表示設定 === */}
      {activeTab === 5 && (<>

      {/* 自分紐づけ設定 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="h6" fontWeight={700}>
          自分紐づけ設定
        </Typography>
        <IconButton
          size="small"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => setHelpAnchor({ key: "myself", el: e.currentTarget })}
          sx={{ color: "text.disabled" }}
        >
          <HelpOutlineIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <Popover
          open={helpAnchor?.key === "myself"}
          anchorEl={helpAnchor?.el}
          onClose={() => setHelpAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{ paper: { sx: { p: 2, maxWidth: 400 } } }}
        >
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            自分紐づけとは？
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            各 Backlog スペースで自分に該当するユーザーを ON にします。複数スペースにまたがっている場合、それぞれで設定してください。
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ダッシュボードの「自分向け」ビューで、自分が担当者のチケットだけを絞り込めるようになります。
          </Typography>
        </Popover>
      </Box>

      <Card>
        <CardContent>
          <FormControl size="small" sx={{ minWidth: 220, mb: 2 }}>
            <InputLabel>現場を選択</InputLabel>
            <Select
              value={myselfSpaceId}
              label="現場を選択"
              onChange={(e) => setMyselfSpaceId(e.target.value as number | "")}
            >
              <MenuItem value="">選択してください</MenuItem>
              {(spaces ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.space_key}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {myselfSpaceId && spaceUsers && spaceUsers.length > 0 ? (
            <List dense disablePadding>
              {spaceUsers.map((user) => (
                <ListItem
                  key={user.id}
                  secondaryAction={
                    <Switch
                      checked={user.is_myself}
                      onChange={() =>
                        toggleMyselfMutation.mutate({
                          id: user.id,
                          is_myself: !user.is_myself,
                        })
                      }
                      disabled={toggleMyselfMutation.isPending}
                    />
                  }
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <PersonIcon
                      sx={{ color: user.is_myself ? "success.main" : "text.disabled" }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={user.name}
                    secondary={user.mail_address || user.user_id_str}
                  />
                  {user.is_myself && (
                    <Chip
                      icon={<CheckCircleIcon />}
                      label="自分"
                      size="small"
                      color="success"
                      variant="outlined"
                      sx={{ mr: 2 }}
                    />
                  )}
                </ListItem>
              ))}
            </List>
          ) : myselfSpaceId ? (
            <Typography variant="body2" color="text.secondary">
              ユーザーが見つかりません。先にスペースを同期してください。
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              現場を選択するとユーザー一覧が表示されます
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* コメント表示設定 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 3 }}>
        <Typography variant="h6" fontWeight={700}>
          コメント表示設定
        </Typography>
        <IconButton
          size="small"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => setHelpAnchor({ key: "display", el: e.currentTarget })}
          sx={{ color: "text.disabled" }}
        >
          <HelpOutlineIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <Popover
          open={helpAnchor?.key === "display"}
          anchorEl={helpAnchor?.el}
          onClose={() => setHelpAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{ paper: { sx: { p: 2, maxWidth: 400 } } }}
        >
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            コメント表示設定とは？
          </Typography>
          <Typography variant="body2" color="text.secondary">
            チケット詳細画面などの表示に関する個人設定です。ブラウザに保存され、他のユーザーには影響しません。
          </Typography>
        </Popover>
      </Box>

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="body1" fontWeight={600} sx={{ minWidth: 200 }}>
              コメント初期フィルター
            </Typography>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>デフォルトタグ</InputLabel>
              <Select
                value={defaultCommentTag ?? ""}
                label="デフォルトタグ"
                onChange={(e: { target: { value: string } }) => {
                  const val = e.target.value;
                  setDefaultCommentTag(val === "" ? null : val);
                }}
              >
                {COMMENT_TAG_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value ?? "__all__"} value={opt.value ?? ""}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            チケット詳細を開いた時にコメント欄に適用される初期フィルターです。URL のタグパラメータがある場合はそちらが優先されます。
          </Typography>
        </CardContent>
      </Card>

      {/* テーマ */}
      <Typography variant="h6" fontWeight={700} sx={{ mt: 3 }}>テーマ</Typography>

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="body1" fontWeight={600} sx={{ minWidth: 200 }}>
              カラーモード
            </Typography>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>カラーモード</InputLabel>
              <Select
                value={colorMode}
                label="カラーモード"
                onChange={(e: { target: { value: string } }) => {
                  setColorMode(e.target.value as "light" | "dark");
                }}
              >
                <MenuItem value="light">ライトモード</MenuItem>
                <MenuItem value="dark">ダークモード</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      </>)}

      {/* === タブ4: バッファ === */}
      {activeTab === 4 && (<>
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

      </>)}

      {/* ディレクトリブラウザ */}
      <Dialog open={browseDirOpen} onClose={() => setBrowseDirOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>ディレクトリ選択</DialogTitle>
        <DialogContent sx={{ px: 2, pb: 0 }}>
          <Typography
            variant="body2"
            sx={{ fontFamily: "monospace", bgcolor: "grey.100", px: 1.5, py: 1, borderRadius: 1, mb: 1, wordBreak: "break-all" }}
          >
            {browseCurrentPath}
          </Typography>
          {browseLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <List dense sx={{ maxHeight: 360, overflow: "auto" }}>
              {browseParent !== null && (
                <ListItemButton onClick={() => loadDirs(browseParent ?? undefined)}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <ArrowUpwardIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="上へ（親ディレクトリ）" primaryTypographyProps={{ variant: "body2" }} />
                </ListItemButton>
              )}
              {browseDirList.length === 0 ? (
                <ListItem>
                  <ListItemText
                    primary="サブディレクトリがありません"
                    primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                  />
                </ListItem>
              ) : (
                browseDirList.map((dir: string) => (
                  <ListItemButton
                    key={dir}
                    onClick={() => loadDirs(`${browseCurrentPath}/${dir}`)}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <FolderIcon fontSize="small" color="action" />
                    </ListItemIcon>
                    <ListItemText primary={dir} primaryTypographyProps={{ variant: "body2" }} />
                  </ListItemButton>
                ))
              )}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBrowseDirOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={() => {
              setRepoForm({ ...repoForm, local_path: browseCurrentPath });
              setBrowseDirOpen(false);
            }}
          >
            このフォルダを選択
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
