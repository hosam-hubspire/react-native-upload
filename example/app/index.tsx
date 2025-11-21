import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
  uploadMultipleFiles,
  uploadMultipleSimpleFiles,
  uploadSimpleFile,
  type UploadConfig,
  type FileUploadConfig,
  type SimpleUploadConfig,
} from "react-native-chunk-upload";

// Configuration - Update this to match your backend URL
const API_BASE_URL = __DEV__
  ? Platform.OS === "android"
    ? "http://10.0.2.2:3000" // Android emulator
    : "http://localhost:3000" // iOS simulator / web
  : "https://your-backend-url.com";

const getSignedUrls = async ({
  mediaType,
  totalParts,
  contentType,
  extension,
}: any) => {
  const response = await fetch(`${API_BASE_URL}/api/upload/chunks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaType, totalParts, contentType, extension }),
  });
  if (!response.ok) throw new Error("Failed to get signed URLs");
  return response.json();
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

const getThumbnailSignedUrl = async ({ contentType, extension }: any) => {
  const response = await fetch(`${API_BASE_URL}/api/upload/thumbnail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, extension }),
  });
  if (!response.ok) throw new Error("Failed to get thumbnail URL");
  return response.json();
};

const getSimpleUploadUrl = async ({ contentType, extension }: any) => {
  const response = await fetch(`${API_BASE_URL}/api/upload/simple`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, extension }),
  });
  if (!response.ok) throw new Error("Failed to get simple upload URL");
  return response.json();
};

interface UploadProgress {
  fileIndex: number;
  percentComplete: number;
  uploadedBytes: number;
  totalBytes: number;
  status: "uploading" | "completed" | "failed";
  error?: string;
  reason?: string;
}

/**
 * Generate a thumbnail from a video file
 */
