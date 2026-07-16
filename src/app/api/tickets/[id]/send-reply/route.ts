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

    // 1. Fetch messages to get the top-level message ID
    const messagesRes = await fetch(`https://api.usepylon.com/issues/${id}/messages`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const messagesData = await messagesRes.json();
    const messages = messagesData.data || [];
    
    // Find the latest public message
    const publicMessages = messages.filter((m: any) => !m.is_private);
    const lastPublicMessage = publicMessages[publicMessages.length - 1];
    
    if (!lastPublicMessage) {
       return NextResponse.json({ error: "Cannot send reply: no public message found in thread." }, { status: 400 });
    }

    // 2. Post reply
    const replyRes = await fetch(`https://api.usepylon.com/issues/${id}/reply`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        body_html: body.body.replace(/\n/g, '<br/>'),
        message_id: lastPublicMessage.id
      })
    });

    if (!replyRes.ok) {
       const err = await replyRes.json();
       throw new Error(err.errors?.[0] || "Pylon API error");
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to send reply" }, { status: 500 });
  }
}
