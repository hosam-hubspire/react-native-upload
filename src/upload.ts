import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import {
  UploadConfig,
  FileUploadConfig,
  UploadChunkResult,
  UploadFileResult,
  UploadProgress,
  SimpleUploadConfig,
  UnifiedUploadConfig,
  SignedUrlResponse,
  SimpleSignedUrlResponse,
} from "./types";
import { mapConcurrent, generateVideoThumbnail, getImageSize } from "./helpers";

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_CONCURRENT_FILE_UPLOAD_LIMIT = 3;
const DEFAULT_CONCURRENT_CHUNK_UPLOAD_LIMIT = 6;
const DEFAULT_MAX_FILE_SIZE_MB = 4096;
const DEFAULT_CHUNK_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Updates the upload progress for a chunked upload and calls the progress callback.
 *
 * @param fileIndex - Index of the file being uploaded
 * @param totalParts - Total number of chunks/parts
 * @param uploadedPartsCount - Number of chunks uploaded so far
 * @param partSize - Size of each chunk in bytes
 * @param fileSize - Total file size in bytes
 * @param onProgress - Optional progress callback function
 */
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

/**
 * Uploads a video thumbnail to S3 using a signed URL.
 *
 * @param params - Parameters for thumbnail upload
 * @param params.thumbnailPath - Local path to the thumbnail image
 * @param params.getThumbnailSignedUrl - Function to get signed URL for thumbnail
 * @returns Promise resolving to the thumbnail S3 key
 * @throws Error if thumbnail upload fails
 */
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

