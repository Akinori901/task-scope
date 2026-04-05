import axios from "axios";
import type {
  BacklogSpace,
  BacklogSpaceInput,
  BacklogUser,
  CodeRepository,
  CodeRepositoryInput,
  DashboardStats,
  ExcludedStatus,
  JiraSpace,
  JiraSpaceInput,
  PaginatedResponse,
  Project,
  Ticket,
  TicketComment,
  TicketDetail,
  TicketEvaluation,
  ViewMode,
} from "./types";

const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

export default apiClient;

// --- API 関数 ---

export interface DashboardFilterParams {
  view?: ViewMode;
  space?: number | null;
  jira_space?: number | null;
  project?: number;
  status_name?: string;
  assignee?: number;
  search?: string;
}

export const fetchDashboardStats = (params: DashboardFilterParams) =>
  apiClient.get<DashboardStats>("/dashboard/stats/", { params });

export interface TicketQueryParams {
  view?: ViewMode;
  space?: number | null;
  jira_space?: number | null;
  project?: number;
  status_name?: string;
  assignee?: number;
  is_overdue?: boolean;
  is_stagnant?: boolean;
  exclude_completed?: boolean;
  search?: string;
  ordering?: string;
  page?: number;
}

export const fetchTickets = (params: TicketQueryParams) =>
  apiClient.get<PaginatedResponse<Ticket>>("/tickets/", { params });

export const fetchProjects = (spaceFilter?: { space?: number; jira_space?: number }) =>
  apiClient.get<PaginatedResponse<Project>>("/projects/", {
    params: spaceFilter ?? {},
  });

export const fetchStatusNames = (spaceFilter?: { space?: number; jira_space?: number }, projectId?: number | null) => {
  const params: Record<string, number> = {};
  if (projectId) params.project = projectId;
  else if (spaceFilter?.space) params.space = spaceFilter.space;
  else if (spaceFilter?.jira_space) params.jira_space = spaceFilter.jira_space;
  return apiClient.get<string[]>("/status-names/", { params });
};

export const fetchUsers = (spaceFilter?: { space?: number; jira_space?: number }) =>
  apiClient.get<PaginatedResponse<BacklogUser>>("/users/", {
    params: spaceFilter ?? {},
  });

export const updateUser = (id: number, data: { is_myself: boolean }) =>
  apiClient.patch<BacklogUser>(`/users/${id}/`, data);

export const exportTicketsCsv = (params: TicketQueryParams) =>
  apiClient.get("/tickets/export/", { params, responseType: "blob" });

export const fetchTicketDetail = (id: number) =>
  apiClient.get<TicketDetail>(`/tickets/${id}/`);

export const evaluateTicket = (id: number) =>
  apiClient.post<TicketEvaluation>(`/tickets/${id}/evaluate/`);

export interface BackgroundTask {
  task_id: string;
  status: "running" | "completed" | "failed";
  ticket_id: number;
  issue_key: string;
  summary?: string;
  started_at?: string;
  comment_id?: number;
  error?: string;
}

export const generateSpec = (id: number) =>
  apiClient.post<{ task_id: string; status: string }>(`/tickets/${id}/generate-spec/`);

export const fetchBackgroundTasks = () =>
  apiClient.get<BackgroundTask[]>("/tasks/");

export const deleteBackgroundTask = (taskId: string) =>
  apiClient.delete(`/tasks/${taskId}/`);

export const createComment = (id: number, content: string, tags: string[] = []) =>
  apiClient.post<TicketComment>(`/tickets/${id}/comments/`, { content, tags });

export const updateCommentTags = (ticketId: number, commentId: number, tags: string[]) =>
  apiClient.patch<TicketComment>(`/tickets/${ticketId}/comments/${commentId}/tags/`, { tags });

export const updateComment = (ticketId: number, commentId: number, data: { content?: string; tags?: string[] }) =>
  apiClient.patch<TicketComment>(`/tickets/${ticketId}/comments/${commentId}/edit/`, data);

