import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import {
  YTDLP_ANTI_BOT_ARGS,
  contentDispositionHeader,
  getFfmpegPath,
  getYtDlpPath,
  isValidVideoId,
} from "@/lib/ytdlp";

export const runtime = "nodejs";
export const maxDuration = 60;

function runYtDlpDownload(videoId: string, outputBase: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outputTemplate = `${outputBase}.%(ext)s`;
    const finalPath = `${outputBase}.mp3`;

    const child = spawn(
      getYtDlpPath(),
      [
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout",
        "20",
        "--ffmpeg-location",
        getFfmpegPath(),
        ...YTDLP_ANTI_BOT_ARGS,
        "-o",
        outputTemplate,
        url,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(finalPath)) {
        resolve(finalPath);
      } else {
        reject(new Error(stderr || `yt-dlp çıkış kodu ${code}`));
      }
    });
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  const title = searchParams.get("title") || id;

  if (!isValidVideoId(id)) {
    return NextResponse.json({ error: "Geçersiz video kimliği" }, { status: 400 });
  }

  const outputBase = path.join(os.tmpdir(), `ytmp3-${id}-${randomUUID()}`);

  let finalPath: string;
  try {
    finalPath = await runYtDlpDownload(id, outputBase);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message.slice(-1500)
            : "İndirme sırasında bilinmeyen hata",
      },
      { status: 500 }
    );
  }

  const nodeStream = fs.createReadStream(finalPath);
  nodeStream.on("close", () => {
    fs.unlink(finalPath, () => {});
  });

  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": contentDispositionHeader(title),
      "Cache-Control": "no-store",
    },
  });
}
