import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTicketTag,
  deleteTicketTag,
  fetchTicketTags,
  updateTicketTag,
  updateTicketCustomTags,
} from "../api/client";
import type { TicketTagInput } from "../api/types";

export const useTicketTags = () => {
  return useQuery({
    queryKey: ["ticket-tags"],
    queryFn: () => fetchTicketTags().then((r) => r.data),
  });
};

export const useCreateTicketTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TicketTagInput) => createTicketTag(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-tags"] });
    },
  });
};

export const useUpdateTicketTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TicketTagInput> }) =>
      updateTicketTag(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-tags"] });
    },
  });
};

export const useDeleteTicketTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTicketTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-tags"] });
    },
  });
};

export const useUpdateTicketCustomTags = (ticketId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tags: string[]) => updateTicketCustomTags(ticketId, tags).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
};
