// Downloads the standalone yt-dlp binary for the current platform into ./bin
// The standalone build bundles its own Python interpreter, so no system
// Python is required at runtime (important for Vercel's Node.js functions).
const fs = require("fs");
const https = require("https");
const path = require("path");

const BIN_DIR = path.join(__dirname, "..", "bin");

function assetNameForPlatform() {
  switch (process.platform) {
    case "win32":
      return { asset: "yt-dlp.exe", file: "yt-dlp.exe" };
    case "darwin":
      return { asset: "yt-dlp_macos", file: "yt-dlp" };
    default:
      return { asset: "yt-dlp_linux", file: "yt-dlp" };
  }
}

function download(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "yt-dlp-fetch-script" } }, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          resolve(download(res.headers.location, destPath, redirectsLeft - 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
          return;
        }
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on("finish", () => fileStream.close(resolve));
        fileStream.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  const { asset, file } = assetNameForPlatform();
  const destPath = path.join(BIN_DIR, file);

  if (fs.existsSync(destPath) && !process.env.FORCE_YTDLP_DOWNLOAD) {
    console.log(`[fetch-yt-dlp] Already present at ${destPath}, skipping.`);
    return;
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });

  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  console.log(`[fetch-yt-dlp] Downloading ${url} -> ${destPath}`);

  try {
    await download(url, destPath);
    if (process.platform !== "win32") {
      fs.chmodSync(destPath, 0o755);
    }
    console.log("[fetch-yt-dlp] Done.");
  } catch (err) {
    console.error("[fetch-yt-dlp] Failed to download yt-dlp binary:", err.message);
    console.error(
      "[fetch-yt-dlp] The app will not be able to download audio until this succeeds. " +
        "Retry with: npm run fetch:yt-dlp"
    );
  }
}

main();
