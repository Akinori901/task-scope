import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createComment,
  deleteComment,
  evaluateTicket,
  fetchTicketDetail,
  generateSpec,
  postCommentToBacklog,
  updateComment,
  updateCommentTags,
} from "../api/client";

export const useTicketDetail = (id: number) => {
  return useQuery({
    queryKey: ["ticket-detail", id],
    queryFn: () => fetchTicketDetail(id).then((r) => r.data),
  });
};

export const useEvaluateTicket = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => evaluateTicket(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
};

export const useGenerateSpec = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generateSpec(id).then((r) => r.data),
    onSuccess: () => {
      // バックグラウンドタスクのポーリングを開始
      queryClient.invalidateQueries({ queryKey: ["background-tasks"] });
    },
  });
};

export const usePostCommentToBacklog = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) =>
      postCommentToBacklog(id, commentId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    },
  });
};

export const useUpdateCommentTags = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, tags }: { commentId: number; tags: string[] }) =>
      updateCommentTags(id, commentId, tags).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    },
  });
};

export const useCreateComment = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, tags }: { content: string; tags: string[] }) =>
      createComment(id, content, tags).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    },
  });
};

export const useUpdateComment = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, content, tags }: { commentId: number; content?: string; tags?: string[] }) =>
      updateComment(id, commentId, { content, tags }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    },
  });
};

export const useDeleteComment = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) => deleteComment(id, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    },
  });
};
