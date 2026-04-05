import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRepository,
  deleteRepository,
  fetchRepositories,
  updateRepository,
} from "../api/client";
import type { CodeRepositoryInput } from "../api/types";

export const useRepositories = (projectId?: number) => {
  return useQuery({
    queryKey: ["repositories", projectId],
    queryFn: () => fetchRepositories(projectId).then((r) => r.data),
  });
};

export const useCreateRepository = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CodeRepositoryInput) =>
      createRepository(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
    },
  });
};

export const useUpdateRepository = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CodeRepositoryInput> }) =>
      updateRepository(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
    },
  });
};

export const useDeleteRepository = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRepository(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
    },
  });
};
