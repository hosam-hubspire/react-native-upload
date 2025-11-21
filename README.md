# react-native-chunk-upload

A generalized React Native package for chunked file uploads with progress tracking. This package handles multipart uploads for large files, supports concurrent uploads, and provides detailed progress callbacks.

## Features

- ✅ Chunked uploads for large files (configurable chunk size, up to 4GB)
- ✅ Concurrent file and chunk uploads
- ✅ Real-time progress tracking per file and overall progress
- ✅ Support for photos and videos
- ✅ Automatic video thumbnail generation using `expo-video-thumbnails`
- ✅ Thumbnail upload support for videos
- ✅ Simple single-file upload option (with progress tracking)
- ✅ Multiple file uploads (both chunked and simple)
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

### Chunked Upload (Recommended for Large Files)

For large files that need to be uploaded in chunks:

```typescript
import {
  uploadFile,
  uploadMultipleFiles,
  UploadConfig,
  FileUploadConfig,
} from "react-native-chunk-upload";

// Configure your upload
const uploadConfig: UploadConfig = {
  // Required: Function to get signed URLs for chunks
  getSignedUrls: async ({ mediaType, totalParts, contentType, extension }) => {
    // Call your backend API to get signed URLs
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

  // Required: Function to mark upload as complete
  markUploadComplete: async ({ eTags, key, uploadId }) => {
    // Call your backend API to complete the multipart upload
    const response = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eTags, key, uploadId }),
    });
    if (!response.ok) throw new Error("Failed to complete upload");
    return response.json();
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

// Upload a single file
const fileConfig: FileUploadConfig = {
  fileIndex: 0,
  filePath: "/path/to/file.jpg",
  fileSize: 1024 * 1024 * 10, // 10MB
  mediaType: "photo",
  contentType: "image/jpg",
  extension: "jpg",
};

const result = await uploadFile(fileConfig, uploadConfig);
console.log("Upload result:", result);

// Upload multiple files
const files: FileUploadConfig[] = [
  {
    fileIndex: 0,
    filePath: "/path/to/image1.jpg",
    fileSize: 1024 * 1024 * 5,
    mediaType: "photo",
    contentType: "image/jpg",
    extension: "jpg",
  },
  {
    fileIndex: 1,
    filePath: "/path/to/video.mp4",
    fileSize: 1024 * 1024 * 50,
    mediaType: "video",
    thumbnailPath: "/path/to/thumbnail.jpg", // Generated using expo-video-thumbnails
    contentType: "video/mp4",
    extension: "mp4",
  },
];

const results = await uploadMultipleFiles(files, uploadConfig);
console.log("Upload results:", results);
```

### Simple Upload (For Small Files)

For smaller files that don't need chunking:

