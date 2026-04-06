import { createBrowserRouter } from "react-router-dom";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import GanttPage from "@/pages/GanttPage";
import SettingsPage from "@/pages/SettingsPage";
import TicketDetailPage from "@/pages/TicketDetailPage";
import TicketListPage from "@/pages/TicketListPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "tickets", element: <TicketListPage /> },
      { path: "tickets/:id", element: <TicketDetailPage /> },
      { path: "gantt", element: <GanttPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export default router;
