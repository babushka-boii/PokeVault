import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts (no runtime requests to Google). unicode-range keeps downloads to the used subsets.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource/silkscreen/400.css";

import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles.css";


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
