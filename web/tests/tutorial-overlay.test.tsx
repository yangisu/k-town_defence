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

/** Steps advance on a click anywhere; the one that waits needs a real pick. */
async function advance(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /다음 단계|가이드 마치기/ }));
}

async function reachTheWaitingStep(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole("dialog");
  await advance(user);
  return dialog;
}

it("waits for a fandom before greeting a first-time visitor", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  // Artist selection explains itself, so the guide stays out of its way.
  expect(await screen.findByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));

  expect(await screen.findByRole("dialog", { name: "K-Defense 시작하기" })).toBeVisible();
  expect(screen.getByText(`1 / ${GUIDE_STEPS.length}`)).toBeVisible();
});

it("moves on from a click anywhere, and offers no skip or next button", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByRole("button", { name: "건너뛰기" })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "다음 단계" })).not.toBeInTheDocument();

  // The whole screen is the control, so a tap wherever the reader is already
  // looking takes them on.
  await advance(user);
  expect(within(dialog).getByText(`2 / ${GUIDE_STEPS.length}`)).toBeVisible();
});

it("holds the choose-a-territory step until a territory is chosen", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const dialog = await reachTheWaitingStep(user);
  expect(within(dialog).getByRole("heading", { name: "여행할 지역 선택하기" })).toBeVisible();

  // No click-anywhere catcher while the step waits: the page has to stay
  // reachable for the reader to pick a card.
  expect(screen.queryByRole("button", { name: /다음 단계|가이드 마치기/ })).not.toBeInTheDocument();

  await user.click(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getAllByRole("button")[0]);

  expect(await within(dialog).findByRole("heading", { name: "지금 점수 차이" })).toBeVisible();
});

it("walks the rest of the tour and finishes on the last step", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const dialog = await reachTheWaitingStep(user);
  await user.click(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getAllByRole("button")[0]);
  await within(dialog).findByRole("heading", { name: "지금 점수 차이" });

  // Up to the step that asks for a route to be started.
  const startIndex = GUIDE_STEPS.findIndex((candidate) => candidate.awaits === "expedition");
  for (let step = 3; step <= startIndex; step += 1) {
    await advance(user);
    expect(within(dialog).getByText(`${step + 1} / ${GUIDE_STEPS.length}`)).toBeVisible();
  }

  // That step waits for the press, and the press carries the guide onto the
  // expedition page for the rest of the tour.
  expect(screen.queryByRole("button", { name: /다음 단계|가이드 마치기/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "원정 시작" }));
  expect(await within(dialog).findByText(`${startIndex + 2} / ${GUIDE_STEPS.length}`)).toBeVisible();

  for (let step = startIndex + 2; step < GUIDE_STEPS.length; step += 1) {
    await advance(user);
    expect(within(dialog).getByText(`${step + 1} / ${GUIDE_STEPS.length}`)).toBeVisible();
  }

  await advance(user);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("steps back from the control left of the counter", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "이전" })).toBeDisabled();

  await advance(user);
  expect(within(dialog).getByText(`2 / ${GUIDE_STEPS.length}`)).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "이전" }));
  expect(within(dialog).getByText(`1 / ${GUIDE_STEPS.length}`)).toBeVisible();
});

it("explains the real scoring numbers rather than placeholders", () => {
  const award = GUIDE_STEPS.find((step) => step.id === "award");
  const impact = GUIDE_STEPS.find((step) => step.id === "impact");
  expect(award?.body.ko).toContain(`${GAME_RULES.localSpend}P`);
  expect(award?.body.ko).toContain(`${GAME_RULES.accommodation}P`);
  expect(impact?.body.ko).toContain(`${Math.round(GAME_RULES.repeatDecay[1] * 100)}%`);
});

it("remembers a finished guide so it does not interrupt the next visit", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  const { unmount } = render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "가이드 닫기" }));
  expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe("seen");

  unmount();
  render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("closes the guide with Escape", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("dialog")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("reopens the guide from the record page", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  window.localStorage.setItem(TUTORIAL_SEEN_KEY, "seen");
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  await user.click(screen.getByRole("button", { name: "다시 보기" }));

  expect(await screen.findByRole("dialog", { name: "K-Defense 시작하기" })).toBeVisible();
});

it("shows the English tour for an English visitor", async () => {
  storeConfirmedBtsSession("en");
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("dialog", { name: GUIDE_STEPS[0].title.en })).toBeVisible();
});
