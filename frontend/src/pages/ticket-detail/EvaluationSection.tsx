import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import type { TicketEvaluation } from "../../api/types";

interface Props {
  evaluation: TicketEvaluation | null;
}

const READINESS_LABELS = {
  ready: { label: "作成可能", color: "success" as const },
  partial: { label: "一部不足", color: "warning" as const },
  not_ready: { label: "情報不足", color: "error" as const },
};

const FEASIBILITY_LABELS = {
  feasible: { label: "妥当", color: "success" as const },
  risky: { label: "リスクあり", color: "warning" as const },
  unrealistic: { label: "非現実的", color: "error" as const },
  unknown: { label: "判定不可", color: "default" as const },
};

/** 情報品質評価（折りたたみ） */
export default function EvaluationSection({ evaluation }: Props) {

  return (
    <>
      {/* 情報品質評価 (折りたたみサブセクション) */}
      {evaluation && (
        <Accordion defaultExpanded={false} sx={{ bgcolor: "background.paper" }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
              <Typography variant="subtitle1" fontWeight={600}>
                チケット品質
              </Typography>
              <Chip
                label={READINESS_LABELS[evaluation.spec_readiness].label}
                color={READINESS_LABELS[evaluation.spec_readiness].color}
                size="small"
              />
              <Chip
                label={FEASIBILITY_LABELS[evaluation.schedule_feasibility].label}
                color={FEASIBILITY_LABELS[evaluation.schedule_feasibility].color}
                size="small"
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ ml: "auto", mr: 1 }}
              >
                {new Date(evaluation.evaluated_at).toLocaleString("ja-JP")}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  情報充足度
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={evaluation.info_completeness_score}
                    sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                    color={
                      evaluation.info_completeness_score >= 70
                        ? "success"
                        : evaluation.info_completeness_score >= 40
                          ? "warning"
                          : "error"
                    }
                  />
                  <Typography variant="body2" fontWeight={700}>
                    {evaluation.info_completeness_score}%
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  方針書作成可否
                </Typography>
                <Chip
                  label={READINESS_LABELS[evaluation.spec_readiness].label}
                  color={READINESS_LABELS[evaluation.spec_readiness].color}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  日程妥当性
                </Typography>
                <Chip
                  label={FEASIBILITY_LABELS[evaluation.schedule_feasibility].label}
                  color={FEASIBILITY_LABELS[evaluation.schedule_feasibility].color}
                  size="small"
                />
              </Grid>
            </Grid>

            {/* Summary */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                サマリ
              </Typography>
              <Typography variant="body1">{evaluation.summary}</Typography>
            </Box>

            {evaluation.schedule_comment && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  日程コメント
                </Typography>
                <Typography variant="body1">{evaluation.schedule_comment}</Typography>
              </Box>
            )}

            {evaluation.missing_items.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  欠損情報
                </Typography>
                <List dense>
                  {evaluation.missing_items.map((item: string, i: number) => (
                    <ListItem key={i}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <Typography color="error" variant="body2">・</Typography>
                      </ListItemIcon>
                      <ListItemText primary={item} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {evaluation.pr_urls.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  検出された PR
                </Typography>
                <List dense>
                  {evaluation.pr_urls.map((url: string, i: number) => (
                    <ListItem key={i}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <OpenInNewIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Link href={url} target="_blank" rel="noopener">
                            {url}
                          </Link>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
                <Typography variant="caption" color="text.secondary">
                  Claude Code で /wf-review を実行し PR URL を渡すとコードレビューが可能です
                </Typography>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      )}
    </>
  );
}
