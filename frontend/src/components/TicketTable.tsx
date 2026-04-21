import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DescriptionIcon from "@mui/icons-material/Description";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TicketQueryParams } from "../api/client";
import type { PaginatedResponse, Ticket } from "../api/types";
import { useTickets } from "../hooks/useTickets";
import { useTicketTags } from "../hooks/useTicketTags";
import PriorityChip from "./PriorityChip";
import StatusChip from "./StatusChip";

interface Props {
  data: PaginatedResponse<Ticket> | undefined;
  filters: TicketQueryParams;
  onChange: (filters: TicketQueryParams) => void;
  isLoading: boolean;
}

const columns: {
  key: string;
  label: string;
  sortable: boolean;
  width?: number;
}[] = [
  { key: "issue_key", label: "キー", sortable: true, width: 120 },
  { key: "summary", label: "件名", sortable: true },
  { key: "project_key", label: "PJ", sortable: false, width: 80 },
  { key: "status_name", label: "ステータス", sortable: true, width: 110 },
  { key: "custom_tags", label: "次工程", sortable: false, width: 140 },
  { key: "priority_name", label: "優先度", sortable: true, width: 80 },
  { key: "assignee_name", label: "担当者", sortable: false, width: 100 },
  { key: "due_date", label: "期限", sortable: true, width: 110 },
  { key: "eval", label: "評価", sortable: false, width: 60 },
  { key: "spec", label: "方針書", sortable: false, width: 60 },
  { key: "re_eval", label: "再評価", sortable: false, width: 60 },
  { key: "alerts", label: "アラート", sortable: false, width: 140 },
];

function EvalBadge({ ticket }: { ticket: Ticket }) {
  if (!ticket.has_evaluation) {
    return (
      <Tooltip title="未評価">
        <HelpOutlineIcon fontSize="small" sx={{ color: "text.disabled" }} />
      </Tooltip>
    );
  }
  switch (ticket.spec_readiness) {
    case "ready":
      return (
        <Tooltip title="情報十分">
          <CheckCircleIcon fontSize="small" color="success" />
        </Tooltip>
      );
    case "partial":
      return (
        <Tooltip title="一部不足">
          <RemoveCircleOutlineIcon fontSize="small" color="warning" />
        </Tooltip>
      );
    case "not_ready":
      return (
        <Tooltip title="情報不足">
          <RemoveCircleOutlineIcon fontSize="small" color="error" />
        </Tooltip>
      );
    default:
      return (
        <Tooltip title="未評価">
          <HelpOutlineIcon fontSize="small" sx={{ color: "text.disabled" }} />
        </Tooltip>
      );
  }
}

