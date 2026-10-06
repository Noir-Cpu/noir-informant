import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { previewHeaders } from "./headers-preview";
import { sitePlugin } from "./site-plugin";

export default defineConfig({
  plugins: [react(), sitePlugin(__dirname), previewHeaders(__dirname)],
});
