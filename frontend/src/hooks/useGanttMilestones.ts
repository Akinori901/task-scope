import { useQuery } from "@tanstack/react-query";
import { fetchGanttMilestones, type TicketQueryParams, toArray } from "../api/client";
import type { GanttMilestone } from "../api/types";

export const useGanttMilestones = (params: TicketQueryParams) => {
  return useQuery({
    queryKey: ["gantt-milestones", params],
    queryFn: () => fetchGanttMilestones(params).then((r) => toArray<GanttMilestone>(r.data)),
  });
};
