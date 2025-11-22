# react-native-chunk-upload

A generalized React Native package for file uploads with automatic chunking. This package automatically switches between chunked multipart uploads (for large files) and simple uploads (for smaller files) based on file size, supports concurrent uploads, and provides detailed progress callbacks.

## Features

- ✅ Automatic upload method selection - Automatically uses chunked upload for large files and simple upload for smaller files
- ✅ Concurrent file and chunk uploads with progress tracking
- ✅ Real-time progress tracking per file and overall progress
- ✅ Support for photos and videos
- ✅ Automatic video thumbnail generation using `expo-video-thumbnails`
- ✅ TypeScript support with full type definitions
- ✅ Expo compatible
- ✅ Error handling with detailed failure reasons

## Installation

```bash
npm install @hubspire/react-native-chunk-upload
# or
yarn add @hubspire/react-native-chunk-upload
# or
bun add @hubspire/react-native-chunk-upload
```

## Peer Dependencies

This package requires the following peer dependencies:

- `expo-file-system` - For file system operations

```bash
npm install expo-file-system
# or
yarn add expo-file-system
# or
bun add expo-file-system
```

For automatic video thumbnail generation (optional - only needed if you plan to upload videos):

```bash
npm install expo-video-thumbnails
# or
yarn add expo-video-thumbnails
# or
bun add expo-video-thumbnails
```

**Note:** The package will automatically generate thumbnails for videos if `expo-video-thumbnails` is installed. If not installed, video uploads will proceed without thumbnails.

## Usage

The package provides a single unified `uploadFiles` function that automatically selects the best upload method based on file size. Files larger than the threshold use chunked multipart upload, while smaller files use simple upload.

### Basic Example

```typescript
import {
  uploadFiles,
  UnifiedUploadConfig,
  FileUploadConfig,
} from "@hubspire/react-native-chunk-upload";

// Configure your upload
const uploadConfig: UnifiedUploadConfig = {
  // File size threshold in bytes (default: 5MB)
  // Files >= this size will use chunked upload, files < this size will use simple upload
  chunkThresholdBytes: 5 * 1024 * 1024, // 5MB

  // Required: Unified function to get signed URLs for chunked, simple, and thumbnail uploads
  getUploadUrl: async ({
    uploadType,
    mediaType,
    contentType,
    extension,
    totalParts,
  }) => {
    const response = await fetch("/api/upload/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadType, // "chunked", "simple", or "thumbnail"
        mediaType, // Not required for thumbnails
        contentType,
        extension,
        totalParts, // Only used when uploadType is "chunked"
      }),
    });
    if (!response.ok) throw new Error("Failed to get upload URL");
    return response.json();
    // Returns { urls, key, uploadId } for chunked or { url, key } for simple/thumbnail
  },

  // Required: Function to mark chunked upload as complete
  markUploadComplete: async ({ eTags, key, uploadId }) => {
    const response = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eTags, key, uploadId }),
    });
    if (!response.ok) throw new Error("Failed to complete upload");
    return response.json();
  },

  // Optional: Progress callbacks
  onProgress: (fileIndex, progress) => {
    console.log(`File ${fileIndex}: ${progress.percentComplete}%`);
    // progress includes: percentComplete, uploadedBytes, totalBytes, uploadFailed, uploadCompleted
  },
  onTotalProgress: (progress) => {
    console.log(`Overall: ${progress.overallPercentComplete}%`);
  },

  // Optional: Configuration
  chunkSize: 5 * 1024 * 1024, // 5MB chunks (default)
  concurrentFileUploadLimit: 3, // Max 3 files at once (default)
  concurrentChunkUploadLimit: 6, // Max 6 chunks at once (default)
  maxFileSizeMB: 4096, // Max file size in MB (default: 4096MB = 4GB)
};

// Upload a single file (always pass as array)
const files: FileUploadConfig[] = [
  {
    fileIndex: 0,
    filePath: "/path/to/file.jpg",
    fileSize: 1024 * 1024 * 10, // 10MB - will use chunked upload (>= 5MB threshold)
    mediaType: "photo",
    contentType: "image/jpeg",
    extension: "jpg",
  },
];

const results = await uploadFiles(files, uploadConfig);
console.log("Upload result:", results[0]);

// Upload multiple files (mixed sizes)
const multipleFiles: FileUploadConfig[] = [
  {
    fileIndex: 0,
    filePath: "/path/to/small-image.jpg",
    fileSize: 1024 * 1024 * 2, // 2MB - will use simple upload (< 5MB threshold)
    mediaType: "photo",
    contentType: "image/jpeg",
    extension: "jpg",
  },
  {
    fileIndex: 1,
    filePath: "/path/to/large-video.mp4",
    fileSize: 1024 * 1024 * 50, // 50MB - will use chunked upload (>= 5MB threshold)
    mediaType: "video",
    // thumbnailPath is optional - will be auto-generated if expo-video-thumbnails is installed
    contentType: "video/mp4",
    extension: "mp4",
  },
];

const uploadResults = await uploadFiles(multipleFiles, uploadConfig);
console.log("Upload results:", uploadResults);
```

### Automatic Video Thumbnail Generation

The package automatically generates thumbnails for videos if `expo-video-thumbnails` is installed. You don't need to provide `thumbnailPath` - it will be generated automatically:

