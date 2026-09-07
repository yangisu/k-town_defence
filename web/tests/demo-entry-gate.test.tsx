import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DemoBrandTransition } from "@/components/demo-entry/demo-brand-transition";
import { DemoEntryGate } from "@/components/demo-entry/demo-entry-gate";
import { KTownApp } from "@/features/ktown-app";
import { DEMO_LOGIN_SESSION_KEY } from "@/features/demo-entry/demo-auth";
import { useDemoSignOut } from "@/features/demo-entry/demo-sign-out";

beforeEach(() => window.sessionStorage.clear());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("validates credentials before entering the brand transition", async () => {
  const user = userEvent.setup();
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);

  const heading = await screen.findByRole("heading", { name: "Log in" });
  // The brand name belongs to the lockup above, so the heading must not repeat it.
  expect(within(heading).queryByText(/K-TOWN/i)).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Email"), "invalid");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  expect(screen.getByText("Enter a valid email address.")).toBeVisible();
  expect(screen.getByText("Enter your password.")).toBeVisible();

  await user.clear(screen.getByLabelText("Email"));
  await user.type(screen.getByLabelText("Email"), "fan@example.com");
  await user.type(screen.getByLabelText("Password"), "demo");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(screen.getByRole("button", { name: "K-TOWN DEFENCE 시작 화면—클릭하여 바로 시작" })).toBeVisible();
  expect(window.sessionStorage.getItem(DEMO_LOGIN_SESSION_KEY)).toBe("authenticated");
});

it("completes the transition after 1.5 seconds", () => {
  vi.useFakeTimers();
  const onComplete = vi.fn();
  render(<DemoBrandTransition onComplete={onComplete} />);
  expect(onComplete).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1_500));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it("cleans up the transition timer when it unmounts", () => {
  vi.useFakeTimers();
  const onComplete = vi.fn();
  const view = render(<DemoBrandTransition onComplete={onComplete} />);
  view.unmount();
  act(() => vi.advanceTimersByTime(1_500));
  expect(onComplete).not.toHaveBeenCalled();
});

it("restores an authenticated tab directly into the service", async () => {
  window.sessionStorage.setItem(DEMO_LOGIN_SESSION_KEY, "authenticated");
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);
  expect(await screen.findByText("service workspace")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Log in" })).not.toBeInTheDocument();
});

it.each(["click", "Enter", " "])("skips the transition with %s", async (action) => {
  const user = userEvent.setup();
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);
  await user.type(await screen.findByLabelText("Email"), "fan@example.com");
  await user.type(screen.getByLabelText("Password"), "demo");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  const transition = screen.getByRole("button", { name: "K-TOWN DEFENCE 시작 화면—클릭하여 바로 시작" });
  // The screen carries no visible hint; the affordance stays in the label only.
  expect(within(transition).queryByText("클릭하여 바로 시작")).not.toBeInTheDocument();
  if (action === "click") await user.click(transition);
  else {
    transition.focus();
    await user.keyboard(action === "Enter" ? "{Enter}" : " ");
  }
  expect(screen.getByText("service workspace")).toBeVisible();
});

it("continues in memory when session storage is blocked", async () => {
  const user = userEvent.setup();
  const storage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  render(<DemoEntryGate storage={storage}><div>service workspace</div></DemoEntryGate>);
  await user.type(await screen.findByLabelText("Email"), "fan@example.com");
  await user.type(screen.getByLabelText("Password"), "demo");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  await user.click(screen.getByRole("button", { name: /K-TOWN DEFENCE 시작 화면/ }));
  expect(screen.getByText("service workspace")).toBeVisible();
});

function SignOutProbe() {
  const signOut = useDemoSignOut();
  return (
    <div>
      <p>service workspace</p>
      <button type="button" onClick={() => signOut?.()}>로그인 화면으로 돌아가기</button>
    </div>
  );
}

it("returns an authenticated visitor to the login screen and clears the marker", async () => {
  const user = userEvent.setup();
  window.sessionStorage.setItem(DEMO_LOGIN_SESSION_KEY, "authenticated");
  render(<DemoEntryGate><SignOutProbe /></DemoEntryGate>);

  await user.click(await screen.findByRole("button", { name: "로그인 화면으로 돌아가기" }));

  expect(await screen.findByRole("heading", { name: "Log in" })).toBeVisible();
  expect(screen.queryByText("service workspace")).not.toBeInTheDocument();
  expect(window.sessionStorage.getItem(DEMO_LOGIN_SESSION_KEY)).toBeNull();
});

