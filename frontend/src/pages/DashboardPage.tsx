import { Alert, Box, CircularProgress, Grid } from "@mui/material";
import { useState } from "react";
import type { DashboardFilterParams } from "../api/client";
import DelayAlertList from "../components/DelayAlertList";
import MyTasksSummary from "../components/MyTasksSummary";
import PinnedTicketsList from "../components/PinnedTicketsList";
import StatsCards from "../components/StatsCards";
import StatusChart from "../components/StatusChart";
import TicketFilters from "../components/TicketFilters";
import WorkloadChart from "../components/WorkloadChart";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useProjects } from "../hooks/useProjects";
import { useStatusNames } from "../hooks/useStatusNames";
import { useTickets } from "../hooks/useTickets";
import { useUsers } from "../hooks/useUsers";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export default function DashboardPage() {
  const viewMode = useViewStore((s) => s.viewMode);
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  const [filters, setFilters] = useState<DashboardFilterParams>({});

  const dashboardExtra = {
    ...(filters.project ? { project: filters.project } : {}),
    ...(filters.status_name ? { status_name: filters.status_name } : {}),
    ...(filters.assignee ? { assignee: filters.assignee } : {}),
    ...(filters.search ? { search: filters.search } : {}),
  };

  const { data: stats, isLoading, error } = useDashboardStats(dashboardExtra);
  const { data: projects } = useProjects();
  const { data: users } = useUsers();
  const { data: statusNames } = useStatusNames();
  const { data: alertTickets } = useTickets({
    view: viewMode,
    ...spaceFilter,
    is_overdue: true,
    ordering: "-due_date",
    ...dashboardExtra,
  });
  const { data: stagnantTickets } = useTickets({
    view: viewMode,
    ...spaceFilter,
    is_stagnant: true,
    ordering: "-stagnant_days",
    ...dashboardExtra,
  });

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !stats) {
    return <Alert severity="error">ダッシュボードの読み込みに失敗しました</Alert>;
  }

  const warningTickets = [
    ...(alertTickets?.results ?? []),
    ...(stagnantTickets?.results ?? []),
  ]
    .filter(
      (ticket, index, self) =>
        self.findIndex((t) => t.id === ticket.id) === index
    )
    .slice(0, 10);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <TicketFilters
        filters={{
          project: filters.project,
          status_name: filters.status_name,
          assignee: filters.assignee,
          search: filters.search,
        }}
        onChange={(f) =>
          setFilters({
            project: f.project,
            status_name: f.status_name,
            assignee: f.assignee,
            search: f.search,
          })
        }
        projects={projects ?? []}
        users={users ?? []}
        statusNames={statusNames ?? []}
      />

      {viewMode === "my" && <MyTasksSummary stats={stats} />}

      <StatsCards stats={stats} />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <StatusChart data={stats.status_distribution} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <WorkloadChart data={stats.assignee_workload} />
        </Grid>
      </Grid>

      <PinnedTicketsList />

      <DelayAlertList tickets={warningTickets} />
    </Box>
  );
}
