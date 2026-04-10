import SyncIcon from "@mui/icons-material/Sync";
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  FormControl,
  MenuItem,
  Select,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from "@mui/material";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { ViewMode } from "../api/types";
import BackgroundTaskBar from "./BackgroundTaskBar";
import { useAutoSync } from "../hooks/useAutoSync";
import { useJiraSpaces } from "../hooks/useJiraSpaces";
import { useSpaces } from "../hooks/useSpaces";
import { useSync } from "../hooks/useSync";
import { useViewStore } from "../stores/viewStore";

export default function Layout() {
  const { viewMode, setViewMode, spaceId, setSpaceId } = useViewStore();
  const syncMutation = useSync();
  const { data: spaces } = useSpaces();
  const { data: jiraSpaces } = useJiraSpaces();
  useAutoSync(spaces);
  const navigate = useNavigate();
  const location = useLocation();

  const currentTab = location.pathname === "/settings"
    ? 3
    : location.pathname.startsWith("/gantt")
      ? 2
      : location.pathname.startsWith("/tickets")
        ? 1
        : 0;

  const handleViewChange = (
    _: React.MouseEvent<HTMLElement>,
    newMode: ViewMode | null
  ) => {
    if (newMode) setViewMode(newMode);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ mr: 4, fontWeight: 700 }}>
            Task Scope
          </Typography>

          <Tabs
            value={currentTab}
            onChange={(_, v) => navigate(v === 3 ? "/settings" : v === 2 ? "/gantt" : v === 1 ? "/tickets" : "/")}
            textColor="inherit"
            sx={{ flexGrow: 1, "& .MuiTab-root": { minHeight: 64 } }}
            TabIndicatorProps={{ sx: { backgroundColor: "white" } }}
          >
            <Tab label="ダッシュボード" />
            <Tab label="チケット一覧" />
            <Tab label="ガントチャート" />
            <Tab label="設定" />
          </Tabs>

          {/* スペース（現場）切替 */}
          <FormControl
            size="small"
            sx={{
              mr: 2,
              minWidth: 140,
              "& .MuiInputBase-root": {
                color: "white",
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: "rgba(255,255,255,0.3)",
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: "rgba(255,255,255,0.5)",
                },
              },
              "& .MuiSvgIcon-root": { color: "rgba(255,255,255,0.7)" },
            }}
          >
            <Select
              value={spaceId ?? ""}
              displayEmpty
              onChange={(e) => {
                const val = e.target.value as string;
                setSpaceId(val === "" ? null : val);
              }}
            >
              <MenuItem value="">全現場</MenuItem>
              {spaces?.map((s) => (
                <MenuItem key={`b:${s.id}`} value={`b:${s.id}`}>
                  {s.space_key}
                </MenuItem>
              ))}
              {jiraSpaces?.map((s) => (
                <MenuItem key={`j:${s.id}`} value={`j:${s.id}`}>
                  {s.site_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewChange}
            size="small"
            sx={{
              mr: 2,
              "& .MuiToggleButton-root": {
                color: "rgba(255,255,255,0.7)",
                borderColor: "rgba(255,255,255,0.3)",
                "&.Mui-selected": {
                  color: "white",
                  backgroundColor: "rgba(255,255,255,0.15)",
                },
              },
            }}
          >
            <ToggleButton value="all">全体</ToggleButton>
            <ToggleButton value="my">自分</ToggleButton>
          </ToggleButtonGroup>

          <Button
            variant="outlined"
            color="inherit"
            size="small"
            startIcon={
              syncMutation.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SyncIcon />
              )
            }
            onClick={() => syncMutation.mutate(undefined)}
            disabled={syncMutation.isPending}
          >
            同期
          </Button>
        </Toolbar>
      </AppBar>

      <BackgroundTaskBar />
      <Box component="main" sx={{ flexGrow: 1, bgcolor: "background.default", p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
