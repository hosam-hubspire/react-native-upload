const express = require("express");
const cors = require("cors");
const {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  UploadPartCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // Serve static files for web interface

// Initialize S3 client
const USE_LOCALSTACK = process.env.USE_LOCALSTACK === "true";
const ENDPOINT = USE_LOCALSTACK
  ? process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566"
  : undefined;

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId:
      process.env.AWS_ACCESS_KEY_ID || (USE_LOCALSTACK ? "test" : undefined),
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY ||
      (USE_LOCALSTACK ? "test" : undefined),
  },
  forcePathStyle: USE_LOCALSTACK, // Required for LocalStack
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "your-bucket-name";

/**
 * POST /api/upload/url
 * Unified endpoint to get signed URLs for chunked, simple, and thumbnail uploads
 *
 * Request body:
 * {
 *   "uploadType": "chunked" | "simple" | "thumbnail",
 *   "mediaType": "photo" | "video" (not used for thumbnails),
 *   "contentType": "image/jpeg" | "video/mp4",
 *   "extension": "jpg" | "mp4",
 *   "totalParts": number (only for chunked uploads)
 * }
 *
 * Response for chunked:
 * {
 *   "urls": string[],
 *   "key": string,
 *   "uploadId": string
 * }
 *
 * Response for simple or thumbnail:
 * {
 *   "url": string,
 *   "key": string
 * }
 */
app.post("/api/upload/url", async (req, res) => {
  try {
    const { uploadType, mediaType, contentType, extension, totalParts } =
      req.body;

    if (!uploadType || !contentType || !extension) {
      return res.status(400).json({
        error: "Missing required fields: uploadType, contentType, extension",
      });
    }

    // For thumbnails, we don't need mediaType
    if (uploadType !== "thumbnail" && !mediaType) {
      return res.status(400).json({
        error:
          "Missing required field: mediaType (not required for thumbnails)",
      });
    }

    if (uploadType === "chunked") {
      // Handle chunked upload
      if (!totalParts) {
        return res.status(400).json({
          error: "totalParts is required for chunked uploads",
        });
      }

      // Generate a unique key for the file
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const key = `uploads/${mediaType}/${timestamp}-${randomId}.${extension}`;

      // Create multipart upload
      const createMultipartUploadCommand = new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        Metadata: {
          mediaType: mediaType,
          uploadedAt: new Date().toISOString(),
        },
      });

      const { UploadId } = await s3Client.send(createMultipartUploadCommand);

      // Generate signed URLs for each part
      const urls = [];
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const uploadPartCommand = new UploadPartCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          UploadId: UploadId,
          PartNumber: partNumber,
        });

        const signedUrl = await getSignedUrl(s3Client, uploadPartCommand, {
          expiresIn: 3600, // URL expires in 1 hour
        });

        urls.push(signedUrl);
      }

      res.json({
        urls,
        key,
        uploadId: UploadId,
      });
    } else if (uploadType === "thumbnail") {
      // Handle thumbnail upload
      // Generate a unique key for the thumbnail
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const key = `thumbnails/${timestamp}-${randomId}.${extension}`;

      const { PutObjectCommand } = require("@aws-sdk/client-s3");
      const putObjectCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(s3Client, putObjectCommand, {
        expiresIn: 3600, // URL expires in 1 hour
      });

      res.json({
        url: signedUrl,
        key: key,
      });
    } else {
      // Handle simple upload
      // Generate a unique key for the file
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const key = `uploads/${mediaType}/${timestamp}-${randomId}.${extension}`;

      const { PutObjectCommand } = require("@aws-sdk/client-s3");
      const putObjectCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(s3Client, putObjectCommand, {
        expiresIn: 3600, // URL expires in 1 hour
      });

      res.json({
        url: signedUrl,
        key: key,
      });
    }
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({
      error: "Failed to generate upload URL",
      message: error.message,
    });
  }
});

/**
 * POST /api/upload/complete
 * Complete a multipart upload
 *
 * Request body:
 * {
 *   "eTags": [{ "ETag": string, "PartNumber": number }],
 *   "key": string,
 *   "uploadId": string
 * }
 *
 * Response:
 * {
 *   "success": boolean,
 *   "location": string,
 *   "key": string
 * }
 */
