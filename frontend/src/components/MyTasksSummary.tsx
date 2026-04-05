import PersonIcon from "@mui/icons-material/Person";
import { Box, Card, CardContent, Typography } from "@mui/material";
import type { DashboardStats } from "../api/types";

interface Props {
  stats: DashboardStats;
}

export default function MyTasksSummary({ stats }: Props) {
  return (
    <Card sx={{ border: "2px solid", borderColor: "primary.main" }}>
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <PersonIcon color="primary" />
          自分のタスク
        </Typography>
        <Box sx={{ display: "flex", gap: 4 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              担当数
            </Typography>
            <Typography variant="h5" fontWeight={700}>
              {stats.my_total}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              遅延
            </Typography>
            <Typography
              variant="h5"
              fontWeight={700}
              color={stats.my_overdue > 0 ? "error" : "text.primary"}
            >
              {stats.my_overdue}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              停滞
            </Typography>
            <Typography
              variant="h5"
              fontWeight={700}
              color={stats.my_stagnant > 0 ? "warning.main" : "text.primary"}
            >
              {stats.my_stagnant}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
