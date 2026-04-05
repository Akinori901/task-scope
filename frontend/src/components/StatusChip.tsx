import { Chip } from "@mui/material";

const STATUS_COLORS: Record<string, string> = {
  // 日本語
  未対応: "#78909c",
  処理中: "#42a5f5",
  処理済み: "#66bb6a",
  完了: "#388e3c",
  // 英語
  Open: "#78909c",
  "In Progress": "#42a5f5",
  Resolved: "#66bb6a",
  Closed: "#388e3c",
  Done: "#388e3c",
};

export default function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#78909c";

  return (
    <Chip
      label={status}
      size="small"
      sx={{
        bgcolor: color,
        color: "#fff",
        fontWeight: 600,
        fontSize: "0.75rem",
      }}
    />
  );
}
