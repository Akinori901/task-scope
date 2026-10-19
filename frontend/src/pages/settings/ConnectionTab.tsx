import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
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
import type { BacklogSpace, BacklogSpaceInput, JiraSpace, JiraSpaceInput } from "../../api/types";
import {
  useCreateSpace,
  useDeleteSpace,
  useSpaces,
  useSyncSpace,
  useUpdateSpace,
} from "../../hooks/useSpaces";
import {
  useCreateJiraSpace,
  useDeleteJiraSpace,
  useSyncJiraSpace,
  useJiraSpaces,
  useUpdateJiraSpace,
} from "../../hooks/useJiraSpaces";

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

/** 接続設定タブ: Backlog / Jira スペースの登録・編集・同期 */
export default function ConnectionTab() {
  const { data: spaces } = useSpaces();
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

  // ヘルプポップオーバー
  const [helpAnchor, setHelpAnchor] = useState<{ key: string; el: HTMLElement } | null>(null);

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

  return (
    <>
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
                    <TableCell sx={{ fontWeight: 700 }}>自動同期</TableCell>
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
                        <Select
                          size="small"
                          value={space.sync_interval_minutes}
                          onChange={(e) => {
                            updateJiraMutation.mutate({
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

    </>
  );
}
