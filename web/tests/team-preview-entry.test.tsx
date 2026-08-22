import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { KTownApp } from "@/features/ktown-app";

beforeEach(() => window.localStorage.clear());

it("opens in the product shell and guides artist selection beside the service", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" />);

  expect(await screen.findByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByText("게스트 데모")).toBeVisible();
  expect(screen.getByText("1. 아티스트 선택")).toBeVisible();
  expect(screen.queryByRole("heading", { name: /함께 여행할 팬덤/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "아티스트 선택" }));
  expect(screen.getByRole("dialog", { name: "아티스트 선택" })).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(15);
});

it("searches localized artists and recommends their first home territory", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" />);

  await user.click(await screen.findByRole("button", { name: "아티스트 선택" }));
  const search = screen.getByRole("searchbox", { name: "아티스트 또는 팬덤 검색" });
  await user.type(search, "에스파");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.clear(search);
  await user.type(search, "UAENA");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.clear(search);
  await user.type(search, "aespa");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.click(screen.getByRole("radio", { name: /aespa.*MY/i }));

  expect(screen.queryByRole("dialog", { name: "아티스트 선택" })).not.toBeInTheDocument();
  const recommendation = screen.getByRole("complementary", { name: "추천 영토" });
  expect(within(recommendation).getByText("2. 추천 영토 확인")).toBeVisible();
  expect(within(recommendation).getByText("부산")).toBeVisible();
  expect(within(screen.getByRole("region", { name: "현재 목표" })).getByText(/MY/)).toBeVisible();
});
