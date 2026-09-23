import { KTownApp } from "@/features/ktown-app";
import { IntegratedLogin } from "@/components/demo-entry/integrated-login";
import { readSessionPayload, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { cookies } from "next/headers";

export default async function Page() {
  const cookieStore = await cookies();
  const session = readSessionPayload(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return <IntegratedLogin returnTo="/" />;

  return <KTownApp mode="integrated" />;
}
