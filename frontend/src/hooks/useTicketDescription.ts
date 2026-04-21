import { useQuery } from "@tanstack/react-query";
import { fetchTicketDetail } from "../api/client";

export const useTicketDescription = (ticketId: number, enabled: boolean) => {
  return useQuery({
    queryKey: ["ticketDetail", ticketId],
    queryFn: () => fetchTicketDetail(ticketId).then((r) => r.data),
    enabled,
    staleTime: 5 * 60 * 1000,
    select: (data) => data.description,
  });
};
