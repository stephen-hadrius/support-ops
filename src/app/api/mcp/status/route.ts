import { NextResponse } from "next/server";
import { isConnected } from "@/lib/mcp/tokenStore";

export async function GET() {
  return NextResponse.json({
    pylon: isConnected("pylon"),
    notion: isConnected("notion"),
    hadrius: isConnected("hadrius"),
    linear: isConnected("linear"),
  });
}
