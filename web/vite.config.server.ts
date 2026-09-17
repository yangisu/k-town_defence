import vinext from "vinext";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

function mapLibreWorkerSharedImport() {
  return {
    name: "maplibre-worker-shared-import",
    generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>) {
      const sharedAsset = Object.values(bundle).find((output) => (
        output.type === "asset"
        && output.fileName.includes("maplibre-gl-shared")
        && output.fileName.endsWith(".mjs")
      ));
      if (!sharedAsset) return;

      const sharedFileName = sharedAsset.fileName.split("/").pop();
      if (!sharedFileName) return;
      for (const output of Object.values(bundle)) {
        if (output.type !== "asset" || !output.fileName.includes("maplibre-gl-worker") || output.source === undefined) continue;
        const source = typeof output.source === "string" ? output.source : new TextDecoder().decode(output.source);
        output.source = source.replace('from"./maplibre-gl-shared.mjs"', `from"./${sharedFileName}"`);
      }
    },
  };
}

/** Production build for the long-running Node server hosted on EC2. */
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => assetInfo.name === "maplibre-gl-shared.mjs"
          ? "_next/static/media/maplibre-gl-shared.mjs"
          : "_next/static/media/[name].[hash][extname]",
      },
    },
  },
  plugins: [vinext(), tailwindcss(), mapLibreWorkerSharedImport(), nitro()],
});
