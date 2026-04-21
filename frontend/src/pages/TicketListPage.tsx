import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import SendIcon from "@mui/icons-material/Send";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { TicketQueryParams, UnpostedSpec } from "../api/client";
import { bulkPostComments, deleteComment, exportTicketsCsv, fetchUnpostedSpecs } from "../api/client";
import TicketFilters from "../components/TicketFilters";
import TicketTable from "../components/TicketTable";
import { useTickets } from "../hooks/useTickets";
import { parseSpaceId, useViewStore } from "../stores/viewStore";
import { useCategoryNames } from "../hooks/useCategoryNames";
import { useMilestoneNames } from "../hooks/useMilestoneNames";
import { useProjects } from "../hooks/useProjects";
import { useStatusNames } from "../hooks/useStatusNames";
import { useUsers } from "../hooks/useUsers";
import { useTicketTags } from "../hooks/useTicketTags";

/** URLクエリパラメータからフィルターを復元 */
function filtersFromSearchParams(sp: URLSearchParams, defaultOrdering: string): TicketQueryParams {
  const f: TicketQueryParams = {
    ordering: sp.get("ordering") ?? defaultOrdering,
    page: sp.has("page") ? Number(sp.get("page")) : 1,
  };
  if (sp.get("search")) f.search = sp.get("search")!;
  if (sp.get("project")) f.project = Number(sp.get("project"));
  if (sp.get("status_name")) f.status_name = sp.get("status_name")!;
  if (sp.get("assignee")) f.assignee = Number(sp.get("assignee"));
  if (sp.get("category")) f.category = sp.get("category")!;
  if (sp.get("milestone")) f.milestone = sp.get("milestone")!;
  if (sp.get("is_overdue")) f.is_overdue = true;
  if (sp.get("is_stagnant")) f.is_stagnant = true;
  if (sp.get("is_watched")) f.is_watched = true;
  if (sp.get("custom_tag")) f.custom_tag = sp.get("custom_tag")!;
  return f;
}

/** フィルターをURLクエリパラメータに変換 */
function filtersToSearchParams(filters: TicketQueryParams, excludeCompleted: boolean): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.search) sp.set("search", filters.search);
  if (filters.project) sp.set("project", String(filters.project));
  if (filters.status_name) sp.set("status_name", filters.status_name);
  if (filters.assignee) sp.set("assignee", String(filters.assignee));
  if (filters.category) sp.set("category", filters.category);
  if (filters.milestone) sp.set("milestone", filters.milestone);
  if (filters.is_overdue) sp.set("is_overdue", "1");
  if (filters.is_stagnant) sp.set("is_stagnant", "1");
  if (filters.is_watched) sp.set("is_watched", "1");
  if (filters.custom_tag) sp.set("custom_tag", filters.custom_tag);
  if (filters.ordering && filters.ordering !== "-backlog_updated") sp.set("ordering", filters.ordering);
  if (filters.page && filters.page > 1) sp.set("page", String(filters.page));
  if (!excludeCompleted) sp.set("show_completed", "1");
  return sp;
}

