import vinext from "vinext";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/** Production build for the long-running Node server hosted on EC2. */
export default defineConfig({
  plugins: [vinext(), tailwindcss(), nitro()],
});
