import { useQuery } from "@tanstack/react-query";
import { fetchStatusNames } from "../api/client";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export const useStatusNames = (projectId?: number | null) => {
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  return useQuery({
    queryKey: ["status-names", spaceId, projectId ?? null],
    queryFn: () => fetchStatusNames(spaceFilter, projectId).then((r) => r.data),
  });
};
