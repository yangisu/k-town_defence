import type { ReactNode } from "react";

export function StateMessage({ tone = "info", title, children }: { tone?: "info" | "warning" | "success"; title: string; children: ReactNode }) {
  return <div className={`state-message ${tone}`} role="status"><strong>{title}</strong><p>{children}</p></div>;
}
