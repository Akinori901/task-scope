import { Card, CardContent, Typography } from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AssigneeWorkload } from "../api/types";

interface Props {
  data: AssigneeWorkload[];
}

export default function WorkloadChart({ data }: Props) {
  // API がエラーオブジェクトを返すと data は undefined になりうるため正規化する
  const rows = Array.isArray(data) ? data : [];
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          担当者別負荷
        </Typography>
        {rows.length === 0 ? (
          <Typography color="text.secondary">データなし</Typography>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" name="担当数" fill="#1976d2" />
              <Bar dataKey="overdue" name="遅延" fill="#d32f2f" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
