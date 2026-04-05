import { useQuery } from "@tanstack/react-query";
import { fetchTickets, type TicketQueryParams } from "../api/client";

export const useTickets = (params: TicketQueryParams) => {
  return useQuery({
    queryKey: ["tickets", params],
    queryFn: () => fetchTickets(params).then((r) => r.data),
  });
};
