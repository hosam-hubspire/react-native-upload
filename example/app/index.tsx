import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  uploadFiles,
  UnifiedUploadConfig,
  FileUploadConfig,
  UploadProgress,
  generateVideoThumbnail,
} from "@hubspire/react-native-upload";
import { UploadMediaList } from "@/components/UploadMediaList";

// Configuration - Update this to match your backend URL
const API_BASE_URL = __DEV__
  ? Platform.OS === "android"
    ? "http://10.0.2.2:3000" // Android emulator
    : "http://localhost:3000" // iOS simulator / web
  : "https://your-backend-url.com";

const getUploadUrl = async ({
  uploadType,
  mediaType,
  contentType,
  extension,
  totalParts,
}: any) => {
  // Single unified endpoint - backend handles chunked, simple, and thumbnail uploads
  const response = await fetch(`${API_BASE_URL}/api/upload/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadType,
      mediaType, // Not required for thumbnails
      contentType,
      extension,
      totalParts, // Only used for chunked uploads
    }),
  });
  if (!response.ok) throw new Error("Failed to get upload URL");
  return response.json();
  // Returns { urls, key, uploadId } for chunked or { url, key } for simple/thumbnail
};

const markUploadComplete = async ({ eTags, key, uploadId }: any) => {
  const response = await fetch(`${API_BASE_URL}/api/upload/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eTags, key, uploadId }),
  });
  if (!response.ok) throw new Error("Failed to complete upload");
  return response.json();
};