export const postCommentToBacklog = (ticketId: number, commentId: number) =>
  apiClient.post<TicketComment>(`/tickets/${ticketId}/comments/${commentId}/post/`);

export const deleteComment = (ticketId: number, commentId: number) =>
  apiClient.delete(`/tickets/${ticketId}/comments/${commentId}/`);

export interface UnpostedSpec {
  id: number;
  ticket_id: number;
  issue_key: string;
  summary: string;
  created_at: string;
}

export const fetchUnpostedSpecs = () =>
  apiClient.get<UnpostedSpec[]>("/comments/unposted-specs/");

export const bulkPostComments = (commentIds: number[]) =>
  apiClient.post<{ posted: number; errors: string[] }>("/comments/bulk-post/", { comment_ids: commentIds });

// --- Pinned Tickets ---

export interface PinnedTicketData {
  id: number;
  ticket: Ticket;
  note: string;
  pinned_at: string;
}

export const fetchPinnedTickets = () =>
  apiClient.get<PinnedTicketData[]>("/pinned-tickets/");

export const pinTicket = (ticketId: number, note?: string) =>
  apiClient.post<PinnedTicketData>("/pinned-tickets/", { ticket_id: ticketId, note });

export const unpinTicket = (pinId: number) =>
  apiClient.delete(`/pinned-tickets/${pinId}/`);

export const triggerSync = (spaceId?: number) =>
  apiClient.post<{ status: string }>("/sync/", spaceId ? { space_id: spaceId } : {});

// --- Spaces ---

export const fetchSpaces = () =>
  apiClient.get<BacklogSpace[]>("/spaces/");

export const createSpace = (data: BacklogSpaceInput) =>
  apiClient.post<BacklogSpace>("/spaces/", data);

export const updateSpace = (id: number, data: Partial<BacklogSpaceInput>) =>
  apiClient.patch<BacklogSpace>(`/spaces/${id}/`, data);

export const deleteSpace = (id: number) =>
  apiClient.delete(`/spaces/${id}/`);

// --- Jira Spaces ---

export const fetchJiraSpaces = () =>
  apiClient.get<JiraSpace[]>("/jira-spaces/");

export const createJiraSpace = (data: JiraSpaceInput) =>
  apiClient.post<JiraSpace>("/jira-spaces/", data);

export const updateJiraSpace = (id: number, data: Partial<JiraSpaceInput>) =>
  apiClient.patch<JiraSpace>(`/jira-spaces/${id}/`, data);

export const deleteJiraSpace = (id: number) =>
  apiClient.delete(`/jira-spaces/${id}/`);

export const triggerJiraSync = (spaceId: number) =>
  apiClient.post(`/jira-spaces/${spaceId}/sync/`);

// --- Excluded Statuses ---

export const fetchExcludedStatuses = (spaceFilter?: { space?: number; jira_space?: number }) =>
  apiClient.get<ExcludedStatus[]>("/excluded-statuses/", {
    params: spaceFilter ?? {},
  });

export const createExcludedStatus = (project: number, status_name: string) =>
  apiClient.post<ExcludedStatus>("/excluded-statuses/", { project, status_name });

export const deleteExcludedStatus = (id: number) =>
  apiClient.delete(`/excluded-statuses/${id}/`);

// --- Code Repositories ---

export const fetchRepositories = (projectId?: number) =>
  apiClient.get<CodeRepository[]>("/repositories/", {
    params: projectId ? { project: projectId } : {},
  });

export const createRepository = (data: CodeRepositoryInput) =>
  apiClient.post<CodeRepository>("/repositories/", data);

export const updateRepository = (id: number, data: Partial<CodeRepositoryInput>) =>
  apiClient.patch<CodeRepository>(`/repositories/${id}/`, data);

export const deleteRepository = (id: number) =>
  apiClient.delete(`/repositories/${id}/`);

// --- Directory Browser ---

export const browseDirs = (path?: string) =>
  apiClient.post<{ current: string; parent: string | null; dirs: string[] }>(
    "/browse-dirs/", { path },
  );
