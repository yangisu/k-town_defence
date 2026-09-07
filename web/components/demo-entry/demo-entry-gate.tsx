"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { DemoBrandTransition } from "@/components/demo-entry/demo-brand-transition";
import { DemoLogin } from "@/components/demo-entry/demo-login";
import { clearDemoLogin, hasDemoLogin, saveDemoLogin, subscribeToDemoLogin, type DemoLoginStorage } from "@/features/demo-entry/demo-auth";
import { DemoSignOutProvider } from "@/features/demo-entry/demo-sign-out";

type EntryState = "login" | "brand-transition" | "service";

interface Props {
  children: ReactNode;
  storage?: DemoLoginStorage;
}

export function DemoEntryGate({ children, storage }: Props) {
  const [state, setState] = useState<EntryState>("login");
  const [resolvedStorage] = useState<DemoLoginStorage | undefined>(() => {
    if (storage) return storage;
    try {
      return typeof window === "undefined" ? undefined : window.sessionStorage;
    } catch {
      return undefined;
    }
  });
  const authenticated = useSyncExternalStore(
    subscribeToDemoLogin,
    () => resolvedStorage ? hasDemoLogin(resolvedStorage) : false,
    () => null,
  );
  const signOut = useCallback(() => {
    if (resolvedStorage) clearDemoLogin(resolvedStorage);
    setState("login");
  }, [resolvedStorage]);

  if (authenticated === null) return <p className="demo-entry-loading" role="status">데모를 준비하고 있어요.</p>;
  const service = <DemoSignOutProvider value={signOut}>{children}</DemoSignOutProvider>;
  if (state === "login" && authenticated) return service;
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
  return service;
}
