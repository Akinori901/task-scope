import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TicketQueryParams } from "../api/client";
import type { GanttMilestone, Ticket } from "../api/types";
import { useTickets } from "../hooks/useTickets";

// ---- constants ----
const W = 24; // week column width in px
const LABEL_W = 280; // left label column width in px
const ROW_H = 96; // milestone row height
const TICKET_H = 48; // ticket row height
const HEADER_H = 28; // each header row height
const BAR_H = 32;
const TICKET_BAR_H = 22;

// ---- helpers ----
function getMonday(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface Week {
  start: Date;
  month: number; // 0-11
  year: number;
  weekInMonth: number; // 1-based
}

function buildWeeks(start: Date, end: Date): Week[] {
  const weeks: Week[] = [];
  let cur = getMonday(start);
  const stop = addDays(getMonday(end), 7);
  while (cur < stop) {
    weeks.push({
      start: new Date(cur),
      month: cur.getMonth(),
      year: cur.getFullYear(),
      weekInMonth: Math.ceil(cur.getDate() / 7),
    });
    cur = addDays(cur, 7);
  }
  return weeks;
}

interface MonthGroup {
  label: string;
  span: number;
}
function buildMonths(weeks: Week[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const w of weeks) {
    const label = `${w.month + 1}月`;
    if (groups.length > 0 && groups[groups.length - 1]!.label === label) {
      groups[groups.length - 1]!.span++;
    } else {
      groups.push({ label, span: 1 });
    }
  }
  return groups;
}

/** Returns column indices [startCol, endCol) that a date range spans */
function barCols(
  startStr: string,
  endStr: string,
  weeks: Week[],
): { startCol: number; endCol: number } | null {
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || weeks.length === 0) return null;
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const firstWeek = weeks[0]!.start.getTime();
  const startCol = Math.max(0, (s.getTime() - firstWeek) / 604800000);
  const endCol = Math.min(weeks.length, (e.getTime() - firstWeek) / 604800000 + 1);
  if (endCol <= 0 || startCol >= weeks.length) return null;
  return { startCol: Math.max(0, startCol), endCol: Math.min(weeks.length, endCol) };
}

function todayCol(weeks: Week[]): number | null {
  if (weeks.length === 0) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const first = weeks[0]!.start.getTime();
  const col = (now.getTime() - first) / 604800000;
  if (col < 0 || col > weeks.length) return null;
  return col;
}

// ---- helpers ----
function ticketBarColor(t: Ticket): string {
  if (t.is_stagnant) return "#fb8c00";
  if (t.is_overdue) return "#e53935";
  if (t.status_name === "完了" || t.status_name === "Done" || t.status_name === "Closed") return "#43a047";
  if (t.status_name === "未対応" || t.status_name === "Open") return "#bdbdbd";
  return "#90caf9";
}

