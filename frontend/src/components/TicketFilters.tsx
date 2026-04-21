import {
  Box,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { TicketQueryParams } from "../api/client";
import type { BacklogUser, Project, TicketTag } from "../api/types";

interface Props {
  filters: TicketQueryParams;
  onChange: (filters: TicketQueryParams) => void;
  projects: Project[];
  users: BacklogUser[];
  statusNames?: string[];
  categoryNames?: string[];
  milestoneNames?: string[];
  ticketTags?: TicketTag[];
}

export default function TicketFilters({
  filters,
  onChange,
  projects,
  users,
  statusNames = [],
  categoryNames = [],
  milestoneNames = [],
  ticketTags = [],
}: Props) {
  // status_name はカンマ区切り文字列 ↔ string[] で変換
  const selectedStatuses: string[] = filters.status_name
    ? filters.status_name.split(",").map((s) => s.trim())
    : [];

  // IME 変換中でも壊れないよう、検索テキストはローカルステートで管理
  const [searchText, setSearchText] = useState(filters.search ?? "");
  const composingRef = useRef(false);

  // 外部からフィルターがリセットされた場合にローカルステートも同期
  useEffect(() => {
    setSearchText(filters.search ?? "");
  }, [filters.search]);

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
      <TextField
        label="検索"
        size="small"
        value={searchText}
        onChange={(e) => {
          setSearchText(e.target.value);
          if (!composingRef.current) {
            onChange({ ...filters, search: e.target.value || undefined, page: 1 });
          }
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          const value = (e.target as HTMLInputElement).value;
          onChange({ ...filters, search: value || undefined, page: 1 });
        }}
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

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>ステータス</InputLabel>
        <Select
          multiple
          value={selectedStatuses}
          label="ステータス"
          onChange={(e) => {
            const val = e.target.value;
            const arr = typeof val === "string" ? val.split(",") : val;
            onChange({
              ...filters,
              status_name: arr.length > 0 ? arr.join(",") : undefined,
              page: 1,
            });
          }}
          renderValue={(sel) => sel.length === 0 ? "すべて" : `${sel.length}件選択`}
        >
          {statusNames.map((s) => (
            <MenuItem key={s} value={s}>
              <Checkbox checked={selectedStatuses.includes(s)} size="small" />
              <ListItemText primary={s} />
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

      {ticketTags.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>次工程</InputLabel>
          <Select
            value={filters.custom_tag ?? ""}
            label="次工程"
            onChange={(e) =>
              onChange({
                ...filters,
                custom_tag: e.target.value || undefined,
                page: 1,
              })
            }
          >
            <MenuItem value="">すべて</MenuItem>
            {ticketTags.map((t) => (
              <MenuItem key={t.id} value={t.name}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>状態</InputLabel>
        <Select
          value={
            filters.is_overdue !== undefined
              ? "overdue"
              : filters.is_stagnant !== undefined
                ? "stagnant"
                : filters.is_watched !== undefined
                  ? "watched"
                  : ""
          }
          label="状態"
          onChange={(e) => {
            const val = e.target.value;
            onChange({
              ...filters,
              is_overdue: val === "overdue" ? true : undefined,
              is_stagnant: val === "stagnant" ? true : undefined,
              is_watched: val === "watched" ? true : undefined,
              page: 1,
            });
          }}
        >
          <MenuItem value="">すべて</MenuItem>
          <MenuItem value="overdue">遅延のみ</MenuItem>
          <MenuItem value="stagnant">停滞のみ</MenuItem>
          <MenuItem value="watched">ウォッチ中</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}