function TicketRow({
  ticket,
  indent = 0,
  expanded,
  onToggle,
  tagColorMap = {},
}: {
  ticket: Ticket;
  indent?: number;
  expanded: boolean;
  onToggle: () => void;
  tagColorMap?: Record<string, string>;
}) {
  const navigate = useNavigate();
  const hasChildren = ticket.child_count > 0;

  return (
    <TableRow
      hover
      sx={{ cursor: "pointer" }}
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          window.open(`/tickets/${ticket.id}`, "_blank");
        }
      }}
    >
      <TableCell>
        <Box sx={{ display: "flex", alignItems: "center", pl: indent * 3 }}>
          {hasChildren && indent === 0 ? (
            <IconButton
              size="small"
              sx={{ p: 0, mr: 0.5 }}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          ) : indent > 0 ? (
            <Box sx={{ width: 22 }} />
          ) : null}
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {ticket.issue_key}
            </Typography>
            {ticket.parent_ticket_key && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10 }}>
                ↑ {ticket.parent_ticket_key}
              </Typography>
            )}
          </Box>
        </Box>
      </TableCell>
      <TableCell>
        {ticket.summary}
        {hasChildren && (
          <Chip label={`子${ticket.child_count}`} size="small" variant="outlined" sx={{ ml: 1, height: 18, fontSize: 10 }} />
        )}
      </TableCell>
      <TableCell>{ticket.project_key}</TableCell>
      <TableCell>
        <StatusChip status={ticket.status_name} />
        {ticket.status_changed_at &&
          Date.now() - new Date(ticket.status_changed_at).getTime() < 86400000 && (
          <Tooltip title={`${ticket.previous_status_name ?? "?"} → ${ticket.status_name}`}>
            <Chip label="更新" size="small" color="info" variant="outlined" sx={{ ml: 0.5, height: 20, fontSize: 11 }} />
          </Tooltip>
        )}
      </TableCell>
      <TableCell>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {ticket.custom_tags?.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              color={(tagColorMap[tag] ?? "default") as "default" | "primary" | "info" | "success" | "warning" | "error" | "secondary"}
              sx={{ height: 20, fontSize: 11 }}
            />
          ))}
        </Box>
      </TableCell>
      <TableCell><PriorityChip priority={ticket.priority_name} /></TableCell>
      <TableCell>{ticket.assignee_name ?? "未割当"}</TableCell>
      <TableCell>{ticket.due_date ?? "—"}</TableCell>
      <TableCell align="center">
        <EvalBadge ticket={ticket} />
      </TableCell>
      <TableCell align="center">
        <Tooltip title={ticket.has_spec ? "方針書あり — クリックで方針書を表示" : "方針書なし"}>
          <DescriptionIcon
            fontSize="small"
            sx={{
              color: ticket.has_spec ? "info.main" : "text.disabled",
              cursor: ticket.has_spec ? "pointer" : "default",
            }}
            onClick={(e) => {
              if (ticket.has_spec) {
                e.stopPropagation();
                navigate(`/tickets/${ticket.id}?tag=spec`);
              }
            }}
          />
        </Tooltip>
      </TableCell>
      <TableCell align="center">
        {ticket.needs_re_evaluation && (
          <Tooltip title="新コメントあり — 再評価推奨">
            <RefreshIcon fontSize="small" sx={{ color: "error.main" }} />
          </Tooltip>
        )}
      </TableCell>
      <TableCell>
        {ticket.is_overdue && (
          <Chip label="遅延" color="error" size="small" sx={{ mr: 0.5 }} />
        )}
        {ticket.is_stagnant && (
          <Chip label={`停滞${ticket.stagnant_days}日`} color="warning" size="small" />
        )}
      </TableCell>
    </TableRow>
  );
}

function ChildRows({ parentId, filters }: { parentId: number; filters: TicketQueryParams }) {
  const { data, isLoading } = useTickets({ ...filters, parent_id: parentId, is_root: undefined, page: 1 });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={columns.length} sx={{ pl: 6 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">読み込み中...</Typography>
          </Box>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {(data?.results ?? []).map((child) => (
        <TicketRow key={child.id} ticket={child} indent={1} expanded={false} onToggle={() => {}} />
      ))}
    </>
  );
}

export default function TicketTable({
  data,
  filters,
  onChange,
  isLoading,
}: Props) {
  const { data: ticketTags } = useTicketTags();
  const tagColorMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    ticketTags?.forEach((t) => { map[t.name] = t.color; });
    return map;
  }, [ticketTags]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const currentOrdering = filters.ordering ?? "";
  const orderDir = currentOrdering.startsWith("-") ? "desc" : "asc";
  const orderBy = currentOrdering.replace(/^-/, "");

  const handleSort = (key: string) => {
    const isAsc = orderBy === key && orderDir === "asc";
    onChange({ ...filters, ordering: isAsc ? `-${key}` : key });
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    onChange({ ...filters, page: newPage + 1 });
  };

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const page = (filters.page ?? 1) - 1;
  const count = data?.count ?? 0;

  return (
    <Paper>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell key={col.key} sx={{ width: col.width, fontWeight: 700 }}>
                  {col.sortable ? (
                    <TableSortLabel
                      active={orderBy === col.key}
                      direction={orderBy === col.key ? orderDir : "asc"}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  ) : (
                    col.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center">
                  読み込み中…
                </TableCell>
              </TableRow>
            ) : data?.results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center">
                  <Typography color="text.secondary">該当チケットなし</Typography>
                </TableCell>
              </TableRow>
            ) : (
              data?.results.map((ticket) => (
                <React.Fragment key={ticket.id}>
                  <TicketRow
                    ticket={ticket}
                    expanded={expanded.has(ticket.id)}
                    onToggle={() => toggle(ticket.id)}
                    tagColorMap={tagColorMap}
                  />
                  {expanded.has(ticket.id) && ticket.child_count > 0 && (
                    <ChildRows parentId={ticket.id} filters={filters} />
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={count}
        page={page}
        onPageChange={handlePageChange}
        rowsPerPage={20}
        rowsPerPageOptions={[20]}
        labelDisplayedRows={({ from, to, count: c }) =>
          `${from}–${to} / ${c}`
        }
      />
    </Paper>
  );
}
