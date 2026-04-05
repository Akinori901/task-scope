import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createExcludedStatus, deleteExcludedStatus, fetchExcludedStatuses } from "../api/client";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export const useExcludedStatuses = () => {
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  return useQuery({
    queryKey: ["excluded-statuses", spaceId],
    queryFn: () => fetchExcludedStatuses(spaceFilter).then((r) => r.data),
  });
};

export const useCreateExcludedStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ project, statusName }: { project: number; statusName: string }) =>
      createExcludedStatus(project, statusName).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excluded-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
};

export const useDeleteExcludedStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteExcludedStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excluded-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
};
