export interface BacklogSpace {
  id: number;
  space_key: string;
  domain: "backlog.jp" | "backlog.com";
  api_key_masked: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BacklogSpaceInput {
  space_key: string;
  domain: "backlog.jp" | "backlog.com";
  api_key: string;
}

export interface JiraSpace {
  id: number;
  site_name: string;
  base_url: string;
  user_email: string;
  api_token_masked: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JiraSpaceInput {
  site_name: string;
  base_url: string;
  user_email: string;
  api_token: string;
}

export interface Project {
  id: number;
  backlog_id: number;
  project_key: string;
  name: string;
  is_active: boolean;
  last_synced_at: string | null;
  ticket_count: number;
  completed_count: number;
  overdue_count: number;
}

export interface Ticket {
  id: number;
  backlog_id: number;
  issue_key: string;
  summary: string;
  issue_type: string;
  status_name: string;
  status_id: number;
  priority_name: string;
  priority_id: number;
  assignee: number | null;
  assignee_name: string | null;
  parent_ticket_id: number | null;
  parent_ticket_key: string | null;
  child_count: number;
  project_key: string;
  project_name: string;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  comment_count: number;
  last_comment_at: string | null;
  backlog_created: string;
  backlog_updated: string;
  is_overdue: boolean;
  is_stagnant: boolean;
  stagnant_days: number;
  previous_status_name: string | null;
  status_changed_at: string | null;
  source_type: "backlog" | "jira";
  external_url: string | null;
  has_evaluation: boolean;
  has_spec: boolean;
  needs_re_evaluation: boolean;
  new_comment_count: number;
  spec_readiness: "ready" | "partial" | "not_ready" | null;
}

export interface TicketEvaluation {
  id: number;
  // 難易度6軸
  impact_scope_score: number;
  query_complexity_score: number;
  ambiguity_score: number;
  verification_difficulty_score: number;
  coordination_cost_score: number;
  regression_risk_score: number;
  overall_difficulty_score: number;
  difficulty_comment: string;
  // 対処区分
  resolution_type: "data_fix" | "code_fix" | "config_change" | "investigation" | "mixed" | "unknown";
  resolution_comment: string;
  // 推定工数
  estimated_days: number;
  estimated_breakdown: { phase: string; days: number; note: string }[];
  // 情報品質
  info_completeness_score: number;
  missing_items: string[];
  spec_readiness: "ready" | "partial" | "not_ready";
  schedule_feasibility: "feasible" | "risky" | "unrealistic" | "unknown";
  schedule_comment: string;
  summary: string;
  pr_urls: string[];
  comment_count_at_eval: number;
  model_used: string;
  evaluated_at: string;
}

export interface TicketComment {
  id: number;
  content: string;
  created_user_name: string | null;
  has_attachments: boolean;
  tags: string[];
  source: "synced" | "ai" | "manual";
  posted_at: string | null;
  backlog_created: string;
}

export interface CustomField {
  id: number;
  name: string;
  fieldTypeId: number;
  value: string | number | string[];
}

export interface MatchedRepository {
  id: number;
  name: string;
  description: string;
}

export interface TicketDetail extends Ticket {
  description: string;
  evaluation: TicketEvaluation | null;
  comments: TicketComment[];
  custom_fields: CustomField[];
  matched_repositories: MatchedRepository[];
  children: Ticket[];
}

export interface GanttMilestoneStats {
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
  stagnant: number;
  completion_rate: number;
}

export interface GanttMilestone {
  id: number;
  project_key: string;
  project_name: string;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
  stats: GanttMilestoneStats;
}

export interface MilestoneData {
  id: number;
  project: number;
  project_key: string;
  project_name: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MilestoneInput {
  project: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  sort_order?: number;
}

export interface CodeRepository {
  id: number;
  project: number;
  project_name: string;
  project_key: string;
  name: string;
  local_path: string;
  match_field: string | null;
  match_value: string | null;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CodeRepositoryInput {
  project: number;
  name: string;
  local_path: string;
  match_field?: string | null;
  match_value?: string | null;
  description?: string;
  is_active?: boolean;
}

export interface BacklogUser {
  id: number;
  backlog_id: number;
  user_id_str: string;
  name: string;
  mail_address: string;
  is_myself: boolean;
}

export interface StatusDistribution {
  status: string;
  count: number;
}

export interface AssigneeWorkload {
  name: string;
  total: number;
  overdue: number;
}

export interface DashboardStats {
  total_tickets: number;
  completed_tickets: number;
  not_started_tickets: number;
  incomplete_tickets: number;
  overdue_tickets: number;
  stagnant_tickets: number;
  completion_rate: number;
  my_total: number;
  my_overdue: number;
  my_stagnant: number;
  projects: Project[];
  status_distribution: StatusDistribution[];
  assignee_workload: AssigneeWorkload[];
  last_synced_at: string | null;
}

export interface ExcludedStatus {
  id: number;
  project: number;
  project_key: string;
  status_name: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type ViewMode = "all" | "my";
