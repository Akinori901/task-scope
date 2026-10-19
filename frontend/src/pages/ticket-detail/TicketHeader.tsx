import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PushPinIcon from "@mui/icons-material/PushPin";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Box, Button, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PinnedTicketData } from "../../api/client";
import { fetchPinnedTickets, pinTicket, unpinTicket } from "../../api/client";
import StatusChip from "../../components/StatusChip";
import { useTicketTags, useUpdateTicketCustomTags } from "../../hooks/useTicketTags";
import type { TicketDetail } from "../../api/types";

interface Props {
  ticket: TicketDetail;
  ticketId: number;
}

/** チケット詳細のヘッダー: 戻る・課題キー・状態・次工程タグ・ピン留め */
export default function TicketHeader({ ticket, ticketId }: Props) {
  const navigate = useNavigate();
  const customTagsMutation = useUpdateTicketCustomTags(ticketId);
  const queryClient = useQueryClient();
  const { data: ticketTagDefs } = useTicketTags();
  const { data: pinnedTickets } = useQuery({
    queryKey: ["pinned-tickets"],
    queryFn: () =>
      fetchPinnedTickets().then((r: { data: PinnedTicketData[] }) =>
        Array.isArray(r.data) ? r.data : [],
      ),
  });
  const currentPin = pinnedTickets?.find((p: PinnedTicketData) => p.ticket.id === ticketId);
  const pinMutation = useMutation({
    mutationFn: () => pinTicket(ticketId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pinned-tickets"] }),
  });
  const unpinMutation = useMutation({
    mutationFn: (pinId: number) => unpinTicket(pinId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pinned-tickets"] }),
  });

  return (
    <>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, position: "sticky", top: 0, zIndex: 10, bgcolor: "background.default", mx: -3, px: 3, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          size="small"
        >
          戻る
        </Button>
        <Box>
          {ticket.parent_ticket_key && (
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: "pointer", display: "block", lineHeight: 1 }}
              onClick={() => {
                if (ticket.parent_ticket_id) navigate(`/tickets/${ticket.parent_ticket_id}`);
              }}
            >
              ↑ {ticket.parent_ticket_key}
            </Typography>
          )}
          <Typography variant="h5" fontWeight={700}>
            {ticket.issue_key}
          </Typography>
        </Box>
        {ticket.external_url && (
          <Tooltip title={`${ticket.source_type === "jira" ? "Jira" : "Backlog"} で開く`}>
            <IconButton
              size="small"
              component="a"
              href={ticket.external_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <OpenInNewIcon />
            </IconButton>
          </Tooltip>
        )}
        <StatusChip status={ticket.status_name} />
        {ticket.is_overdue && <Chip label="遅延" color="error" size="small" />}
        {ticket.is_stagnant && (
          <Chip
            label={`停滞${ticket.stagnant_days}日`}
            color="warning"
            size="small"
          />
        )}
        {ticketTagDefs && ticketTagDefs.length > 0 && (
          <>
            <Box sx={{ borderLeft: 1, borderColor: "divider", height: 24, mx: 0.5 }} />
            {ticketTagDefs.map((tagDef) => {
              const active = ticket.custom_tags?.includes(tagDef.name);
              return (
                <Chip
                  key={tagDef.id}
                  label={tagDef.name}
                  size="small"
                  color={(active ? tagDef.color : "default") as "default" | "primary" | "info" | "success" | "warning" | "error" | "secondary"}
                  variant={active ? "filled" : "outlined"}
                  onClick={() => {
                    const current = ticket.custom_tags ?? [];
                    const next = active
                      ? current.filter((t: string) => t !== tagDef.name)
                      : [...current, tagDef.name];
                    customTagsMutation.mutate(next);
                  }}
                  sx={{ cursor: "pointer" }}
                />
              );
            })}
          </>
        )}
        <Tooltip title={currentPin ? "ピン解除" : "ピン留め"}>
          <IconButton
            size="small"
            onClick={() => {
              if (currentPin) {
                unpinMutation.mutate(currentPin.id);
              } else {
                pinMutation.mutate();
              }
            }}
            sx={{ color: currentPin ? "primary.main" : "text.disabled", ml: "auto" }}
          >
            <PushPinIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </>
  );
}
