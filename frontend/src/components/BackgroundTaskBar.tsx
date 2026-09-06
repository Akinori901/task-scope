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
import { useState } from "react";

import { getDismissedTasks, markTaskDismissed } from "../utils/taskState";

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
    queryFn: () =>
      fetchBackgroundTasks().then((r: { data: BackgroundTask[] }) =>
        // 認証レースや非配列レスポンスでも落ちないよう配列を保証
        Array.isArray(r.data) ? r.data : [],
      ),
    refetchInterval: (query) => {
      const data = query.state.data as BackgroundTask[] | undefined;
      if (data?.some((t) => t.status === "running")) return 3000;
      return false;
    },
  });

  // 非表示は localStorage を正とする。サーバ側の削除が失敗しても
  // （権限不足など）リロードで通知が復活しないようにするため。
  const [hidden, setHidden] = useState<Set<string>>(() => getDismissedTasks());

  const handleDismiss = (taskId: string) => {
    markTaskDismissed(taskId);
    setHidden((prev) => new Set(prev).add(taskId));
    deleteBackgroundTask(taskId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["background-tasks"] });
      })
      .catch(() => {
        /* サーバ側で消えなくてもローカルの非表示記録で消えたままになる */
      });
  };

  // 「表示」は該当コメントへ移動するだけ。通知は消さない
  // （消すかどうかは × で明示的に決める）。
  const handleNavigate = (task: BackgroundTask) => {
    navigate(task.task_type ? `/tickets/${task.ticket_id}?tag=${task.task_type}` : `/tickets/${task.ticket_id}`);
  };

  // 完了/失敗タスクがあればチケット詳細も再取得
  const completedOrFailed = tasks?.filter((t) => t.status !== "running") ?? [];
  if (completedOrFailed.length > 0) {
    for (const task of completedOrFailed) {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", task.ticket_id] });
    }
  }

  const visibleTasks = (tasks ?? []).filter((t) => !hidden.has(t.task_id));
  if (visibleTasks.length === 0) return null;

  return (
    <Box sx={{ px: 3, pt: 1 }}>
      {visibleTasks.map((task) => (
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
              {(() => {
                const LABELS: Record<string, string> = {
                  evaluate: "採点",
                  qa: "QA項目生成",
                  spec: "方針書生成",
                  survey: "調査報告書生成",
                  plan: "実装計画書生成",
                  record: "実行記録生成",
                  completion: "完了報告生成",
                };
                // 未知の種別を「方針書生成」と誤表示しないこと（採点が方針書と
                // 表示される不具合があった）。分からなければ種別名を出す。
                const label = LABELS[task.task_type ?? ""] ?? task.task_type ?? "AI処理";
                if (task.status === "running") return `${label}中: ${task.issue_key} ${task.summary ?? ""}`;
                if (task.status === "completed")
                  return task.task_type === "qa"
                    ? `QA項目生成完了: ${task.issue_key}（Excelをダウンロードしました）`
                    : `${label}完了: ${task.issue_key}`;
                return `${label}失敗: ${task.issue_key}`;
              })()}
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
