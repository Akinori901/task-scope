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
import { useState } from "react";
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

export default function TicketListPage() {
  const viewMode = useViewStore((s) => s.viewMode);
  const spaceId = useViewStore((s) => s.spaceId);
  const spaceFilter = parseSpaceId(spaceId);
  const [excludeCompleted, setExcludeCompleted] = useState(true);
  const [filters, setFilters] = useState<TicketQueryParams>({
    view: viewMode,
    ordering: "-backlog_updated",
    page: 1,
  });

  const mergedFilters = {
    ...filters,
    view: viewMode,
    ...spaceFilter,
    exclude_completed: excludeCompleted || undefined,
    is_root: true as const,
  };
  const { data, isLoading } = useTickets(mergedFilters);
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: statusNames } = useStatusNames();
  const { data: categoryNames } = useCategoryNames();
  const { data: milestoneNames } = useMilestoneNames();
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
          filters={mergedFilters}
          onChange={setFilters}
          projects={projects ?? []}
          users={users ?? []}
          statusNames={statusNames ?? []}
          categoryNames={categoryNames ?? []}
          milestoneNames={milestoneNames ?? []}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={excludeCompleted}
              onChange={(e: { target: { checked: boolean } }) => {
                setExcludeCompleted(e.target.checked);
                setFilters({ ...filters, page: 1 });
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
