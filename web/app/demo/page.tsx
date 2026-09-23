import { DemoEntryGate } from "@/components/demo-entry/demo-entry-gate";
import { KTownApp } from "@/features/ktown-app";
import { readMapConfig } from "@/lib/map-config";

export default function DemoPage() {
  const mapConfig = readMapConfig(process.env);
  return <DemoEntryGate><KTownApp mode="demo" mapConfig={mapConfig} /></DemoEntryGate>;
}
