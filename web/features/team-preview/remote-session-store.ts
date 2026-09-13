import type { DemoSession } from "./demo-session";
import type { RemoteDemoSessionStore } from "./demo-session-context";

type GameStateResponse = { state: unknown } | null;

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GAME_STATE_${response.status}`);
  return body as T;
}

export function createRemoteDemoSessionStore(fetcher: typeof fetch = fetch): RemoteDemoSessionStore {
  return {
    async load() {
      const response = await fetcher("/api/ktown/api/v1/me/game-state", { cache: "no-store" });
      return (await responseJson<GameStateResponse>(response))?.state ?? null;
    },
    async save(state: DemoSession) {
      const response = await fetcher("/api/ktown/api/v1/me/game-state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      });
      await responseJson<GameStateResponse>(response);
    },
  };
}
