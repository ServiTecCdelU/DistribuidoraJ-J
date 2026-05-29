import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (!authResult.ok) return authResult.response;

    const { base64, filename } = await req.json();

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );

    auth.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const drive = google.drive({ version: "v3", auth });

    const buffer = Buffer.from(base64, "base64");
    const stream = Readable.from(buffer);

    const response = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: "application/pdf",
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!],
      },
      media: {
        mimeType: "application/pdf",
        body: stream,
      },
      fields: "id",
    });

    const fileId = response.data.id!;

    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    return NextResponse.json({ downloadUrl, fileId });
  } catch (error: any) {
    console.error("[Drive] Error:", error.message);
    return NextResponse.json({ error: "Error al subir archivo" }, { status: 500 });
  }
}