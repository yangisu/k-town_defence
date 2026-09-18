import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { KTownApp } from "@/features/ktown-app";
import { GUIDE_STEPS } from "@/features/team-preview/guide-steps";
import { GAME_RULES } from "@/features/team-preview/game-rules";
import { createInitialDemoSession, DEMO_SESSION_KEY } from "@/features/team-preview/demo-session";
import { TUTORIAL_SEEN_KEY } from "@/features/team-preview/tutorial-seen";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.lang = "ko";
});

function storeConfirmedBtsSession(locale: "ko" | "en" = "ko") {
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    locale,
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
  }));
}

it("waits for a fandom before greeting a first-time visitor", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  // Artist selection explains itself, so the guide stays out of its way.
  expect(await screen.findByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));

  expect(await screen.findByRole("dialog", { name: "영토 지도부터 볼게요" })).toBeVisible();
  expect(screen.getByText(`1 / ${GUIDE_STEPS.length}`)).toBeVisible();
});

it("walks every step of the territory, expedition and scoring tour", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const dialog = await screen.findByRole("dialog");
  for (const [index, step] of GUIDE_STEPS.entries()) {
    expect(within(dialog).getByRole("heading", { name: step.title.ko })).toBeVisible();
    expect(within(dialog).getByText(`${index + 1} / ${GUIDE_STEPS.length}`)).toBeVisible();
    if (index < GUIDE_STEPS.length - 1) await user.click(within(dialog).getByRole("button", { name: "다음" }));
  }

  // The last step finishes instead of walking off the end.
  await user.click(within(dialog).getByRole("button", { name: "가이드 마치기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("explains the real scoring numbers rather than placeholders", async () => {
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const award = GUIDE_STEPS.find((step) => step.id === "award");
  const impact = GUIDE_STEPS.find((step) => step.id === "impact");
  expect(award?.body.ko).toContain(`${GAME_RULES.localSpend}P`);
  expect(award?.body.ko).toContain(`${GAME_RULES.accommodation}P`);
  expect(impact?.body.ko).toContain(GAME_RULES.dailyCap.toLocaleString());
  expect(await screen.findByRole("dialog")).toBeVisible();
});

it("steps back and skips out of the tour", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "이전" })).toBeDisabled();

  await user.click(within(dialog).getByRole("button", { name: "다음" }));
  expect(within(dialog).getByText(`2 / ${GUIDE_STEPS.length}`)).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "이전" }));
  expect(within(dialog).getByText(`1 / ${GUIDE_STEPS.length}`)).toBeVisible();

  await user.click(within(dialog).getByRole("button", { name: "건너뛰기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("remembers a finished guide so it does not interrupt the next visit", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  const { unmount } = render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "건너뛰기" }));
  expect(window.sessionStorage.getItem(TUTORIAL_SEEN_KEY)).toBe("seen");

  unmount();
  render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("closes the guide with Escape and with the close control", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "가이드 닫기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  window.sessionStorage.clear();
  const { unmount } = render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByRole("dialog")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  unmount();
});

it("reopens the guide from the record page", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  window.sessionStorage.setItem(TUTORIAL_SEEN_KEY, "seen");
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  await user.click(screen.getByRole("button", { name: "다시 보기" }));

  expect(await screen.findByRole("dialog", { name: "영토 지도부터 볼게요" })).toBeVisible();
});

it("shows the English tour for an English visitor", async () => {
  storeConfirmedBtsSession("en");
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("dialog", { name: GUIDE_STEPS[0].title.en })).toBeVisible();
});

it("says so when a step's control is not on screen", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  // jsdom gives every element a zero-size box, so no target can be spotlighted
  // and each anchored step falls back to explaining itself.
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "다음" }));

  expect(within(dialog).getByRole("note")).toHaveTextContent("지금 화면에 없어요");
});

it("always opens the guide when a first fandom is chosen, even after a dismissal", async () => {
  const user = userEvent.setup();
  // The visitor closed the guide earlier in this tab, before ever reaching
  // the territory page it describes.
  window.sessionStorage.setItem(TUTORIAL_SEEN_KEY, "seen");
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));

  expect(await screen.findByRole("dialog", { name: "영토 지도부터 볼게요" })).toBeVisible();
});
