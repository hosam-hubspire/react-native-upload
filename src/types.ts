/**
 * Progress information for a file upload operation.
 */
export interface UploadProgress {
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
  /** Whether the upload has failed */
  uploadFailed?: boolean;
  /** Whether the upload has completed successfully */
  uploadCompleted?: boolean;
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
 * Response from the backend containing signed URLs for multipart upload.
 */
export interface SignedUrlResponse {
  /** Array of signed URLs, one for each chunk/part */
  urls: string[];
  /** S3 key where the file will be stored */
  key: string;
  /** Multipart upload ID from S3 */
  uploadId: string;
}

/**
 * Response from the backend containing a signed URL for simple upload.
 */
export interface SimpleSignedUrlResponse {
  /** Signed URL to upload the file to */
  url: string;
  /** S3 key where the file will be stored */
  key: string;
}

/**
 * Result of uploading a single chunk/part.
 */
export interface UploadChunkResult {
  /** File index this chunk belongs to */
  fileIndex: number;
  /** ETag returned from S3 for this chunk (null if upload failed) */
  eTag: string | null;
  /** Part number of this chunk (1-indexed) */
  partNumber: number;
  /** S3 key and upload ID (only present if chunk upload succeeded) */
  keyAndUploadId?: {
    key: string;
    uploadId: string;
  };
  /** S3 key (legacy field, use keyAndUploadId) */
  key?: string;
  /** Upload ID (legacy field, use keyAndUploadId) */
  uploadId?: string;
  /** Type of media: 'photo' or 'video' */
  mediaType: "photo" | "video";
  /** S3 key of the uploaded thumbnail (for videos) */
  thumbnailKey?: string;
  /** Original file path */
  filePath?: string;
  /** Image/video height in pixels */
  height?: number;
  /** Image/video width in pixels */
  width?: number;
  /** Whether this chunk upload failed */
  uploadFailed?: boolean;
  /** Error message or Error object if upload failed */
  reason?: string | Error;
}

/**
 * Final result of uploading a complete file.
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
  /** Whether the upload failed */
  uploadFailed?: boolean;
  /** Error message or Error object if upload failed */
  reason?: string | Error;
}

/**
 * Configuration object for chunked file uploads.
 */
export interface UploadConfig {
  /** Size of each chunk in bytes (default: 5MB) */
  chunkSize?: number;
  /** Maximum number of files to upload concurrently (default: 3) */
  concurrentFileUploadLimit?: number;
  /** Maximum number of chunks to upload concurrently per file (default: 6) */
  concurrentChunkUploadLimit?: number;
  /** Maximum file size in MB (default: 4096) */
  maxFileSizeMB?: number;
  /**
   * Function to get signed URLs for multipart upload chunks.
   * This should call your backend API to generate S3 presigned URLs.
   *
   * @param config - Configuration object with media type, total parts, content type, and extension
   * @returns Promise resolving to signed URLs, S3 key, and upload ID
   */
  getSignedUrls: (config: {
    mediaType: "photo" | "video";
    totalParts: number;
    contentType?: string;
    extension?: string;
  }) => Promise<SignedUrlResponse>;
  /**
   * Function to mark a multipart upload as complete.
   * This should call your backend API to complete the S3 multipart upload.
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
   * Optional function to get a signed URL for thumbnail upload.
   * Required for video uploads.
   *
   * @param config - Configuration object with content type and extension
   * @returns Promise resolving to signed URL and S3 key for thumbnail
   */
  getThumbnailSignedUrl?: (config: {
    contentType?: string;
    extension?: string;
  }) => Promise<{ url: string; key: string }>;
  /**
   * Optional callback for per-file progress updates.
   *
   * @param fileIndex - Index of the file being uploaded
   * @param progress - Progress information for this file
   */
  onProgress?: (fileIndex: number, progress: UploadProgress) => void;
  /**
   * Optional callback for overall progress across all files.
   *
   * @param progress - Overall progress information
   */
  onTotalProgress?: (progress: {
    overallPercentComplete: number;
    totalUploadedBytes: number;
  }) => void;
}

/**
 * Configuration for a simple (non-chunked) file upload.
 */
export interface SimpleUploadConfig {
  /** Presigned URL to upload the file to */
  signedUrl: string;
  /** Local file path to upload */
  filePath: string;
  /**
   * Optional callback for upload progress updates.
   *
   * @param progress - Upload progress percentage (0-100)
   */
  onProgress?: (progress: number) => void;
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
   * Unified function to get signed URLs for both chunked and simple uploads.
   * The library will call this with different parameters based on the upload type.
   *
   * @param config - Configuration object with upload type, file metadata, and optional chunk info
   * @returns Promise resolving to signed URLs and metadata
   */
  getUploadUrl: (config: {
    uploadType: "chunked" | "simple";
    mediaType: "photo" | "video";
    contentType?: string;
    extension?: string;
    fileName?: string;
    // Only present for chunked uploads
    totalParts?: number;
  }) => Promise<
    | SignedUrlResponse // For chunked uploads
    | SimpleSignedUrlResponse // For simple uploads
  >;
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
   * Optional function to get a signed URL for thumbnail upload.
   * Required for video uploads.
   *
   * @param config - Configuration object with content type and extension
   * @returns Promise resolving to signed URL and S3 key for thumbnail
   */
  getThumbnailSignedUrl?: (config: {
    contentType?: string;
    extension?: string;
  }) => Promise<{ url: string; key: string }>;
  /**
   * Optional callback for per-file progress updates.
   *
   * @param fileIndex - Index of the file being uploaded
   * @param progress - Progress information for this file
   */
  onProgress?: (fileIndex: number, progress: UploadProgress) => void;
  /**
   * Optional callback for overall progress across all files.
   *
   * @param progress - Overall progress information
   */
  onTotalProgress?: (progress: {
    overallPercentComplete: number;
    totalUploadedBytes: number;
  }) => void;
}
