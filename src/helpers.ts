import { Image } from "react-native";

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
const getImageSize = (uri: string) =>
  new Promise<{ height: number; width: number }>((resolve, reject) => {
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
