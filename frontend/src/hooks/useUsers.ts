import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchUsers, updateUser } from "../api/client";
import { parseSpaceId, useViewStore } from "../stores/viewStore";

export const useUsers = (overrideSpaceId?: string | null) => {
  const storeSpaceId = useViewStore((s) => s.spaceId);
  const effectiveSpaceId = overrideSpaceId !== undefined ? overrideSpaceId : storeSpaceId;
  const spaceFilter = parseSpaceId(effectiveSpaceId);
  return useQuery({
    queryKey: ["users", effectiveSpaceId],
    queryFn: () => fetchUsers(spaceFilter).then((r) => r.data.results),
  });
};

export const useToggleMyself = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_myself }: { id: number; is_myself: boolean }) =>
      updateUser(id, { is_myself }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
};