// ---- Single ticket row (reused for parent and child) ----
function GanttTicketRow({
  ticket,
  weeks,
  indent,
  hasChildren,
  isExpanded,
  onToggle,
}: {
  ticket: Ticket;
  weeks: Week[];
  indent: number;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle?: () => void;
}) {
  const navigate = useNavigate();
  const bar = ticket.start_date && ticket.due_date ? barCols(ticket.start_date, ticket.due_date, weeks) : null;
  const barColor = ticketBarColor(ticket);
  const pl = 12 + indent * 16;

  return (
    <tr
      style={{ cursor: "pointer" }}
      onClick={() => navigate(`/tickets/${ticket.id}`)}
    >
      <td
        style={{
          position: "sticky",
          left: 0,
          zIndex: 2,
          width: LABEL_W,
          minWidth: LABEL_W,
          maxWidth: LABEL_W,
          height: TICKET_H,
          borderBottom: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          paddingLeft: pl,
          paddingRight: 4,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          background: "var(--bg-sub)",
          fontSize: 12,
        }}
      >
        {hasChildren && onToggle && (
          <span
            style={{ cursor: "pointer", marginRight: 2, fontSize: 14, verticalAlign: "middle" }}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {isExpanded ? "▾" : "▸"}
          </span>
        )}
        <span style={{ color: "var(--primary)", fontWeight: 600, marginRight: 4 }}>{ticket.issue_key}</span>
        <span style={{ color: "var(--text-secondary)" }}>{ticket.summary}</span>
        {hasChildren && (
          <span style={{ color: "var(--text-secondary)", fontSize: 10, marginLeft: 4 }}>({ticket.child_count})</span>
        )}
      </td>
      <td
        colSpan={weeks.length}
        style={{
          position: "relative",
          height: TICKET_H,
          borderBottom: "1px solid var(--border)",
          padding: 0,
        }}
      >
        {weeks.map((_, ci) => (
          <div
            key={ci}
            style={{
              position: "absolute",
              left: (ci / weeks.length) * 100 + "%",
              top: 0,
              bottom: 0,
              width: (1 / weeks.length) * 100 + "%",
              borderRight: "1px solid var(--border-light)",
              pointerEvents: "none",
            }}
          />
        ))}
        {bar && (
          <div
            style={{
              position: "absolute",
              top: (TICKET_H - TICKET_BAR_H) / 2,
              left: `${(bar.startCol / weeks.length) * 100}%`,
              width: `${((bar.endCol - bar.startCol) / weeks.length) * 100}%`,
              height: TICKET_BAR_H,
              background: barColor,
              borderRadius: 2,
            }}
          />
        )}
      </td>
    </tr>
  );
}

