import { useQuery } from "@tanstack/react-query";
import type { DashboardFilterParams } from "../api/client";
import { fetchDashboardStats } from "../api/client";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export const useDashboardStats = (extra?: Omit<DashboardFilterParams, "view" | "space" | "jira_space">) => {
  const viewMode = useViewStore((s) => s.viewMode);
  const spaceId = useViewStore((s) => s.spaceId);
  const params: DashboardFilterParams = {
    view: viewMode,
    ...parseSpaceId(spaceId),
    ...extra,
  };
  return useQuery({
    queryKey: ["dashboard-stats", params],
    queryFn: () => fetchDashboardStats(params).then((r) => r.data),
  });
};
