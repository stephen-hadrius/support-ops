import { NextRequest, NextResponse } from "next/server";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { createOAuthProvider } from "@/lib/mcp/oauthProvider";
import { getServerUrl, resetClient, mcpFetch } from "@/lib/mcp/client";
import { publicErrorMessage } from "@/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const baseUrl = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`/?mcp_error=${encodeURIComponent(oauthError)}`, baseUrl));
  }
  if (!code) {
    return NextResponse.redirect(new URL(`/?mcp_error=missing_code`, baseUrl));
  }

  let serverUrl: string;
  try {
    serverUrl = getServerUrl(provider);
  } catch {
    return NextResponse.redirect(
      new URL(`/?mcp_error=${encodeURIComponent(`Unknown MCP provider: ${provider}`)}`, baseUrl),
    );
  }

  const oauthProvider = createOAuthProvider(provider, baseUrl);

  try {
    await auth(oauthProvider, {
      serverUrl,
      authorizationCode: code,
      ...(provider === "hadrius" ? { fetchFn: mcpFetch } : {}),
    });
    resetClient(provider);
    return NextResponse.redirect(new URL(`/?mcp_connected=${provider}`, baseUrl));
  } catch (err) {
    console.error(`OAuth callback failed for ${provider}:`, err);
    return NextResponse.redirect(
      new URL(`/?mcp_error=${encodeURIComponent(publicErrorMessage(err, "Authorization failed"))}`, baseUrl),
    );
  }
}
