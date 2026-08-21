import type { AppServices } from "./domain";
import { createDemoServices } from "./demo-services";
import { createHttpServices } from "./http-services";

export type ServiceMode = "demo" | "integrated";

export function createServices(
  mode: ServiceMode,
  fetcher: typeof fetch = fetch,
): AppServices {
  return mode === "integrated"
    ? createHttpServices(fetcher)
    : createDemoServices();
}
