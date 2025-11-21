export interface UploadProgress {
  totalParts?: number;
  uploadedParts?: number;
  percentComplete?: number;
  uploadedBytes?: number;
  totalBytes?: number;
  uploadFailed?: boolean;
  uploadCompleted?: boolean;
}

export interface FileUploadConfig {
  fileIndex: number;
  filePath: string;
  fileSize: number;
  mediaType: "photo" | "video";
  thumbnailPath?: string;
  contentType?: string;
  extension?: string;
}

export interface SignedUrlResponse {
  urls: string[];
  key: string;
  uploadId: string;
}

export interface UploadChunkResult {
  fileIndex: number;
  eTag: string | null;
  partNumber: number;
  keyAndUploadId?: {
    key: string;
    uploadId: string;
  };
  key?: string;
  uploadId?: string;
  mediaType: "photo" | "video";
  thumbnailKey?: string;
  filePath?: string;
  height?: number;
  width?: number;
  uploadFailed?: boolean;
  reason?: string | Error;
}

export interface UploadFileResult {
  fileIndex: number;
  mediaType: "photo" | "video";
  key?: string;
  height?: number;
  width?: number;
  thumbnailKey?: string;
  uploadFailed?: boolean;
  reason?: string | Error;
}

export interface UploadConfig {
  chunkSize?: number;
  concurrentFileUploadLimit?: number;
  concurrentChunkUploadLimit?: number;
  maxFileSizeMB?: number;
  getSignedUrls: (config: {
    mediaType: "photo" | "video";
    totalParts: number;
    contentType?: string;
    extension?: string;
  }) => Promise<SignedUrlResponse>;
  markUploadComplete: (config: {
    eTags: Array<{ ETag: string; PartNumber: number }>;
    key: string;
    uploadId: string;
  }) => Promise<any>;
  getThumbnailSignedUrl?: (config: {
    contentType?: string;
    extension?: string;
  }) => Promise<{ url: string; key: string }>;
  onProgress?: (fileIndex: number, progress: UploadProgress) => void;
  onTotalProgress?: (progress: {
    overallPercentComplete: number;
    totalUploadedBytes: number;
  }) => void;
  getImageSize?: (
    filePath: string
  ) => Promise<{ height: number; width: number }>;
}

export interface SimpleUploadConfig {
  signedUrl: string;
  filePath: string;
  onProgress?: (progress: number) => void;
}
