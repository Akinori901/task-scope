import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSpace, deleteSpace, fetchSpaces, triggerSync, updateSpace } from "../api/client";
import type { BacklogSpaceInput } from "../api/types";

export const useSpaces = () => {
  return useQuery({
    queryKey: ["spaces"],
    queryFn: () => fetchSpaces().then((r) => r.data),
  });
};

export const useCreateSpace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BacklogSpaceInput) => createSpace(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
};

export const useUpdateSpace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BacklogSpaceInput> }) =>
      updateSpace(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
};

export const useDeleteSpace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSpace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
};

export const useSyncSpace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (spaceId?: number) => triggerSync(spaceId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
};