export default function Index() {
  const [selectedFiles, setSelectedFiles] = useState<FileUploadConfig[]>([]);
  const [uploadProgress, setUploadProgress] = useState<
    Map<number, UploadProgress>
  >(new Map());
  const [overallProgress, setOverallProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any[]>([]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant camera roll permissions");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled && result.assets) {
      // Process assets and generate thumbnails for videos
      const files: FileUploadConfig[] = await Promise.all(
        result.assets.map(async (asset) => {
          const extension = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
          const contentType =
            asset.type === "video"
              ? `video/${extension}`
              : `image/${extension}`;

          const file: FileUploadConfig = {
            // fileIndex is automatically assigned by the package
            filePath: asset.uri,
            fileSize: asset.fileSize || 0,
            mediaType: asset.type === "video" ? "video" : "photo",
            contentType,
            extension,
          };

          // Generate thumbnail for videos immediately upon selection
          if (asset.type === "video") {
            try {
              const thumbnailPath = await generateVideoThumbnail(asset.uri);
              if (thumbnailPath) {
                file.thumbnailPath = thumbnailPath;
              }
            } catch (error) {
              console.warn("Failed to generate video thumbnail:", error);
              // Continue without thumbnail - it will be generated during upload if needed
            }
          }

          return file;
        })
      );

      // Add files to selected files (fileIndex will be auto-assigned by the package)
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant camera permissions");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const extension = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const contentType =
        asset.type === "video" ? `video/${extension}` : `image/${extension}`;

      // Add file to selected files (fileIndex will be auto-assigned by the package)
      const file: FileUploadConfig = {
        // fileIndex is automatically assigned by the package
        filePath: asset.uri,
        fileSize: asset.fileSize || 0,
        mediaType: asset.type === "video" ? "video" : "photo",
        contentType,
        extension,
      };

      // Generate thumbnail for videos immediately upon selection
      if (asset.type === "video") {
        try {
          const thumbnailPath = await generateVideoThumbnail(asset.uri);
          if (thumbnailPath) {
            file.thumbnailPath = thumbnailPath;
          }
        } catch (error) {
          console.warn("Failed to generate video thumbnail:", error);
          // Continue without thumbnail - it will be generated during upload if needed
        }
      }

      setSelectedFiles((prev) => [...prev, file]);
    }
  };

  const uploadConfig: UnifiedUploadConfig = {
    getUploadUrl,
    markUploadComplete,
    onProgress: (progress) => {
      setUploadProgress((prev) => {
        const newMap = new Map(prev);
        newMap.set(progress.fileIndex, progress);
        return newMap;
      });
      if (progress.overallPercentComplete !== undefined) {
        setOverallProgress(progress.overallPercentComplete);
      }
    },
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert("No files", "Please select files first");
      return;
    }

    setIsUploading(true);
    setUploadProgress(new Map());
    setOverallProgress(0);
    setUploadResults([]);

    try {
      // uploadFiles automatically switches between chunked and simple uploads
      // based on file size (files >= chunkThresholdBytes use chunked, others use simple)
      const results = await uploadFiles(selectedFiles, uploadConfig);
      setUploadResults(results);

      // Update progress with failure reasons from results
      setUploadProgress((prev) => {
        const newMap = new Map(prev);
        results.forEach((result) => {
          if (result.status === "failed" && result.error) {
            const existing = newMap.get(result.fileIndex);
            if (existing) {
              const errorStr =
                typeof result.error === "string"
                  ? result.error
                  : String(result.error || "Upload failed");
              newMap.set(result.fileIndex, {
                ...existing,
                status: "failed",
                error: errorStr,
              });
            }
          }
        });
        return newMap;
      });

      const failed = results.filter((r) => r.status === "failed");
      if (failed.length > 0) {
        Alert.alert(
          "Upload completed with errors",
          `${results.length - failed.length} succeeded, ${failed.length} failed`
        );
      } else {
        Alert.alert(
          "Success",
          `All ${results.length} files uploaded successfully!`
        );
      }
    } catch (error: any) {
      Alert.alert("Upload error", error.message || "Failed to upload files");
    } finally {
      setIsUploading(false);
    }
  };

  const clearFiles = async () => {
    try {
      // Clear files from LocalStack
      const response = await fetch(`${API_BASE_URL}/api/files`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        Alert.alert(
          "Clear Error",
          errorData.message || "Failed to clear files from server"
        );
      } else {
        const data = await response.json();
        if (data.deleted > 0) {
          Alert.alert(
            "Files Cleared",
            `Deleted ${data.deleted} file(s) from server${
              data.failed > 0 ? ` (${data.failed} failed)` : ""
            }`
          );
        }
      }
    } catch (error: any) {
      console.error("Error clearing files:", error);
      // Don't show error alert - just clear local state anyway
    }

    // Clear local state
    setSelectedFiles([]);
    setUploadProgress(new Map());
    setOverallProgress(0);
    setUploadResults([]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chunked Upload Example</Text>
        <Text style={styles.subtitle}>{`Backend: ${API_BASE_URL}`}</Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.buttonText}>Pick from Library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={pickCamera}>
            <Text style={styles.buttonText}>Take Photo/Video</Text>
          </TouchableOpacity>
        </View>
      </View>

      {selectedFiles.length > 0 && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.uploadButton,
              isUploading && styles.uploadButtonDisabled,
            ]}
            onPress={handleUpload}
            disabled={isUploading}
          >
            <Text style={styles.uploadButtonText}>
              {isUploading ? "Uploading..." : "Upload Files"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.clearButton} onPress={clearFiles}>
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Use UploadMediaList component for gallery-style display */}
      {selectedFiles.length > 0 && (
        <View style={styles.mediaListContainer}>
          <UploadMediaList
            files={selectedFiles}
            progressMap={uploadProgress}
            overallProgress={overallProgress}
            numColumns={3}
            onItemPress={(fileIndex, file) => {
              const progress = uploadProgress.get(fileIndex);
              if (progress?.status === "failed" && progress.error) {
                Alert.alert(
                  "Upload Failed",
                  typeof progress.error === "string"
                    ? progress.error
                    : progress.error?.message || "Upload failed"
                );
              }
            }}
          />
        </View>
      )}

      {uploadResults.filter((r) => r.status === "failed").length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Errors</Text>
          {uploadResults
            .filter((result) => result.status === "failed")
            .map((result, index) => (
              <View key={index} style={styles.resultItem}>
                <Text style={styles.resultText}>
                  File{" "}
                  {typeof result.fileIndex === "number"
                    ? result.fileIndex + 1
                    : index + 1}
                  :{" "}
                  <Text style={styles.errorText}>
                    {typeof result.error === "string"
                      ? result.error
                      : result.error?.message || "Upload failed"}
                  </Text>
                </Text>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  uploadButton: {
    flex: 1,
    backgroundColor: "#34C759",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  clearButton: {
    flex: 1,
    backgroundColor: "#FF3B30",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  clearButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  section: {
    marginTop: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  fileItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginBottom: 8,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
  },
  filePath: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  removeButton: {
    fontSize: 24,
    color: "#FF3B30",
    fontWeight: "bold",
  },
  progressSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  progressItem: {
    marginBottom: 15,
  },
  progressLabel: {
    fontSize: 14,
    marginBottom: 5,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#007AFF",
    borderRadius: 4,
  },
  progressText: {
    marginTop: 5,
    fontSize: 12,
    color: "#666",
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 12,
    marginTop: 5,
  },
  successText: {
    color: "#34C759",
    fontSize: 12,
  },
  resultItem: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    flexWrap: "wrap",
  },
  mediaListContainer: {
    flex: 1,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
});
