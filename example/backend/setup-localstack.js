const {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
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
  forcePathStyle: USE_LOCALSTACK, // Required for LocalStack
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "test-bucket";

async function checkLocalStackHealth() {
  try {
    const http = require("http");
    return new Promise((resolve) => {
      const req = http.get(`${ENDPOINT}/_localstack/health`, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve(res.statusCode === 200);
        });
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

async function setupLocalStack() {
  try {
    if (!USE_LOCALSTACK) {
      console.error("❌ USE_LOCALSTACK is not set to 'true'");
      console.error("   Please set USE_LOCALSTACK=true in your .env file");
      process.exit(1);
    }

    console.log("Checking LocalStack connection...");
    const isHealthy = await checkLocalStackHealth();
    if (!isHealthy) {
      console.error("❌ Cannot connect to LocalStack");
      console.error(`   Endpoint: ${ENDPOINT}`);
      console.error("\n💡 Please start LocalStack first:");
      console.error("   npm run localstack:up");
      console.error("\n   Or check if LocalStack is running:");
      console.error("   docker ps | grep localstack");
      process.exit(1);
    }

    console.log("✅ LocalStack is running");
    console.log("\nSetting up LocalStack S3 bucket...");
    console.log(`   Endpoint: ${ENDPOINT}`);
    console.log(`   Bucket: ${BUCKET_NAME}`);

    // Create bucket
    try {
      await s3Client.send(
        new CreateBucketCommand({
          Bucket: BUCKET_NAME,
        })
      );
      console.log(`✅ Bucket "${BUCKET_NAME}" created successfully`);
    } catch (error) {
      if (error.name === "BucketAlreadyOwnedByYou") {
        console.log(`ℹ️  Bucket "${BUCKET_NAME}" already exists`);
      } else {
        throw error;
      }
    }

    // Configure CORS
    try {
      await s3Client.send(
        new PutBucketCorsCommand({
          Bucket: BUCKET_NAME,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ["*"],
                AllowedMethods: ["GET", "PUT", "POST", "HEAD", "DELETE"],
                AllowedOrigins: ["*"],
                ExposeHeaders: ["ETag", "x-amz-request-id"],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        })
      );
      console.log(`✅ CORS configured for bucket "${BUCKET_NAME}"`);
    } catch (error) {
      console.warn(`⚠️  Could not configure CORS: ${error.message}`);
    }

    console.log("\n✅ LocalStack setup complete!");
    console.log(`📦 Bucket: ${BUCKET_NAME}`);
    console.log(`🌐 Endpoint: ${ENDPOINT || "AWS (production)"}`);
  } catch (error) {
    console.error("❌ Setup failed:");
    console.error("   Error:", error.message || error.toString());
    if (error.stack) {
      console.error("   Stack:", error.stack);
    }
    if (!USE_LOCALSTACK) {
      console.error(
        "\n💡 Tip: Make sure USE_LOCALSTACK=true in your .env file"
      );
    } else {
      console.error("\n💡 Tip: Make sure LocalStack is running:");
      console.error("   npm run localstack:up");
    }
    process.exit(1);
  }
}

setupLocalStack();
