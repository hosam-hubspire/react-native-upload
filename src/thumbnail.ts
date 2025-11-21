/**
 * Generates a thumbnail from a video file using expo-video-thumbnails.
 * This function will only work if expo-video-thumbnails is installed.
 *
 * @param videoUri - URI or path to the video file
 * @param options - Optional configuration for thumbnail generation
 * @param options.time - Time in milliseconds to capture thumbnail (default: 1000)
 * @param options.quality - Quality of thumbnail 0-1 (default: 0.8)
 * @returns Promise resolving to the thumbnail URI, or null if expo-video-thumbnails is not available
 * @throws Error if thumbnail generation fails (when expo-video-thumbnails is available)
 */
export async function generateVideoThumbnail(
  videoUri: string,
  options?: { time?: number; quality?: number }
): Promise<string | null> {
  try {
    // Dynamically import expo-video-thumbnails
    // This will only work if the package is installed
    const VideoThumbnails = require("expo-video-thumbnails");

    if (!VideoThumbnails || !VideoThumbnails.getThumbnailAsync) {
      // expo-video-thumbnails is not available
      return null;
    }

    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: options?.time ?? 1000, // Get thumbnail at 1 second by default
      quality: options?.quality ?? 0.8,
    });

    return uri;
  } catch (error: any) {
    // If the error is about the module not being found, return null
    // Otherwise, rethrow the error
    if (
      error?.message?.includes("Cannot find module") ||
      error?.message?.includes("expo-video-thumbnails")
    ) {
      return null;
    }
    throw new Error(
      `Failed to generate video thumbnail: ${error?.message || String(error)}`
    );
  }
}
