# Backend API for Chunked Upload Example

This is a Node.js/Express backend that provides AWS S3 multipart upload APIs for the React Native `react-native-chunk-upload` example app. It supports both AWS S3 (production) and LocalStack (local development).

## Features

- ✅ AWS S3 multipart upload support
- ✅ Signed URL generation for secure uploads
- ✅ Thumbnail upload support
- ✅ Simple (non-chunked) upload support
- ✅ LocalStack integration for local development
- ✅ Web interface to view uploaded files
- ✅ File management (list, download, clear)
- ✅ CORS enabled for React Native apps

## Setup

### Option 1: Using LocalStack (Recommended for Testing)

LocalStack provides a local AWS S3 emulator, perfect for testing without real AWS credentials.

1. **Install dependencies:**

```bash
bun install
# or
npm install
```

2. **Start LocalStack:**

```bash
npm run localstack:up
```

This starts a Docker container with LocalStack running on port 4566.

3. **Configure environment:**

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` for LocalStack:

```env
USE_LOCALSTACK=true
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_BUCKET_NAME=test-bucket
PORT=3000
```

4. **Setup LocalStack bucket:**

```bash
npm run localstack:setup
```

This creates the S3 bucket and configures CORS automatically.

5. **Start the server:**

```bash
npm start
# or for development with auto-reload
npm run dev
```

**Useful LocalStack commands:**
- `npm run localstack:up` - Start LocalStack
- `npm run localstack:down` - Stop LocalStack
- `npm run localstack:setup` - Create bucket and configure CORS
- `npm run localstack:logs` - View LocalStack logs
- `npm run localstack:download` - Download all files from LocalStack
- `npm run localstack:clear` - Clear all files from LocalStack (with confirmation)

### Option 2: Using Real AWS S3

1. **Install dependencies:**

```bash
bun install
# or
npm install
```

2. **Configure AWS credentials:**

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your AWS credentials:

```env
USE_LOCALSTACK=false
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=your-bucket-name
PORT=3000
```

3. **Make sure your S3 bucket exists and has the correct CORS configuration:**

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

4. **Start the server:**

```bash
npm start
# or for development with auto-reload
npm run dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### POST /api/upload/url

Unified endpoint to get signed URLs for both chunked and simple uploads.

**Request:**
```json
{
  "uploadType": "chunked" | "simple",
  "mediaType": "photo" | "video",
  "contentType": "image/jpeg" | "video/mp4",
  "extension": "jpg" | "mp4",
  "totalParts": 5  // Only required when uploadType is "chunked"
}
```

**Response for chunked uploads:**
```json
{
  "urls": ["https://s3.amazonaws.com/...", ...],
  "key": "uploads/photo/1234567890-abc123.jpg",
  "uploadId": "upload-id-123"
}
```

**Response for simple uploads:**
```json
{
  "url": "https://s3.amazonaws.com/...",
  "key": "uploads/photo/1234567890-abc123.jpg"
}
```

### POST /api/upload/complete

Complete a multipart upload (required for chunked uploads).

**Request:**
```json
{
  "eTags": [
    { "ETag": "\"etag1\"", "PartNumber": 1 },
    { "ETag": "\"etag2\"", "PartNumber": 2 }
  ],
  "key": "uploads/photo/1234567890-abc123.jpg",
  "uploadId": "upload-id-123"
}
```

**Response:**
```json
{
  "success": true,
  "location": "https://s3.amazonaws.com/bucket/key",
  "key": "uploads/photo/1234567890-abc123.jpg",
  "etag": "\"final-etag\""
}
```

### POST /api/upload/thumbnail

Get signed URL for thumbnail upload (optional, for videos).

**Request:**
```json
{
  "contentType": "image/jpeg",
  "extension": "jpg"
}
```

**Response:**
```json
{
  "url": "https://s3.amazonaws.com/...",
  "key": "thumbnails/1234567890-abc123.jpg"
}
```

### GET /api/files

List all uploaded files in the bucket.

**Response:**
```json
{
  "files": [
    {
      "key": "uploads/photo/1234567890-abc123.jpg",
      "size": 1024000,
      "lastModified": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /api/files/:key

Get a signed download URL for a specific file.

**Response:**
```json
{
  "url": "https://s3.amazonaws.com/...",
  "key": "uploads/photo/1234567890-abc123.jpg"
}
```

### DELETE /api/files

Delete all files from the bucket. **Only available when using LocalStack** (safety feature).

**Response:**
```json
{
  "message": "Files cleared successfully",
  "deleted": 10,
  "failed": 0
}
```

## Web Interface

When the server is running, you can access a web interface at `http://localhost:3000` to:

- View all uploaded files
- See file thumbnails (for images)
- Download files
- Filter thumbnails
- View file statistics

## AWS IAM Permissions

Your AWS IAM user/role needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:CreateMultipartUpload",
        "s3:CompleteMultipartUpload",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
        "s3:PutBucketCors"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

## Security Considerations

⚠️ **Important:** This is an example backend. For production:

1. Add authentication/authorization (JWT, API keys, etc.)
2. Validate and sanitize all inputs
3. Implement rate limiting
4. Add request logging and monitoring
5. Use environment-specific configurations
6. Consider using AWS IAM roles instead of access keys
7. Implement proper error handling and logging
8. Add request size limits
9. Restrict DELETE endpoint to authenticated admin users only

## Testing

You can test the API using curl:

```bash
# Get signed URL for chunked upload
curl -X POST http://localhost:3000/api/upload/url \
  -H "Content-Type: application/json" \
  -d '{
    "uploadType": "chunked",
    "mediaType": "photo",
    "totalParts": 3,
    "contentType": "image/jpeg",
    "extension": "jpg"
  }'

# Get signed URL for simple upload
curl -X POST http://localhost:3000/api/upload/url \
  -H "Content-Type: application/json" \
  -d '{
    "uploadType": "simple",
    "mediaType": "photo",
    "contentType": "image/jpeg",
    "extension": "jpg"
  }'

# List all files
curl http://localhost:3000/api/files

# Get download URL for a file
curl http://localhost:3000/api/files/uploads%2Fphoto%2F1234567890-abc123.jpg

# Clear all files (LocalStack only)
curl -X DELETE http://localhost:3000/api/files
```

## License

MIT
