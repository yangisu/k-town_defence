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

  expect(await within(dialog).findByRole("heading", { name: "지역 점수 현황" })).toBeVisible();
});

it("walks the rest of the tour and finishes on the last step", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const dialog = await reachTheWaitingStep(user);
  await user.click(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getAllByRole("button")[0]);
  await within(dialog).findByRole("heading", { name: "지역 점수 현황" });

  // Each remaining step either moves on from a tap anywhere, or waits for the
  // very control it is pointing at. Pressing that control is the whole point
  // of the second half of the tour, so the walk is driven by what each step
  // asks for rather than by a fixed count.
  const press = async (name: RegExp) => user.click(screen.getAllByRole("button", { name })[0]);
  for (let index = 2; index < GUIDE_STEPS.length; index += 1) {
    expect(within(dialog).getByText(`${index + 1} / ${GUIDE_STEPS.length}`)).toBeVisible();
    const step = GUIDE_STEPS[index];
    if (!step.awaits) {
      await advance(user);
      continue;
    }
    expect(screen.queryByRole("button", { name: /다음 단계|가이드 마치기/ })).not.toBeInTheDocument();
    if (step.id === "start-expedition") await press(/^원정 시작$/);
    else if (step.id === "check-in") await press(/체크인$/);
    else if (step.id === "check-in-verify") await press(/^데모 인증 진행$/);
    else if (step.id === "check-in-submit") await press(/^체크인 제출$/);
    else if (step.id === "check-in-result") await press(/^여행 계속하기$/);
    else if (step.id === "expedition-end") await press(/^원정 종료$|^원정 완료$/);
    // The page button and the dialog's both read "end expedition"; this step
    // means the one inside the dialog it just opened.
    else if (step.id === "expedition-end-confirm") await user.click(document.querySelector<HTMLButtonElement>('[data-guide="expedition-end-confirm"]')!);
    await within(dialog).findByText(`${index + 2} / ${GUIDE_STEPS.length}`);
  }

  // The loop advanced off the closing step, which is what ends the guide.
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}, 30_000);

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

it("keeps nothing the practice check-in earned", async () => {
  const user = userEvent.setup();
  storeConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const before = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!);
  const dialog = await reachTheWaitingStep(user);
  await user.click(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getAllByRole("button")[0]);
  await within(dialog).findByRole("heading", { name: "지역 점수 현황" });

  // Far enough in to have started a route and banked a check-in.
  for (let index = 2; index < GUIDE_STEPS.findIndex((s) => s.id === "check-in-result"); index += 1) {
    const step = GUIDE_STEPS[index];
    if (!step.awaits) { await advance(user); continue; }
    if (step.id === "start-expedition") await user.click(screen.getAllByRole("button", { name: /^원정 시작$/ })[0]);
    else if (step.id === "check-in") await user.click(screen.getAllByRole("button", { name: /체크인$/ })[0]);
    else if (step.id === "check-in-verify") await user.click(screen.getAllByRole("button", { name: /^데모 인증 진행$/ })[0]);
    else if (step.id === "check-in-submit") await user.click(screen.getAllByRole("button", { name: /^체크인 제출$/ })[0]);
    await within(dialog).findByText(`${index + 2} / ${GUIDE_STEPS.length}`);
  }
  // The check-in really happened — the reader is looking at the points it
  // earned — and yet nothing of it reached storage. A practice run is sealed
  // in memory, so closing the tab halfway through leaves no trace either.
  expect(screen.getByText("체크인 승인 완료")).toBeVisible();
  const during = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!);
  expect(during.approvedCheckIns).toEqual(before.approvedCheckIns);
  expect(during.activeExpeditionId).toBe(before.activeExpeditionId);

  // Leaving the guide hands the in-memory session back as it was found too.
  await user.keyboard("{Escape}");
  const after = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!);
  expect(after.approvedCheckIns).toEqual(before.approvedCheckIns);
  expect(after.contributedToday).toBe(before.contributedToday);
  expect(after.territories).toEqual(before.territories);
  expect(after.activeExpeditionId).toBe(before.activeExpeditionId);
}, 30_000);
