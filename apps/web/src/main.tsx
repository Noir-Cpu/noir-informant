import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@noir/ui/tokens.css";
import "./styles.css";
import { App } from "./App";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// index.html ships the prerendered shell (heading, verdict, loading line), so hydrate it.
// In `vite dev` the root is empty and the shell is rendered on the client instead.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
