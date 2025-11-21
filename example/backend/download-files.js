const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
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
const DOWNLOAD_DIR = path.join(__dirname, "downloaded-files");

async function downloadAllFiles() {
  try {
    // Create download directory
    if (!fs.existsSync(DOWNLOAD_DIR)) {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }

    console.log("📥 Downloading files from LocalStack S3...\n");

    // List all files
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
    });
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];

    if (files.length === 0) {
      console.log("No files found in bucket.");
      return;
    }

    console.log(`Found ${files.length} file(s)\n`);

    // Download each file
    for (const file of files) {
      const key = file.Key;
      const fileName = path.basename(key);
      const filePath = path.join(DOWNLOAD_DIR, fileName);

      try {
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        const response = await s3Client.send(getCommand);
        const chunks = [];
        
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(filePath, buffer);

        const fileSize = file.Size || buffer.length;
        console.log(`✅ Downloaded: ${fileName} (${formatBytes(fileSize)})`);
      } catch (error) {
        console.error(`❌ Failed to download ${key}: ${error.message}`);
      }
    }

    console.log(`\n✅ All files downloaded to: ${DOWNLOAD_DIR}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

downloadAllFiles();