```typescript
import {
  uploadSimpleFile,
  uploadMultipleSimpleFiles,
  SimpleUploadConfig,
} from "react-native-chunk-upload";

// Upload a single file
const result = await uploadSimpleFile({
  signedUrl: "https://s3.amazonaws.com/bucket/file.jpg?signature=...",
  filePath: "/path/to/file.jpg",
  onProgress: (percentage) => {
    console.log(`Progress: ${percentage}%`);
  },
});

// Upload multiple files
const uploadConfigs: SimpleUploadConfig[] = [
  {
    signedUrl: "https://s3.amazonaws.com/bucket/file1.jpg?signature=...",
    filePath: "/path/to/file1.jpg",
    onProgress: (percentage) => console.log(`File 1: ${percentage}%`),
  },
  {
    signedUrl: "https://s3.amazonaws.com/bucket/file2.jpg?signature=...",
    filePath: "/path/to/file2.jpg",
    onProgress: (percentage) => console.log(`File 2: ${percentage}%`),
  },
];

const results = await uploadMultipleSimpleFiles(uploadConfigs, 3); // Optional: concurrency limit
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

### Types

#### `UploadConfig`

Configuration object for chunked uploads.

- `getSignedUrls` (required): Function that returns signed URLs for chunks
- `markUploadComplete` (required): Function to complete the multipart upload
- `getThumbnailSignedUrl` (optional): Function to get signed URL for video thumbnails
- `getImageSize` (optional): Function to get image dimensions
- `onProgress` (optional): Callback for per-file progress updates
- `onTotalProgress` (optional): Callback for overall progress updates
- `chunkSize` (optional): Size of each chunk in bytes (default: 5MB)
- `concurrentFileUploadLimit` (optional): Max concurrent file uploads (default: 3)
- `concurrentChunkUploadLimit` (optional): Max concurrent chunk uploads (default: 6)
- `maxFileSizeMB` (optional): Maximum file size in MB (default: 4096)

#### `FileUploadConfig`

Configuration for a single file upload.

- `fileIndex`: Unique index for the file
- `filePath`: Path to the file
- `fileSize`: Size of the file in bytes
- `mediaType`: 'photo' or 'video'
- `thumbnailPath` (optional): Path to thumbnail (required for videos)
- `contentType` (optional): MIME type
- `extension` (optional): File extension

#### `UploadProgress`

Progress information for a file upload.

- `totalParts`: Total number of chunks
- `uploadedParts`: Number of uploaded chunks
- `percentComplete`: Upload percentage (0-100)
- `uploadedBytes`: Bytes uploaded so far
- `totalBytes`: Total file size
- `uploadFailed`: Whether upload failed
- `uploadCompleted`: Whether upload completed
- `reason` (optional): Failure reason if upload failed

#### `UploadFileResult`

Result of a file upload.

- `fileIndex`: File index
- `mediaType`: 'photo' or 'video'
- `key`: S3 key of uploaded file
- `thumbnailKey` (optional): S3 key of thumbnail (for videos)
- `height` (optional): Image/video height
- `width` (optional): Image/video width
- `uploadFailed` (optional): Whether upload failed
- `reason` (optional): Failure reason if upload failed

### Functions

#### `uploadFile(fileConfig, uploadConfig)`

Upload a single file using chunked upload.

Returns: `Promise<UploadFileResult>`

#### `uploadMultipleFiles(files, uploadConfig)`

Upload multiple files concurrently using chunked upload.

Returns: `Promise<UploadFileResult[]>`

#### `uploadSimpleFile(uploadConfig)`

Upload a single file without chunking. Supports progress tracking via XMLHttpRequest.

Returns: `Promise<{ status: number; headers: Record<string, string>; body: string }>`

#### `uploadMultipleSimpleFiles(files, concurrency?)`

Upload multiple files concurrently without chunking.

- `files`: Array of `SimpleUploadConfig` objects
- `concurrency` (optional): Maximum concurrent uploads (default: 6)

Returns: `Promise<Array<{ status: number; headers: Record<string, string>; body: string }>>`

## Example: Integration with GraphQL

```typescript
import { ApolloClient } from "@apollo/client";
import { uploadMultipleFiles, UploadConfig } from "react-native-chunk-upload";
import { GET_UPLOAD_CHUNK, MARK_UPLOAD_COMPLETE } from "./graphql";

const client = new ApolloClient({
  /* ... */
});

const uploadConfig: UploadConfig = {
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

  onProgress: (fileIndex, progress) => {
    // Update your state/store
    updateFileProgress(fileIndex, progress);
  },
};
```

## Example App

An example React Native app demonstrating the package usage is available in the `example/` directory. The example includes:

- Full React Native Expo app with file selection
- Backend server with AWS S3 integration
- LocalStack support for local development
- Video thumbnail generation
- Progress tracking UI
- Error handling with detailed messages
- Multiple upload methods (chunked and simple)

To run the example:

```bash
cd example
bun install  # or npm install
npm start    # or bun start
```

See the [example README](./example/README.md) for detailed setup instructions.

## Backend Requirements

Your backend needs to provide the following endpoints:

1. **POST /api/upload/chunks** - Get signed URLs for multipart upload chunks
2. **POST /api/upload/complete** - Complete multipart upload
3. **POST /api/upload/thumbnail** - Get signed URL for thumbnail upload (optional, for videos)
4. **POST /api/upload/simple** - Get signed URL for simple upload (optional)

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
