import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.KAKAO_CLIENT_ID = "kakao-id";
  process.env.KAKAO_CLIENT_SECRET = "kakao-secret";
  process.env.GOOGLE_CLIENT_ID = "google-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

it("labels each provider the way its branding guideline requires", () => {
  render(<SocialLoginButtons returnTo="/" />);

  // Kakao asks for "카카오 로그인"; Google asks for "Google 계정으로 로그인".
  const kakao = screen.getByRole("link", { name: "카카오 로그인" });
  const google = screen.getByRole("link", { name: "Google 계정으로 로그인" });
  expect(kakao).toHaveAttribute("href", "/api/auth/kakao?return_to=%2F");
  expect(google).toHaveAttribute("href", "/api/auth/google?return_to=%2F");

  // Both guidelines require the symbol beside the label, never a bare label.
  expect(kakao.querySelector("svg.social-login-symbol")).not.toBeNull();
  expect(google.querySelectorAll("svg.social-login-symbol path")).toHaveLength(4);
});
