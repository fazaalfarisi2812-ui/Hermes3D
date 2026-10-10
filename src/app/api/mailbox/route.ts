import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const logPath = "C:/Users/faza0/OneDrive/Desktop/mailbox/transcript.log";
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ messages: [] });
    }
    const data = fs.readFileSync(logPath, "utf-8");
    const lines = data.trim().split("\n").filter(Boolean);
    return NextResponse.json({ messages: lines });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
