import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { ProfileSetup } from "@/components/team-preview/profile-setup";
import { KTownApp } from "@/features/ktown-app";
import { TUTORIAL_SEEN_KEY } from "@/features/team-preview/tutorial-seen";

beforeEach(() => {
  window.sessionStorage.clear();
  document.documentElement.lang = "ko";
});

it("greets a first-time visitor with the three-step guide over artist selection", async () => {
  render(<ProfileSetup locale="ko" onConfirm={() => undefined} />);

  const dialog = await screen.findByRole("dialog", { name: "K-TOWN DEFENSE 시작 가이드" });
  expect(dialog).toBeVisible();
  // The guide repeats the golden path the objective strip and tactical panel follow.
  expect(within(dialog).getByText("1. 아티스트 선택")).toBeVisible();
  expect(within(dialog).getByText("2. 추천 영토 확인")).toBeVisible();
  expect(within(dialog).getByText("3. 첫 원정 시작")).toBeVisible();
  // Artist selection stays on the page behind the guide.
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
});

it("remembers a dismissed guide so it does not interrupt the next visit", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<ProfileSetup locale="ko" onConfirm={() => undefined} />);

  await user.click(await screen.findByRole("button", { name: "아티스트 고르러 가기" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(window.sessionStorage.getItem(TUTORIAL_SEEN_KEY)).toBe("seen");

  unmount();
  render(<ProfileSetup locale="ko" onConfirm={() => undefined} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("closes the guide with the close control and with Escape", async () => {
  const user = userEvent.setup();
  render(<ProfileSetup locale="ko" onConfirm={() => undefined} />);

  await user.click(await screen.findByRole("button", { name: "가이드 닫기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  window.sessionStorage.clear();
  const { unmount } = render(<ProfileSetup locale="ko" onConfirm={() => undefined} />);
  expect(await screen.findByRole("dialog")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  unmount();
});

it("shows the English guide for an English visitor", async () => {
  render(<ProfileSetup locale="en" onConfirm={() => undefined} />);

  expect(await screen.findByRole("dialog", { name: "K-TOWN DEFENSE starter guide" })).toBeVisible();
});

it("keeps working when storage is unavailable", async () => {
  const throwingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };

  render(<ProfileSetup locale="ko" onConfirm={() => undefined} tutorialStorage={throwingStorage} />);

  expect(await screen.findByRole("dialog")).toBeVisible();
});

it("lets the visitor pick a fandom as soon as the guide is dismissed", async () => {
  const user = userEvent.setup();
  const confirmed: string[] = [];
  render(<ProfileSetup locale="ko" onConfirm={(artistId) => confirmed.push(artistId)} />);

  await user.click(await screen.findByRole("button", { name: "아티스트 고르러 가기" }));

  // Search only reaches the input once the guide releases the focus trap.
  await user.type(screen.getByRole("searchbox", { name: "아티스트 또는 팬덤 검색" }), "BTS");
  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));

  expect(confirmed).toEqual(["bts"]);
});

it("reopens the guide from the record page after it was dismissed", async () => {
  const user = userEvent.setup();
  window.sessionStorage.setItem(TUTORIAL_SEEN_KEY, "seen");
  window.localStorage.clear();
  render(<KTownApp mode="demo" mapConfig={null} />);

  // A returning visitor is past onboarding, so nothing greets them.
  await user.click(await screen.findByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  await user.click(screen.getByRole("button", { name: "다시 보기" }));

  const dialog = await screen.findByRole("dialog", { name: "K-TOWN DEFENSE 시작 가이드" });
  expect(within(dialog).getByText("1. 아티스트 선택")).toBeVisible();

  await user.click(within(dialog).getByRole("button", { name: "아티스트 고르러 가기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
