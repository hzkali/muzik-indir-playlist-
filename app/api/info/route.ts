import { execFile } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { getYtDlpPath, isAllowedYoutubeUrl } from "@/lib/ytdlp";

export const runtime = "nodejs";
export const maxDuration = 45;

interface YtDlpFlatEntry {
  id: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url: string }[];
}

interface YtDlpDump {
  _type?: string;
  id?: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url: string }[];
  entries?: YtDlpFlatEntry[];
}

function thumbnailFor(entry: {
  id: string;
  thumbnail?: string;
  thumbnails?: { url: string }[];
}) {
  if (entry.thumbnail) return entry.thumbnail;
  if (entry.thumbnails && entry.thumbnails.length > 0) {
    return entry.thumbnails[entry.thumbnails.length - 1].url;
  }
  return `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`;
}

function runYtDlpJson(url: string): Promise<YtDlpDump> {
  return new Promise((resolve, reject) => {
    execFile(
      getYtDlpPath(),
      [
        "--flat-playlist",
        "--dump-single-json",
        "--no-warnings",
        "--no-call-home",
        "--socket-timeout",
        "20",
        url,
      ],
      { maxBuffer: 1024 * 1024 * 64, timeout: 40_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.toString().slice(-2000) || error.message));
          return;
        }
        try {
          resolve(JSON.parse(stdout.toString()));
        } catch {
          reject(new Error("yt-dlp çıktısı ayrıştırılamadı"));
        }
      }
    );
  });
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "URL gerekli" }, { status: 400 });
  }
  if (!isAllowedYoutubeUrl(url)) {
    return NextResponse.json(
      { error: "Sadece YouTube bağlantıları desteklenir" },
      { status: 400 }
    );
  }

  try {
    const data = await runYtDlpJson(url);

    if (data._type === "playlist" && Array.isArray(data.entries)) {
      const items = data.entries
        .filter((e): e is YtDlpFlatEntry => !!e && !!e.id)
        .map((e) => ({
          id: e.id,
          title: e.title || e.id,
          duration: e.duration ?? null,
          thumbnail: thumbnailFor(e),
        }));
      return NextResponse.json({
        playlistTitle: data.title ?? null,
        items,
      });
    }

    if (data.id) {
      return NextResponse.json({
        playlistTitle: null,
        items: [
          {
            id: data.id,
            title: data.title || data.id,
            duration: data.duration ?? null,
            thumbnail: thumbnailFor(data as { id: string; thumbnail?: string; thumbnails?: { url: string }[] }),
          },
        ],
      });
    }

    return NextResponse.json({ error: "Video bilgisi bulunamadı" }, { status: 404 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}
