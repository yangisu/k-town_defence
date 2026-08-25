import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import {
  DEMO_SESSION_KEY,
  createInitialDemoSession,
  type DemoSession,
} from "@/features/team-preview/demo-session";
import { KTownApp } from "@/features/ktown-app";
import type { CheckInService, Place } from "@/lib/domain";

const place: Place = {
  id: "busan-1",
  regionId: "busan",
  nameKo: "감천문화마을",
  category: "culture",
  categoryLabel: "인근 추천",
  description: "공공 관광 추천지",
  address: "부산광역시 사하구",
  transit: "대중교통",
  dwellMinutes: 45,
  points: 100,
};

beforeEach(() => window.localStorage.clear());

function storeReadyBtsSession(locale: "ko" | "en" = "ko") {
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    locale,
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
  }));
}

async function openPreviewCheckIn(user: ReturnType<typeof userEvent.setup>) {
  storeReadyBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);
  await user.click(await screen.findByRole("button", { name: "원정 시작" }));
  await user.click(await screen.findByRole("button", { name: "감천문화마을 체크인" }));
}

it("connects demo evidence to territory and rank impact", async () => {
  const user = userEvent.setup();
  await openPreviewCheckIn(user);

  await user.click(screen.getByRole("button", { name: "데모 인증 진행" }));
  expect(screen.getByText("GPS 위치 확인 완료")).toBeVisible();
  expect(screen.getByText("현장 사진 확인 완료")).toBeVisible();
  expect(screen.getByText("체류 45분 확인")).toBeVisible();
  await user.click(screen.getByRole("checkbox", { name: "로컬 소비 인증 포함" }));
  await user.click(screen.getByRole("button", { name: "포인트 검토" }));
  await user.click(screen.getByRole("button", { name: "체크인 제출" }));

  expect(await screen.findByText(/지역 점유율.*52\.3%.*58\.6%/)).toBeVisible();
  expect(screen.queryByText("부산 여행에 120P를 보탰어요")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "체크인 승인 완료" })).toBeVisible();
  expect(screen.getByText(/거점.*씨앗.*나무/)).toBeVisible();
  expect(screen.getByText(/팬덤 순위.*#1.*#1/)).toBeVisible();
  expect(screen.getByText(/내 기여 순위.*#128.*#123/)).toBeVisible();
  expect(screen.getByText("거점 버프").closest("div")).toHaveTextContent("+10P");
  expect(screen.getByText("유효 포인트 +270P")).toBeVisible();

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.missionVisitCounts["busan-1"]).toBe(1);
    expect(saved.contributedToday).toBe(270);
    expect(saved.territories.find((territory) => territory.id === "busan")
      ?.standings.find((standing) => standing.artistId === "bts")?.validPoints).toBe(1190);
  });
}, 10_000);

it("keeps the condensed demo check-in and impact available in English", async () => {
  const user = userEvent.setup();
  storeReadyBtsSession("en");
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("button", { name: "Start expedition" }));
  expect(await screen.findByRole("heading", { name: "BTS Busan official concert venue expedition" })).toBeVisible();
  expect(screen.getByText("90 min")).toBeVisible();
  expect(screen.getAllByText("Dwell 45 min")).toHaveLength(2);
  expect(document.body).not.toHaveTextContent("90분");
  await user.click(await screen.findByRole("button", { name: "Gamcheon Culture Village check in" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "On-site check-in" })).toBeVisible();
  expect(within(dialog).getByText("Upload the original photo for private review")).toBeVisible();
  expect(dialog).not.toHaveTextContent("원본 사진을 비공개 검토용으로 업로드");
  await user.click(screen.getByRole("button", { name: "Run demo verification" }));
  expect(screen.getByText("GPS position verified")).toBeVisible();
  expect(screen.getByText("On-site photo verified")).toBeVisible();
  expect(screen.getByText("Dwell 45 minutes verified")).toBeVisible();
  await user.click(screen.getByRole("checkbox", { name: "Include local spend verification" }));
  await user.click(screen.getByRole("button", { name: "Review points" }));
  await user.click(screen.getByRole("button", { name: "Submit check-in" }));

  expect(await screen.findByRole("heading", { name: "Check-in approved" })).toBeVisible();
  expect(screen.getByText(/Territory share/)).toBeVisible();
  expect(within(screen.getByRole("status", { name: "Mission impact summary" })).getByText(/Stronghold.*Seed.*Tree/)).toBeVisible();
  expect(screen.getByText(/Fandom rank/)).toBeVisible();
  expect(screen.getByText(/My contribution rank/)).toBeVisible();
});

it("requires a fresh review when optional evidence changes after review", async () => {
  const user = userEvent.setup();
  await openPreviewCheckIn(user);

  await user.click(screen.getByRole("button", { name: "데모 인증 진행" }));
  await user.click(screen.getByRole("button", { name: "포인트 검토" }));
  expect(screen.getByRole("button", { name: "체크인 제출" })).toBeVisible();

  await user.click(screen.getByRole("checkbox", { name: "숙박 인증 포함" }));

  expect(screen.getByRole("checkbox", { name: "숙박 인증 포함" })).toBeChecked();
  expect(screen.queryByRole("button", { name: "체크인 제출" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "포인트 검토" })).toBeVisible();
});

it("retains demo evidence and the submission key when a network retry is needed", async () => {
  const user = userEvent.setup();
  const submit = vi.fn()
    .mockRejectedValueOnce(new Error("private upstream stack"))
    .mockResolvedValueOnce({ decision: "approved", message: "승인" });
  const service: CheckInService = {
    create: vi.fn().mockResolvedValue({
      id: "session-1",
      placeId: place.id,
      status: "collecting",
      expiresAt: "2026-08-22T10:30:00Z",
    }),
    restore: vi.fn().mockResolvedValue(null),
    recordGps: vi.fn().mockResolvedValue(undefined),
    recordPhoto: vi.fn().mockResolvedValue(undefined),
    submit,
  };

  render(
    <CheckInFlow
      place={place}
      service={service}
      mode="demo"
      demoAwardInput={{
        visitBase: 100,
        balanceMultiplier: 1,
        fandomSizeMultiplier: 1,
        repeatCount: 0,
        contributedToday: 0,
      }}
      onApproved={() => undefined}
      onClose={() => undefined}
    />,
  );

  await user.click(screen.getByRole("button", { name: "데모 인증 진행" }));
  await user.click(screen.getByRole("checkbox", { name: "로컬 소비 인증 포함" }));
  await user.click(screen.getByRole("button", { name: "포인트 검토" }));
  await user.click(screen.getByRole("button", { name: "체크인 제출" }));

  expect(await screen.findByText("체크인 저장에 실패했어요")).toBeVisible();
  expect(screen.queryByText(/private upstream stack/)).not.toBeInTheDocument();
  expect(screen.getByText("GPS 위치 확인 완료")).toBeVisible();
  expect(screen.getByText("현장 사진 확인 완료")).toBeVisible();
  expect(screen.getByText("체류 45분 확인")).toBeVisible();
  expect(screen.getByRole("checkbox", { name: "로컬 소비 인증 포함" })).toBeChecked();

  await user.click(screen.getByRole("button", { name: "다시 제출" }));
  expect(await screen.findByRole("heading", { name: "체크인 승인 완료" })).toBeVisible();
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit.mock.calls[1][1]).toBe(submit.mock.calls[0][1]);
});
