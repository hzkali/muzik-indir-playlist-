import fs from "node:fs";
import os from "node:os";
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

// Datacenter IPs (Vercel dahil) YouTube'un "sign in to confirm you're not a
// bot" kontrolüne daha sık takılır. "android" client'ı imzalama/PO-token
// gerektirmeyen eski bir progressive format (itag 18) döndürdüğü için bu
// kontrolü çoğunlukla atlatır; "web" ikinci client olarak denenir.
export const YTDLP_ANTI_BOT_ARGS = [
  "--extractor-args",
  "youtube:player_client=android,web",
  "--sleep-requests",
  "1",
];

const COOKIES_PATH = path.join(os.tmpdir(), "yt-dlp-cookies.txt");

// Datacenter IP'lerde client değişimi bile bot kontrolünü her zaman atlatamaz.
// YTDLP_COOKIES_BASE64 ortam değişkeni (Netscape formatlı cookies.txt'nin
// base64'ü) tanımlıysa, gerçek bir oturumu kanıt olarak yt-dlp'ye geçirir.
// Değişken sadece Vercel'in ortam değişkenlerinde tutulur, repoya asla girmez.
export function getCookiesArgs(): string[] {
  const b64 = process.env.YTDLP_COOKIES_BASE64;
  if (!b64) return [];
  try {
    if (!fs.existsSync(COOKIES_PATH)) {
      fs.writeFileSync(COOKIES_PATH, Buffer.from(b64, "base64"));
    }
    return ["--cookies", COOKIES_PATH];
  } catch {
    return [];
  }
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
