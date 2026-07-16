import { NextRequest, NextResponse } from "next/server";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { createOAuthProvider } from "@/lib/mcp/oauthProvider";
import { getServerUrl, mcpFetch } from "@/lib/mcp/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const baseUrl = req.nextUrl.origin;

  let serverUrl: string;
  try {
    serverUrl = getServerUrl(provider);
  } catch {
    return NextResponse.json({ error: `Unknown MCP provider: ${provider}` }, { status: 404 });
  }

  const oauthProvider = createOAuthProvider(provider, baseUrl);

  try {
    const result = await auth(oauthProvider, {
      serverUrl,
      ...(provider === "hadrius" ? { fetchFn: mcpFetch } : {}),
    });
    if (result === "REDIRECT") {
      if (!oauthProvider.lastAuthorizationUrl) {
        return NextResponse.json({ error: "Failed to build authorization URL" }, { status: 500 });
      }
      return NextResponse.redirect(oauthProvider.lastAuthorizationUrl.toString());
    }
    return NextResponse.redirect(new URL("/", baseUrl));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
