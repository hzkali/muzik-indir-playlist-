export interface FsWritableStreamLike extends WritableStream<Uint8Array> {}

export interface FsFileHandleLike {
  createWritable(): Promise<FsWritableStreamLike>;
}

export interface FsDirectoryHandleLike {
  name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FsFileHandleLike>;
}

export interface DirectoryPickerOptions {
  mode?: "read" | "readwrite";
}

declare global {
  interface Window {
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions
    ) => Promise<FsDirectoryHandleLike>;
  }
}
