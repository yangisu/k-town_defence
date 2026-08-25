"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DemoBrandTransition } from "@/components/demo-entry/demo-brand-transition";
import { DemoLogin } from "@/components/demo-entry/demo-login";
import { hasDemoLogin, saveDemoLogin, type DemoLoginStorage } from "@/features/demo-entry/demo-auth";

type EntryState = "checking" | "login" | "brand-transition" | "service";

interface Props {
  children: ReactNode;
  storage?: DemoLoginStorage;
}

export function DemoEntryGate({ children, storage }: Props) {
  const [state, setState] = useState<EntryState>("checking");
  const [resolvedStorage] = useState<DemoLoginStorage | undefined>(() => {
    if (storage) return storage;
    try {
      return typeof window === "undefined" ? undefined : window.sessionStorage;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    setState(resolvedStorage && hasDemoLogin(resolvedStorage) ? "service" : "login");
  }, [resolvedStorage]);

  if (state === "checking") return <p className="demo-entry-loading" role="status">데모를 준비하고 있어요.</p>;
  if (state === "login") {
    return (
      <DemoLogin onComplete={() => {
        if (resolvedStorage) saveDemoLogin(resolvedStorage);
        setState("brand-transition");
      }} />
    );
  }
  if (state === "brand-transition") {
    return <DemoBrandTransition onComplete={() => setState("service")} />;
  }
  return <>{children}</>;
}
