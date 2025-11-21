import { Image } from "react-native";

export const getImageSize = (uri: string) =>
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
