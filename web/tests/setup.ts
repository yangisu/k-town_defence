import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

type NativeFocusMethods = { focus: typeof HTMLElement.prototype.focus; blur: typeof HTMLElement.prototype.blur };
const nativeFocusKey = "__ktownNativeFocusMethods";
const shared = globalThis as typeof globalThis & { [nativeFocusKey]?: NativeFocusMethods };
shared[nativeFocusKey] ??= {
  focus: window.HTMLElement.prototype.focus,
  blur: window.HTMLElement.prototype.blur,
};

beforeEach(() => {
  // user-event uses a module-local symbol to remember its focus patch. Vitest
  // isolates that module per file while reusing jsdom's HTMLElement, so the
  // wrappers otherwise stack until focus overflows the call stack.
  Object.defineProperties(window.HTMLElement.prototype, {
    focus: { configurable: true, writable: true, value: shared[nativeFocusKey]!.focus },
    blur: { configurable: true, writable: true, value: shared[nativeFocusKey]!.blur },
  });
  window.scrollTo = vi.fn();
  window.scrollBy = vi.fn();
});
afterEach(() => cleanup());