```typescript
// Thumbnail will be auto-generated if expo-video-thumbnails is installed
const videoFile: FileUploadConfig = {
  fileIndex: 0,
  filePath: videoUri,
  fileSize: videoSize,
  mediaType: "video",
  contentType: "video/mp4",
  extension: "mp4",
  // thumbnailPath is optional - will be auto-generated if expo-video-thumbnails is installed
};

const results = await uploadFiles([videoFile], uploadConfig);
```

**Note:** Thumbnails are automatically generated for videos if `expo-video-thumbnails` is installed. You don't need to manually generate or provide thumbnails - the package handles this internally.

## API Reference

### Functions

#### `uploadFiles(files, config)`

Uploads one or more files, automatically selecting chunked or simple upload based on file size.

**Parameters:**

- `files` (required): Array of `FileUploadConfig` objects. Always pass an array, even for a single file.
- `config` (required): `UnifiedUploadConfig` object with all required callbacks and optional settings.

**Returns:** `Promise<UploadFileResult[]>` - Array of upload results, one per file, in the same order as input.

**Behavior:**

- Files with `fileSize >= chunkThresholdBytes` use chunked multipart upload
- Files with `fileSize < chunkThresholdBytes` use simple upload
- All files are uploaded concurrently up to `concurrentFileUploadLimit`
- Progress callbacks are called for both chunked and simple uploads

### Types

#### `UnifiedUploadConfig`

Configuration object for unified uploads.

- `chunkThresholdBytes` (optional): File size threshold in bytes. Files >= this size use chunked upload, files < this size use simple upload. Default: 5MB (5 _ 1024 _ 1024)
- `getUploadUrl` (required): Unified function to get signed URLs for chunked, simple, and thumbnail uploads. The library calls this with `uploadType: "chunked"`, `uploadType: "simple"`, or `uploadType: "thumbnail"` as needed.
- `markUploadComplete` (required): Function to complete chunked multipart uploads
- `onProgress` (optional): Callback for per-file progress updates
- `onTotalProgress` (optional): Callback for overall progress across all files
- `chunkSize` (optional): Size of each chunk in bytes (default: 5MB)
- `concurrentFileUploadLimit` (optional): Max concurrent file uploads (default: 3)
- `concurrentChunkUploadLimit` (optional): Max concurrent chunk uploads (default: 6)
- `maxFileSizeMB` (optional): Maximum file size in MB (default: 4096)

#### `FileUploadConfig`

Configuration for a single file upload.

- `fileIndex`: Unique index identifier for this file
- `filePath`: Local file path to upload
- `fileSize`: File size in bytes
- `mediaType`: 'photo' or 'video'
- `thumbnailPath` (optional): Path to thumbnail image. If not provided for videos, will be auto-generated if `expo-video-thumbnails` is installed
- `contentType` (optional): MIME content type (e.g., 'image/jpeg', 'video/mp4')
- `extension` (optional): File extension (e.g., 'jpg', 'mp4')

#### `UploadFileResult`

Result of a file upload.

- `fileIndex`: File index that was uploaded
- `mediaType`: 'photo' or 'video'
- `key`: S3 key where the file is stored
- `height` (optional): Image/video height in pixels
- `width` (optional): Image/video width in pixels
- `thumbnailKey` (optional): S3 key of thumbnail (for videos)
- `uploadFailed`: Whether the upload failed
- `reason` (optional): Error message or Error object if upload failed

#### `UploadProgress`

Progress information for a file upload.

- `totalParts`: Total number of chunks (for chunked uploads)
- `uploadedParts`: Number of uploaded chunks (for chunked uploads)
- `percentComplete`: Upload percentage (0-100)
- `uploadedBytes`: Bytes uploaded so far
- `totalBytes`: Total file size
- `uploadFailed`: Whether upload failed
- `uploadCompleted`: Whether upload completed

## Example App

An example React Native app demonstrating the package usage is available in the `example/` directory. The example includes:

- Full React Native Expo app with file selection
- Backend server with AWS S3 integration
- LocalStack support for local development
- Video thumbnail generation
- Progress tracking UI
- Error handling with detailed messages
- Automatic upload method selection

To run the example:

```bash
cd example
bun install  # or npm install
npm start    # or bun start
```

See the [example README](./example/README.md) for detailed setup instructions.

## Backend Requirements

Your backend needs to provide the following endpoints:

**Required:**

- **POST /api/upload/url** - Unified endpoint that handles both chunked and simple uploads. Receives `uploadType` parameter ("chunked" or "simple") and returns appropriate response:
  - For `uploadType: "chunked"`: Returns `{ urls: string[], key: string, uploadId: string }`
  - For `uploadType: "simple"`: Returns `{ url: string, key: string }`
- **POST /api/upload/complete** - Complete multipart upload (required for chunked uploads)

**Optional:**


See the example backend in `example/backend/` for a complete implementation using AWS S3 and LocalStack.

## LocalStack Support

The package works seamlessly with LocalStack for local development and testing. The example backend includes:

- LocalStack S3 setup
- Docker Compose configuration
- Scripts for managing LocalStack
- File viewing and management interface

See `example/backend/README.md` for LocalStack setup instructions.

## License

MIT
