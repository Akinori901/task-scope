import { useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  FormControlLabel,
  Switch,
  Typography,
} from "@mui/material";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { StatusDistribution } from "../api/types";

interface Props {
  data: StatusDistribution[];
}

const COLORS = [
  "#1976d2",
  "#2e7d32",
  "#ed6c02",
  "#d32f2f",
  "#9c27b0",
  "#00bcd4",
  "#ff9800",
  "#607d8b",
];

// 完了とみなすステータス名（backend の CLOSED_STATUS_NAMES と一致させる）
const CLOSED_STATUS_NAMES = new Set(["完了", "Closed", "Done", "Resolved", "Close"]);

export default function StatusChart({ data }: Props) {
  const [excludeCompleted, setExcludeCompleted] = useState(false);

  // API がエラーオブジェクトを返すと data は undefined になりうる。
  // ここで配列に正規化しておかないと .some()/.filter() で画面全体が落ちる。
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const shown = useMemo(
    () =>
      excludeCompleted
        ? rows.filter((d) => !CLOSED_STATUS_NAMES.has(d.status))
        : rows,
    [rows, excludeCompleted],
  );

  const hasCompleted = useMemo(
    () => rows.some((d) => CLOSED_STATUS_NAMES.has(d.status)),
    [rows],
  );

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography variant="h6">ステータス分布</Typography>
          {hasCompleted && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={excludeCompleted}
                  onChange={(e) => setExcludeCompleted(e.target.checked)}
                />
              }
              label="完了を除外"
              sx={{ mr: 0, "& .MuiFormControlLabel-label": { fontSize: 13 } }}
            />
          )}
        </Box>
        {shown.length === 0 ? (
          <Typography color="text.secondary">データなし</Typography>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={shown}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {shown.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
