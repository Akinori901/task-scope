import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMilestone,
  fetchMilestones,
  updateMilestone,
} from "../api/client";
import type { MilestoneInput } from "../api/types";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export const useMilestones = (projectId?: number) => {
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  return useQuery({
    queryKey: ["milestones", spaceId, projectId],
    queryFn: () => fetchMilestones(spaceFilter, projectId).then((r) => r.data),
  });
};

export const useUpdateMilestone = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MilestoneInput> }) =>
      updateMilestone(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
    },
  });
};

export const useDeleteMilestone = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMilestone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
    },
  });
};
