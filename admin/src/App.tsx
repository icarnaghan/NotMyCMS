import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import AppLayout from "@cloudscape-design/components/app-layout";
import SideNavigation, { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import TopNavigation from "@cloudscape-design/components/top-navigation";

import { useAuth } from "./auth/use-auth";
import { useSettings } from "./lib/settings-context";
import { adminTitle } from "./lib/site-config";
import ProtectedRoute from "./auth/protected-route";
import DashboardPage from "./pages/dashboard/dashboard-page";
import ContentListPage from "./pages/content/content-list-page";
import ContentEditorPage from "./pages/content/content-editor-page";
import PagesListPage from "./pages/pages/pages-list-page";
import PageEditorPage from "./pages/pages/page-editor-page";
import TaxonomyPage from "./pages/taxonomy/taxonomy-page";
import DeployPage from "./pages/deploy/deploy-page";
import AnalyticsPage from "./pages/analytics/analytics-page";
import AuditPage from "./pages/audit/audit-page";
import SettingsPage from "./pages/settings/settings-page";
import HelpPage from "./pages/help/help-page";

const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: "/" },
  { type: "divider" },
  {
    type: "section",
    text: "Content",
    items: [
      { type: "link", text: "Posts", href: "/posts" },
      { type: "link", text: "Knowledge Base", href: "/knowledge-base" },
      { type: "link", text: "Landing Pages", href: "/pages" },
    ],
  },
  { type: "divider" },
  { type: "link", text: "Taxonomy", href: "/taxonomy" },
  { type: "link", text: "Deploy", href: "/deploy" },
  { type: "link", text: "Analytics", href: "/analytics" },
  { type: "link", text: "Audit Log", href: "/audit" },
  { type: "link", text: "Settings", href: "/settings" },
  { type: "link", text: "Help", href: "/help" },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, density, setTheme, setDensity } = useSettings();

  const handleNavFollow = (event: CustomEvent<SideNavigationProps.FollowDetail>) => {
    event.preventDefault();
    navigate(event.detail.href);
  };

  return (
    <ProtectedRoute>
      <TopNavigation
        identity={{
          href: "/",
          title: adminTitle(),
          onFollow: (e) => {
            e.preventDefault();
            navigate("/");
          },
        }}
        utilities={[
          {
            type: "menu-dropdown",
            iconName: "settings",
            ariaLabel: "Settings",
            title: "Settings",
            items: [
              {
                id: "theme",
                text: "Theme",
                items: [
                  {
                    id: "theme-light",
                    text: "Light",
                    itemType: "checkbox",
                    checked: theme === "light",
                  },
                  {
                    id: "theme-dark",
                    text: "Dark",
                    itemType: "checkbox",
                    checked: theme === "dark",
                  },
                  {
                    id: "theme-system",
                    text: "System",
                    itemType: "checkbox",
                    checked: theme === "system",
                  },
                ],
              },
              {
                id: "density",
                text: "Density",
                items: [
                  {
                    id: "density-comfortable",
                    text: "Comfortable",
                    itemType: "checkbox",
                    checked: density === "comfortable",
                  },
                  {
                    id: "density-compact",
                    text: "Compact",
                    itemType: "checkbox",
                    checked: density === "compact",
                  },
                ],
              },
            ],
            onItemClick: ({ detail }) => {
              switch (detail.id) {
                case "theme-light":
                  setTheme("light");
                  break;
                case "theme-dark":
                  setTheme("dark");
                  break;
                case "theme-system":
                  setTheme("system");
                  break;
                case "density-comfortable":
                  setDensity("comfortable");
                  break;
                case "density-compact":
                  setDensity("compact");
                  break;
              }
            },
          },
          {
            type: "menu-dropdown",
            // displayName prefers the email claim; `username` is a Cognito-
            // generated UUID because the pool signs in by email alias.
            text: user?.displayName || user?.email || "Admin",
            iconName: "user-profile",
            items: [{ id: "signout", text: "Sign out" }],
            onItemClick: ({ detail }) => {
              if (detail.id === "signout") {
                logout();
              }
            },
          },
        ]}
      />
      <AppLayout
        navigation={
          <SideNavigation
            header={{ text: "Admin", href: "/" }}
            activeHref={location.pathname}
            items={NAV_ITEMS}
            onFollow={handleNavFollow}
          />
        }
        content={
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/posts" element={<ContentListPage />} />
            <Route path="/posts/new" element={<ContentEditorPage />} />
            <Route path="/posts/:slug" element={<ContentEditorPage />} />
            <Route path="/knowledge-base" element={<ContentListPage />} />
            <Route path="/knowledge-base/new" element={<ContentEditorPage />} />
            <Route path="/knowledge-base/:slug" element={<ContentEditorPage />} />
            <Route path="/pages" element={<PagesListPage />} />
            <Route path="/pages/new" element={<PageEditorPage />} />
            {/* Greedy: a landing-page slug may contain slashes (teaching/cmst388-tips). */}
            <Route path="/pages/*" element={<PageEditorPage />} />
            <Route path="/taxonomy" element={<TaxonomyPage />} />
            <Route path="/deploy" element={<DeployPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<HelpPage />} />
          </Routes>
        }
        toolsHide
        headerSelector="#h"
      />
    </ProtectedRoute>
  );
}
