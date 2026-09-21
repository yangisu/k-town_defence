import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("production entry route", () => {
  const source = readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8");

  it("always starts the authenticated product with HTTP services", () => {
    expect(source).toContain('<KTownApp mode="integrated"');
    expect(source).not.toContain("KTOWN_SERVICE_MODE");
    expect(source).not.toContain("DemoEntryGate");
  });

  it("uses the demo-styled real login when there is no signed session", () => {
    expect(source).toContain("readSessionPayload");
    expect(source).toContain("<IntegratedLogin");
  });

  it("keeps the isolated demo route on demo services", () => {
    const demoSource = readFileSync(join(process.cwd(), "app", "demo", "page.tsx"), "utf8");
    expect(demoSource).toContain('<KTownApp mode="demo"');
  });
});
