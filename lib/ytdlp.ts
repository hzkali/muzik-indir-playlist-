import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

export function getYtDlpPath(): string {
  const binaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return path.join(process.cwd(), "bin", binaryName);
}

export function getFfmpegPath(): string {
  if (!ffmpegStatic) {
    throw new Error("ffmpeg-static binary could not be resolved");
  }
  return ffmpegStatic as unknown as string;
}

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function isValidVideoId(id: string): boolean {
  return VIDEO_ID_RE.test(id);
}

const ALLOWED_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function isAllowedYoutubeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      ALLOWED_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/["\\/:*?<>|\x00-\x1f]/g, "_").trim();
  return cleaned.slice(0, 150).trim() || "audio";
}

export function contentDispositionHeader(title: string): string {
  const safe = sanitizeFilename(title);
  const asciiFallback = safe.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${asciiFallback}.mp3"; filename*=UTF-8''${encodeURIComponent(
    safe
  )}.mp3`;
}
