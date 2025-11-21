# Chunked Upload Example

This is an example React Native app demonstrating the `react-native-chunked-upload` package with an AWS S3 backend server.

## Structure

```
example/
├── app/              # React Native Expo app source files
├── assets/           # App assets (images, etc.)
├── backend/          # Node.js/Express backend with AWS S3
├── package.json      # App dependencies and scripts
└── README.md         # This file
```

## Quick Start

### 1. Install Dependencies

From the example directory:

```bash
npm install
```

Note: This project uses `--legacy-peer-deps` to handle peer dependency conflicts. An `.npmrc` file is included to automatically use this flag.

Then install backend dependencies:

```bash
cd backend
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
npm run build
```

### 3. Set Up Backend

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
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=your-bucket-name
PORT=3000
```

4. Start the backend (from example root):
```bash
npm run backend:start
# or for development with auto-reload
npm run backend:dev
```

### 4. Configure and Start the App

1. Edit `app/index.tsx`:
```typescript
const USE_MOCK_API = false; // Set to false to use real backend
const API_BASE_URL = "http://localhost:3000"; // Or your backend URL
```

2. Start the app (from example root):
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

### Backend Scripts

- `npm run backend:start` - Start the backend server
- `npm run backend:dev` - Start backend with auto-reload

### Other Scripts

- `npm run build:package` - Build the parent package

## Development Workflow

1. **Start backend:**
   ```bash
   npm run backend:dev
   ```

2. **In another terminal, start the app:**
   ```bash
   npm start
   ```

3. **For physical devices:** Update `API_BASE_URL` in `app/index.tsx` to use your computer's IP address:
   ```typescript
   const API_BASE_URL = "http://192.168.1.100:3000";
   ```

## Package Details

### App

React Native Expo app demonstrating:
- Chunked file uploads
- Simple file uploads
- Progress tracking
- Multiple file uploads
- Error handling

See `app/index.tsx` for implementation details. The app uses Expo Router for navigation.

### Backend

Node.js/Express server providing:
- AWS S3 multipart upload APIs
- Signed URL generation
- Thumbnail upload support
- Simple upload support

See `backend/README.md` for API documentation.

## Requirements

- Node.js >= 16.0.0
- npm >= 8.0.0
- AWS Account with S3 bucket
- Expo CLI (for React Native app)

## Troubleshooting

### Package not found

If you get errors about the package not being found:
1. Make sure you've built the parent package: `npm run build:package`
2. The app package references the parent package via `file:../..`

### Backend connection issues

- Make sure the backend is running on the correct port
- For physical devices, use your computer's IP address, not `localhost`
- Check CORS settings in your S3 bucket
