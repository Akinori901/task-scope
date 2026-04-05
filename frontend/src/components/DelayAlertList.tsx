import DescriptionIcon from "@mui/icons-material/Description";
import GradingIcon from "@mui/icons-material/Grading";
import WarningIcon from "@mui/icons-material/Warning";
import {
  Box,
  Card,
  CardContent,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import type { Ticket } from "../api/types";

interface Props {
  tickets: Ticket[];
}

export default function DelayAlertList({ tickets }: Props) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <WarningIcon color="warning" />
          要注意チケット
        </Typography>
        {tickets.length === 0 ? (
          <Typography color="text.secondary">遅延・停滞なし</Typography>
        ) : (
          <List dense disablePadding>
            {tickets.map((ticket) => (
              <ListItemButton
                key={ticket.id}
                divider
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                sx={{ borderRadius: 1 }}
              >
                <ListItemText
                  primary={`${ticket.issue_key}: ${ticket.summary}`}
                  secondary={`${ticket.project_key} / ${ticket.assignee_name ?? "未割当"}`}
                />
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: 1, flexShrink: 0 }}>
                  <Tooltip title={ticket.has_evaluation ? "評価済" : "未評価"}>
                    <GradingIcon
                      fontSize="small"
                      sx={{ color: ticket.has_evaluation ? "success.main" : "text.disabled" }}
                    />
                  </Tooltip>
                  <Tooltip title={ticket.has_spec ? "方針書あり — クリックで方針書を表示" : "方針書なし"}>
                    <DescriptionIcon
                      fontSize="small"
                      sx={{
                        color: ticket.has_spec ? "info.main" : "text.disabled",
                        cursor: ticket.has_spec ? "pointer" : "default",
                      }}
                      onClick={(e: { stopPropagation: () => void }) => {
                        if (ticket.has_spec) {
                          e.stopPropagation();
                          navigate(`/tickets/${ticket.id}?tag=spec`);
                        }
                      }}
                    />
                  </Tooltip>
                  {ticket.status_changed_at &&
                    Date.now() - new Date(ticket.status_changed_at).getTime() < 86400000 && (
                    <Tooltip title={`${ticket.previous_status_name ?? "?"} → ${ticket.status_name}`}>
                      <Chip label="更新" size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                    </Tooltip>
                  )}
                  {ticket.is_overdue && (
                    <Chip label="遅延" color="error" size="small" />
                  )}
                  {ticket.is_stagnant && (
                    <Chip
                      label={`停滞${ticket.stagnant_days}日`}
                      color="warning"
                      size="small"
                    />
                  )}
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}
