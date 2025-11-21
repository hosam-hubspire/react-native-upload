/**
 * Executes an array of items through a mapper function with a concurrency limit.
 * Similar to Bluebird's Promise.map with concurrency option.
 * Processes items concurrently up to the specified limit, maintaining the order of results.
 *
 * @template T - Type of items in the input array
 * @template R - Type of results returned by the mapper function
 * @param items - Array of items to process
 * @param mapper - Function that processes each item and returns a Promise. Receives the item and its index.
 * @param concurrency - Maximum number of concurrent operations (default: Infinity)
 * @returns Promise that resolves to an array of results in the same order as input items
 * @throws Error if concurrency is less than or equal to 0
 *
 * @example
 * ```typescript
 * // Process files with max 3 concurrent uploads
 * const results = await mapConcurrent(
 *   files,
 *   async (file, index) => {
 *     return await uploadFile(file);
 *   },
 *   3
 * );
 * ```
 */
export async function mapConcurrent<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = Infinity
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  if (concurrency <= 0) {
    throw new Error("Concurrency must be greater than 0");
  }

  // If no concurrency limit or limit is greater than items, process all at once
  if (concurrency === Infinity || concurrency >= items.length) {
    return Promise.all(items.map((item, index) => mapper(item, index)));
  }

  const results: R[] = new Array(items.length);
  let index = 0;

  return new Promise<R[]>((resolve, reject) => {
    const executing = new Set<Promise<void>>();

    const processNext = () => {
      // If all items are processed, resolve when all executing promises complete
      if (index >= items.length) {
        if (executing.size === 0) {
          resolve(results);
        }
        return;
      }

      // If we're at concurrency limit, wait for one to complete
      if (executing.size >= concurrency) {
        return;
      }

      const currentIndex = index++;
      const item = items[currentIndex];

      const promise = mapper(item, currentIndex)
        .then((result) => {
          results[currentIndex] = result;
        })
        .catch((error) => {
          reject(error);
        })
        .finally(() => {
          executing.delete(promise);
          // Process next item
          processNext();
        });

      executing.add(promise);
      processNext();
    };

    // Start processing
    processNext();
  });
}

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

/**
 * Gets the dimensions (width and height) of an image from its URI.
 * Uses React Native's Image.getSize method.
 *
 * @param uri - URI or path to the image file
 * @returns Promise resolving to an object with width and height in pixels
 * @throws Error if the image size cannot be calculated
 *
 * @example
 * ```typescript
 * try {
 *   const { width, height } = await getImageSize('file:///path/to/image.jpg');
 *   console.log(`Image dimensions: ${width}x${height}`);
 * } catch (error) {
 *   console.error('Failed to get image size:', error);
 * }
 * ```
 */
export const getImageSize = async (
  uri: string
): Promise<{ height: number; width: number }> => {
  const { Image } = await import("react-native");

  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve({ width, height });
      },
      () => {
        reject(new Error("Failed to calculate image size"));
      }
    );
  });
};
