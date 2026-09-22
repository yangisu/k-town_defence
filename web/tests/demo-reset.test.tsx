import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  createInitialDemoSession,
  DEMO_SESSION_KEY,
  type DemoSession,
} from "@/features/team-preview/demo-session";
import { DemoSessionProvider, useDemoSession } from "@/features/team-preview/demo-session-context";

function playedSession(): DemoSession {
  return {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    followedArtistIds: ["bts"],
    activeTab: "journey",
  };
}

function ResetProbe() {
  const session = useDemoSession();
  return (
    <div>
      <span data-testid="artist">{session.state.selectedArtistId ?? "none"}</span>
      <button type="button" onClick={() => session.reset()}>초기화</button>
    </div>
  );
}

function fakeStorage(seed: DemoSession | null): Storage {
  const map = new Map<string, string>();
  if (seed) map.set(DEMO_SESSION_KEY, JSON.stringify(seed));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  } as Storage;
}

it("clears the signed-in player's saved state on the server, not just in this browser", async () => {
  const user = userEvent.setup();
  const saved: DemoSession[] = [];
  const remote = {
    load: vi.fn(async () => playedSession() as unknown),
    save: vi.fn(async (state: DemoSession) => { saved.push(state); }),
  };
  const storage = fakeStorage(playedSession());

  render(
    <DemoSessionProvider storage={storage} remote={remote}>
      <ResetProbe />
    </DemoSessionProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("artist")).toHaveTextContent("bts"));

  await user.click(screen.getByRole("button", { name: "초기화" }));

  // The session on screen empties immediately, and so does this browser's copy.
  expect(screen.getByTestId("artist")).toHaveTextContent("none");
  expect(storage.getItem(DEMO_SESSION_KEY)).toBeNull();

  // The copy the server holds has to go too, or the next page load brings the
  // whole played session back and the reset looks like it never happened.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
  const last = saved.at(-1);
  expect(last, "the reset never reached the server").toBeDefined();
  expect(last?.selectedArtistId).toBeNull();
  expect(last?.artistConfirmed).toBe(false);
});
