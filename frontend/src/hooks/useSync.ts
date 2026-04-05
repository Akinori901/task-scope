import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerSync } from "../api/client";

export const useSync = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (spaceId?: number) => triggerSync(spaceId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
};
