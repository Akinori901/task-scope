/**
 * QA 項目コメントの表示。
 *
 * QA の生成結果は JSON 文字列としてコメントに保存されるため、そのまま
 * 表示すると読めない。ここで表に整形する。JSON として読めない場合は
 * 元のテキストをそのまま出す（内容を失わないため）。
 */
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

interface QaItem {
  category?: string;
  precondition?: string;
  steps?: string;
  expected?: string;
  note?: string;
}

function parseItems(content: string): QaItem[] | null {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const items = JSON.parse(match[0])?.qa_items;
    return Array.isArray(items) ? (items as QaItem[]) : null;
  } catch {
    return null;
  }
}

export default function QaItemsView({ content }: { content: string }) {
  const items = parseItems(content);

  if (!items) {
    return (
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {content}
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        QA項目 {items.length} 件
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mt: 1, maxHeight: 600 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }}>#</TableCell>
              <TableCell sx={{ minWidth: 100 }}>分類</TableCell>
              <TableCell sx={{ minWidth: 140 }}>前提条件</TableCell>
              <TableCell sx={{ minWidth: 200 }}>手順</TableCell>
              <TableCell sx={{ minWidth: 200 }}>期待結果</TableCell>
              <TableCell sx={{ minWidth: 120 }}>備考</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, i) => (
              <TableRow key={i} hover>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell sx={{ whiteSpace: "pre-wrap" }}>{item.precondition}</TableCell>
                <TableCell sx={{ whiteSpace: "pre-wrap" }}>{item.steps}</TableCell>
                <TableCell sx={{ whiteSpace: "pre-wrap" }}>{item.expected}</TableCell>
                <TableCell sx={{ whiteSpace: "pre-wrap" }}>{item.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