/**
 * Reads a file in chunks and uploads each chunk to S3 using signed URLs.
 * This is the core function that handles multipart uploads.
 *
 * @param params - File upload configuration and parameters
 * @param params.fileIndex - Unique index for this file
 * @param params.filePath - Local path to the file
 * @param params.fileSize - File size in bytes
 * @param params.partSize - Size of each chunk in bytes
 * @param params.totalParts - Total number of chunks
 * @param params.mediaType - Type of media: 'photo' or 'video'
 * @param params.thumbnailPath - Optional thumbnail path (required for videos)
 * @param params.contentType - Optional MIME content type
 * @param params.extension - Optional file extension
 * @param params.config - Upload configuration object
 * @returns Promise resolving to an array of chunk upload results
 */
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
    // UploadConfig still uses getSignedUrls (internal type)
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

    /**
     * Reads a chunk from the file and uploads it to S3.
     *
     * @param position - Byte position to start reading from
     * @param length - Number of bytes to read
     * @param partNumber - Part number (1-indexed)
     * @returns Promise resolving to ETag and part number, or error information
     */
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
      (task: { position: number; length: number; partNumber: number }) =>
        readAndUploadChunk(task.position, task.length, task.partNumber),
      concurrentChunkLimit
    );

    let thumbnailKey = "";
    let height = 0;
    let width = 0;

    if (mediaType === "video") {
      // Auto-generate thumbnail if not provided
      let finalThumbnailPath = thumbnailPath;
      if (!finalThumbnailPath) {
        const generatedThumbnail = await generateVideoThumbnail(filePath);
        if (generatedThumbnail) {
          finalThumbnailPath = generatedThumbnail;
        } else {
          // expo-video-thumbnails is not installed, skip thumbnail upload
          console.warn(
            `expo-video-thumbnails is not installed. Skipping thumbnail generation for video at ${filePath}. Install expo-video-thumbnails to enable automatic thumbnail generation.`
          );
        }
      }

      // Only upload thumbnail if we have one and getThumbnailSignedUrl is provided
      if (finalThumbnailPath && config.getThumbnailSignedUrl) {
        try {
          const { thumbnailKey: thumbKey } = await uploadThumbnail({
            thumbnailPath: finalThumbnailPath,
            getThumbnailSignedUrl: config.getThumbnailSignedUrl,
          });

          try {
            const { height: calculatedHeight, width: calculatedWidth } =
              await getImageSize(finalThumbnailPath);
            height = calculatedHeight;
            width = calculatedWidth;
          } catch (error) {
            console.error("Failed to get thumbnail image size:", error);
          }

          thumbnailKey = thumbKey;
        } catch (thumbnailError: any) {
          // Don't fail the entire upload if thumbnail fails
          console.error("Failed to upload thumbnail:", thumbnailError);
          // Continue without thumbnail
        }
      }
    } else {
      try {
        const { height: calculatedHeight, width: calculatedWidth } =
          await getImageSize(filePath);
        height = calculatedHeight;
        width = calculatedWidth;
      } catch (error) {
        console.error("Failed to get image size:", error);
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

/**
 * Uploads a single file using chunked multipart upload.
 * This is the recommended method for large files (>5MB).
 *
 * @param fileConfig - Configuration for the file to upload
 * @param config - Upload configuration with callbacks and settings
 * @returns Promise resolving to the upload result with S3 key and metadata
 *
 * @example
 * ```typescript
 * const result = await uploadFile(
 *   {
 *     fileIndex: 0,
 *     filePath: '/path/to/file.jpg',
 *     fileSize: 10 * 1024 * 1024,
 *     mediaType: 'photo',
 *     contentType: 'image/jpeg',
 *     extension: 'jpg'
 *   },
 *   {
 *     getUploadUrl: async ({ uploadType, mediaType, contentType, extension, totalParts }) => {
 *       // Call your backend API
 *       const response = await fetch('/api/upload/url', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify({ uploadType, mediaType, contentType, extension, totalParts }),
 *       });
 *       return response.json();
 *     },
 *     markUploadComplete: async ({ eTags, key, uploadId }) => {
 *       // Call your backend API
 *       const response = await fetch('/api/upload/complete', { ... });
 *       return response.json();
 *     },
 *     onProgress: (fileIndex, progress) => {
 *       console.log(`File ${fileIndex}: ${progress.percentComplete}%`);
 *     }
 *   }
 * );
 * ```
 */
async function uploadFile(
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

/**
 * Uploads multiple files concurrently using chunked multipart upload.
 * Files are uploaded in parallel up to the configured concurrency limit.
 *
 * @param files - Array of file configurations to upload
 * @param config - Upload configuration with callbacks and settings
 * @returns Promise resolving to an array of upload results, one per file
 *
 * @example
 * ```typescript
 * const results = await uploadMultipleFiles(
 *   [
 *     {
 *       fileIndex: 0,
 *       filePath: '/path/to/image1.jpg',
 *       fileSize: 5 * 1024 * 1024,
 *       mediaType: 'photo',
 *       contentType: 'image/jpeg',
 *       extension: 'jpg'
 *     },
 *     {
 *       fileIndex: 1,
 *       filePath: '/path/to/video.mp4',
 *       fileSize: 50 * 1024 * 1024,
 *       mediaType: 'video',
 *       thumbnailPath: '/path/to/thumbnail.jpg',
 *       contentType: 'video/mp4',
 *       extension: 'mp4'
 *     }
 *   ],
 *   uploadConfig
 * );
 * ```
 */
async function uploadMultipleFiles(
  files: FileUploadConfig[],
  config: UploadConfig
): Promise<UploadFileResult[]> {
  if (!files.length) return [];

  const concurrentFileLimit =
    config.concurrentFileUploadLimit || DEFAULT_CONCURRENT_FILE_UPLOAD_LIMIT;

  try {
    const uploadResponse = await mapConcurrent(
      files,
      (file: FileUploadConfig) => uploadFile(file, config),
      concurrentFileLimit
    );

    const uploadedFiles = uploadResponse.flat();

    // Calculate total progress if callback provided
    if (config.onTotalProgress) {
      const totalBytes = files.reduce((sum, file) => sum + file.fileSize, 0);
      const fileSizeMap = new Map(
        files.map((file) => [file.fileIndex, file.fileSize])
      );
      const totalUploadedBytes = uploadedFiles.reduce(
        (sum: number, file: UploadFileResult) => {
          // This is a simplified calculation - in a real scenario you'd track bytes per file
          const fileSize = fileSizeMap.get(file.fileIndex) || 0;
          return sum + (file.uploadFailed ? 0 : fileSize);
        },
        0
      );

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

/**
 * Uploads a single file using a simple (non-chunked) upload.
 * This is suitable for smaller files that don't need multipart upload.
 * Supports progress tracking via XMLHttpRequest when onProgress is provided.
 *
 * @param uploadConfig - Configuration for the simple upload
 * @param uploadConfig.signedUrl - Presigned URL to upload the file to
 * @param uploadConfig.filePath - Local path to the file
 * @param uploadConfig.onProgress - Optional progress callback (0-100)
 * @returns Promise resolving to the upload response with status, headers, and body
 *
 * @example
 * ```typescript
 * const result = await uploadSimpleFile({
 *   signedUrl: 'https://s3.amazonaws.com/bucket/file.jpg?signature=...',
 *   filePath: '/path/to/file.jpg',
 *   onProgress: (percentage) => {
 *     console.log(`Progress: ${percentage}%`);
 *   }
 * });
 * ```
 */
async function uploadSimpleFile(
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

/**
 * Uploads multiple files concurrently using simple (non-chunked) uploads.
 * Files are uploaded in parallel up to the specified concurrency limit.
 *
 * @param files - Array of simple upload configurations
 * @param concurrency - Maximum number of concurrent uploads (default: 6)
 * @returns Promise resolving to an array of upload responses
 *
 * @example
 * ```typescript
 * const results = await uploadMultipleSimpleFiles(
 *   [
 *     {
 *       signedUrl: 'https://s3.amazonaws.com/bucket/file1.jpg?signature=...',
 *       filePath: '/path/to/file1.jpg',
 *       onProgress: (percentage) => console.log(`File 1: ${percentage}%`)
 *     },
 *     {
 *       signedUrl: 'https://s3.amazonaws.com/bucket/file2.jpg?signature=...',
 *       filePath: '/path/to/file2.jpg',
 *       onProgress: (percentage) => console.log(`File 2: ${percentage}%`)
 *     }
 *   ],
 *   3 // Upload up to 3 files at once
 * );
 * ```
 */
async function uploadMultipleSimpleFiles(
  files: SimpleUploadConfig[],
  concurrency: number = DEFAULT_CONCURRENT_CHUNK_UPLOAD_LIMIT
): Promise<
  Array<{ status: number; headers: Record<string, string>; body: string }>
> {
  try {
    const uploadTasks = await mapConcurrent(
      files,
      (file: SimpleUploadConfig) => uploadSimpleFile(file),
      concurrency
    );

    return uploadTasks.flat();
  } catch (error: any) {
    throw new Error(`${error?.message || String(error)}`);
  }
}

/**
 * Unified upload function that automatically switches between chunked and simple uploads
 * based on file size. Always accepts an array of files, even if only one file is provided.
 *
 * Files with size >= chunkThresholdBytes will use chunked multipart upload.
 * Files with size < chunkThresholdBytes will use simple upload.
 *
 * @param files - Array of file configurations to upload (always an array, even for single files)
 * @param config - Unified upload configuration with all required callbacks
 * @returns Promise resolving to an array of upload results, one per file, in the same order as input
 *
 * @example
 * ```typescript
 * // Upload a single file (still pass as array)
 * const results = await uploadFiles(
 *   [
 *     {
 *       fileIndex: 0,
 *       filePath: '/path/to/file.jpg',
 *       fileSize: 10 * 1024 * 1024, // 10MB - will use chunked upload
 *       mediaType: 'photo',
 *       contentType: 'image/jpeg',
 *       extension: 'jpg'
 *     }
 *   ],
 *   {
 *     chunkThresholdBytes: 5 * 1024 * 1024, // 5MB threshold
 *     getUploadUrl: async ({ uploadType, mediaType, contentType, extension, totalParts }) => {
 *       // Single unified endpoint (recommended)
 *       const response = await fetch('/api/upload/url', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify({ uploadType, mediaType, contentType, extension, totalParts }),
 *       });
 *       return response.json();
 *       // Returns { urls, key, uploadId } for chunked or { url, key } for simple
 *     },
 *     onProgress: (fileIndex, progress) => {
 *       console.log(`File ${fileIndex}: ${progress.percentComplete}%`);
 *     }
 *   }
 * );
 * ```
 */
export async function uploadFiles(
  files: FileUploadConfig[],
  config: UnifiedUploadConfig
): Promise<UploadFileResult[]> {
  if (!files.length) return [];

  const chunkThreshold =
    config.chunkThresholdBytes ?? DEFAULT_CHUNK_THRESHOLD_BYTES;

  // Separate files into chunked and simple upload groups
  const chunkedFiles: FileUploadConfig[] = [];
  const simpleFiles: FileUploadConfig[] = [];

  files.forEach((file) => {
    if (file.fileSize >= chunkThreshold) {
      chunkedFiles.push(file);
    } else {
      simpleFiles.push(file);
    }
  });

  const results: UploadFileResult[] = [];
  const resultMap = new Map<number, UploadFileResult>();

  // Upload chunked files
  if (chunkedFiles.length > 0) {
    const chunkedConfig: UploadConfig = {
      chunkSize: config.chunkSize,
      concurrentFileUploadLimit: config.concurrentFileUploadLimit,
      concurrentChunkUploadLimit: config.concurrentChunkUploadLimit,
      maxFileSizeMB: config.maxFileSizeMB,
      getSignedUrls: async (params) => {
        const response = await config.getUploadUrl({
          uploadType: "chunked",
          mediaType: params.mediaType,
          totalParts: params.totalParts,
          contentType: params.contentType,
          extension: params.extension,
        });
        if (!("urls" in response) || !("uploadId" in response)) {
          throw new Error("Invalid response for chunked upload");
        }
        return response;
      },
      markUploadComplete: config.markUploadComplete,
      getThumbnailSignedUrl: config.getThumbnailSignedUrl,
      onProgress: config.onProgress,
      onTotalProgress: config.onTotalProgress,
    };

    const chunkedResults = await uploadMultipleFiles(
      chunkedFiles,
      chunkedConfig
    );
    chunkedResults.forEach((result) => {
      resultMap.set(result.fileIndex, result);
    });
  }

  // Upload simple files
  if (simpleFiles.length > 0) {
    // Get signed URLs and keys for all simple files
    const simpleFileData = await Promise.all(
      simpleFiles.map(async (file) => {
        const response = await config.getUploadUrl({
          uploadType: "simple",
          mediaType: file.mediaType,
          contentType: file.contentType,
          extension: file.extension,
        });

        // Type guard to ensure we have simple upload response
        if (!("url" in response)) {
          throw new Error("Invalid response for simple upload");
        }

        const { url, key } = response;

        return {
          file,
          signedUrl: url,
          key,
        };
      })
    );

    const simpleUploadConfigs: SimpleUploadConfig[] = simpleFileData.map(
      (data) => ({
        signedUrl: data.signedUrl,
        filePath: data.file.filePath,
        onProgress: config.onProgress
          ? (percentage: number) => {
              const progress: UploadProgress = {
                percentComplete: percentage,
                uploadedBytes: (data.file.fileSize * percentage) / 100,
                totalBytes: data.file.fileSize,
                uploadCompleted: percentage === 100,
              };
              config.onProgress!(data.file.fileIndex, progress);
            }
          : undefined,
      })
    );

    const concurrentLimit =
      config.concurrentFileUploadLimit || DEFAULT_CONCURRENT_FILE_UPLOAD_LIMIT;

    const simpleUploadResults = await uploadMultipleSimpleFiles(
      simpleUploadConfigs,
      concurrentLimit
    );

    // Convert simple upload results to UploadFileResult format
    await Promise.all(
      simpleFileData.map(async (data, index) => {
        const file = data.file;
        const uploadResult = simpleUploadResults[index];
        const uploadFailed = uploadResult.status !== 200;

        let height = 0;
        let width = 0;
        let thumbnailKey: string | undefined;

        // Get image size
        if (!uploadFailed) {
          try {
            const size = await getImageSize(file.filePath);
            height = size.height;
            width = size.width;
          } catch (error) {
            console.error("Failed to get image size:", error);
          }
        }

        // Upload thumbnail for videos
        if (file.mediaType === "video" && !uploadFailed) {
          // Auto-generate thumbnail if not provided
          let finalThumbnailPath = file.thumbnailPath;
          if (!finalThumbnailPath) {
            const generatedThumbnail = await generateVideoThumbnail(
              file.filePath
            );
            if (generatedThumbnail) {
              finalThumbnailPath = generatedThumbnail;
            } else {
              // expo-video-thumbnails is not installed, skip thumbnail upload
              console.warn(
                `expo-video-thumbnails is not installed. Skipping thumbnail generation for video at ${file.filePath}. Install expo-video-thumbnails to enable automatic thumbnail generation.`
              );
            }
          }

          // Only upload thumbnail if we have one and getThumbnailSignedUrl is provided
          if (finalThumbnailPath && config.getThumbnailSignedUrl) {
            try {
              const thumbnailResponse = await config.getThumbnailSignedUrl({
                contentType: "image/jpeg",
                extension: "jpg",
              });
              thumbnailKey = thumbnailResponse.key;

              const thumbnailFile = new File(finalThumbnailPath);
              const thumbnailBytes = await thumbnailFile.bytes();
              await fetch(thumbnailResponse.url, {
                method: "PUT",
                headers: { "Content-Type": "image/jpeg" },
                body: thumbnailBytes,
              });
            } catch (error) {
              console.error("Failed to upload thumbnail:", error);
              // Continue without thumbnail
            }
          }
        }

        resultMap.set(file.fileIndex, {
          fileIndex: file.fileIndex,
          mediaType: file.mediaType,
          key: data.key,
          height,
          width,
          thumbnailKey,
          uploadFailed,
          reason: uploadFailed
            ? `Upload failed with status ${uploadResult.status}`
            : undefined,
        });
      })
    );
  }

  // Return results in the same order as input files
  files.forEach((file) => {
    const result = resultMap.get(file.fileIndex);
    if (result) {
      results.push(result);
    } else {
      // Fallback if result not found
      results.push({
        fileIndex: file.fileIndex,
        mediaType: file.mediaType,
        uploadFailed: true,
        reason: "Upload result not found",
      });
    }
  });

  // Calculate overall progress if callback provided
  if (config.onTotalProgress) {
    const totalBytes = files.reduce((sum, file) => sum + file.fileSize, 0);
    const totalUploadedBytes = results.reduce((sum, result) => {
      const file = files.find((f) => f.fileIndex === result.fileIndex);
      if (!file) return sum;
      return sum + (result.uploadFailed ? 0 : file.fileSize);
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

  return results;
}
