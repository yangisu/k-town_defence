import { ImageResponse } from "next/og";
import { fetchShareSubject } from "../subject";

type RouteContext = { params: Promise<{ kind: string; id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { kind, id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const subject = await fetchShareSubject(kind, id, searchParams);

  if (!subject) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#16231d", color: "#dfff59", fontSize: 48 }}>
          K-TOWN DEFENSE
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 64,
          background: "#16231d",
          color: "#fffef9",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#dfff59", fontWeight: 700, letterSpacing: 2 }}>
          K-TOWN DEFENSE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{subject.title}</div>
          <div style={{ display: "flex", fontSize: 32, color: "#c7d1cb" }}>{subject.description}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
