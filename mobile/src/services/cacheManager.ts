import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore - pako types not available
import pako from 'pako';

// Cache configuration
const CACHE_CONFIG = {
  HTML_CACHE_DIR: `${FileSystem.documentDirectory}html_cache/`,
  IMAGE_CACHE_DIR: `${FileSystem.documentDirectory}image_cache/`,
  METADATA_KEY: 'cache_metadata',
  MAX_CACHE_SIZE: 100 * 1024 * 1024, // 100MB
  CACHE_EXPIRY_DAYS: 30,
};

// Cache metadata interface
interface CacheMetadata {
  [key: string]: {
    url: string;
    localPath: string;
    timestamp: number;
    size: number;
    type: 'html' | 'image';
    gzip?: boolean;
  };
}

// Utility functions
class CacheManager {
  private metadata: CacheMetadata = {};

  constructor() {
    this.initializeCache();
  }

  // Initialize cache directories
  private async initializeCache(): Promise<void> {
    try {
      // Create cache directories if they don't exist
      const htmlDirInfo = await FileSystem.getInfoAsync(CACHE_CONFIG.HTML_CACHE_DIR);
      if (!htmlDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_CONFIG.HTML_CACHE_DIR, { intermediates: true });
      }

      const imageDirInfo = await FileSystem.getInfoAsync(CACHE_CONFIG.IMAGE_CACHE_DIR);
      if (!imageDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_CONFIG.IMAGE_CACHE_DIR, { intermediates: true });
      }

