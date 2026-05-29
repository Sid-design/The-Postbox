import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useWindowDimensions, View, ActivityIndicator, Text, TouchableOpacity, Modal, Alert, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useMessages } from '../context/MessagesContext';
import { DetailScreenProps, Message } from '../navigation/types';
import { useTheme } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { colors } from '../theme';
import cacheManager from '../services/cacheManager';
import useNetwork from '../hooks/useNetwork';

type ThemeMode = 'light' | 'dark' | 'sepia';

const DetailScreen = ({ route }: DetailScreenProps) => {
  const { setMessages } = useMessages();
  const { messageId } = route.params;
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const networkState = useNetwork();
  const navigation = useNavigation();
  const { authToken } = useAuth();
  
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cachedHtml, setCachedHtml] = useState<string | null>(null);
  const [processedHtml, setProcessedHtml] = useState('<html><body><p>Loading...</p></body></html>');

  // Reading preferences state
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [fontSize, setFontSize] = useState(16); // Default font size

  const [menuVisible, setMenuVisible] = useState(false);

  // Function to inject viewport meta tag for proper mobile scaling
  const injectViewportMeta = (html: string) => {
    // Check if viewport meta tag already exists
    if (html.includes('<meta name="viewport"')) {
      return html;
    }

    // Inject viewport meta tag in the head section
    const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';

    if (html.includes('<head>')) {
      return html.replace('<head>', `<head>${viewportMeta}`);
    } else if (html.includes('<html>')) {
      return html.replace('<html>', `<html><head>${viewportMeta}</head>`);
    } else {
      // Fallback: prepend to the HTML
      return `${viewportMeta}${html}`;
    }
  };

  // Load reading preferences from AsyncStorage
  const loadReadingPreferences = async () => {
    try {
      const storedTheme = await AsyncStorage.getItem('readingTheme');
      const storedFontSize = await AsyncStorage.getItem('readingFontSize');
      if (storedTheme) setThemeMode(storedTheme as ThemeMode);
      if (storedFontSize) setFontSize(parseInt(storedFontSize));
    } catch (error) {
      console.warn('Error loading reading preferences:', error);
    }
  };

  // Save reading preferences to AsyncStorage
  const saveReadingPreferences = async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.warn('Error saving reading preferences:', error);
    }
  };

  // Cycle through theme modes
  const cycleTheme = () => {
    const themes: ThemeMode[] = ['light', 'dark', 'sepia'];
    const currentIndex = themes.indexOf(themeMode);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];

    setThemeMode(nextTheme);
    saveReadingPreferences('readingTheme', nextTheme);
  };

  // Get theme icon based on current mode
  const getThemeIcon = () => {
    switch (themeMode) {
      case 'light': return 'sunny';
      case 'dark': return 'moon';
      case 'sepia': return 'partly-sunny';
      default: return 'sunny';
    }
  };

  // Handle font size changes
  const adjustFontSize = (delta: number) => {
    const newFontSize = Math.max(12, Math.min(24, fontSize + delta));
    setFontSize(newFontSize);
    saveReadingPreferences('readingFontSize', newFontSize.toString());
  };



  // Cache images and replace URLs with local file:// URLs
  const cacheImagesAndReplaceUrls = async (html: string): Promise<string> => {
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      // In offline mode, just use cached image URLs
      return html;
    }

    let processedHtml = html;
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const images: string[] = [];
    let match;

    // Extract all image URLs
    while ((match = imgRegex.exec(html)) !== null) {
      const imgUrl = match[1];
      if (imgUrl && !imgUrl.startsWith('data:') && !imgUrl.startsWith('file://')) {
        images.push(imgUrl);
      }
    }

    // Cache images and replace URLs
    for (const imgUrl of images) {
      try {
        const isCached = await cacheManager.isCached(imgUrl);
        if (!isCached) {
          console.log('🖼️ CACHING IMAGE', { imgUrl });
          // Cache the image in background
          cacheManager.cacheImage(imgUrl).catch(error => {
            console.warn('❌ Failed to cache image:', imgUrl, error);
          });
        } else {
          if (__DEV__) {
            console.log('✅ USING CACHED IMAGE', { imgUrl });
          }
          // Replace URL with cached version
          const cachedContent = await cacheManager.getCachedContent(imgUrl);
          if (cachedContent) {
            const fileUrl = `file://${cachedContent.localPath}`;
            processedHtml = processedHtml.replace(
              new RegExp(imgUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              fileUrl
            );
            console.log('🔗 REPLACED IMAGE URL', {
              original: imgUrl,
              cached: fileUrl,
              localPath: cachedContent.localPath,
            });
          }
        }
      } catch (error) {
        console.warn('Error processing image:', imgUrl, error);
      }
    }

    return processedHtml;
  };

  // Comprehensive cache logging function
  const logCacheStats = async (context: string = '') => {
    try {
      const stats = await cacheManager.getCacheStats();
      const isCurrentEmailCached = await cacheManager.isCached(`/messages/${messageId}`);

      if (__DEV__) {
        console.log(`📊 CACHE STATS [${context}]`, {
          totalSize: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
          entryCount: stats.entryCount,
          htmlFiles: stats.htmlCount,
          imageFiles: stats.imageCount,
          currentEmailCached: isCurrentEmailCached,
          networkConnected: networkState.isConnected,
          internetReachable: networkState.isInternetReachable,
          connectionType: networkState.type,
        });
      }

      // Log cache metadata for current email if cached
      if (isCurrentEmailCached) {
        const cacheKey = `/messages/${messageId}`;
        const cachedContent = await cacheManager.getCachedContent(cacheKey);
        // Get metadata directly from cacheManager since getCachedContent doesn't return it
        try {
          const metadata = JSON.parse(await AsyncStorage.getItem('cache_metadata') || '{}');
          const meta = metadata[cacheKey];
          if (cachedContent && meta) {
            console.log(`📧 CURRENT EMAIL CACHE DETAILS [${context}]`, {
              cacheKey,
              localPath: cachedContent.localPath,
              cachedAt: new Date(meta.timestamp).toISOString(),
              size: `${(meta.size / 1024).toFixed(2)} KB`,
              isCompressed: meta.gzip || false,
            });
          }
        } catch (error) {
          console.warn('Error reading cache metadata:', error);
        }
      }
    } catch (error) {
      console.warn('Error logging cache stats:', error);
    }
  };

  // Function to wrap HTML in a complete HTML document if needed
  // Get theme styles based on current theme mode
  const getThemeStyles = () => {
    switch (themeMode) {
      case 'dark':
        return `
          body, body *, div, p, span, h1, h2, h3, h4, h5, h6, td, th, table, li, ul, ol, blockquote {
            color: #e2e8f0 !important;
            background-color: #1a202c !important;
          }
          a, a * {
            color: #63b3ed !important;
            background-color: transparent !important;
          }
          /* Override common newsletter styles */
          [style*="color"], [style*="background"], [style*="background-color"] {
            background-color: #1a202c !important;
          }
          [style*="color"] {
            color: #e2e8f0 !important;
          }
        `;
      case 'sepia':
        return `
          body, body *, div, p, span, h1, h2, h3, h4, h5, h6, td, th, table, li, ul, ol, blockquote {
            color: #5c4b37 !important;
            background-color: #f4ecd8 !important;
          }
          a, a * {
            color: #8b4513 !important;
            background-color: transparent !important;
          }
          /* Override common newsletter styles */
          [style*="color"], [style*="background"], [style*="background-color"] {
            background-color: #f4ecd8 !important;
          }
          [style*="color"] {
            color: #5c4b37 !important;
          }
        `;
      default: // light
        return `
          body, body *, div, p, span, h1, h2, h3, h4, h5, h6, td, th, table, li, ul, ol, blockquote {
            color: #1a202c !important;
            background-color: #ffffff !important;
          }
          a, a * {
            color: #4a90e2 !important;
            background-color: transparent !important;
          }
          /* Override common newsletter styles */
          [style*="color"], [style*="background"], [style*="background-color"] {
            background-color: #ffffff !important;
          }
          [style*="color"] {
            color: #1a202c !important;
          }
        `;
    }
  };

  const ensureCompleteHtml = (html: string) => {
    if (html.includes('<html>')) {
      return html;
    }

    const mobileCss = `
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 16px;
          line-height: 1.6;
          transition: all 0.3s ease;
        }
        img {
          max-width: 100%;
          height: auto;
        }
        a {
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        td, th {
          padding: 8px;
        }
      </style>
    `;

    // Wrap in complete HTML document
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          ${injectViewportMeta('')}
          ${mobileCss}
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;
  };

    // Load reading preferences on mount
  useEffect(() => {
    if (__DEV__) {
      console.log('📱 DetailScreen mounted', { messageId });
    }
    loadReadingPreferences();
    // Log initial cache state
    logCacheStats('SCREEN_MOUNT');
  }, []);

  // Fetch message data
  useEffect(() => {
    const fetchMessage = async () => {
      try {
        setLoading(true);

        // Log initial cache state
        await logCacheStats('FETCH_START');

        // Check for cached HTML first
        const cacheKey = `/messages/${messageId}`;
        const cachedContent = await cacheManager.getCachedContent(cacheKey);

        if (cachedContent) {
          if (__DEV__) {
            console.log('🎯 FOUND CACHED CONTENT', {
              cacheKey,
              hasContent: true,
              contentLength: cachedContent.content.length,
            });
          }
          setCachedHtml(cachedContent.content);
        } else {
          if (__DEV__) {
            console.log('❌ NO CACHED CONTENT FOUND', { cacheKey });
          }
        }

        // Always try to fetch from API (will handle network errors gracefully)
        try {
          const response = await apiClient.get<Message>(`/api/messages/${messageId}`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
          });
          const msg = response.data;
          setMessage(msg);

          // Cache the HTML content for offline use
          if (msg.body_html) {
            console.log('💾 CACHING HTML CONTENT', {
              cacheKey,
              contentLength: msg.body_html.length,
              compressed: true,
            });
            await cacheManager.cacheHtml(cacheKey, msg.body_html, true);
            setCachedHtml(msg.body_html); // Update with fresh content

            // Log cache state after caching
            await logCacheStats('AFTER_CACHE');
          }

          // Mark as read if it isn't already
          if (!msg.is_read) {
            try {
              await apiClient.post(`/api/messages/${messageId}/read`, {}, {
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
              });
            } catch {}
            // Optimistically update local cache
            setMessages(curr => curr.map(m => (m.id === messageId ? { ...m, is_read: true } : m)));
          }
        } catch (apiError) {
          // If API fails but we have cached content, use it
          if (cachedContent) {
            if (__DEV__) {
              console.log('🔄 USING CACHED CONTENT DUE TO API ERROR', {
                cacheKey,
                error: (apiError as Error).message,
                cachedContentLength: cachedContent.content.length,
                hasFallback: true,
              });
            }

            // Use cached content for offline mode - don't set error since we have content
            setMessage({ id: messageId, body_html: cachedContent.content, is_read: false } as Message);
            setCachedHtml(cachedContent.content);
            // Don't set error state when we successfully fall back to cache

            await logCacheStats('OFFLINE_MODE');
          } else {
            console.log('❌ NO CACHED CONTENT AVAILABLE, API FAILED', {
              cacheKey,
              error: (apiError as Error).message,
            });
            // Only set error when we have no cached content AND API failed
            setError(apiError as Error);
          }
        }
      } catch (e) {
        setError(e as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessage();
  }, [messageId]);



  // Set up navigation header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: '',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={cycleTheme}
            style={{ padding: 8, marginRight: 8 }}
          >
            <Ionicons name={getThemeIcon()} size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={{ padding: 8 }}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
      headerLeft: () => null, // Remove default back button if needed
      headerStyle: {
        backgroundColor: colors.card,
        shadowColor: 'transparent', // Remove shadow
        elevation: 0, // Remove elevation on Android
      },
    });
  }, [navigation, colors, themeMode]);



  // Process HTML when content changes
  useEffect(() => {
    const processHtml = async () => {
      const htmlToProcess = cachedHtml || message?.body_html || '';
      // Only log in development and keep it minimal
      if (__DEV__) {
        console.log('🔧 PROCESSING HTML', {
          hasCachedHtml: !!cachedHtml,
          hasMessageBody: !!message?.body_html,
          contentLength: htmlToProcess.length,
          usingCache: !!cachedHtml,
        });
      }

      if (htmlToProcess) {
        try {
          const html = ensureCompleteHtml(htmlToProcess); // Remove await since it's synchronous
          if (__DEV__) {
            console.log('✅ HTML PROCESSED SUCCESSFULLY', {
              originalLength: htmlToProcess.length,
              processedLength: html.length,
              addedWrapper: !htmlToProcess.includes('<html>'),
            });
          }
          setProcessedHtml(html);
        } catch (error) {
          console.warn('❌ Error processing HTML:', error);
          setProcessedHtml('<html><body><p>Error processing content</p></body></html>');
        }
      } else {
        if (__DEV__) {
          console.log('⚠️ NO HTML CONTENT TO PROCESS');
        }
        setProcessedHtml('<html><body><p>No content available</p></body></html>');
      }
    };
    processHtml();
  }, [cachedHtml, message?.body_html]);

  // Apply theme dynamically when theme or font size changes
  useEffect(() => {
    if (webViewRef.current && processedHtml !== '<html><body><p>Loading...</p></body></html>') {
      const applyTheme = () => {
        const themeStyles = getThemeStyles();
        const fontStyles = `
          body { font-size: ${fontSize}px !important; }
          ${themeStyles}
        `;

        webViewRef.current?.injectJavaScript(`
          (function() {
            var style = document.getElementById('dynamic-theme-styles');
            if (!style) {
              style = document.createElement('style');
              style.id = 'dynamic-theme-styles';
              document.head.appendChild(style);
            }
            style.textContent = \`${fontStyles}\`;
          })();
        `);
      };

      // Small delay to ensure WebView is ready
      setTimeout(applyTheme, 100);
    }
  }, [themeMode, fontSize, processedHtml]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !message) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.text }}>Error loading message.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Handle menu actions
  const handleMenuAction = async (action: string) => {
    setMenuVisible(false);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    switch (action) {
      case 'mark_read':
        setMessages(curr => curr.map(m => m.id === messageId ? { ...m, is_read: !m.is_read } : m));
        if (message?.is_read) {
          await apiClient.post(`/api/messages/${messageId}/unread`, {}, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
          });
        } else {
          await apiClient.post(`/api/messages/${messageId}/read`, {}, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
          });
        }
        break;
      case 'save':
        setMessages(curr => curr.map(m => m.id === messageId ? { ...m, is_saved: !m.is_saved } : m));
        break;
      case 'delete':
        Alert.alert(
          'Delete Message',
          'Are you sure you want to delete this message?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                setMessages(curr => curr.filter(m => m.id !== messageId));
              }
            }
          ]
        );
        break;
      case 'font_increase':
        adjustFontSize(2);
        break;
      case 'font_decrease':
        adjustFontSize(-2);
        break;


    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>

      <WebView
        ref={webViewRef}
        source={{ html: processedHtml }}
        style={{ flex: 1 }}
        scalesPageToFit={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        onNavigationStateChange={(navState) => {
          // Handle external links by opening them in the system browser
          if (navState.url !== 'about:blank' && navState.url !== 'data:text/html,' && !navState.url.includes('data:text/html')) {
            // This is an external link - you could open it with Linking.openURL(navState.url)
            // For now, we'll just log it
            console.log('External link clicked:', navState.url);
          }
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error: ', nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView HTTP error: ', nativeEvent.statusCode);
        }}
        onLoadEnd={() => {
          // WebView has finished loading
          const cacheStatus = cachedHtml ? 'CACHED' : 'FRESH';
          console.log(`🌐 WebView loaded successfully [${cacheStatus}]`, {
            emailId: messageId,
            networkConnected: networkState.isConnected,
            hasCachedContent: !!cachedHtml,
            cacheUsed: cacheStatus === 'CACHED',
          });
          // Log final cache stats
          logCacheStats('WEBVIEW_LOADED');
        }}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        decelerationRate="normal"
        bounces={true}
      />

      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.15)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={{
            backgroundColor: colors.card,
            margin: 16,
            borderRadius: 8,
            paddingVertical: 16,
            paddingHorizontal: 8,
            minWidth: 280,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}>
            {/* Mark as Read/Unread */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 16,
              }}
              onPress={() => handleMenuAction('mark_read')}
            >
              <Ionicons
                name={message?.is_read ? 'mail-unread' : 'mail'}
                size={18}
                color="#111827"
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: '#111827', fontSize: 16 }}>
                {message?.is_read ? 'Mark as unread' : 'Mark as read'}
              </Text>
            </TouchableOpacity>

            {/* Save/Unsave */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 16,
              }}
              onPress={() => handleMenuAction('save')}
            >
              <Ionicons
                name={message?.is_saved ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color="#111827"
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: '#111827', fontSize: 16 }}>Save</Text>
            </TouchableOpacity>

            {/* Font Size Controls */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 8,
            }}>
              <Ionicons name="text" size={18} color="#111827" style={{ marginRight: 8 }} />
              <Text style={{ color: '#111827', fontSize: 16, flex: 1 }}>Font Size</Text>
              <TouchableOpacity
                onPress={() => handleMenuAction('font_decrease')}
                style={{ padding: 4 }}
              >
                <Ionicons name="remove-circle" size={20} color="#6B7280" />
              </TouchableOpacity>
              <Text style={{ color: '#111827', fontSize: 16, marginHorizontal: 8 }}>{fontSize}px</Text>
              <TouchableOpacity
                onPress={() => handleMenuAction('font_increase')}
                style={{ padding: 4 }}
              >
                <Ionicons name="add-circle" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>





            {/* Delete */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 16,
              }}
              onPress={() => handleMenuAction('delete')}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
              <Text style={{ color: '#DC2626', fontSize: 16 }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default DetailScreen; 