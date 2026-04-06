import DownloadIcon from "@mui/icons-material/Download";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TicketQueryParams } from "../api/client";
import GanttChart from "../components/GanttChart";
import { useCategoryNames } from "../hooks/useCategoryNames";
import { useGanttMilestones } from "../hooks/useGanttMilestones";
import { useProjects } from "../hooks/useProjects";
import { parseSpaceId, useViewStore } from "../stores/viewStore";
import { exportGanttExcel } from "../utils/exportGanttExcel";

/** YYYYMMDD → YYYY/MM/DD 自動フォーマット日付入力 */
function DateInput({
  value,
  onCommit,
  label,
}: {
  value: string | null;
  onCommit: (date: string | null) => void;
  label?: string;
}) {
  const toDisplay = (v: string | null) => (v ? v.replace(/-/g, "/") : "");
  const [text, setText] = React.useState(toDisplay(value));
  React.useEffect(() => setText(toDisplay(value)), [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    let display = raw;
    if (raw.length > 4) display = raw.slice(0, 4) + "/" + raw.slice(4);
    if (raw.length > 6) display = raw.slice(0, 4) + "/" + raw.slice(4, 6) + "/" + raw.slice(6);
    setText(display);
    if (raw.length === 8) {
      onCommit(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
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
      setText(toDisplay(value));
    }
  };

  return (
    <TextField
      size="small"
      label={label}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="YYYY/MM/DD"
      sx={{ width: 150 }}
      slotProps={{ htmlInput: { maxLength: 10 }, inputLabel: { shrink: true } }}
    />
  );
}

export default function GanttPage() {
  const viewMode = useViewStore((s) => s.viewMode);
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  const [excludeCompleted, setExcludeCompleted] = useState(false);
  const [timelineStart, setTimelineStart] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [project, setProject] = useState<number | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [selectedMilestones, setSelectedMilestones] = useState<string[]>([]);

  const mergedFilters: TicketQueryParams = {
    view: viewMode,
    ...spaceFilter,
    project,
    category,
    exclude_completed: excludeCompleted || undefined,
    page: 1,
  };

  const { data: allMilestones, isLoading } = useGanttMilestones(mergedFilters);
  const { data: projects } = useProjects();
  const { data: categoryNames } = useCategoryNames();

  // Milestone names from API response for the checkbox list
  const milestoneOptions = useMemo(
    () => (allMilestones ?? []).map((m) => m.name),
    [allMilestones],
  );

  // Initialize selectedMilestones to all when data loads or filter changes
  const prevOptionsRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = prevOptionsRef.current;
    const changed = milestoneOptions.length !== prev.length || milestoneOptions.some((n, i) => n !== prev[i]);
    if (milestoneOptions.length > 0 && changed) {
      setSelectedMilestones(milestoneOptions);
      prevOptionsRef.current = milestoneOptions;
    }
  }, [milestoneOptions]);

  // Filter displayed milestones by checkbox selection
  const displayedMilestones = useMemo(() => {
    if (!allMilestones) return [];
    return allMilestones.filter((m) => selectedMilestones.includes(m.name));
  }, [allMilestones, selectedMilestones]);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1, flexWrap: "wrap" }}>
        {/* プロジェクト */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>プロジェクト</InputLabel>
          <Select
            value={project ?? ""}
            label="プロジェクト"
            onChange={(e) => setProject(e.target.value ? Number(e.target.value) : undefined)}
          >
            <MenuItem value="">すべて</MenuItem>
            {(projects ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.project_key}: {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* カテゴリ */}
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>カテゴリ</InputLabel>
          <Select
            value={category ?? ""}
            label="カテゴリ"
            onChange={(e) => setCategory(e.target.value || undefined)}
          >
            <MenuItem value="">すべて</MenuItem>
            {(categoryNames ?? []).map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* マイルストーン複数選択 */}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>表示マイルストーン</InputLabel>
          <Select
            multiple
            value={selectedMilestones}
            label="表示マイルストーン"
            onChange={(e) => {
              const val = e.target.value;
              setSelectedMilestones(typeof val === "string" ? val.split(",") : val);
            }}
            renderValue={(sel) => sel.length === 0 ? "すべて" : `${sel.length}件選択`}
          >
            {milestoneOptions.map((name) => (
              <MenuItem key={name} value={name}>
                <Checkbox checked={selectedMilestones.includes(name)} size="small" />
                <ListItemText primary={name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <DateInput
          value={timelineStart}
          onCommit={setTimelineStart}
          label="表示開始日"
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
          disabled={exporting || !displayedMilestones.length}
          onClick={async () => {
            setExporting(true);
            try {
              await exportGanttExcel(displayedMilestones, timelineStart);
            } finally {
              setExporting(false);
            }
          }}
          sx={{ whiteSpace: "nowrap" }}
        >
          Excel出力
        </Button>
        <FormControlLabel
          control={
            <Checkbox
              checked={excludeCompleted}
              onChange={(e: { target: { checked: boolean } }) => setExcludeCompleted(e.target.checked)}
              size="small"
            />
          }
          label="完了を除外"
          sx={{ whiteSpace: "nowrap", ml: "auto" }}
        />
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <GanttChart
          milestones={displayedMilestones}
          filters={mergedFilters}
          timelineStartDate={timelineStart}
        />
      )}
    </Box>
  );
}
