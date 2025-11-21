import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import {
  UploadConfig,
  FileUploadConfig,
  UploadChunkResult,
  UploadFileResult,
  UploadProgress,
  SimpleUploadConfig,
} from "./types";
import { mapConcurrent } from "./concurrent";

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_CONCURRENT_FILE_UPLOAD_LIMIT = 3;
const DEFAULT_CONCURRENT_CHUNK_UPLOAD_LIMIT = 6;
const DEFAULT_MAX_FILE_SIZE_MB = 4096;

function updateChunkUploadProgress(
  fileIndex: number,
  totalParts: number,
  uploadedPartsCount: number,
  partSize: number,
  fileSize: number,
  onProgress?: (fileIndex: number, progress: UploadProgress) => void
) {
  const percentComplete = Math.ceil((uploadedPartsCount / totalParts) * 100);
  const uploadedBytes = uploadedPartsCount * partSize;

  const progress: UploadProgress = {
    totalParts,
    uploadedParts: uploadedPartsCount,
    percentComplete,
    uploadedBytes,
    totalBytes: fileSize,
  };

  if (onProgress) {
    onProgress(fileIndex, progress);
  }
}

async function uploadThumbnail({
  thumbnailPath,
  getThumbnailSignedUrl,
}: {
  thumbnailPath: string;
  getThumbnailSignedUrl: (config: {
    contentType?: string;
    extension?: string;
  }) => Promise<{ url: string; key: string }>;
}) {
  try {
    const { url, key } = await getThumbnailSignedUrl({
      contentType: "image/jpg",
      extension: "jpg",
    });

    // Read thumbnail file as bytes
    const thumbnailFile = new File(thumbnailPath);
    const thumbnailBytes = await thumbnailFile.bytes();

    // Upload using fetch
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
      },
      body: thumbnailBytes,
    });

    if (!response.ok) {
      throw new Error(`Thumbnail upload failed with status ${response.status}`);
    }

    return { thumbnailKey: key };
  } catch (e) {
    throw new Error(`Thumbnail upload error: ${e}`);
  }
}

async function readAndUploadFileAsChunks({
  fileIndex,
  filePath,
  fileSize,
  partSize,
  totalParts,
  mediaType,
  thumbnailPath,
  contentType,
  extension,
  config,
}: FileUploadConfig & {
  partSize: number;
  totalParts: number;
  config: UploadConfig;
}): Promise<UploadChunkResult[]> {
  let uploadedPartsCount = 0;

  try {
    const { urls, key, uploadId } = await config.getSignedUrls({
      mediaType,
      totalParts,
      contentType,
      extension,
    });

    const keyAndUploadId = { key, uploadId };

    if (!urls || !urls.length) {
      throw new Error("Signed URLs not found");
    }

    const readAndUploadChunk = async (
      position: number,
      length: number,
      partNumber: number
    ) => {
      try {
        // Use new File API instead of deprecated readAsStringAsync
        const file = new File(filePath);
        const handle = file.open();

        // Set offset to read from specific position
        handle.offset = position;

        // Read the chunk as bytes
        const chunkBytes = handle.readBytes(length);
        handle.close();

        // Upload directly using fetch (no temp file needed!)
        const url = urls[partNumber - 1];
        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: new Uint8Array(chunkBytes),
        });

        if (response.status === 200) {
          uploadedPartsCount++;

          updateChunkUploadProgress(
            fileIndex,
            totalParts,
            uploadedPartsCount,
            partSize,
            fileSize,
            config.onProgress
          );

          // Get ETag from response headers
          const etag =
            response.headers.get("ETag") || response.headers.get("Etag") || "";
          // Remove quotes from ETag if present
          const eTag = etag.replace(/^"|"$/g, "");

          return {
            eTag,
            partNumber,
          };
        } else {
          throw new Error(`Received ${response.status} status`);
        }
      } catch (error: any) {
        return {
          partNumber,
          error: true,
          reason: error?.message || String(error),
        };
      }
    };

    const uploadTasks: Array<{
      position: number;
      length: number;
      partNumber: number;
    }> = [];

    let position = 0;
    let partNumber = 1;

    while (position < fileSize) {
      const length = Math.min(partSize, fileSize - position);
      uploadTasks.push({ position, length, partNumber });
      position += length;
      partNumber++;
    }

    const concurrentChunkLimit =
      config.concurrentChunkUploadLimit ||
      DEFAULT_CONCURRENT_CHUNK_UPLOAD_LIMIT;

    const eTags = await mapConcurrent(
      uploadTasks,
      (task) => readAndUploadChunk(task.position, task.length, task.partNumber),
      concurrentChunkLimit
    );

    let thumbnailKey = "";
    let height = 0;
    let width = 0;

    if (mediaType === "video") {
      if (!config.getThumbnailSignedUrl) {
        throw new Error("getThumbnailSignedUrl is required for video uploads");
      }

      if (!thumbnailPath) {
        throw new Error("thumbnailPath is required for video uploads");
      }

      try {
        const { thumbnailKey: thumbKey } = await uploadThumbnail({
          thumbnailPath,
          getThumbnailSignedUrl: config.getThumbnailSignedUrl,
        });

        if (config.getImageSize) {
          const { height: calculatedHeight, width: calculatedWidth } =
            await config.getImageSize(thumbnailPath);
          height = calculatedHeight;
          width = calculatedWidth;
        }

        thumbnailKey = thumbKey;
      } catch (thumbnailError: any) {
        return [
          {
            fileIndex,
            eTag: null,
            partNumber: 0,
            mediaType,
            uploadFailed: true,
            reason: thumbnailError?.message || String(thumbnailError),
            keyAndUploadId,
          },
        ];
      }
    } else {
      if (config.getImageSize) {
        const { height: calculatedHeight, width: calculatedWidth } =
          await config.getImageSize(filePath);
        height = calculatedHeight;
        width = calculatedWidth;
      }
    }

    const processedETags: UploadChunkResult[] = eTags.map((result: any) => {
      if (!result.error) {
        return {
          fileIndex,
          eTag: result.eTag,
          partNumber: result.partNumber,
          keyAndUploadId,
          mediaType,
          thumbnailKey,
          filePath,
          height,
          width,
        };
      } else {
        return {
          fileIndex,
          eTag: null,
          partNumber: result.partNumber,
          mediaType,
          uploadFailed: true,
          reason: result.reason,
        };
      }
    });

    return processedETags;
  } catch (error: any) {
    throw error;
  }
}

