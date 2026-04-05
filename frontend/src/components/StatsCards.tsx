import {
  Assignment as IncompleteIcon,
  AssignmentLate as OverdueIcon,
  HourglassEmpty as NotStartedIcon,
  PauseCircle as StagnantIcon,
} from "@mui/icons-material";
import { Box, Card, CardContent, Grid, Typography } from "@mui/material";
import type { DashboardStats } from "../api/types";

interface Props {
  stats: DashboardStats;
}

const cards = [
  {
    key: "incomplete_tickets" as const,
    label: "未完了チケット",
    icon: IncompleteIcon,
    color: "#1976d2",
  },
  {
    key: "not_started_tickets" as const,
    label: "未対応",
    icon: NotStartedIcon,
    color: "#78909c",
  },
  {
    key: "overdue_tickets" as const,
    label: "遅延",
    icon: OverdueIcon,
    color: "#d32f2f",
  },
  {
    key: "stagnant_tickets" as const,
    label: "停滞",
    icon: StagnantIcon,
    color: "#ed6c02",
  },
];

export default function StatsCards({ stats }: Props) {
  return (
    <Grid container spacing={2}>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Grid key={card.key} size={{ xs: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                  <Icon sx={{ color: card.color, mr: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    {card.label}
                  </Typography>
                </Box>
                <Typography variant="h4" fontWeight={700}>
                  {stats[card.key]}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );
}
