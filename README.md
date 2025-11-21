# react-native-chunk-upload

A generalized React Native package for file uploads with automatic chunking. This package automatically switches between chunked multipart uploads (for large files) and simple uploads (for smaller files) based on file size, supports concurrent uploads, and provides detailed progress callbacks.

## Features

- ✅ **Automatic upload method selection** - Automatically uses chunked upload for large files and simple upload for smaller files
- ✅ Chunked uploads for large files (configurable chunk size, up to 4GB)
- ✅ Simple uploads for smaller files (with progress tracking)
- ✅ Concurrent file and chunk uploads
- ✅ Real-time progress tracking per file and overall progress
- ✅ Support for photos and videos
- ✅ Automatic video thumbnail generation using `expo-video-thumbnails`
- ✅ Thumbnail upload support for videos
- ✅ Always accepts an array of files (even for single file uploads)
- ✅ TypeScript support with full type definitions
- ✅ Expo compatible
- ✅ Error handling with detailed failure reasons
- ✅ LocalStack support for local development and testing

## Installation

```bash
npm install react-native-chunk-upload
# or
yarn add react-native-chunk-upload
# or
bun add react-native-chunk-upload
```

## Peer Dependencies

This package requires the following peer dependencies:

- `expo-file-system` - For file system operations
- `react-native` - React Native runtime

```bash
npm install expo-file-system react-native
# or
yarn add expo-file-system react-native
# or
bun add expo-file-system react-native
```

For video thumbnail generation (optional but recommended for videos):

```bash
npm install expo-video-thumbnails
# or
yarn add expo-video-thumbnails
# or
bun add expo-video-thumbnails
```

## Usage

The package provides a single unified `uploadFiles` function that automatically selects the best upload method based on file size. Files larger than the threshold use chunked multipart upload, while smaller files use simple upload.

### Basic Example

```typescript
import { uploadFiles, UnifiedUploadConfig, FileUploadConfig } from "react-native-chunk-upload";

// Configure your upload
const uploadConfig: UnifiedUploadConfig = {
  // File size threshold in bytes (default: 5MB)
  // Files >= this size will use chunked upload, files < this size will use simple upload
  chunkThresholdBytes: 5 * 1024 * 1024, // 5MB

  // Required: Function to get signed URLs for chunked uploads (files >= threshold)
  getSignedUrls: async ({ mediaType, totalParts, contentType, extension }) => {
    const response = await fetch("/api/upload/chunks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaType,
        totalParts,
        contentType,
        extension,
      }),
    });
    if (!response.ok) throw new Error("Failed to get signed URLs");
    const data = await response.json();
    return {
      urls: data.urls, // Array of signed URLs, one per chunk
      key: data.key,
      uploadId: data.uploadId,
    };
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

  // Required: Function to get signed URL for simple uploads (files < threshold)
  getSimpleUploadUrl: async ({ contentType, extension }) => {
    const response = await fetch("/api/upload/simple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType, extension }),
    });
    if (!response.ok) throw new Error("Failed to get simple upload URL");
    const data = await response.json();
    return { url: data.url, key: data.key };
  },

  // Optional: For video thumbnail uploads
  getThumbnailSignedUrl: async ({ contentType, extension }) => {
    const response = await fetch("/api/upload/thumbnail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType, extension }),
    });
    if (!response.ok) throw new Error("Failed to get thumbnail URL");
    const data = await response.json();
    return { url: data.url, key: data.key };
  },

  // Optional: For getting image dimensions
  getImageSize: async (filePath) => {
    // Use your preferred image size detection library
    // Example with expo-image-manipulator:
    // const manipResult = await ImageManipulator.manipulateAsync(filePath);
    // return { height: manipResult.height, width: manipResult.width };
    return { height: 0, width: 0 };
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
    thumbnailPath: "/path/to/thumbnail.jpg", // Generated using expo-video-thumbnails
    contentType: "video/mp4",
    extension: "mp4",
  },
];

const uploadResults = await uploadFiles(multipleFiles, uploadConfig);
console.log("Upload results:", uploadResults);
```

### Video Thumbnail Generation

The package supports automatic thumbnail generation for videos using `expo-video-thumbnails`:

```typescript
import * as VideoThumbnails from "expo-video-thumbnails";

async function generateVideoThumbnail(videoUri: string): Promise<string> {
  const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
    time: 1000, // Get thumbnail at 1 second
    quality: 0.8,
  });
  return uri;
}

// When selecting a video
const videoFile: FileUploadConfig = {
  fileIndex: 0,
  filePath: videoUri,
  fileSize: videoSize,
  mediaType: "video",
  contentType: "video/mp4",
  extension: "mp4",
  thumbnailPath: await generateVideoThumbnail(videoUri), // Generate thumbnail
};
```

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

- `chunkThresholdBytes` (optional): File size threshold in bytes. Files >= this size use chunked upload, files < this size use simple upload. Default: 5MB (5 * 1024 * 1024)
- `getSignedUrls` (required): Function to get signed URLs for chunked uploads
- `markUploadComplete` (required): Function to complete chunked multipart uploads
- `getSimpleUploadUrl` (required): Function to get signed URL for simple uploads
- `getThumbnailSignedUrl` (optional): Function to get signed URL for video thumbnails
- `getImageSize` (optional): Function to get image/video dimensions
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
- `thumbnailPath` (optional): Path to thumbnail image (required for videos)
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

## Example: Integration with GraphQL

```typescript
import { ApolloClient } from "@apollo/client";
import { uploadFiles, UnifiedUploadConfig } from "react-native-chunk-upload";
import { GET_UPLOAD_CHUNK, MARK_UPLOAD_COMPLETE, GET_SIMPLE_UPLOAD } from "./graphql";

const client = new ApolloClient({
  /* ... */
});

const uploadConfig: UnifiedUploadConfig = {
  chunkThresholdBytes: 5 * 1024 * 1024, // 5MB

  getSignedUrls: async ({ mediaType, totalParts, contentType, extension }) => {
    const query =
      mediaType === "photo" ? GET_IMAGE_UPLOAD_CHUNK : GET_VIDEO_UPLOAD_CHUNK;

    const res = await client.query({
      query,
      variables: {
        payload: { contentType, extension, parts: totalParts },
      },
    });

    const dataKey =
      mediaType === "photo" ? "getImageUploadChunk" : "getVideoUploadChunk";

    return {
      urls: res.data[dataKey].urls,
      key: res.data[dataKey].key,
      uploadId: res.data[dataKey].uploadId,
    };
  },

  markUploadComplete: async ({ eTags, key, uploadId }) => {
    const res = await client.mutate({
      mutation: MARK_UPLOAD_COMPLETE,
      variables: { eTags, key, uploadId },
    });
    return res.data;
  },

  getSimpleUploadUrl: async ({ contentType, extension }) => {
    const res = await client.query({
      query: GET_SIMPLE_UPLOAD,
      variables: { contentType, extension },
    });
    return {
      url: res.data.getSimpleUpload.url,
      key: res.data.getSimpleUpload.key,
    };
  },

  onProgress: (fileIndex, progress) => {
    // Update your state/store
    updateFileProgress(fileIndex, progress);
  },
};

const files = [/* ... */];
const results = await uploadFiles(files, uploadConfig);
```

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

1. **POST /api/upload/chunks** - Get signed URLs for multipart upload chunks (for files >= threshold)
2. **POST /api/upload/complete** - Complete multipart upload (for chunked uploads)
3. **POST /api/upload/simple** - Get signed URL for simple upload (for files < threshold)
4. **POST /api/upload/thumbnail** - Get signed URL for thumbnail upload (optional, for videos)

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
