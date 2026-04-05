import { useQuery } from "@tanstack/react-query";
import { fetchProjects } from "../api/client";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export const useProjects = () => {
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  return useQuery({
    queryKey: ["projects", spaceId],
    queryFn: () => fetchProjects(spaceFilter).then((r) => r.data.results),
  });
};
