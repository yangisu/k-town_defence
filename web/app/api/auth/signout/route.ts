import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/server/request-origin";
import { SESSION_COOKIE_NAME } from "@/lib/server/session";

export async function GET(request: Request): Promise<Response> {
  const response = NextResponse.redirect(new URL("/signin", requestOrigin(request)));
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