      // Load existing metadata
      await this.loadMetadata();
    } catch (error) {
      console.warn('Error initializing cache:', error);
    }
  }

  // Load cache metadata from AsyncStorage
  private async loadMetadata(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(CACHE_CONFIG.METADATA_KEY);
      if (stored) {
        this.metadata = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Error loading cache metadata:', error);
      this.metadata = {};
    }
  }

  // Save cache metadata to AsyncStorage
  private async saveMetadata(): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_CONFIG.METADATA_KEY, JSON.stringify(this.metadata));
    } catch (error) {
      console.warn('Error saving cache metadata:', error);
    }
  }

  // Generate cache key from URL
  private generateCacheKey(url: string): string {
    // Use URL as key, replace special characters
    return url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
  }

  // Compress HTML content using gzip
  private async compressHtml(html: string): Promise<string> {
    try {
      // Convert HTML string to Uint8Array for compression
      const input = new TextEncoder().encode(html);
      // Compress using gzip
      const compressed = pako.gzip(input);
      // Convert back to base64 string for storage
      return btoa(String.fromCharCode(...compressed));
    } catch (error) {
      console.warn('Error compressing HTML:', error);
      return html; // Return uncompressed if compression fails
    }
  }

  // Decompress HTML content (handles both compressed and uncompressed)
  private async decompressHtml(content: string): Promise<string> {
    try {
      // Check if content is base64 encoded (our compressed format)
      // If it's valid base64 and can be decompressed, it's compressed
      const compressed = new Uint8Array(
        atob(content).split('').map(char => char.charCodeAt(0))
      );

      // Try to decompress - if successful, it was compressed
      const decompressed = pako.ungzip(compressed);
      return new TextDecoder().decode(decompressed);
    } catch (error) {
      // If decompression fails, content is likely already uncompressed
      return content;
    }
  }

  // Cache HTML content
  async cacheHtml(url: string, html: string, compress: boolean = true): Promise<string> {
    try {
      const cacheKey = this.generateCacheKey(url);
      const fileName = `${cacheKey}.html`;
      const localPath = `${CACHE_CONFIG.HTML_CACHE_DIR}${fileName}`;

      // Compress HTML if requested
      const processedHtml = compress ? await this.compressHtml(html) : html;

      // Write to file
      await FileSystem.writeAsStringAsync(localPath, processedHtml);

      // Update metadata
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      this.metadata[cacheKey] = {
        url,
        localPath,
        timestamp: Date.now(),
        size: (fileInfo as any).size || processedHtml.length,
        type: 'html',
        gzip: compress,
      };

      await this.saveMetadata();

      // Auto-purge if cache is too large
      await this.autoPurge();

      return localPath;
    } catch (error) {
      console.warn('Error caching HTML:', error);
      throw error;
    }
  }

  // Cache image content
  async cacheImage(url: string): Promise<string> {
    try {
      const cacheKey = this.generateCacheKey(url);
      const extension = url.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${cacheKey}.${extension}`;
      const localPath = `${CACHE_CONFIG.IMAGE_CACHE_DIR}${fileName}`;

      // Download image to cache
      const downloadResult = await FileSystem.downloadAsync(url, localPath);

      if (downloadResult.status !== 200) {
        throw new Error(`Failed to download image: ${downloadResult.status}`);
      }

      // Update metadata
      this.metadata[cacheKey] = {
        url,
        localPath,
        timestamp: Date.now(),
        size: downloadResult.headers['content-length'] ? parseInt(downloadResult.headers['content-length']) : 0,
        type: 'image',
      };

      await this.saveMetadata();

      // Auto-purge if cache is too large
      await this.autoPurge();

      return localPath;
    } catch (error) {
      console.warn('Error caching image:', error);
      throw error;
    }
  }

  // Get cached content
  async getCachedContent(url: string): Promise<{ content: string; localPath: string } | null> {
    try {
      const cacheKey = this.generateCacheKey(url);
      const meta = this.metadata[cacheKey];

      if (!meta) {
        return null; // Not cached
      }

      // Check if cache is expired
      const age = Date.now() - meta.timestamp;
      const maxAge = CACHE_CONFIG.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      if (age > maxAge) {
        // Remove expired cache
        await this.removeCacheEntry(cacheKey);
        return null;
      }

      // Read from file
      const content = await FileSystem.readAsStringAsync(meta.localPath);

      // Decompress if needed
      const finalContent = meta.gzip ? await this.decompressHtml(content) : content;

      return {
        content: finalContent,
        localPath: meta.localPath,
      };
    } catch (error) {
      console.warn('Error getting cached content:', error);
      // Remove corrupted cache entry
      const cacheKey = this.generateCacheKey(url);
      await this.removeCacheEntry(cacheKey);
      return null;
    }
  }

  // Check if content is cached
  async isCached(url: string): Promise<boolean> {
    const cacheKey = this.generateCacheKey(url);
    const meta = this.metadata[cacheKey];

    if (!meta) {
      return false;
    }

    // Check if file exists and cache is not expired
    const fileInfo = await FileSystem.getInfoAsync(meta.localPath);
    if (!fileInfo.exists) {
      await this.removeCacheEntry(cacheKey);
      return false;
    }

    const age = Date.now() - meta.timestamp;
    const maxAge = CACHE_CONFIG.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    if (age > maxAge) {
      await this.removeCacheEntry(cacheKey);
      return false;
    }

    return true;
  }

  // Remove cache entry
  private async removeCacheEntry(cacheKey: string): Promise<void> {
    try {
      const meta = this.metadata[cacheKey];
      if (meta) {
        // Delete file
        await FileSystem.deleteAsync(meta.localPath, { idempotent: true });
        // Remove from metadata
        delete this.metadata[cacheKey];
        await this.saveMetadata();
      }
    } catch (error) {
      console.warn('Error removing cache entry:', error);
    }
  }

  // Auto-purge old cache entries
  private async autoPurge(): Promise<void> {
    try {
      // Calculate total cache size
      let totalSize = 0;
      const entries = Object.entries(this.metadata);

      for (const [key, meta] of entries) {
        totalSize += meta.size;
      }

      // If cache is too large, remove oldest entries
      if (totalSize > CACHE_CONFIG.MAX_CACHE_SIZE) {
        // Sort by timestamp (oldest first)
        const sortedEntries = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

        let sizeToRemove = totalSize - CACHE_CONFIG.MAX_CACHE_SIZE;
        let removedSize = 0;

        for (const [key, meta] of sortedEntries) {
          if (removedSize >= sizeToRemove) break;

          await this.removeCacheEntry(key);
          removedSize += meta.size;
        }
      }

      // Remove expired entries
      const maxAge = CACHE_CONFIG.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      const now = Date.now();

      for (const [key, meta] of entries) {
        if (now - meta.timestamp > maxAge) {
          await this.removeCacheEntry(key);
        }
      }
    } catch (error) {
      console.warn('Error during auto-purge:', error);
    }
  }

  // Get cache statistics
  async getCacheStats(): Promise<{
    totalSize: number;
    entryCount: number;
    htmlCount: number;
    imageCount: number;
  }> {
    let totalSize = 0;
    let htmlCount = 0;
    let imageCount = 0;

    for (const meta of Object.values(this.metadata)) {
      totalSize += meta.size;
      if (meta.type === 'html') htmlCount++;
      if (meta.type === 'image') imageCount++;
    }

    return {
      totalSize,
      entryCount: Object.keys(this.metadata).length,
      htmlCount,
      imageCount,
    };
  }

  // Clear all cache
  async clearAllCache(): Promise<void> {
    try {
      // Delete cache directories
      await FileSystem.deleteAsync(CACHE_CONFIG.HTML_CACHE_DIR, { idempotent: true });
      await FileSystem.deleteAsync(CACHE_CONFIG.IMAGE_CACHE_DIR, { idempotent: true });

      // Recreate directories
      await FileSystem.makeDirectoryAsync(CACHE_CONFIG.HTML_CACHE_DIR, { intermediates: true });
      await FileSystem.makeDirectoryAsync(CACHE_CONFIG.IMAGE_CACHE_DIR, { intermediates: true });

      // Clear metadata
      this.metadata = {};
      await this.saveMetadata();
    } catch (error) {
      console.warn('Error clearing cache:', error);
    }
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
export default cacheManager;
