import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createJiraSpace, deleteJiraSpace, fetchJiraSpaces, triggerJiraSync, updateJiraSpace } from "../api/client";
import type { JiraSpaceInput } from "../api/types";

export const useJiraSpaces = () => {
  return useQuery({
    queryKey: ["jira-spaces"],
    queryFn: () => fetchJiraSpaces().then((r) => r.data),
  });
};

export const useCreateJiraSpace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: JiraSpaceInput) => createJiraSpace(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jira-spaces"] });
    },
  });
};

export const useUpdateJiraSpace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<JiraSpaceInput> }) =>
      updateJiraSpace(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jira-spaces"] });
    },
  });
};

export const useDeleteJiraSpace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteJiraSpace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jira-spaces"] });
    },
  });
};

export const useSyncJiraSpace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: number) => triggerJiraSync(spaceId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jira-spaces"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
};