export async function uploadFile(
  fileConfig: FileUploadConfig,
  config: UploadConfig
): Promise<UploadFileResult> {
  const { fileIndex, fileSize, mediaType } = fileConfig;

  const chunkSize = config.chunkSize || DEFAULT_CHUNK_SIZE;
  const maxFileSizeMB = config.maxFileSizeMB || DEFAULT_MAX_FILE_SIZE_MB;
  const partSize = Math.min(chunkSize, fileSize);
  const totalParts = Math.ceil(fileSize / partSize);
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

  if (parseInt(fileSizeMB, 10) > maxFileSizeMB) {
    const progress: UploadProgress = {
      uploadFailed: true,
      totalBytes: fileSize,
    };
    if (config.onProgress) {
      config.onProgress(fileIndex, progress);
    }

    return {
      fileIndex,
      mediaType,
      uploadFailed: true,
      reason: `File size is greater than ${maxFileSizeMB} MB`,
    };
  }

  try {
    const uploadResponses = await readAndUploadFileAsChunks({
      ...fileConfig,
      partSize,
      totalParts,
      config,
    });

    const uploadFailed = uploadResponses.find(
      (res) => res.fileIndex === fileIndex && res.uploadFailed
    )?.uploadFailed;

    if (!uploadFailed && uploadResponses.length > 0) {
      const eTagsKeyAndUploadId = uploadResponses
        .filter((res) => res.eTag)
        .map((item) => ({
          ETag: item.eTag!,
          PartNumber: item.partNumber,
        }));

      if (eTagsKeyAndUploadId.length > 0) {
        await config.markUploadComplete({
          eTags: eTagsKeyAndUploadId,
          key: uploadResponses[0].keyAndUploadId!.key,
          uploadId: uploadResponses[0].keyAndUploadId!.uploadId,
        });

        const progress: UploadProgress = {
          uploadCompleted: true,
          totalBytes: fileSize,
          uploadedBytes: fileSize,
          percentComplete: 100,
        };
        if (config.onProgress) {
          config.onProgress(fileIndex, progress);
        }
      }
    } else {
      const progress: UploadProgress = {
        uploadFailed: true,
        totalBytes: fileSize,
      };
      if (config.onProgress) {
        config.onProgress(fileIndex, progress);
      }
    }

    const fileUploadStatusMap = new Map<number, UploadFileResult>();

    uploadResponses.forEach((res) => {
      if (!fileUploadStatusMap.has(res.fileIndex)) {
        fileUploadStatusMap.set(res.fileIndex, {
          fileIndex: res.fileIndex,
          mediaType: res.mediaType,
          key: res.keyAndUploadId?.key,
          height: res.height,
          width: res.width,
          ...(res.mediaType === "video" && { thumbnailKey: res.thumbnailKey }),
          ...(res.uploadFailed && {
            uploadFailed: true,
            reason: res.reason,
          }),
        });
      } else if (res.uploadFailed) {
        const existingEntry = fileUploadStatusMap.get(res.fileIndex)!;
        existingEntry.uploadFailed = true;
        existingEntry.reason = res.reason;
      }
    });

    const formattedResponse = Array.from(fileUploadStatusMap.values())[0];

    return (
      formattedResponse || {
        fileIndex,
        mediaType,
        uploadFailed: true,
        reason: "No upload response received",
      }
    );
  } catch (error: any) {
    const progress: UploadProgress = {
      uploadFailed: true,
      totalBytes: fileSize,
    };
    if (config.onProgress) {
      config.onProgress(fileIndex, progress);
    }

    return {
      fileIndex,
      mediaType,
      uploadFailed: true,
      reason: error?.message || String(error),
    };
  }
}

