import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import PersonIcon from "@mui/icons-material/Person";
import {
  Box,
  Card,
  CardContent,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Popover,
  Select,
  Switch,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useToggleMyself, useUsers } from "../../hooks/useUsers";
import { useSpaces } from "../../hooks/useSpaces";
import { useViewStore } from "../../stores/viewStore";

interface Props {
  myselfSpaceId: number | "";
  setMyselfSpaceId: (id: number | "") => void;
}

const COMMENT_TAG_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "すべて（フィルターなし）" },
  { value: "spec", label: "方針書" },
  { value: "pr", label: "PR" },
  { value: "report", label: "報告書" },
  { value: "decision", label: "決定事項" },
  { value: "blocker", label: "ブロッカー" },
];

/** 表示設定タブ: 自分の紐づけ・コメント表示・テーマ */
export default function DisplayTab({ myselfSpaceId, setMyselfSpaceId }: Props) {
  const { defaultCommentTag, setDefaultCommentTag, colorMode, setColorMode } = useViewStore();
  const { data: spaces } = useSpaces();
  const { data: spaceUsers } = useUsers(myselfSpaceId ? `b:${myselfSpaceId}` : null);
  const toggleMyselfMutation = useToggleMyself();

  // ヘルプポップオーバー
  const [helpAnchor, setHelpAnchor] = useState<{ key: string; el: HTMLElement } | null>(null);

  return (
    <>

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

    </>
  );
}
