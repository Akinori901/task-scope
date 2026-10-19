import { Box, CircularProgress, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { useSpaces } from "../hooks/useSpaces";
import BufferTab from "./settings/BufferTab";
import ConnectionTab from "./settings/ConnectionTab";
import DisplayTab from "./settings/DisplayTab";
import MilestoneTab from "./settings/MilestoneTab";
import ProjectTab from "./settings/ProjectTab";
import TagTab from "./settings/TagTab";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const { isLoading } = useSpaces();
  // タブを切り替えても選択を保つものは、ここで持って各タブへ渡す
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const [msFilterProject, setMsFilterProject] = useState<number | "">("");
  const [myselfSpaceId, setMyselfSpaceId] = useState<number | "">("");

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h5" fontWeight={700}>設定</Typography>
      <Tabs
        value={activeTab}
        onChange={(_: unknown, v: number) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 1 }}
      >
        <Tab label="接続設定" />
        <Tab label="プロジェクト設定" />
        <Tab label="マイルストーン" />
        <Tab label="タグ" />
        <Tab label="バッファ" />
        <Tab label="表示設定" />
      </Tabs>

      {activeTab === 0 && <ConnectionTab />}
      {activeTab === 1 && (
        <ProjectTab selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} />
      )}
      {activeTab === 2 && (
        <MilestoneTab msFilterProject={msFilterProject} setMsFilterProject={setMsFilterProject} />
      )}
      {activeTab === 3 && <TagTab />}
      {activeTab === 4 && <BufferTab />}
      {activeTab === 5 && <DisplayTab myselfSpaceId={myselfSpaceId} setMyselfSpaceId={setMyselfSpaceId} />}
    </Box>
  );
}
