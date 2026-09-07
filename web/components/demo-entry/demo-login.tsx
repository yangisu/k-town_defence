"use client";

import { useState, type FormEvent } from "react";
import { DemoBrandLockup } from "@/components/demo-entry/demo-brand-lockup";
import { Eye, EyeOff } from "@/components/ui/icons";
import { isValidDemoEmail } from "@/features/demo-entry/demo-auth";

interface LoginErrors {
  email: string | null;
  password: string | null;
}

export function DemoLogin({ onComplete }: { onComplete(): void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({ email: null, password: null });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const emailError = isValidDemoEmail(email) ? null : "Enter a valid email address.";
    const passwordError = password.trim() ? null : "Enter your password.";
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
        <h1 id="demo-login-title">Log in</h1>
        <p>Travel Korea&apos;s fandom territories with the artist you love.</p>
        <form noValidate onSubmit={submit}>
          <label htmlFor="demo-login-email">Email</label>
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

          <label htmlFor="demo-login-password">Password</label>
          <div className="demo-login-field">
            <input
              id="demo-login-password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "demo-login-password-error" : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                if (errors.password) setErrors((current) => ({ ...current, password: null }));
              }}
            />
            <button
              type="button"
              className="demo-login-reveal"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              onClick={() => setPasswordVisible((current) => !current)}
            >
              {passwordVisible ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
            </button>
          </div>
          {errors.password ? <p id="demo-login-password-error" className="demo-login-error" role="alert">{errors.password}</p> : null}

          <button type="submit">Log in</button>
        </form>
        <small className="demo-login-note">Demo login · Any email and password works.</small>
      </section>
    </main>
  );
}
