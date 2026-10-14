import { NextResponse, type NextRequest } from "next/server";

/** Garante um identificador anônimo por aparelho (favoritos, reações, métricas). */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get("be_visitor")) {
    res.cookies.set("be_visitor", crypto.randomUUID(), {
      httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 730,
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/|api/media|api/og|fonts/|brand/|story/|demo/|icon-|apple-touch|favicon|manifest|sw\\.js|robots\\.txt).*)"],
};
