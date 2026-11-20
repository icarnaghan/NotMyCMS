import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The active theme's global styles come before the app and its own overrides after it, so
// the cascade order is the one the site has always had.
import "@theme/global.css";
import App from "./App.tsx";
import "@theme/styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
