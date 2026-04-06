import { useQuery } from "@tanstack/react-query";
import { fetchMilestoneNames } from "../api/client";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export const useMilestoneNames = (projectId?: number | null) => {
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  return useQuery({
    queryKey: ["milestone-names", spaceId, projectId ?? null],
    queryFn: () => fetchMilestoneNames(spaceFilter, projectId).then((r) => r.data),
  });
};
