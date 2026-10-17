import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@cloudscape-design/global-styles/index.css";
import { AuthProvider } from "./auth/auth-provider";
import { SettingsProvider } from "./lib/settings-context";
import App from "./App";

// Theme and density are applied by SettingsProvider from the stored preference
// (shared with the public site), rather than hardcoded here.

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/admin">
      <SettingsProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  </React.StrictMode>
);
