import { useQuery } from "@tanstack/react-query";
import { fetchCategoryNames } from "../api/client";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export const useCategoryNames = (projectId?: number | null) => {
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  return useQuery({
    queryKey: ["category-names", spaceId, projectId ?? null],
    queryFn: () => fetchCategoryNames(spaceFilter, projectId).then((r) => r.data),
  });
};
