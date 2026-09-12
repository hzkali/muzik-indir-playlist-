"use client";

import { useEffect, useRef, useState } from "react";
import type { FsDirectoryHandleLike } from "@/types/file-system-access";

type ItemStatus = "bekliyor" | "indiriliyor" | "tamamlandi" | "hata";

interface QueueItem {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string;
  status: ItemStatus;
  error?: string;
}

interface InfoItem {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";
  const total = Math.floor(seconds);
  const s = (total % 60).toString().padStart(2, "0");
  const totalMinutes = Math.floor(total / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s}`;
  }
  return `${m}:${s}`;
}

function sanitizeFilenameClient(name: string): string {
  const cleaned = name.replace(/["\\/:*?<>|\x00-\x1f]/g, "_").trim();
  return cleaned.slice(0, 150).trim() || "audio";
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  bekliyor: "Bekliyor",
  indiriliyor: "İndiriliyor",
  tamamlandi: "Tamamlandı",
  hata: "Hata",
};

const STATUS_CLASS: Record<ItemStatus, string> = {
  bekliyor: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  indiriliyor: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  tamamlandi: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
  hata: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
};

export default function Home() {
  const [urlInput, setUrlInput] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderPickerSupported, setFolderPickerSupported] = useState(true);

  const itemsRef = useRef<QueueItem[]>([]);
  const stopRequestedRef = useRef(false);
  const isRunningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const dirHandleRef = useRef<FsDirectoryHandleLike | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    setFolderPickerSupported(typeof window !== "undefined" && !!window.showDirectoryPicker);
  }, []);

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function handleAddUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setInfoError(null);
    setIsFetchingInfo(true);
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Bilgi alınamadı");
      }
      const incoming = (data.items as InfoItem[]) || [];
      setItems((prev) => {
        const existing = new Set(prev.map((i) => i.id));
        const fresh: QueueItem[] = incoming
          .filter((i) => !existing.has(i.id))
          .map((i) => ({ ...i, status: "bekliyor" as const }));
        return [...prev, ...fresh];
      });
      setUrlInput("");
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      setIsFetchingInfo(false);
    }
  }

  async function handlePickFolder() {
    if (!window.showDirectoryPicker) {
      setFolderPickerSupported(false);
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      dirHandleRef.current = handle;
      setFolderName(handle.name);
    } catch {
      // kullanıcı iptal etti
    }
  }

  async function downloadOne(id: string) {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;

    updateItem(id, { status: "indiriliyor", error: undefined });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = new URLSearchParams({ id, title: item.title });
      const res = await fetch(`/api/download?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Sunucu hatası (${res.status})`);
      }
      if (!res.body) {
        throw new Error("Yanıt akışı alınamadı");
      }

      const filename = `${sanitizeFilenameClient(item.title)}.mp3`;

      if (dirHandleRef.current) {
        const fileHandle = await dirHandleRef.current.getFileHandle(filename, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await res.body.pipeTo(writable);
      } else {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      }

      updateItem(id, { status: "tamamlandi" });
    } catch (err) {
      if (controller.signal.aborted) {
        updateItem(id, { status: "bekliyor" });
      } else {
        updateItem(id, {
          status: "hata",
          error: err instanceof Error ? err.message : "Bilinmeyen hata",
        });
      }
    } finally {
      abortRef.current = null;
    }
  }

  async function startDownloads() {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    stopRequestedRef.current = false;
    setIsDownloading(true);

    const queue = itemsRef.current
      .filter((i) => i.status === "bekliyor" || i.status === "hata")
      .map((i) => i.id);

    for (const id of queue) {
      if (stopRequestedRef.current) break;
      await downloadOne(id);
    }

    isRunningRef.current = false;
    setIsDownloading(false);
  }

  function stopDownloads() {
    stopRequestedRef.current = true;
    abortRef.current?.abort();
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearAll() {
    if (isDownloading) return;
    setItems([]);
  }

  const total = items.length;
  const done = items.filter((i) => i.status === "tamamlandi").length;
  const failed = items.filter((i) => i.status === "hata").length;
  const pending = items.filter((i) => i.status === "bekliyor").length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            YouTube MP3 İndirici
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Tek video veya playlist bağlantısı yapıştırın, mp3 olarak seçtiğiniz klasöre indirin.
            Yalnızca üzerinde hak sahibi olduğunuz veya indirmeye izinli içerikler için kullanın.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            YouTube video veya playlist linki
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddUrl();
              }}
              placeholder="https://www.youtube.com/watch?v=... veya playlist linki"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button
              onClick={handleAddUrl}
              disabled={isFetchingInfo || !urlInput.trim()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isFetchingInfo ? "Getiriliyor..." : "Ekle"}
            </button>
          </div>
          {infoError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{infoError}</p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePickFolder}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Klasör Seç
            </button>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {folderName ? (
                <>
                  Seçili klasör: <span className="font-medium text-zinc-800 dark:text-zinc-200">{folderName}</span>
                </>
              ) : folderPickerSupported ? (
                "Klasör seçilmedi (varsayılan İndirilenler'e kaydedilecek)"
              ) : (
                "Bu tarayıcı klasör seçimini desteklemiyor, dosyalar İndirilenler'e kaydedilecek"
              )}
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              onClick={startDownloads}
              disabled={isDownloading || (pending === 0 && failed === 0)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isDownloading ? "İndiriliyor..." : "İndirmeyi Başlat"}
            </button>
            <button
              onClick={stopDownloads}
              disabled={!isDownloading}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
            >
              Durdur
            </button>
            <button
              onClick={clearAll}
              disabled={isDownloading || items.length === 0}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
            >
              Listeyi Temizle
            </button>
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            Toplam: {total} · Tamamlanan: {done} · Hata: {failed}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Henüz listeye eklenmiş bir şarkı yok.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="h-12 w-20 flex-shrink-0 rounded object-cover bg-zinc-200 dark:bg-zinc-700"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {item.title}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDuration(item.duration)}
                      {item.error ? ` · ${item.error}` : ""}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[item.status]}`}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={item.status === "indiriliyor"}
                    className="text-zinc-400 hover:text-red-500 disabled:opacity-30"
                    aria-label="Kaldır"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
