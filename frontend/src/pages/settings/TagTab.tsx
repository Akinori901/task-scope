import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import {
  useTicketTags,
  useCreateTicketTag,
  useUpdateTicketTag,
  useDeleteTicketTag,
} from "../../hooks/useTicketTags";

/** タグタブ: 次工程タグの管理 */
export default function TagTab() {
  // タグ管理
  const { data: ticketTags } = useTicketTags();
  const createTagMutation = useCreateTicketTag();
  const updateTagMutation = useUpdateTicketTag();
  const deleteTagMutation = useDeleteTicketTag();
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("default");

  return (
    <>
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
    </>
  );
}
