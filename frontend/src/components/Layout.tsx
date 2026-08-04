import { useState } from "react";
import SyncIcon from "@mui/icons-material/Sync";
import LogoutIcon from "@mui/icons-material/Logout";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import TimelineIcon from "@mui/icons-material/Timeline";
import SettingsIcon from "@mui/icons-material/Settings";
import CheckIcon from "@mui/icons-material/Check";
import { logout } from "../auth/useAuth";
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { ViewMode } from "../api/types";
import BackgroundTaskBar from "./BackgroundTaskBar";
import { useAutoSync } from "../hooks/useAutoSync";
import { useJiraSpaces } from "../hooks/useJiraSpaces";
import { useSpaces } from "../hooks/useSpaces";
import { useSync } from "../hooks/useSync";
import { useViewStore } from "../stores/viewStore";

const NAV_ITEMS = [
  { label: "ダッシュボード", path: "/", icon: <DashboardIcon fontSize="small" /> },
  { label: "チケット一覧", path: "/tickets", icon: <ListAltIcon fontSize="small" /> },
  { label: "ガントチャート", path: "/gantt", icon: <TimelineIcon fontSize="small" /> },
  { label: "設定", path: "/settings", icon: <SettingsIcon fontSize="small" /> },
];

export default function Layout() {
  const { viewMode, setViewMode, spaceId, setSpaceId } = useViewStore();
  const syncMutation = useSync();
  const { data: spaces } = useSpaces();
  const { data: jiraSpaces } = useJiraSpaces();
  useAutoSync(spaces);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchor);

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

  const closeMenu = () => setMenuAnchor(null);

  const spaceSelect = (
    <FormControl
      size="small"
      sx={{
        mr: isMobile ? 0 : 2,
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
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="static" elevation={1}>
        <Toolbar>
          {isMobile ? (
            <Button
              color="inherit"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              aria-label="メニュー"
              aria-controls={menuOpen ? "header-menu" : undefined}
              aria-haspopup="true"
              aria-expanded={menuOpen ? "true" : undefined}
              endIcon={<ArrowDropDownIcon />}
              sx={{
                mr: 0,
                flexGrow: 1,
                justifyContent: "flex-start",
                textTransform: "none",
              }}
            >
              <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
                Task Scope
              </Typography>
            </Button>
          ) : (
            <Typography variant="h6" sx={{ mr: 4, fontWeight: 700 }}>
              Task Scope
            </Typography>
          )}

          {!isMobile && (
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
          )}

          {/* スペース（現場）切替 — モバイルでもヘッダーに残す */}
          {isMobile && <Box sx={{ mr: 1 }}>{spaceSelect}</Box>}
          {!isMobile && spaceSelect}

          {!isMobile && (
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
          )}

          {!isMobile && (
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
          )}

          {!isMobile && (
            <Button
              variant="text"
              color="inherit"
              size="small"
              startIcon={<LogoutIcon />}
              onClick={() => void logout()}
              sx={{ ml: 1 }}
            >
              ログアウト
            </Button>
          )}

          {/* モバイル: タイトルタップで開くメニュー */}
          {isMobile && (
            <>
              <Menu
                id="header-menu"
                anchorEl={menuAnchor}
                open={menuOpen}
                onClose={closeMenu}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                slotProps={{ paper: { sx: { minWidth: 220 } } }}
              >
                {NAV_ITEMS.map((item, i) => (
                  <MenuItem
                    key={item.path}
                    selected={currentTab === i}
                    onClick={() => {
                      navigate(item.path);
                      closeMenu();
                    }}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText>{item.label}</ListItemText>
                  </MenuItem>
                ))}

                <Divider />

                {/* 表示切替（全体 / 自分） */}
                <MenuItem
                  onClick={() => {
                    setViewMode("all");
                    closeMenu();
                  }}
                >
                  <ListItemIcon>
                    {viewMode === "all" ? <CheckIcon fontSize="small" /> : null}
                  </ListItemIcon>
                  <ListItemText>全体を表示</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setViewMode("my");
                    closeMenu();
                  }}
                >
                  <ListItemIcon>
                    {viewMode === "my" ? <CheckIcon fontSize="small" /> : null}
                  </ListItemIcon>
                  <ListItemText>自分を表示</ListItemText>
                </MenuItem>

                <Divider />

                <MenuItem
                  disabled={syncMutation.isPending}
                  onClick={() => {
                    syncMutation.mutate(undefined);
                    closeMenu();
                  }}
                >
                  <ListItemIcon>
                    {syncMutation.isPending ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <SyncIcon fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText>同期</ListItemText>
                </MenuItem>

                <MenuItem
                  onClick={() => {
                    closeMenu();
                    void logout();
                  }}
                >
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>ログアウト</ListItemText>
                </MenuItem>
              </Menu>
            </>
          )}
        </Toolbar>
      </AppBar>

      <BackgroundTaskBar />
      <Box component="main" sx={{ flexGrow: 1, bgcolor: "background.default", p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
