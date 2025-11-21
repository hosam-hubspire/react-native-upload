# react-native-chunked-upload

A generalized React Native package for chunked file uploads with progress tracking. This package handles multipart uploads for large files, supports concurrent uploads, and provides detailed progress callbacks.

## Features

- ✅ Chunked uploads for large files (configurable chunk size)
- ✅ Concurrent file and chunk uploads
- ✅ Progress tracking per file and overall progress
- ✅ Support for photos and videos
- ✅ Thumbnail upload support for videos
- ✅ Simple single-file upload option
- ✅ TypeScript support
- ✅ Expo compatible

## Installation

```bash
npm install react-native-chunked-upload
# or
yarn add react-native-chunked-upload
# or
bun add react-native-chunked-upload
```

## Peer Dependencies

This package requires the following peer dependency:

- `expo-file-system` - For file system operations

```bash
npm install expo-file-system
# or
yarn add expo-file-system
# or
bun add expo-file-system
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
} from "react-native-chunked-upload";

// Configure your upload
const uploadConfig: UploadConfig = {
  // Required: Function to get signed URLs for chunks
  getSignedUrls: async ({ mediaType, totalParts, contentType, extension }) => {
    // Call your backend API to get signed URLs
    const response = await fetch("/api/get-signed-urls", {
      method: "POST",
      body: JSON.stringify({
        mediaType,
        totalParts,
        contentType,
        extension,
      }),
    });
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
    const response = await fetch("/api/complete-upload", {
      method: "POST",
      body: JSON.stringify({ eTags, key, uploadId }),
    });
    return response.json();
  },

  // Optional: For video thumbnail uploads
  getThumbnailSignedUrl: async ({ contentType, extension }) => {
    const response = await fetch("/api/get-thumbnail-url", {
      method: "POST",
      body: JSON.stringify({ contentType, extension }),
    });
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
  },
  onTotalProgress: (progress) => {
    console.log(`Overall: ${progress.overallPercentComplete}%`);
  },

  // Optional: Configuration
  chunkSize: 5 * 1024 * 1024, // 5MB chunks (default)
  concurrentFileUploadLimit: 3, // Max 3 files at once (default)
  concurrentChunkUploadLimit: 6, // Max 6 chunks at once (default)
  maxFileSizeMB: 100, // Max file size (default)
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
    thumbnailPath: "/path/to/thumbnail.jpg",
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
} from "react-native-chunked-upload";

// Upload a single file
const result = await uploadSimpleFile({
  signedUrl: "https://s3.amazonaws.com/bucket/file.jpg?signature=...",
  filePath: "/path/to/file.jpg",
  onProgress: (percentage) => {
    console.log(`Progress: ${percentage}%`);
  },
});

// Upload multiple files
const results = await uploadMultipleSimpleFiles(
  [
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
  ],
  3 // Optional: concurrency limit (default: 6)
);
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
- `maxFileSizeMB` (optional): Maximum file size in MB (default: 100)

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
- `percentComplete`: Upload percentage
- `uploadedBytes`: Bytes uploaded so far
- `totalBytes`: Total file size
- `uploadFailed`: Whether upload failed
- `uploadCompleted`: Whether upload completed

### Functions

#### `uploadFile(fileConfig, uploadConfig)`

Upload a single file using chunked upload.

Returns: `Promise<UploadFileResult>`

#### `uploadMultipleFiles(files, uploadConfig)`

Upload multiple files concurrently using chunked upload.

Returns: `Promise<UploadFileResult[]>`

#### `uploadSimpleFile(uploadConfig)`

Upload a single file without chunking.

Returns: `Promise<FileSystemUploadResult>`

#### `uploadMultipleSimpleFiles(files, concurrency?)`

Upload multiple files concurrently without chunking.

Returns: `Promise<FileSystemUploadResult[]>`

## Example: Integration with GraphQL

```typescript
import { ApolloClient } from "@apollo/client";
import { uploadMultipleFiles, UploadConfig } from "react-native-chunked-upload";
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

An example React Native app demonstrating the package usage is available in the `example/` directory. To run it:

```bash
cd example
npm install  # or bun install
npm start    # or bun start
```

The example app shows:
- Image and video selection
- Chunked upload with progress tracking
- Simple upload for smaller files
- Multiple file uploads
- Error handling

See the [example README](./example/README.md) for more details.

## License

MIT
