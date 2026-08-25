import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DemoBrandTransition } from "@/components/demo-entry/demo-brand-transition";
import { DemoEntryGate } from "@/components/demo-entry/demo-entry-gate";
import { DEMO_LOGIN_SESSION_KEY } from "@/features/demo-entry/demo-auth";

beforeEach(() => window.sessionStorage.clear());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("validates credentials before entering the brand transition", async () => {
  const user = userEvent.setup();
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);

  expect(await screen.findByRole("heading", { name: "K-TOWN DEFENCE 로그인" })).toBeVisible();
  await user.type(screen.getByLabelText("이메일"), "invalid");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  expect(screen.getByText("올바른 이메일 주소를 입력해 주세요.")).toBeVisible();
  expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeVisible();

  await user.clear(screen.getByLabelText("이메일"));
  await user.type(screen.getByLabelText("이메일"), "fan@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "demo");
  await user.click(screen.getByRole("button", { name: "로그인" }));

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
  expect(screen.queryByRole("heading", { name: "K-TOWN DEFENCE 로그인" })).not.toBeInTheDocument();
});

it.each(["click", "Enter", " "])("skips the transition with %s", async (action) => {
  const user = userEvent.setup();
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);
  await user.type(await screen.findByLabelText("이메일"), "fan@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "demo");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  const transition = screen.getByRole("button", { name: "K-TOWN DEFENCE 시작 화면—클릭하여 바로 시작" });
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
  };
  render(<DemoEntryGate storage={storage}><div>service workspace</div></DemoEntryGate>);
  await user.type(await screen.findByLabelText("이메일"), "fan@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "demo");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  await user.click(screen.getByRole("button", { name: /K-TOWN DEFENCE 시작 화면/ }));
  expect(screen.getByText("service workspace")).toBeVisible();
});
