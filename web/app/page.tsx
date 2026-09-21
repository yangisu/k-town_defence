import { KTownApp } from "@/features/ktown-app";
import { IntegratedLogin } from "@/components/demo-entry/integrated-login";
import { readMapConfig } from "@/lib/map-config";
import { readSessionPayload, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { cookies } from "next/headers";

export default async function Page() {
  const cookieStore = await cookies();
  const session = readSessionPayload(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return <IntegratedLogin returnTo="/" />;

  const mapConfig = readMapConfig(process.env);
  return <KTownApp mode="integrated" mapConfig={mapConfig} />;
}
