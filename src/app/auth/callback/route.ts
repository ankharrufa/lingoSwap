import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

// The email link lands here. We swap the one-time code for a login session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/home";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  if (code) {
    const sb = await serverSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  const msg = encodeURIComponent("That link didn't work here. Type the code from the email instead.");
  return NextResponse.redirect(`${origin}/login?error=${msg}&next=${encodeURIComponent(safeNext)}`);
}