async function generateVideoThumbnail(videoUri: string): Promise<string> {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 1000, // Get thumbnail at 1 second
      quality: 0.8,
    });
    return uri;
  } catch (error) {
    console.error("Error generating video thumbnail:", error);
    throw error;
  }
}

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
        result.assets.map(async (asset, index) => {
          const extension = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
          const contentType =
            asset.type === "video"
              ? `video/${extension}`
              : `image/${extension}`;

          const file: FileUploadConfig = {
            fileIndex: 0, // Will be set correctly in the functional update
            filePath: asset.uri,
            fileSize: asset.fileSize || 0,
            mediaType: asset.type === "video" ? "video" : "photo",
            contentType,
            extension,
          };

          // Generate thumbnail for videos
          if (asset.type === "video") {
            try {
              const thumbnailUri = await generateVideoThumbnail(asset.uri);
              file.thumbnailPath = thumbnailUri;
            } catch (error) {
              console.error(
                `Failed to generate thumbnail for video ${asset.uri}:`,
                error
              );
              Alert.alert(
                "Thumbnail Error",
                "Failed to generate thumbnail for video. Upload will continue without thumbnail."
              );
            }
          }

          return file;
        })
      );

      // Use functional update to ensure correct fileIndex based on current state
      setSelectedFiles((prev) => {
        // Calculate indices based on the current state at the time of update
        const filesWithCorrectIndices = files.map((file, index) => ({
          ...file,
          fileIndex: prev.length + index,
        }));
        return [...prev, ...filesWithCorrectIndices];
      });
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

      // Generate thumbnail for videos before creating file config
      let thumbnailPath: string | undefined;
      if (asset.type === "video") {
        try {
          thumbnailPath = await generateVideoThumbnail(asset.uri);
        } catch (error) {
          console.error(
            `Failed to generate thumbnail for video ${asset.uri}:`,
            error
          );
          Alert.alert(
            "Thumbnail Error",
            "Failed to generate thumbnail for video. Upload will continue without thumbnail."
          );
        }
      }

      // Use functional update to ensure correct fileIndex based on current state
      setSelectedFiles((prev) => {
        const file: FileUploadConfig = {
          fileIndex: prev.length,
          filePath: asset.uri,
          fileSize: asset.fileSize || 0,
          mediaType: asset.type === "video" ? "video" : "photo",
          contentType,
          extension,
          ...(thumbnailPath && { thumbnailPath }),
        };
        return [...prev, file];
      });
    }
  };

  const uploadConfig: UploadConfig = {
    getSignedUrls,
    markUploadComplete,
    getThumbnailSignedUrl,
    chunkSize: 5 * 1024 * 1024, // 5MB chunks
    concurrentFileUploadLimit: 3,
    concurrentChunkUploadLimit: 6,
    onProgress: (fileIndex, progress) => {
      setUploadProgress((prev) => {
        const newMap = new Map(prev);
        newMap.set(fileIndex, {
          fileIndex,
          percentComplete: progress.percentComplete || 0,
          uploadedBytes: progress.uploadedBytes || 0,
          totalBytes: progress.totalBytes || 0,
          status: progress.uploadFailed
            ? "failed"
            : progress.uploadCompleted
            ? "completed"
            : "uploading",
          error: progress.uploadFailed ? "Upload failed" : undefined,
          reason: (progress as any).reason,
        });

        // Calculate overall progress in real-time
        const totalBytes = selectedFiles.reduce(
          (sum, f) => sum + f.fileSize,
          0
        );
        const totalUploadedBytes = Array.from(newMap.values()).reduce(
          (sum, p) => sum + (p.uploadedBytes || 0),
          0
        );
        const overallPercentage =
          totalBytes > 0
            ? Math.min((totalUploadedBytes / totalBytes) * 100, 100)
            : 0;
        setOverallProgress(overallPercentage);

        return newMap;
      });
    },
    onTotalProgress: (progress) => {
      setOverallProgress(progress.overallPercentComplete);
    },
  };

  const handleChunkedUpload = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert("No files", "Please select files first");
      return;
    }

    setIsUploading(true);
    setUploadProgress(new Map());
    setOverallProgress(0);
    setUploadResults([]);

    try {
      const results = await uploadMultipleFiles(selectedFiles, uploadConfig);
      setUploadResults(results);

      // Update progress with failure reasons from results
      setUploadProgress((prev) => {
        const newMap = new Map(prev);
        results.forEach((result) => {
          if (result.uploadFailed && result.reason) {
            const existing = newMap.get(result.fileIndex);
            if (existing) {
              const reasonStr =
                typeof result.reason === "string"
                  ? result.reason
                  : String(result.reason || "Upload failed");
              newMap.set(result.fileIndex, {
                ...existing,
                status: "failed",
                reason: reasonStr,
                error: reasonStr,
              });
            }
          }
        });
        return newMap;
      });

      const failed = results.filter((r) => r.uploadFailed);
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

  const handleSimpleUpload = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert("No files", "Please select files first");
      return;
    }

    setIsUploading(true);
    setUploadProgress(new Map());
    setOverallProgress(0);
    setUploadResults([]);

    try {
      const totalSize = selectedFiles.reduce((sum, f) => sum + f.fileSize, 0);

      // Upload thumbnails for videos first
      const videoFiles = selectedFiles.filter(
        (f) => f.mediaType === "video" && f.thumbnailPath
      );

      if (videoFiles.length > 0) {
        await Promise.all(
          videoFiles.map(async (file) => {
            try {
              const { url } = await getThumbnailSignedUrl({
                contentType: "image/jpeg",
                extension: "jpg",
              });

              await uploadSimpleFile({
                signedUrl: url,
                filePath: file.thumbnailPath!,
              });
            } catch (error) {
              console.error(
                `Failed to upload thumbnail for file ${file.fileIndex}:`,
                error
              );
              // Continue with main file upload even if thumbnail fails
            }
          })
        );
      }

      // Get signed URLs for all files and store keys
      const fileUploadData = await Promise.all(
        selectedFiles.map(async (file) => {
          const { url, key } = await getSimpleUploadUrl({
            contentType: file.contentType,
            extension: file.extension,
          });

          return {
            file,
            signedUrl: url,
            key,
          };
        })
      );

      const uploadConfigs: SimpleUploadConfig[] = fileUploadData.map(
        (data) => ({
          signedUrl: data.signedUrl,
          filePath: data.file.filePath,
          onProgress: (percentage: number) => {
            setUploadProgress((prev) => {
              const newMap = new Map(prev);
              const uploadedBytes = (data.file.fileSize * percentage) / 100;
              newMap.set(data.file.fileIndex, {
                fileIndex: data.file.fileIndex,
                percentComplete: percentage,
                uploadedBytes,
                totalBytes: data.file.fileSize,
                status: percentage === 100 ? "completed" : "uploading",
              });

              // Calculate overall progress
              const totalUploadedBytes = Array.from(newMap.values()).reduce(
                (sum, p) => sum + p.uploadedBytes,
                0
              );
              const overallPercentage = (totalUploadedBytes / totalSize) * 100;
              setOverallProgress(overallPercentage);

              return newMap;
            });
          },
        })
      );

      // Upload all files concurrently
      const uploadResults = await uploadMultipleSimpleFiles(uploadConfigs, 3);

      // Map results to include fileIndex and key
      const results = uploadResults.map((result, index) => ({
        fileIndex: fileUploadData[index].file.fileIndex,
        key: fileUploadData[index].key,
        uploadFailed: result.status !== 200,
        reason:
          result.status !== 200
            ? `Upload failed with status ${result.status}`
            : undefined,
        mediaType: fileUploadData[index].file.mediaType,
      }));

      setUploadResults(results);

      // Update progress with failure reasons from results
      setUploadProgress((prev) => {
        const newMap = new Map(prev);
        results.forEach((result) => {
          if (result.uploadFailed && result.reason) {
            const existing = newMap.get(result.fileIndex);
            if (existing) {
              const reasonStr =
                typeof result.reason === "string"
                  ? result.reason
                  : String(result.reason || "Upload failed");
              newMap.set(result.fileIndex, {
                ...existing,
                status: "failed",
                reason: reasonStr,
                error: reasonStr,
              });
            }
          }
        });
        return newMap;
      });

      const failed = results.filter((r) => r.uploadFailed);
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

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {selectedFiles.length > 0 && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Selected Files ({selectedFiles.length})
            </Text>
            {selectedFiles.map((file, index) => (
              <View key={index} style={styles.fileItem}>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName}>
                    {file.mediaType} - {formatFileSize(file.fileSize)}
                  </Text>
                  <Text style={styles.filePath}>
                    {file.filePath.split("/").pop()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeFile(index)}>
                  <Text style={styles.removeButton}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.uploadButton,
                isUploading && styles.uploadButtonDisabled,
              ]}
              onPress={handleChunkedUpload}
              disabled={isUploading}
            >
              <Text style={styles.uploadButtonText}>Upload (Chunked)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.uploadButton,
                isUploading && styles.uploadButtonDisabled,
              ]}
              onPress={handleSimpleUpload}
              disabled={isUploading}
            >
              <Text style={styles.uploadButtonText}>Upload (Simple)</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.clearButton} onPress={clearFiles}>
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        </>
      )}

      {overallProgress > 0 && (
        <View style={styles.progressSection}>
          <Text style={styles.sectionTitle}>Overall Progress</Text>
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${overallProgress}%` }]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.round(overallProgress)}%
          </Text>
        </View>
      )}

      {uploadProgress.size > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>File Progress</Text>
          {Array.from(uploadProgress.values()).map((progress) => (
            <View key={progress.fileIndex} style={styles.progressItem}>
              <Text style={styles.progressLabel}>
                File {progress.fileIndex + 1}:{" "}
                {Math.round(progress.percentComplete)}%
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progress.percentComplete}%`,
                      backgroundColor:
                        progress.status === "failed"
                          ? "#ff4444"
                          : progress.status === "completed"
                          ? "#44ff44"
                          : "#4444ff",
                    },
                  ]}
                />
              </View>
              {progress.status === "failed" && (
                <Text style={styles.errorText}>
                  {progress.reason || progress.error || "Upload failed"}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {uploadResults.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Results</Text>
          {uploadResults.map((result, index) => (
            <View key={index} style={styles.resultItem}>
              <Text style={styles.resultText}>
                File{" "}
                {typeof result.fileIndex === "number"
                  ? result.fileIndex + 1
                  : index + 1}
                :{" "}
                {result.uploadFailed ? (
                  <Text style={styles.errorText}>Failed - {result.reason}</Text>
                ) : (
                  <Text style={styles.successText} numberOfLines={0}>
                    Success! Key: {result.key || "N/A"}
                  </Text>
                )}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 20,
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
    backgroundColor: "#FF3B30",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
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
});
