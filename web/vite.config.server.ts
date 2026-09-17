import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vinext from "vinext";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

function mapLibreSharedAsset() {
  return {
    name: "maplibre-shared-asset",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_next/static/media/maplibre-gl-shared.mjs",
        source: readFileSync(resolve(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs")),
      });
    },
  };
}

/** Production build for the long-running Node server hosted on EC2. */
export default defineConfig({
  plugins: [vinext(), tailwindcss(), mapLibreSharedAsset(), nitro()],
});