app.post("/api/upload/complete", async (req, res) => {
  try {
    const { eTags, key, uploadId } = req.body;

    if (!eTags || !key || !uploadId) {
      return res.status(400).json({
        error: "Missing required fields: eTags, key, uploadId",
      });
    }

    // Sort eTags by PartNumber
    const sortedETags = eTags
      .map((etag) => ({
        ETag: etag.ETag,
        PartNumber: etag.PartNumber,
      }))
      .sort((a, b) => a.PartNumber - b.PartNumber);

    // Complete multipart upload
    const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedETags,
      },
    });

    const result = await s3Client.send(completeMultipartUploadCommand);

    res.json({
      success: true,
      location: result.Location,
      key: result.Key,
      etag: result.ETag,
    });
  } catch (error) {
    console.error("Error completing multipart upload:", error);
    res.status(500).json({
      error: "Failed to complete multipart upload",
      message: error.message,
    });
  }
});

/**
 * GET /api/files
 * List all uploaded files in the bucket
 *
 * Response:
 * {
 *   "files": [
 *     {
 *       "key": "uploads/photo/1234567890-abc123.jpg",
 *       "size": 1024,
 *       "lastModified": "2024-01-01T00:00:00.000Z"
 *     }
 *   ]
 * }
 */
app.get("/api/files", async (req, res) => {
  try {
    const { ListObjectsV2Command } = require("@aws-sdk/client-s3");
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
    });

    const response = await s3Client.send(command);

    const files = (response.Contents || []).map((item) => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      etag: item.ETag,
    }));

    res.json({ files });
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({
      error: "Failed to list files",
      message: error.message,
    });
  }
});

/**
 * GET /api/files/:key
 * Get a signed URL to download a specific file
 *
 * Response:
 * {
 *   "url": "https://s3.amazonaws.com/...",
 *   "key": "uploads/photo/1234567890-abc123.jpg"
 * }
 */
app.get("/api/files/:key(*)", async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // URL expires in 1 hour
    });

    res.json({
      url,
      key,
    });
  } catch (error) {
    console.error("Error generating download URL:", error);
    res.status(500).json({
      error: "Failed to generate download URL",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/files
 * Delete all files from LocalStack S3 bucket
 *
 * Response:
 * {
 *   "message": string,
 *   "deleted": number,
 *   "failed": number
 * }
 */
app.delete("/api/files", async (req, res) => {
  try {
    // Safety check: only allow deletion when using LocalStack
    if (!USE_LOCALSTACK) {
      return res.status(403).json({
        error: "This endpoint is only available for LocalStack",
        message:
          "For safety, file deletion is only allowed in local development",
      });
    }

    console.log("🗑️  Clearing all files from LocalStack S3...");

    // Get all files (handles pagination)
    const allFiles = [];
    let continuationToken = undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: continuationToken,
      });
      const listResponse = await s3Client.send(listCommand);

      if (listResponse.Contents) {
        allFiles.push(...listResponse.Contents);
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    if (allFiles.length === 0) {
      return res.json({
        message: "No files found in bucket",
        deleted: 0,
        failed: 0,
      });
    }

    // Delete each file
    let deletedCount = 0;
    let failedCount = 0;

    for (const file of allFiles) {
      const key = file.Key;
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        await s3Client.send(deleteCommand);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete ${key}:`, error.message);
        failedCount++;
      }
    }

    console.log(
      `✅ Deletion complete! Deleted: ${deletedCount}, Failed: ${failedCount}`
    );

    res.json({
      message: "Files cleared successfully",
      deleted: deletedCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error("Error clearing files:", error);
    res.status(500).json({
      error: "Failed to clear files",
      message: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    `S3 Backend: ${USE_LOCALSTACK ? "LocalStack (local)" : "AWS (production)"}`
  );
  if (USE_LOCALSTACK) {
    console.log(`LocalStack Endpoint: ${ENDPOINT}`);
  }
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`\nAPI endpoints:`);
  console.log(
    `  POST http://localhost:${PORT}/api/upload/url - Unified endpoint for chunked and simple uploads`
  );
  console.log(
    `  POST http://localhost:${PORT}/api/upload/complete - Complete multipart upload`
  );
  console.log(
    `  GET  http://localhost:${PORT}/api/files - List all uploaded files`
  );
  console.log(
    `  GET  http://localhost:${PORT}/api/files/:key - Get download URL for a file`
  );
  console.log(
    `  DELETE  http://localhost:${PORT}/api/files - Clear all uploaded files (LocalStack only)`
  );
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error(`   Please either:`);
    console.error(`   1. Stop the process using port ${PORT}`);
    console.error(`   2. Set a different port: PORT=3001 npm run dev`);
    console.error(`   3. Kill the process: lsof -ti:${PORT} | xargs kill\n`);
    process.exit(1);
  } else {
    console.error("Server error:", error);
    process.exit(1);
  }
});
