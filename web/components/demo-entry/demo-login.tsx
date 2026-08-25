"use client";

import { useState, type FormEvent } from "react";
import { DemoBrandLockup } from "@/components/demo-entry/demo-brand-lockup";
import { isValidDemoEmail } from "@/features/demo-entry/demo-auth";

interface LoginErrors {
  email: string | null;
  password: string | null;
}

export function DemoLogin({ onComplete }: { onComplete(): void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({ email: null, password: null });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const emailError = isValidDemoEmail(email) ? null : "올바른 이메일 주소를 입력해 주세요.";
    const passwordError = password.trim() ? null : "비밀번호를 입력해 주세요.";
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }
    onComplete();
  };

  return (
    <main className="demo-entry-screen demo-login-screen">
      <section className="demo-login-card" aria-labelledby="demo-login-title">
        <DemoBrandLockup />
        <h1 id="demo-login-title" aria-label="K-TOWN DEFENCE 로그인">
          <span>K-TOWN DEFENCE</span>
          <span>로그인</span>
        </h1>
        <p>좋아하는 아티스트와 함께 대한민국 팬덤 영토를 여행하세요.</p>
        <form noValidate onSubmit={submit}>
          <label htmlFor="demo-login-email">이메일</label>
          <input
            id="demo-login-email"
            type="email"
            autoComplete="email"
            value={email}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "demo-login-email-error" : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email) setErrors((current) => ({ ...current, email: null }));
            }}
          />
          {errors.email ? <p id="demo-login-email-error" className="demo-login-error" role="alert">{errors.email}</p> : null}

          <label htmlFor="demo-login-password">비밀번호</label>
          <input
            id="demo-login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "demo-login-password-error" : undefined}
            onChange={(event) => {
              setPassword(event.target.value);
              if (errors.password) setErrors((current) => ({ ...current, password: null }));
            }}
          />
          {errors.password ? <p id="demo-login-password-error" className="demo-login-error" role="alert">{errors.password}</p> : null}

          <button type="submit">로그인</button>
        </form>
        <small className="demo-login-note">데모용 로그인 · 임의의 이메일과 비밀번호로 체험할 수 있어요.</small>
      </section>
    </main>
  );
}