it("lets a signed-out visitor log in again and reach the service", async () => {
  const user = userEvent.setup();
  window.sessionStorage.setItem(DEMO_LOGIN_SESSION_KEY, "authenticated");
  render(<DemoEntryGate><SignOutProbe /></DemoEntryGate>);
  await user.click(await screen.findByRole("button", { name: "로그인 화면으로 돌아가기" }));

  await user.type(screen.getByLabelText("Email"), "fan@example.com");
  await user.type(screen.getByLabelText("Password"), "demo");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  await user.click(screen.getByRole("button", { name: /K-TOWN DEFENCE 시작 화면/ }));

  expect(screen.getByText("service workspace")).toBeVisible();
  expect(window.sessionStorage.getItem(DEMO_LOGIN_SESSION_KEY)).toBe("authenticated");
});

it("returns to the login screen from the artist selection screen", async () => {
  const user = userEvent.setup();
  window.localStorage.clear();
  window.sessionStorage.setItem(DEMO_LOGIN_SESSION_KEY, "authenticated");
  render(<DemoEntryGate><KTownApp mode="demo" mapConfig={null} /></DemoEntryGate>);

  expect(await screen.findByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  const back = screen.getByRole("button", { name: "로그인 화면으로 돌아가기" });
  const header = screen.getByRole("group", { name: "언어 선택" }).closest("header");
  expect(header).toContainElement(back);
  await user.click(back);

  expect(await screen.findByRole("heading", { name: "Log in" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "응원할 아티스트를 선택하세요" })).not.toBeInTheDocument();
  expect(window.sessionStorage.getItem(DEMO_LOGIN_SESSION_KEY)).toBeNull();
});

it("logs out from the record tab and keeps demo progress for the next login", async () => {
  const user = userEvent.setup();
  window.localStorage.clear();
  window.sessionStorage.setItem(DEMO_LOGIN_SESSION_KEY, "authenticated");
  render(<DemoEntryGate><KTownApp mode="demo" mapConfig={null} /></DemoEntryGate>);

  await user.click(await screen.findByRole("radio", { name: /방탄소년단.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
  await user.click(within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole("button", { name: "내 기록" }));

  const account = await screen.findByRole("region", { name: "계정" });
  await user.click(within(account).getByRole("button", { name: "로그아웃" }));

  expect(await screen.findByRole("heading", { name: "Log in" })).toBeVisible();
  expect(window.sessionStorage.getItem(DEMO_LOGIN_SESSION_KEY)).toBeNull();

  await user.type(screen.getByLabelText("Email"), "fan@example.com");
  await user.type(screen.getByLabelText("Password"), "demo");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  await user.click(screen.getByRole("button", { name: /K-TOWN DEFENCE 시작 화면/ }));

  expect(within(await screen.findByRole("region", { name: "현재 목표" })).getByText("ARMY")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "응원할 아티스트를 선택하세요" })).not.toBeInTheDocument();
});

it("reveals and re-masks the password from the eye toggle inside the field", async () => {
  const user = userEvent.setup();
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);

  const password = await screen.findByLabelText("Password");
  await user.type(password, "demo-secret");
  expect(password).toHaveAttribute("type", "password");

  const reveal = screen.getByRole("button", { name: "Show password" });
  // Masked state shows the struck-through eye.
  expect(reveal.querySelector(".lucide-eye-off")).not.toBeNull();

  await user.click(reveal);
  expect(password).toHaveAttribute("type", "text");
  expect(password).toHaveValue("demo-secret");

  const hide = screen.getByRole("button", { name: "Hide password" });
  expect(hide.querySelector(".lucide-eye-off")).toBeNull();

  await user.click(hide);
  expect(password).toHaveAttribute("type", "password");
  expect(screen.getByRole("button", { name: "Show password" })).toBeVisible();
});

it("keeps the reveal toggle out of the submit path", async () => {
  const user = userEvent.setup();
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);

  await user.type(await screen.findByLabelText("Email"), "fan@example.com");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  // Toggling visibility must not submit the form, so no validation error appears.
  expect(screen.queryByText("Enter your password.")).not.toBeInTheDocument();
  expect(window.sessionStorage.getItem(DEMO_LOGIN_SESSION_KEY)).toBeNull();
});