export default function TicketListPage() {
  const viewMode = useViewStore((s) => s.viewMode);
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => filtersFromSearchParams(searchParams, "-backlog_updated"), [searchParams]);
  const excludeCompleted = !searchParams.has("show_completed");

  const setFilters = useCallback(
    (next: TicketQueryParams) => {
      setSearchParams(filtersToSearchParams(next, excludeCompleted), { replace: true });
    },
    [setSearchParams, excludeCompleted],
  );

  const setExcludeCompleted = useCallback(
    (val: boolean) => {
      setSearchParams(filtersToSearchParams(filters, val), { replace: true });
    },
    [setSearchParams, filters],
  );

  const mergedFilters = {
    ...filters,
    view: viewMode,
    ...spaceFilter,
    exclude_completed: excludeCompleted || undefined,
    ...(filters.search ? {} : { is_root: true as const }),
  };
  const { data, isLoading } = useTickets(mergedFilters);
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: statusNames } = useStatusNames();
  const { data: categoryNames } = useCategoryNames();
  const { data: milestoneNames } = useMilestoneNames();
  const { data: ticketTags } = useTicketTags();
  const { data: unpostedSpecs } = useQuery({
    queryKey: ["unposted-specs"],
    queryFn: () => fetchUnpostedSpecs().then((r: { data: unknown }) => r.data),
  });
  const queryClient = useQueryClient();
  const [bulkPosting, setBulkPosting] = useState(false);
  const [specsDialogOpen, setSpecsDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  if (projectsLoading || usersLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
        <TicketFilters
          filters={filters}
          onChange={setFilters}
          projects={projects ?? []}
          users={users ?? []}
          statusNames={statusNames ?? []}
          categoryNames={categoryNames ?? []}
          milestoneNames={milestoneNames ?? []}
          ticketTags={ticketTags ?? []}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={excludeCompleted}
              onChange={(e: { target: { checked: boolean } }) => {
                setExcludeCompleted(e.target.checked);
              }}
              size="small"
            />
          }
          label="完了を除外"
          sx={{ whiteSpace: "nowrap", ml: "auto" }}
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          sx={{ whiteSpace: "nowrap" }}
          onClick={() => {
            const { page, ...exportParams } = mergedFilters;
            exportTicketsCsv(exportParams).then((res: { data: Blob }) => {
              const url = URL.createObjectURL(res.data);
              const a = document.createElement("a");
              a.href = url;
              a.download = "tickets.csv";
              a.click();
              URL.revokeObjectURL(url);
            });
          }}
        >
          CSV
        </Button>
        {Array.isArray(unpostedSpecs) && unpostedSpecs.length > 0 && (
          <Badge badgeContent={(unpostedSpecs as UnpostedSpec[]).length} color="warning">
            <Button
              variant="outlined"
              size="small"
              color="warning"
              startIcon={<SendIcon />}
              sx={{ whiteSpace: "nowrap" }}
              onClick={() => setSpecsDialogOpen(true)}
            >
              未投稿方針書
            </Button>
          </Badge>
        )}
      </Box>
      <TicketTable
        data={data}
        filters={mergedFilters}
        onChange={setFilters}
        isLoading={isLoading}
      />

      {/* 未投稿方針書ダイアログ */}
      <Dialog open={specsDialogOpen} onClose={() => setSpecsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>未投稿の方針書</DialogTitle>
        <DialogContent sx={{ px: 1, pb: 0 }}>
          {(unpostedSpecs as UnpostedSpec[] | undefined)?.length ? (
            <List dense>
              {(unpostedSpecs as UnpostedSpec[]).map((spec) => (
                <ListItem
                  key={spec.id}
                  secondaryAction={
                    <Tooltip title="この方針書を削除">
                      <IconButton
                        edge="end"
                        size="small"
                        color="error"
                        disabled={deletingId === spec.id}
                        onClick={() => {
                          setDeletingId(spec.id);
                          deleteComment(spec.ticket_id, spec.id)
                            .then(() => {
                              queryClient.invalidateQueries({ queryKey: ["unposted-specs"] });
                              queryClient.invalidateQueries({ queryKey: ["tickets"] });
                            })
                            .finally(() => setDeletingId(null));
                        }}
                      >
                        {deletingId === spec.id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemText
                    primary={`${spec.issue_key}: ${spec.summary}`}
                    primaryTypographyProps={{ variant: "body2", noWrap: true }}
                    secondary={new Date(spec.created_at).toLocaleString("ja-JP")}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
              未投稿の方針書はありません
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSpecsDialogOpen(false)}>閉じる</Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<SendIcon />}
            disabled={bulkPosting || !(unpostedSpecs as UnpostedSpec[] | undefined)?.length}
            onClick={() => {
              const ids = (unpostedSpecs as UnpostedSpec[]).map((s) => s.id);
              setBulkPosting(true);
              bulkPostComments(ids)
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: ["unposted-specs"] });
                  queryClient.invalidateQueries({ queryKey: ["tickets"] });
                  setSpecsDialogOpen(false);
                })
                .finally(() => setBulkPosting(false));
            }}
          >
            {bulkPosting ? <CircularProgress size={16} /> : "すべて投稿"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