export async function uploadMultipleFiles(
  files: FileUploadConfig[],
  config: UploadConfig
): Promise<UploadFileResult[]> {
  if (!files.length) return [];

  const concurrentFileLimit =
    config.concurrentFileUploadLimit || DEFAULT_CONCURRENT_FILE_UPLOAD_LIMIT;

  try {
    const uploadResponse = await mapConcurrent(
      files,
      (file) => uploadFile(file, config),
      concurrentFileLimit
    );

    const uploadedFiles = uploadResponse.flat();

    // Calculate total progress if callback provided
    if (config.onTotalProgress) {
      const totalBytes = files.reduce((sum, file) => sum + file.fileSize, 0);
      const fileSizeMap = new Map(
        files.map((file) => [file.fileIndex, file.fileSize])
      );
      const totalUploadedBytes = uploadedFiles.reduce((sum, file) => {
        // This is a simplified calculation - in a real scenario you'd track bytes per file
        const fileSize = fileSizeMap.get(file.fileIndex) || 0;
        return sum + (file.uploadFailed ? 0 : fileSize);
      }, 0);

      const overallPercentComplete =
        totalBytes > 0
          ? Math.min(Math.ceil((totalUploadedBytes / totalBytes) * 100), 100)
          : 0;

      config.onTotalProgress({
        overallPercentComplete,
        totalUploadedBytes,
      });
    }

    return uploadedFiles;
  } catch (e: any) {
    throw new Error(`Media upload error: ${e?.message || String(e)}`);
  }
}

export async function uploadSimpleFile(
  uploadConfig: SimpleUploadConfig
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const { signedUrl, filePath, onProgress } = uploadConfig;

  try {
    // Read file as bytes
    const file = new File(filePath);
    const fileBytes = await file.bytes();

    // Use XMLHttpRequest only if progress tracking is needed
    // (fetch doesn't support upload progress)
    if (onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percentage = (event.loaded / event.total) * 100;
            onProgress(percentage);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            // Convert headers to object
            const headers: Record<string, string> = {};
            const headerLines = xhr
              .getAllResponseHeaders()
              .trim()
              .split("\r\n");
            for (const line of headerLines) {
              const parts = line.split(": ");
              const key = parts[0];
              const value = parts.slice(1).join(": ");
              headers[key.toLowerCase()] = value;
            }

            resolve({
              status: xhr.status,
              headers,
              body: xhr.responseText,
            });
          } else {
            reject(new Error(`Received ${xhr.status} status`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload aborted"));
        });

        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.send(fileBytes);
      });
    }

    // Use fetch when progress tracking is not needed (consistent with chunk uploads)
    const response = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: fileBytes,
    });

    if (response.status === 200) {
      // Convert headers to object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const body = await response.text();

      return {
        status: response.status,
        headers,
        body,
      };
    } else {
      throw new Error(`Received ${response.status} status`);
    }
  } catch (error: any) {
    throw new Error(`${error?.message || String(error)}`);
  }
}

export async function uploadMultipleSimpleFiles(
  files: SimpleUploadConfig[],
  concurrency: number = DEFAULT_CONCURRENT_CHUNK_UPLOAD_LIMIT
): Promise<
  Array<{ status: number; headers: Record<string, string>; body: string }>
> {
  try {
    const uploadTasks = await mapConcurrent(
      files,
      (file) => uploadSimpleFile(file),
      concurrency
    );

    return uploadTasks.flat();
  } catch (error: any) {
    throw new Error(`${error?.message || String(error)}`);
  }
}
