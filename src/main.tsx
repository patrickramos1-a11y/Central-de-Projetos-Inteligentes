import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles.css";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/journey.css";
import "./styles/admin.css";
import "./styles/projects.css";
import "./styles/workspace.css";
import "./styles/theme-cobalt.css";
import "./styles/shell.css";
import "./styles/deliveries.css";
import "./styles/journey-v2.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
