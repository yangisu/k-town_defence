import { KTownApp } from "@/features/ktown-app";
import { DemoEntryGate } from "@/components/demo-entry/demo-entry-gate";
import { readMapConfig } from "@/lib/map-config";
import type { ServiceMode } from "@/lib/service-factory";

export default function Page() {
  const mode: ServiceMode = process.env.KTOWN_SERVICE_MODE === "integrated"
    ? "integrated"
    : "demo";
  const mapConfig = readMapConfig(process.env);
  const app = <KTownApp mode={mode} mapConfig={mapConfig} />;
  return mode === "demo" ? <DemoEntryGate>{app}</DemoEntryGate> : app;
}
