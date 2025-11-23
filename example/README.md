# Chunked Upload Example

This is an example React Native app demonstrating the `react-native-upload` package with an AWS S3 backend server and LocalStack support for local development.

## Structure

```
example/
├── app/              # React Native Expo app source files
├── assets/           # App assets (images, etc.)
├── backend/          # Node.js/Express backend with AWS S3 and LocalStack
├── package.json      # App dependencies and scripts
└── README.md         # This file
```

## Features

- ✅ Image and video selection from library or camera
- ✅ Automatic video thumbnail generation on selection for preview using `expo-video-thumbnails`
- ✅ **Automatic upload method selection** - Automatically uses chunked upload for large files and simple upload for smaller files
- ✅ Chunked upload for large files (>= 5MB threshold) with progress tracking
- ✅ Simple upload for smaller files (< 5MB threshold) with progress tracking
- ✅ Multiple file uploads (concurrent)
- ✅ Real-time progress tracking (per file and overall)
- ✅ Error handling with detailed failure reasons
- ✅ LocalStack integration for local testing
- ✅ Web interface to view uploaded files
- ✅ Clear all files functionality

## Quick Start

### 1. Install Dependencies

From the example directory:

```bash
bun install
# or
npm install
```

Note: This project uses Bun by default, but npm works too. An `.npmrc` file is included for npm compatibility.

Then install backend dependencies:

```bash
cd backend
bun install
# or
npm install
cd ..
```

### 2. Build the Package

Make sure the parent package is built:

```bash
# From the example directory
npm run build:package

# Or from the root directory
cd ..
bun run build
```

### 3. Set Up Backend

#### Option A: Using LocalStack (Recommended for Development)

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Edit `.env` for LocalStack:
```env
USE_LOCALSTACK=true
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_BUCKET_NAME=test-bucket
PORT=3000
```

4. Start LocalStack:
```bash
npm run localstack:up
```

5. Set up LocalStack (create bucket and configure CORS):
```bash
npm run localstack:setup
```

6. Start the backend:
```bash
npm run backend:start
# or for development with auto-reload
npm run backend:dev
```

#### Option B: Using AWS S3 (Production)

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Edit `.env` with your AWS credentials:
```env
USE_LOCALSTACK=false
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=your-bucket-name
PORT=3000
```

4. Start the backend:
```bash
npm run backend:start
# or for development with auto-reload
npm run backend:dev
```

### 4. Configure and Start the App

The app automatically detects the backend URL based on the platform:
- iOS Simulator / Web: `http://localhost:3000`
- Android Emulator: `http://10.0.2.2:3000`

For physical devices, update `app/index.tsx`:
```typescript
const API_BASE_URL = "http://192.168.1.100:3000"; // Your computer's IP
```

Start the app (from example root):
```bash
npm start
# or
npm run android
npm run ios
npm run web
```

## Available Scripts

### App Scripts

- `npm start` - Start Expo development server
- `npm run android` - Start on Android
- `npm run ios` - Start on iOS
- `npm run web` - Start on web
- `npm run lint` - Run ESLint
- `npm run build:package` - Build the parent package

### Backend Scripts

- `npm run backend:start` - Start the backend server
- `npm run backend:dev` - Start backend with auto-reload (requires nodemon)

### LocalStack Scripts (from backend directory)

- `npm run localstack:up` - Start LocalStack container
- `npm run localstack:down` - Stop LocalStack container
- `npm run localstack:setup` - Create bucket and configure CORS
- `npm run localstack:logs` - View LocalStack logs
- `npm run localstack:download` - Download all files from LocalStack
- `npm run localstack:clear` - Clear all files from LocalStack

## Development Workflow

1. **Start LocalStack (if using):**
   ```bash
   cd backend
   npm run localstack:up
   npm run localstack:setup
   ```

2. **Start backend:**
   ```bash
   npm run backend:dev
   ```

3. **In another terminal, start the app:**
   ```bash
   npm start
   ```

4. **For physical devices:** Update `API_BASE_URL` in `app/index.tsx` to use your computer's IP address:
   ```typescript
   const API_BASE_URL = "http://192.168.1.100:3000";
   ```

## Package Details

### App

React Native Expo app demonstrating:
- File selection from library or camera
- Video thumbnail generation on selection for preview using `expo-video-thumbnails` - Thumbnails are generated immediately when videos are selected and used for preview in the media list
- **Unified upload API** - Single `uploadFiles` function that automatically selects chunked or simple upload based on file size
- Automatic upload method selection (chunked for files >= 5MB, simple for files < 5MB)
- Multiple file uploads (concurrent)
- Real-time progress updates
- Error handling with detailed failure reasons
- Clear all files functionality (clears both local state and server files)

See `app/index.tsx` for implementation details. The app uses Expo Router for navigation.

### Backend

Node.js/Express server providing:
- AWS S3 multipart upload APIs
- Signed URL generation
- Thumbnail upload support
- Simple upload support
- LocalStack integration for local development
- Web interface to view uploaded files
- File management (list, download, clear)

See `backend/README.md` for API documentation.

## Viewing Uploaded Files

### LocalStack (Local Development)

1. Open the web interface: `http://localhost:3000`
2. View all uploaded files with thumbnails
3. Download files or clear all files

### AWS S3 (Production)

Use the AWS Console or your preferred S3 management tool.

## Requirements

- Node.js >= 16.0.0
- npm >= 8.0.0 or Bun >= 1.0.0
- Docker (for LocalStack)
- AWS Account with S3 bucket (for production)
- Expo CLI (for React Native app)

## Troubleshooting

### Package not found

If you get errors about the package not being found:
1. Make sure you've built the parent package: `npm run build:package`
2. The app package references the parent package via `file:..`
3. Reinstall dependencies: `bun install` or `npm install`

### Backend connection issues

- Make sure the backend is running on the correct port
- For physical devices, use your computer's IP address, not `localhost`
- Check CORS settings in your S3 bucket (or LocalStack)
- Verify the `API_BASE_URL` in `app/index.tsx` matches your backend URL

### LocalStack issues

- Make sure Docker is running
- Check LocalStack is running: `docker ps | grep localstack`
- Verify LocalStack health: `curl http://localhost:4566/_localstack/health`
- Check LocalStack logs: `npm run localstack:logs`

### Metro bundler issues

- Clear Metro cache: `npm start -- --clear`
- Rebuild the package: `npm run build:package`
- Check `metro.config.js` is configured correctly

## License

MIT
