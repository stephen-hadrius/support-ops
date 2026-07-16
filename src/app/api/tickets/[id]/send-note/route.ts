import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    if (!body.body || !body.body.trim()) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    const token = process.env.PYLON_API_KEY;
    if (!token) {
       return NextResponse.json({ error: "PYLON_API_KEY environment variable is not configured." }, { status: 500 });
    }

    // Post internal note (Pylon API handles default thread selection if omitted)
    const noteRes = await fetch(`https://api.usepylon.com/issues/${id}/note`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        body_html: body.body.replace(/\n/g, '<br/>')
      })
    });

    if (!noteRes.ok) {
       const err = await noteRes.json();
       throw new Error(err.errors?.[0] || "Pylon API error");
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to add internal note" }, { status: 500 });
  }
}
