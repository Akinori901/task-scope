import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import type { TicketQueryParams } from "../api/client";
import type { BacklogUser, Project } from "../api/types";

interface Props {
  filters: TicketQueryParams;
  onChange: (filters: TicketQueryParams) => void;
  projects: Project[];
  users: BacklogUser[];
  statusNames?: string[];
  categoryNames?: string[];
  milestoneNames?: string[];
}

export default function TicketFilters({
  filters,
  onChange,
  projects,
  users,
  statusNames = [],
  categoryNames = [],
  milestoneNames = [],
}: Props) {
  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
      <TextField
        label="検索"
        size="small"
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined, page: 1 })}
        sx={{ minWidth: 200 }}
      />

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>プロジェクト</InputLabel>
        <Select
          value={filters.project ?? ""}
          label="プロジェクト"
          onChange={(e) =>
            onChange({
              ...filters,
              project: e.target.value ? Number(e.target.value) : undefined,
              page: 1,
            })
          }
        >
          <MenuItem value="">すべて</MenuItem>
          {projects.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.project_key}: {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>ステータス</InputLabel>
        <Select
          value={filters.status_name ?? ""}
          label="ステータス"
          onChange={(e) =>
            onChange({
              ...filters,
              status_name: e.target.value || undefined,
              page: 1,
            })
          }
        >
          <MenuItem value="">すべて</MenuItem>
          {statusNames.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>担当者</InputLabel>
        <Select
          value={filters.assignee ?? ""}
          label="担当者"
          onChange={(e) =>
            onChange({
              ...filters,
              assignee: e.target.value ? Number(e.target.value) : undefined,
              page: 1,
            })
          }
        >
          <MenuItem value="">すべて</MenuItem>
          {users.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>カテゴリ</InputLabel>
        <Select
          value={filters.category ?? ""}
          label="カテゴリ"
          onChange={(e) =>
            onChange({
              ...filters,
              category: e.target.value || undefined,
              page: 1,
            })
          }
        >
          <MenuItem value="">すべて</MenuItem>
          {categoryNames.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>マイルストーン</InputLabel>
        <Select
          value={filters.milestone ?? ""}
          label="マイルストーン"
          onChange={(e) =>
            onChange({
              ...filters,
              milestone: e.target.value || undefined,
              page: 1,
            })
          }
        >
          <MenuItem value="">すべて</MenuItem>
          {milestoneNames.map((m) => (
            <MenuItem key={m} value={m}>
              {m}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>状態</InputLabel>
        <Select
          value={
            filters.is_overdue !== undefined
              ? "overdue"
              : filters.is_stagnant !== undefined
                ? "stagnant"
                : ""
          }
          label="状態"
          onChange={(e) => {
            const val = e.target.value;
            onChange({
              ...filters,
              is_overdue: val === "overdue" ? true : undefined,
              is_stagnant: val === "stagnant" ? true : undefined,
              page: 1,
            });
          }}
        >
          <MenuItem value="">すべて</MenuItem>
          <MenuItem value="overdue">遅延のみ</MenuItem>
          <MenuItem value="stagnant">停滞のみ</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}
