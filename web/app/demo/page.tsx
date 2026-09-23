import { DemoEntryGate } from "@/components/demo-entry/demo-entry-gate";
import { KTownApp } from "@/features/ktown-app";

export default function DemoPage() {
  return <DemoEntryGate><KTownApp mode="demo" /></DemoEntryGate>;
}
