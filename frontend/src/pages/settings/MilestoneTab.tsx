import {
  Box,
  Card,
  CardContent,
  FormControl,
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
import React from "react";
import { useProjects } from "../../hooks/useProjects";
import { useMilestones, useUpdateMilestone } from "../../hooks/useMilestones";

interface Props {
  msFilterProject: number | "";
  setMsFilterProject: (id: number | "") => void;
}

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
  // 親の value が変わったら同期（描画中に前回値と比べて直す）
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(toDisplay(value));
  }

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

/** マイルストーンタブ: マイルストーンの期間設定 */
export default function MilestoneTab({ msFilterProject, setMsFilterProject }: Props) {
  const { data: projects } = useProjects();
  // マイルストーン管理
  const { data: milestones } = useMilestones();
  const updateMilestoneMutation = useUpdateMilestone();

  return (
    <>
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

    </>
  );
}
