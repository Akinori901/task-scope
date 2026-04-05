import PushPinIcon from "@mui/icons-material/PushPin";
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { PinnedTicketData } from "../api/client";
import { fetchPinnedTickets, unpinTicket } from "../api/client";
import StatusChip from "./StatusChip";

export default function PinnedTicketsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: pins } = useQuery({
    queryKey: ["pinned-tickets"],
    queryFn: () => fetchPinnedTickets().then((r: { data: PinnedTicketData[] }) => r.data),
  });

  const unpinMutation = useMutation({
    mutationFn: (pinId: number) => unpinTicket(pinId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pinned-tickets"] }),
  });

  if (!pins || pins.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PushPinIcon color="primary" fontSize="small" />
          ピン留め ({pins.length})
        </Typography>
        <List dense disablePadding>
          {pins.map((pin) => (
            <ListItemButton
              key={pin.id}
              onClick={() => navigate(`/tickets/${pin.ticket.id}`)}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ minWidth: 100 }}>
                      {pin.ticket.issue_key}
                    </Typography>
                    <Typography variant="body2" noWrap>
                      {pin.ticket.summary}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                    <Chip label={pin.ticket.project_key} size="small" variant="outlined" />
                    <StatusChip status={pin.ticket.status_name} />
                    {pin.ticket.assignee_name && (
                      <Typography variant="caption" color="text.secondary">
                        {pin.ticket.assignee_name}
                      </Typography>
                    )}
                    {pin.ticket.is_overdue && <Chip label="遅延" color="error" size="small" />}
                    {pin.ticket.is_stagnant && (
                      <Chip label={`停滞${pin.ticket.stagnant_days}日`} color="warning" size="small" />
                    )}
                    {pin.note && (
                      <Typography variant="caption" color="text.secondary">
                        {pin.note}
                      </Typography>
                    )}
                  </Box>
                }
              />
              <Tooltip title="ピン解除">
                <IconButton
                  size="small"
                  onClick={(e: { stopPropagation: () => void }) => {
                    e.stopPropagation();
                    unpinMutation.mutate(pin.id);
                  }}
                  sx={{ color: "text.disabled" }}
                >
                  <PushPinIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </ListItemButton>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
