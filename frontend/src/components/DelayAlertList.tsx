import ArticleIcon from "@mui/icons-material/Article";
import DescriptionIcon from "@mui/icons-material/Description";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import GradingIcon from "@mui/icons-material/Grading";
import MarkChatReadIcon from "@mui/icons-material/MarkChatRead";
import SearchIcon from "@mui/icons-material/Search";
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

// 一覧に出す成果物アイコン。並びは作業順（チケット詳細のボタンと揃える）。
// 「報告書」ひとまとめだった表示を成果物ごとに分けている。
const DELIVERABLES: {
  tag: string;
  field: keyof Ticket;
  label: string;
  color: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
}[] = [
  { tag: "survey", field: "has_survey", label: "調査報告書", color: "info.main", icon: SearchIcon },
  { tag: "spec", field: "has_spec", label: "方針書", color: "info.main", icon: DescriptionIcon },
  { tag: "plan", field: "has_plan", label: "実装計画", color: "info.main", icon: GradingIcon },
  { tag: "completion", field: "has_completion", label: "完了報告", color: "success.main", icon: MarkChatReadIcon },
  { tag: "qa", field: "has_qa", label: "QA項目", color: "success.main", icon: FactCheckIcon },
  { tag: "report", field: "has_report", label: "報告書", color: "secondary.main", icon: ArticleIcon },
];

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
                  <Tooltip title={ticket.has_evaluation ? "採点済" : "未採点"}>
                    <GradingIcon
                      fontSize="small"
                      sx={{ color: ticket.has_evaluation ? "success.main" : "text.disabled" }}
                    />
                  </Tooltip>
                  {DELIVERABLES.map((d) => {
                    const present = Boolean(ticket[d.field]);
                    const Icon = d.icon;
                    return (
                      <Tooltip
                        key={d.tag}
                        title={present ? `${d.label}あり — クリックで表示` : `${d.label}なし`}
                      >
                        <Icon
                          fontSize="small"
                          sx={{
                            color: present ? d.color : "text.disabled",
                            cursor: present ? "pointer" : "default",
                          }}
                          onClick={(e: { stopPropagation: () => void }) => {
                            if (!present) return;
                            e.stopPropagation();
                            navigate(`/tickets/${ticket.id}?tag=${d.tag}`);
                          }}
                        />
                      </Tooltip>
                    );
                  })}
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
