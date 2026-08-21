import { KTownApp } from "@/features/ktown-app";
import type { ServiceMode } from "@/lib/service-factory";

export default function Page() {
  const mode: ServiceMode = process.env.KTOWN_SERVICE_MODE === "integrated"
    ? "integrated"
    : "demo";
  return <KTownApp mode={mode} />;
}
