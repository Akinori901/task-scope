import { Chip } from "@mui/material";

const PRIORITY_COLORS: Record<string, string> = {
  高: "#ef5350",
  High: "#ef5350",
  中: "#ffb74d",
  Normal: "#ffb74d",
  低: "#78909c",
  Low: "#78909c",
};

export default function PriorityChip({ priority }: { priority: string }) {
  if (!priority) return null;

  const color = PRIORITY_COLORS[priority] ?? "#78909c";

  return (
    <Chip
      label={priority}
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
