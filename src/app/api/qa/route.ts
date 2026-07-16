import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import fs from "fs";
import Papa from "papaparse";

async function getDriveClient() {
  const credentialsPath = "/Users/stephenskalamera/.openclaw/workspace/credentials.json";
  const tokenPath = "/Users/stephenskalamera/.openclaw/workspace/google_token.json";

  if (!fs.existsSync(credentialsPath) || !fs.existsSync(tokenPath)) {
    throw new Error("Google credentials not found");
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const token = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
  const clientSecretKey = credentials.installed || credentials.web;
  const { client_secret, client_id, redirect_uris } = clientSecretKey;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(token);
  
  return google.drive({ version: "v3", auth: oAuth2Client });
}

async function getCsvFileId(drive: any) {
  const listRes = await drive.files.list({
    q: "'1_RCRTRWLWytFOANwJR3zqUBSYYILTiLQ' in parents and name = 'Hadrius_KB_QnA_v2.csv' and trashed = false",
    fields: "files(id)"
  });
  
  const files = listRes.data.files;
  if (!files || files.length === 0) {
     throw new Error("CSV file not found in Google Drive");
  }
  
  const fileId = files[0].id;
  if (!fileId) {
    throw new Error("CSV file found but has no ID");
  }
  return fileId;
}

export async function GET() {
  try {
    const drive = await getDriveClient();
    const fileId = await getCsvFileId(drive);
    
    const response = await drive.files.get(
      { fileId: fileId, alt: "media" },
      { responseType: "text" }
    );

    const csvText = response.data as unknown as string;
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    
    return NextResponse.json({ data: parsed.data });
  } catch (error: any) {
    console.error("Failed to fetch Q&A:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch Q&A" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.question) {
      return NextResponse.json({ error: "Missing question to delete" }, { status: 400 });
    }

    const drive = await getDriveClient();
    const fileId = await getCsvFileId(drive);
    
    // Download current
    const response = await drive.files.get(
      { fileId: fileId, alt: "media" },
      { responseType: "text" }
    );

    const csvText = response.data as unknown as string;
    const parsed = Papa.parse<{Question: string, Answer: string}>(csvText, { header: true, skipEmptyLines: true });
    
    // Filter out the deleted question
    const originalLength = parsed.data.length;
    const newData = parsed.data.filter((row: any) => row.Question !== body.question);

    if (newData.length === originalLength) {
       return NextResponse.json({ error: "Question not found in CSV" }, { status: 404 });
    }

    // Convert back to CSV
    const newCsv = Papa.unparse(newData);

    // Upload update
    await drive.files.update({
      fileId: fileId,
      media: {
        mimeType: "text/csv",
        body: newCsv
      }
    });

    return NextResponse.json({ success: true, deleted: body.question });
  } catch (error: any) {
    console.error("Failed to delete Q&A:", error);
    return NextResponse.json({ error: error.message || "Failed to delete Q&A" }, { status: 500 });
  }
}
