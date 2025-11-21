const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
require("dotenv").config();

const USE_LOCALSTACK = process.env.USE_LOCALSTACK === "true";
const ENDPOINT = USE_LOCALSTACK
  ? process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566"
  : undefined;

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  },
  forcePathStyle: USE_LOCALSTACK,
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "test-bucket";

async function getAllFiles() {
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

  return allFiles;
}

async function clearAllFiles() {
  try {
    if (!USE_LOCALSTACK) {
      console.error("❌ This script is designed for LocalStack only");
      console.error("   For safety, it only works when USE_LOCALSTACK=true");
      process.exit(1);
    }

    console.log("🗑️  Clearing all files from LocalStack S3...\n");
    console.log(`   Bucket: ${BUCKET_NAME}`);
    console.log(`   Endpoint: ${ENDPOINT}\n`);

    // Get all files (handles pagination)
    const files = await getAllFiles();

    if (files.length === 0) {
      console.log("✅ No files found in bucket. Nothing to delete.");
      return;
    }

    console.log(`Found ${files.length} file(s) to delete\n`);

    // Delete each file
    let deletedCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const key = file.Key;
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        await s3Client.send(deleteCommand);
        deletedCount++;
        // Only log every 10th file to avoid spam
        if (deletedCount % 10 === 0 || deletedCount === files.length) {
          console.log(`✅ Deleted ${deletedCount}/${files.length} files...`);
        }
      } catch (error) {
        console.error(`❌ Failed to delete ${key}: ${error.message}`);
        failedCount++;
      }
    }

    console.log(`\n✅ Deletion complete!`);
    console.log(`   Deleted: ${deletedCount} file(s)`);
    if (failedCount > 0) {
      console.log(`   Failed: ${failedCount} file(s)`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

clearAllFiles();

