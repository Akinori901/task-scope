import { useQuery } from "@tanstack/react-query";
import { fetchGanttMilestones, type TicketQueryParams } from "../api/client";

export const useGanttMilestones = (params: TicketQueryParams) => {
  return useQuery({
    queryKey: ["gantt-milestones", params],
    queryFn: () => fetchGanttMilestones(params).then((r) => r.data),
  });
};
