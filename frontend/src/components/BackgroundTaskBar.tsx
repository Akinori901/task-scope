import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { BackgroundTask } from "../api/client";
import { deleteBackgroundTask, fetchBackgroundTasks } from "../api/client";

export default function BackgroundTaskBar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: tasks } = useQuery({
    queryKey: ["background-tasks"],
    queryFn: () => fetchBackgroundTasks().then((r: { data: BackgroundTask[] }) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as BackgroundTask[] | undefined;
      if (data?.some((t) => t.status === "running")) return 3000;
      return false;
    },
  });

  const handleDismiss = (taskId: string) => {
    deleteBackgroundTask(taskId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["background-tasks"] });
    });
  };

  const handleNavigate = (task: BackgroundTask) => {
    navigate(`/tickets/${task.ticket_id}`);
    if (task.status !== "running") {
      handleDismiss(task.task_id);
    }
  };

  // 完了/失敗タスクがあればチケット詳細も再取得
  const completedOrFailed = tasks?.filter((t) => t.status !== "running") ?? [];
  if (completedOrFailed.length > 0) {
    for (const task of completedOrFailed) {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", task.ticket_id] });
    }
  }

  if (!tasks || tasks.length === 0) return null;

  return (
    <Box sx={{ px: 3, pt: 1 }}>
      {tasks.map((task) => (
        <Collapse key={task.task_id} in>
          <Alert
            severity={
              task.status === "completed" ? "success" :
              task.status === "failed" ? "error" : "info"
            }
            icon={
              task.status === "running" ? <CircularProgress size={20} /> :
              task.status === "completed" ? <CheckCircleIcon /> :
              <ErrorIcon />
            }
            action={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {task.status === "completed" && (
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => handleNavigate(task)}
                  >
                    表示
                  </Button>
                )}
                {task.status !== "running" && (
                  <IconButton size="small" color="inherit" onClick={() => handleDismiss(task.task_id)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            }
            sx={{ mb: 1 }}
          >
            <Typography variant="body2">
              {task.status === "running" && `方針書生成中: ${task.issue_key} ${task.summary ?? ""}`}
              {task.status === "completed" && `方針書生成完了: ${task.issue_key}`}
              {task.status === "failed" && `方針書生成失敗: ${task.issue_key}`}
            </Typography>
            {task.status === "failed" && task.error && (
              <Typography variant="caption" sx={{ display: "block", mt: 0.5, whiteSpace: "pre-wrap" }}>
                {task.error}
              </Typography>
            )}
          </Alert>
        </Collapse>
      ))}
    </Box>
  );
}
