import * as React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { UploadProgress, File } from "@hubspire/react-native-upload";
import { Image } from "expo-image";

export interface UploadMediaListProps {
  /** Array of file configurations being uploaded */
  files: File[];
  /** Map of fileIndex to upload progress */
  progressMap: Map<number, UploadProgress>;
  /** Overall progress percentage (0-100) */
  overallProgress: number;
  /** Number of columns in the grid (default: 3) */
  numColumns?: number;
  /** Callback when a media item is pressed */
  onItemPress?: (fileIndex: number, file: File) => void;
}

/**
 * A reusable React Native component that displays a grid of media items
 * with individual upload progress indicators and an overall progress bar.
 *
 * @example
 * ```tsx
 * const [progressMap, setProgressMap] = useState<Map<number, UploadProgress>>(new Map());
 * const [overallProgress, setOverallProgress] = useState(0);
 *
 * <UploadMediaList
 *   files={selectedFiles}
 *   progressMap={progressMap}
 *   overallProgress={overallProgress}
 *   numColumns={3}
 * />
 * ```
 */
export function UploadMediaList({
  files,
  progressMap,
  overallProgress,
  numColumns = 3,
  onItemPress,
}: UploadMediaListProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1000;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);
    const formatted = size.toFixed(1).replace(/\.?0+$/, "");
    return formatted + " " + sizes[i];
  };

  const renderMediaItem = ({ item, index }: { item: File; index: number }) => {
    const progress = progressMap.get(index);
    const status = progress?.status || "uploading";
    const percentComplete = progress?.percentComplete || 0;

    // Use thumbnail for videos if available, otherwise use filePath
    const imageUri =
      item.mediaType === "video" && item.thumbnailPath
        ? item.thumbnailPath
        : item.filePath;

    return (
      <TouchableOpacity
        style={styles.mediaItem}
        onPress={() => onItemPress?.(index, item)}
        activeOpacity={0.7}
      >
        <View style={styles.mediaThumbnail}>
          <Image source={{ uri: imageUri }} style={styles.thumbnailImage} />

          {/* Video indicator badge */}
          {item.mediaType === "video" && (
            <View style={styles.videoBadge}>
              <Text style={styles.videoIcon}>▶</Text>
            </View>
          )}

          {/* File size badge */}
          <View style={styles.sizeBadge}>
            <Text style={styles.sizeText}>
              {progress?.totalBytes
                ? formatFileSize(progress.totalBytes)
                : formatFileSize(item.fileSize)}
            </Text>
          </View>

          {/* Progress overlay */}
          {status === "uploading" && (
            <View style={styles.progressOverlay}>
              <View style={styles.progressBarContainer}>
                <View
                  style={[styles.progressBar, { width: `${percentComplete}%` }]}
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round(percentComplete)}%
              </Text>
            </View>
          )}

          {/* Status indicators */}
          {status === "completed" && (
            <View style={styles.completedBadge}>
              <Text style={styles.completedIcon}>✓</Text>
            </View>
          )}
          {status === "failed" && (
            <View style={styles.failedBadge}>
              <Text style={styles.failedIcon}>✕</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Overall progress indicator */}
      <View style={styles.overallProgressContainer}>
        <View style={styles.overallProgressHeader}>
          <Text style={styles.overallProgressLabel}>Upload Progress</Text>
          <Text style={styles.overallProgressPercent}>
            {Math.round(overallProgress)}%
          </Text>
        </View>
        <View style={styles.overallProgressBarContainer}>
          <View
            style={[
              styles.overallProgressBar,
              { width: `${overallProgress}%` },
            ]}
          />
        </View>
        <Text style={styles.overallProgressText}>
          {files.length} file{files.length !== 1 ? "s" : ""} selected
        </Text>
      </View>

      {/* Media grid */}
      <FlatList
        data={files}
        renderItem={renderMediaItem}
        numColumns={numColumns}
        keyExtractor={(item: File, index: number) => `media-${index}`}
        contentContainerStyle={styles.gridContainer}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  overallProgressContainer: {
    padding: 16,
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  overallProgressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  overallProgressLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  overallProgressPercent: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  overallProgressBarContainer: {
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  overallProgressBar: {
    height: "100%",
    backgroundColor: "#007AFF",
    borderRadius: 4,
  },
  overallProgressText: {
    fontSize: 12,
    color: "#666",
  },
  gridContainer: {
    padding: 8,
  },
  row: {
    justifyContent: "space-between",
  },
  mediaItem: {
    flex: 1,
    margin: 4,
    aspectRatio: 1,
  },
  mediaThumbnail: {
    flex: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
    position: "relative",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  videoBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  videoIcon: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  sizeBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sizeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "500",
  },
  progressOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  progressBarContainer: {
    width: "80%",
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  progressText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  completedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#34C759",
    justifyContent: "center",
    alignItems: "center",
  },
  completedIcon: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  failedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "center",
  },
  failedIcon: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
});