// ---- Child ticket rows (fetched on demand) ----
function ChildTicketRows({
  parentId,
  filters,
  weeks,
}: {
  parentId: number;
  filters: TicketQueryParams;
  weeks: Week[];
}) {
  const { data, isLoading } = useTickets({
    ...filters,
    parent_id: parentId,
    is_root: undefined,
    milestone: undefined,
    page: 1,
    ordering: "due_date",
  });

  if (isLoading) {
    return (
      <tr>
        <td colSpan={1 + weeks.length} style={{ height: TICKET_H, paddingLeft: 48 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">読み込み中...</Typography>
          </Box>
        </td>
      </tr>
    );
  }

  return (
    <>
      {(data?.results ?? []).map((child: Ticket) => (
        <GanttTicketRow key={child.id} ticket={child} weeks={weeks} indent={2} hasChildren={false} isExpanded={false} />
      ))}
    </>
  );
}

// ---- Ticket expansion sub-component (with parent-child hierarchy) ----
function TicketRows({
  milestoneName,
  filters,
  weeks,
}: {
  milestoneName: string;
  filters: TicketQueryParams;
  weeks: Week[];
}) {
  const [expandedTickets, setExpandedTickets] = useState<Set<number>>(new Set());
  const { data, isLoading } = useTickets({
    ...filters,
    milestone: milestoneName,
    is_root: true,
    page: 1,
    ordering: "due_date",
  });

  const toggleTicket = (id: number) => {
    setExpandedTickets((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  if (isLoading) {
    return (
      <tr>
        <td colSpan={1 + weeks.length} style={{ height: TICKET_H, paddingLeft: 32 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">読み込み中...</Typography>
          </Box>
        </td>
      </tr>
    );
  }

  const tickets = data?.results ?? [];
  if (tickets.length === 0) {
    return (
      <tr>
        <td colSpan={1 + weeks.length} style={{ height: TICKET_H, paddingLeft: 32 }}>
          <Typography variant="caption" color="text.secondary">チケットなし</Typography>
        </td>
      </tr>
    );
  }

  return (
    <>
      {tickets.map((t: Ticket) => {
        const hasChildren = t.child_count > 0;
        const isExp = expandedTickets.has(t.id);
        return (
          <React.Fragment key={t.id}>
            <GanttTicketRow
              ticket={t}
              weeks={weeks}
              indent={1}
              hasChildren={hasChildren}
              isExpanded={isExp}
              onToggle={() => toggleTicket(t.id)}
            />
            {isExp && hasChildren && (
              <ChildTicketRows parentId={t.id} filters={filters} weeks={weeks} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ---- Main ----
interface Props {
  milestones: GanttMilestone[];
  filters: TicketQueryParams;
  timelineStartDate?: string | null;
}

export default function GanttChart({ milestones, filters, timelineStartDate }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (milestones.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography color="text.secondary">
          日付が設定されたマイルストーンがありません。設定 &gt; マイルストーン で期間を設定してください。
        </Typography>
      </Box>
    );
  }

  const allEnds = milestones.map((m) => new Date(m.end_date));
  const timelineStart = timelineStartDate
    ? new Date(timelineStartDate)
    : addDays(new Date(Math.min(...milestones.map((m) => new Date(m.start_date).getTime()))), -14);
  const timelineEnd = addDays(new Date(Math.max(...allEnds.map((d) => d.getTime()))), 14);
  const weeks = buildWeeks(timelineStart, timelineEnd);
  const months = buildMonths(weeks);
  const tCol = todayCol(weeks);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // CSS variables for theming
  const cssVars = {
    "--border": "rgba(255,255,255,0.08)",
    "--border-light": "rgba(255,255,255,0.04)",
    "--bg-header": "rgba(255,255,255,0.04)",
    "--bg-sub": "var(--mui-palette-background-paper, #1e1e1e)",
    "--primary": "var(--mui-palette-primary-main, #90caf9)",
    "--text-secondary": "var(--mui-palette-text-secondary, #aaa)",
  } as React.CSSProperties;

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        overflow: "auto",
        maxHeight: "calc(100vh - 200px)",
      }}
      style={cssVars}
    >
      <table
        style={{
          borderCollapse: "collapse",
          tableLayout: "fixed",
          width: LABEL_W + weeks.length * W,
        }}
      >
        <colgroup>
          <col style={{ width: LABEL_W }} />
          {weeks.map((_, i) => (
            <col key={i} style={{ width: W }} />
          ))}
        </colgroup>

        {/* ---- Header ---- */}
        <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
          {/* Month row */}
          <tr>
            <th
              rowSpan={2}
              style={{
                position: "sticky",
                left: 0,
                zIndex: 11,
                width: LABEL_W,
                minWidth: LABEL_W,
                height: HEADER_H * 2,
                background: "var(--bg-header)",
                borderBottom: "2px solid var(--border)",
                borderRight: "1px solid var(--border)",
                textAlign: "left",
                paddingLeft: 12,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              マイルストーン
            </th>
            {months.map((mg, mi) => (
              <th
                key={mi}
                colSpan={mg.span}
                style={{
                  height: HEADER_H,
                  background: "var(--bg-header)",
                  borderBottom: "1px solid var(--border)",
                  borderRight: "1px solid var(--border)",
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {mg.label}
              </th>
            ))}
          </tr>
          {/* Week row */}
          <tr>
            {weeks.map((w, wi) => (
              <th
                key={wi}
                style={{
                  height: HEADER_H,
                  background: "var(--bg-header)",
                  borderBottom: "2px solid var(--border)",
                  borderRight: "1px solid var(--border-light)",
                  fontSize: 11,
                  fontWeight: 400,
                  textAlign: "center",
                  color: "var(--text-secondary)",
                }}
              >
                {w.weekInMonth}w
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {milestones.map((ms) => {
            const isExp = expanded.has(ms.id);
            const bar = barCols(ms.start_date, ms.end_date, weeks);
            const { stats } = ms;

            return (
              <MilestoneSection
                key={ms.id}
                ms={ms}
                bar={bar}
                stats={stats}
                isExpanded={isExp}
                onToggle={() => toggle(ms.id)}
                weeks={weeks}
                tCol={tCol}
                filters={filters}
              />
            );
          })}
        </tbody>
      </table>
    </Box>
  );
}

// ---- Milestone section (row + optional ticket rows) ----
function MilestoneSection({
  ms,
  bar,
  stats,
  isExpanded,
  onToggle,
  weeks,
  tCol,
  filters,
}: {
  ms: GanttMilestone;
  bar: { startCol: number; endCol: number } | null;
  stats: GanttMilestone["stats"];
  isExpanded: boolean;
  onToggle: () => void;
  weeks: Week[];
  tCol: number | null;
  filters: TicketQueryParams;
}) {
  return (
    <>
      {/* Milestone row */}
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        {/* Label cell */}
        <td
          style={{
            position: "sticky",
            left: 0,
            zIndex: 2,
            width: LABEL_W,
            minWidth: LABEL_W,
            maxWidth: LABEL_W,
            height: ROW_H,
            borderBottom: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
            padding: "4px 8px",
            background: "var(--bg-sub)",
            verticalAlign: "top",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
            <IconButton size="small" sx={{ p: 0 }}>
              {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
            </IconButton>
            <Typography variant="body2" fontWeight={600} noWrap title={ms.name} sx={{ flex: 1 }}>
              {ms.name}
            </Typography>
          </Box>
          <Box sx={{ pl: 2.5, fontSize: 11, lineHeight: 1.5 }}>
            <Box component="span" sx={{ color: "text.secondary" }}>
              総チケット数｜<span style={{ fontWeight: 700 }}>{stats.total}件</span>{" "}
              達成率 <span style={{ color: stats.completion_rate > 0 ? "#388e3c" : "#bdbdbd", fontWeight: 700 }}>{stats.completion_rate}%</span>
            </Box>
            <br />
            <Box component="span" sx={{ color: "text.secondary" }}>
              <span style={{ color: "#78909c" }}>未着手</span>｜{stats.not_started}件{" "}
              <span style={{ color: "#42a5f5" }}>進行中</span>｜{stats.in_progress}件{" "}
              <span style={{ color: "#388e3c" }}>完了</span>｜{stats.completed}件
              {stats.stagnant > 0 && <>{" "}<span style={{ color: "#ffa726" }}>停滞</span>｜{stats.stagnant}件</>}
            </Box>
          </Box>
        </td>

        {/* Timeline cell spanning all weeks */}
        <td
          colSpan={weeks.length}
          style={{
            position: "relative",
            height: ROW_H,
            borderBottom: "1px solid var(--border)",
            padding: 0,
          }}
        >
          {/* Week grid lines */}
          {weeks.map((_, ci) => (
            <div
              key={ci}
              style={{
                position: "absolute",
                left: (ci / weeks.length) * 100 + "%",
                top: 0,
                bottom: 0,
                width: (1 / weeks.length) * 100 + "%",
                borderRight: "1px solid var(--border-light)",
                pointerEvents: "none",
              }}
            />
          ))}
          {/* Today line */}
          {tCol !== null && (
            <div
              style={{
                position: "absolute",
                left: `${(tCol / weeks.length) * 100}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: "#e53935",
                zIndex: 3,
                pointerEvents: "none",
              }}
            />
          )}
          {/* Milestone bar */}
          {bar && (
            <Tooltip title={`${ms.start_date} ~ ${ms.end_date} (${stats.total}件)`}>
              <div
                style={{
                  position: "absolute",
                  top: (ROW_H - BAR_H) / 2,
                  left: `${(bar.startCol / weeks.length) * 100}%`,
                  width: `${((bar.endCol - bar.startCol) / weeks.length) * 100}%`,
                  height: BAR_H,
                  display: "flex",
                  overflow: "hidden",
                  borderRadius: 3,
                }}
              >
                {stats.total > 0 ? (
                  <>
                    {stats.completed > 0 && <div style={{ width: `${(stats.completed / stats.total) * 100}%`, background: "#388e3c" }} />}
                    {stats.in_progress > 0 && <div style={{ width: `${(stats.in_progress / stats.total) * 100}%`, background: "#42a5f5" }} />}
                    {stats.stagnant > 0 && <div style={{ width: `${(stats.stagnant / stats.total) * 100}%`, background: "#ffa726" }} />}
                    {stats.not_started > 0 && <div style={{ width: `${(stats.not_started / stats.total) * 100}%`, background: "#78909c" }} />}
                  </>
                ) : (
                  <div style={{ width: "100%", background: "#e0e0e0" }} />
                )}
              </div>
            </Tooltip>
          )}
        </td>
      </tr>

      {/* Expanded tickets */}
      {isExpanded && (
        <TicketRows milestoneName={ms.name} filters={filters} weeks={weeks} />
      )}
    </>
  );
}
