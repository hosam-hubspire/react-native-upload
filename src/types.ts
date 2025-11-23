/**
 * Progress information for a file upload operation.
 * This type is passed to the onProgress callback.
 */
export interface UploadProgress {
  /** File index that this progress update is for */
  fileIndex: number;
  /** Upload status: "uploading" | "completed" | "failed" */
  status: "uploading" | "completed" | "failed";
  /** Total number of chunks/parts for the file */
  totalParts?: number;
  /** Number of chunks/parts that have been uploaded */
  uploadedParts?: number;
  /** Upload progress percentage (0-100) */
  percentComplete?: number;
  /** Number of bytes uploaded so far */
  uploadedBytes?: number;
  /** Total file size in bytes */
  totalBytes?: number;
  /** Error message or Error object if upload failed */
  error?: string | Error;
  /** Overall progress percentage across all files (0-100) */
  overallPercentComplete?: number;
  /** Total bytes uploaded across all files */
  totalUploadedBytes?: number;
}

/**
 * Configuration for uploading a single file.
 */
export interface FileUploadConfig {
  /** Unique index identifier for this file */
  fileIndex: number;
  /** Local file path to upload */
  filePath: string;
  /** File size in bytes */
  fileSize: number;
  /** Type of media: 'photo' or 'video' */
  mediaType: "photo" | "video";
  /** Optional path to thumbnail image. If not provided for videos, the package will attempt to generate one automatically using expo-video-thumbnails (if installed). */
  thumbnailPath?: string;
  /** Optional MIME content type (e.g., 'image/jpeg', 'video/mp4') */
  contentType?: string;
  /** Optional file extension (e.g., 'jpg', 'mp4') */
  extension?: string;
}

/**
 * Response from the backend containing signed URLs for uploads.
 * For chunked uploads: urls and uploadId are required.
 * For simple/thumbnail uploads: url is required.
 */
export interface SignedUrlResponse {
  /** S3 key where the file will be stored */
  key: string;
  /** Array of signed URLs for chunked uploads (one for each chunk/part) */
  urls?: string[];
  /** Multipart upload ID from S3 (required for chunked uploads) */
  uploadId?: string;
  /** Single signed URL for simple uploads or thumbnails */
  url?: string;
}

/**
 * Result of uploading a file (or a chunk during multipart upload).
 * For chunked uploads, chunk-specific fields (eTag, partNumber, keyAndUploadId) are populated.
 * For final results, only the file-level fields are populated.
 */
export interface UploadFileResult {
  /** File index that was uploaded */
  fileIndex: number;
  /** Type of media: 'photo' or 'video' */
  mediaType: "photo" | "video";
  /** S3 key where the file is stored */
  key?: string;
  /** Image/video height in pixels */
  height?: number;
  /** Image/video width in pixels */
  width?: number;
  /** S3 key of the uploaded thumbnail (for videos) */
  thumbnailKey?: string;
  /** Upload status: "completed" | "failed" (only present if upload finished) */
  status?: "completed" | "failed";
  /** Error message or Error object if upload failed */
  error?: string | Error;
  // Chunk-specific fields (only present during chunked uploads)
  /** ETag returned from S3 for this chunk (only for chunk uploads) */
  eTag?: string | null;
  /** Part number of this chunk (1-indexed, only for chunk uploads) */
  partNumber?: number;
  /** S3 key and upload ID (only present during chunked uploads) */
  keyAndUploadId?: {
    key: string;
    uploadId: string;
  };
  /** Original file path (only for chunk uploads) */
  filePath?: string;
}

/**
 * Unified configuration for file uploads that automatically switches between
 * chunked and simple uploads based on file size.
 */
export interface UnifiedUploadConfig {
  /**
   * File size threshold in bytes to determine when to use chunked upload.
   * Files >= this size will use chunked upload, files < this size will use simple upload.
   * Default: 5MB (5 * 1024 * 1024)
   */
  chunkThresholdBytes?: number;
  /** Size of each chunk in bytes for chunked uploads (default: 5MB) */
  chunkSize?: number;
  /** Maximum number of files to upload concurrently (default: 3) */
  concurrentFileUploadLimit?: number;
  /** Maximum number of chunks to upload concurrently per file (default: 6) */
  concurrentChunkUploadLimit?: number;
  /** Maximum file size in MB (default: 4096) */
  maxFileSizeMB?: number;
  /**
   * Unified function to get signed URLs for chunked, simple, and thumbnail uploads.
   * The library will call this with different parameters based on the upload type.
   *
   * @param config - Configuration object with upload type, file metadata, and optional chunk info
   * @returns Promise resolving to signed URLs and metadata
   */
  getUploadUrl: (config: {
    uploadType: "chunked" | "simple" | "thumbnail";
    mediaType?: "photo" | "video"; // Not required for thumbnails
    contentType?: string;
    extension?: string;
    fileName?: string;
    // Only present for chunked uploads
    totalParts?: number;
  }) => Promise<SignedUrlResponse>;
  /**
   * Function to mark a multipart upload as complete.
   * Required for chunked uploads (files >= chunkThresholdBytes).
   *
   * @param config - Configuration object with ETags, key, and upload ID
   * @returns Promise resolving to the completion response
   */
  markUploadComplete: (config: {
    eTags: Array<{ ETag: string; PartNumber: number }>;
    key: string;
    uploadId: string;
  }) => Promise<any>;
  /**
   * Optional callback for per-file progress updates.
   * The progress object includes both per-file and overall progress information.
   *
   * @param progress - Progress information for this file (includes fileIndex, overallPercentComplete, totalUploadedBytes)
   */
  onProgress?: (progress: UploadProgress) => void;
}
