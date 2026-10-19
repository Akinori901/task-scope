import AddIcon from "@mui/icons-material/Add";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { browseDirs } from "../../api/client";
import type { CodeRepository, CodeRepositoryInput } from "../../api/types";
import { useCreateExcludedStatus, useDeleteExcludedStatus, useExcludedStatuses } from "../../hooks/useExcludedStatuses";
import { useProjects } from "../../hooks/useProjects";
import { useStatusNames } from "../../hooks/useStatusNames";
import {
  useCreateRepository,
  useDeleteRepository,
  useRepositories,
  useUpdateRepository,
} from "../../hooks/useRepositories";

interface Props {
  selectedProjectId: number | "";
  setSelectedProjectId: (id: number | "") => void;
}

/** プロジェクト設定タブ: 除外ステータスとコードリポジトリ（ディレクトリ選択ダイアログを含む） */
export default function ProjectTab({ selectedProjectId, setSelectedProjectId }: Props) {
  const { data: projects } = useProjects();
  const { data: excludedStatuses } = useExcludedStatuses();
  const createExcludedMutation = useCreateExcludedStatus();
  const deleteExcludedMutation = useDeleteExcludedStatus();
  const [newStatus, setNewStatus] = useState("");
  const { data: statusNames } = useStatusNames(selectedProjectId || null);

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

  return (
    <>
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
    </>
  );
}
