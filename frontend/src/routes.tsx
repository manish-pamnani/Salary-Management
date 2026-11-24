import type { RouteObject } from "react-router";
import { App } from "./App";
import { AskPage } from "./pages/AskPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { EmployeePage } from "./pages/EmployeePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PaySummaryPage } from "./pages/PaySummaryPage";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <DirectoryPage /> },
      { path: "employees/:id", element: <EmployeePage /> },
      { path: "pay-summary", element: <PaySummaryPage /> },
      { path: "ask", element: <AskPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
