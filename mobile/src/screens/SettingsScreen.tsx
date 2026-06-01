import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  TextInput,
  SafeAreaView,
  Linking,
} from 'react-native';
import { useTheme } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SettingsScreenProps } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import cacheManager from '../services/cacheManager';
import {
  getNotificationSettings as getLocalNotificationSettings,
  saveNotificationSettings,
  NotificationFrequency,
  NotificationSettings
} from '../services/notifications';
import { syncNotificationSettings as syncBackendNotificationSettings, addTestSender, debugNotifications, sendTestNotification } from '../api/client';

// Create theme colors that match the navigation theme structure
const themeColors = {
  primary: '#4A90E2',
  background: '#F4F6F8',
  card: '#FFFFFF',
  text: '#1A202C',
  border: '#E2E8F0',
};

// Navigation helper to add ConnectedMailboxesScreen
// This will need to be added to the navigation types and stack navigator

type ThemeMode = 'system' | 'dark' | 'sepia';
type ReadingMode = 'list' | 'summary';
type ImageLoadingMode = 'always' | 'wifi_only' | 'never';
// Using NotificationFrequency from the notifications service

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const { colors } = useTheme();
  // Alias the LIVE navigation theme over the module-level (light-only)
  // `themeColors` constant for everything rendered here, so the screen follows
  // light/dark mode. (The StyleSheet below still uses the static constant for
  // structural defaults; key surfaces are overridden inline with these.)
  const themeColors = colors;
  const { logout, authToken } = useAuth();

  // Settings state
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [fontSize, setFontSize] = useState(16);
  const [readingMode, setReadingMode] = useState<ReadingMode>('list');
  const [imageLoading, setImageLoading] = useState<ImageLoadingMode>('always');

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    pushNotifications: true,
    notificationSound: true,
    notificationFrequency: 'immediate',
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  });

  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [cacheSizeLimit, setCacheSizeLimit] = useState(100);
  const [cacheExpiryDays, setCacheExpiryDays] = useState(30);

  // UI state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<string>('');
  const [tempValue, setTempValue] = useState('');

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load general settings
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        setTheme(parsed.theme || 'system');
        setFontSize(parsed.fontSize || 16);
        setReadingMode(parsed.readingMode || 'list');
        setImageLoading(parsed.imageLoading || 'always');
        setAnalyticsEnabled(parsed.analyticsEnabled !== false);
        setCacheSizeLimit(parsed.cacheSizeLimit || 100);
        setCacheExpiryDays(parsed.cacheExpiryDays || 30);
      }

      // Load notification settings
      const notificationSettingsData = await getLocalNotificationSettings();
      setNotificationSettings(notificationSettingsData);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSetting = async (key: string, value: any) => {
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const parsed = settings ? JSON.parse(settings) : {};
      parsed[key] = value;
      await AsyncStorage.setItem('userSettings', JSON.stringify(parsed));
    } catch (error) {
      console.error('Error saving setting:', error);
    }
  };

  const saveNotificationSetting = async (key: keyof NotificationSettings, value: any) => {
    try {
      const updatedSettings = { ...notificationSettings, [key]: value };
      setNotificationSettings(updatedSettings);

      // Save to local storage
      await saveNotificationSettings({ [key]: value });

      // Sync with backend if authenticated
      if (authToken) {
        try {
          await syncBackendNotificationSettings(updatedSettings);
        } catch (error) {
          console.error('Error syncing notification settings to backend:', error);
        }
      }
    } catch (error) {
      console.error('Error saving notification setting:', error);
    }
  };

  const openModal = (type: string, currentValue: string) => {
    setModalType(type);
    setTempValue(currentValue);
    setModalVisible(true);
  };

  const handleModalSave = () => {
    switch (modalType) {
      case 'fontSize':
        const newFontSize = Math.max(12, Math.min(24, parseInt(tempValue) || 16));
        setFontSize(newFontSize);
        saveSetting('fontSize', newFontSize);
        break;
      case 'cacheSizeLimit':
        const newCacheSize = Math.max(10, Math.min(500, parseInt(tempValue) || 100));
        setCacheSizeLimit(newCacheSize);
        saveSetting('cacheSizeLimit', newCacheSize);
        break;
      case 'cacheExpiryDays':
        const newExpiry = Math.max(1, Math.min(365, parseInt(tempValue) || 30));
        setCacheExpiryDays(newExpiry);
        saveSetting('cacheExpiryDays', newExpiry);
        break;
    }
    setModalVisible(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleConnectedMailboxes = () => {
    navigation.navigate('ConnectedMailboxes');
  };

  const cycleTheme = () => {
    const themeOrder: ThemeMode[] = ['system', 'dark', 'sepia'];
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    const nextTheme = themeOrder[nextIndex];
    setTheme(nextTheme);
    saveSetting('theme', nextTheme);
  };

  const toggleReadingMode = () => {
    const nextMode = readingMode === 'list' ? 'summary' : 'list';
    setReadingMode(nextMode);
    saveSetting('readingMode', nextMode);
  };

  const handleAddTestSender = async () => {
    try {
      await addTestSender();
      Alert.alert(
        'Test Sender Added',
        'Test sender "Test User" with email "siddharth.daswani7@gmail.com" has been added to your subscriptions. You can now send an email from that account to test notifications.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to add test sender. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleDebugNotifications = async () => {
    try {
      const debugInfo = await debugNotifications();
      Alert.alert(
        'Notification Debug Info',
        `Test Sender: ${debugInfo.testSender ? '✅ Found' : '❌ Not Found'}\n` +
        `Subscription: ${debugInfo.subscription ? '✅ Active' : '❌ Not Active'}\n` +
        `Devices: ${debugInfo.devices?.length || 0} registered\n` +
        `Notifications: ${debugInfo.userSettings?.push_notifications_enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Firebase: ${debugInfo.firebaseConfigured ? '✅ Configured' : '❌ Not Configured'}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to debug notifications. Check console for details.',
        [{ text: 'OK' }]
      );
    }
  };

  const cycleImageLoading = () => {
    const loadingOrder: ImageLoadingMode[] = ['always', 'wifi_only', 'never'];
    const currentIndex = loadingOrder.indexOf(imageLoading);
    const nextIndex = (currentIndex + 1) % loadingOrder.length;
    const nextLoading = loadingOrder[nextIndex];
    setImageLoading(nextLoading);
    saveSetting('imageLoading', nextLoading);
  };

  const handleResetApp = () => {
    Alert.alert(
      'Reset App',
      'This will reset all settings to default and clear all cached data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            await cacheManager.clearAllCache();
            // Reset all state to defaults
            setTheme('system');
            setFontSize(16);
            setReadingMode('list');
            setImageLoading('always');

            // Reset notification settings
            const defaultNotificationSettings: NotificationSettings = {
              pushNotifications: true,
              notificationSound: true,
              notificationFrequency: 'immediate',
              quietHoursEnabled: false,
              quietHoursStart: '22:00',
              quietHoursEnd: '08:00',
            };
            setNotificationSettings(defaultNotificationSettings);
            await saveNotificationSettings(defaultNotificationSettings);

            setAnalyticsEnabled(true);
            setCacheSizeLimit(100);
            setCacheExpiryDays(30);
          },
        },
      ]
    );
  };

  const handleExportData = async () => {
    try {
      // Get all stored data
      const settings = await AsyncStorage.getItem('userSettings') || '{}';
      const cacheStats = await cacheManager.getCacheStats();

      const exportData = {
        settings: JSON.parse(settings),
        cacheStats,
        exportDate: new Date().toISOString(),
        appVersion: '1.0.0',
      };

      // Save to Downloads directory
      const fileUri = `${FileSystem.documentDirectory}newsletter_reader_export_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(exportData, null, 2));

      Alert.alert('Export Complete', `Data exported to: ${fileUri}`);
    } catch (error) {
      Alert.alert('Export Failed', 'Could not export data');
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will delete all cached content including offline articles and images.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            await cacheManager.clearAllCache();
            Alert.alert('Cache Cleared', 'All cached data has been removed.');
          },
        },
      ]
    );
  };

  const handleTestNotification = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await sendTestNotification();
      if (result.success) {
        Alert.alert('Success', result.details || 'Test notification sent!');
      } else {
        Alert.alert('Error', result.error || 'Failed to send test notification');
      }
    } catch (error) {
      console.error('Test notification error:', error);
      Alert.alert('Error', 'Failed to send test notification. Check your connection.');
    }
  }, []);

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: themeColors.card }]}>
        {children}
      </View>
    </View>
  );

  const renderSettingItem = (
    title: string,
    subtitle: string | null,
    rightElement: React.ReactNode,
    onPress?: () => void,
    showChevron = false
  ) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.settingLeft}>
        <Text style={[styles.settingTitle, { color: colors.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.settingSubtitle, { color: colors.text, opacity: 0.7 }]}>{subtitle}</Text>
        )}
      </View>
      <View style={styles.settingRight}>
        {rightElement}
        {showChevron && (
          <Ionicons name="chevron-forward" size={16} color={colors.text} style={{ marginLeft: 8 }} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Account & Profile */}
        {renderSection('Account & Profile', (
          <>
            {renderSettingItem(
              'Connected Mailboxes',
              'Manage your email accounts and preferences',
              null,
              handleConnectedMailboxes,
              true
            )}
            <TouchableOpacity
              style={[styles.settingItem, styles.logoutButton]}
              onPress={handleLogout}
            >
              <Text style={[styles.logoutText, { color: '#E53E3E' }]}>Logout</Text>
            </TouchableOpacity>
          </>
        ))}

        {/* Appearance & Display */}
        {renderSection('Appearance & Display', (
          <>
            {renderSettingItem(
              'Default Theme',
              'Choose your preferred theme',
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </Text>,
              cycleTheme
            )}

            {renderSettingItem(
              'Font Size',
              'Adjust text size for better readability',
              <Text style={[styles.valueText, { color: themeColors.text }]}>{fontSize}px</Text>,
              () => openModal('fontSize', fontSize.toString())
            )}

            {renderSettingItem(
              'Default Reading Mode',
              'Choose how to view newsletters',
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {readingMode.charAt(0).toUpperCase() + readingMode.slice(1)}
              </Text>,
              toggleReadingMode
            )}

            {renderSettingItem(
              'Image Loading',
              'When to download images automatically',
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {imageLoading === 'wifi_only' ? 'WiFi Only' : imageLoading.charAt(0).toUpperCase() + imageLoading.slice(1)}
              </Text>,
              cycleImageLoading
            )}
          </>
        ))}

        {/* Notifications */}
        {renderSection('Notifications', (
          <>
            {renderSettingItem(
              'Push Notifications',
              'Receive notifications for new newsletters',
              <Switch
                value={notificationSettings.pushNotifications}
                onValueChange={(value) => saveNotificationSetting('pushNotifications', value)}
                trackColor={{ false: '#767577', true: themeColors.primary }}
                thumbColor={notificationSettings.pushNotifications ? themeColors.card : '#f4f3f4'}
              />
            )}

            {renderSettingItem(
              'Notification Sound',
              'Play sound with notifications',
              <Switch
                value={notificationSettings.notificationSound}
                onValueChange={(value) => saveNotificationSetting('notificationSound', value)}
                trackColor={{ false: '#767577', true: themeColors.primary }}
                thumbColor={notificationSettings.notificationSound ? themeColors.card : '#f4f3f4'}
              />
            )}

            {renderSettingItem(
              'Notification Frequency',
              'How often to send notifications',
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {notificationSettings.notificationFrequency.charAt(0).toUpperCase() + notificationSettings.notificationFrequency.slice(1)}
              </Text>,
              () => {
                const frequencyOrder: NotificationFrequency[] = ['immediate', 'hourly', 'daily', 'weekly'];
                const currentIndex = frequencyOrder.indexOf(notificationSettings.notificationFrequency);
                const nextIndex = (currentIndex + 1) % frequencyOrder.length;
                const nextFrequency = frequencyOrder[nextIndex];
                saveNotificationSetting('notificationFrequency', nextFrequency);
              }
            )}

            {renderSettingItem(
              'Quiet Hours',
              'Disable notifications during specific times',
              <Switch
                value={notificationSettings.quietHoursEnabled}
                onValueChange={(value) => saveNotificationSetting('quietHoursEnabled', value)}
                trackColor={{ false: '#767577', true: themeColors.primary }}
                thumbColor={notificationSettings.quietHoursEnabled ? themeColors.card : '#f4f3f4'}
              />
            )}

            {notificationSettings.quietHoursEnabled && (
              <>
                {renderSettingItem(
                  'Quiet Hours Start',
                  'Start time for quiet hours',
                  <Text style={[styles.valueText, { color: themeColors.text }]}>
                    {notificationSettings.quietHoursStart}
                  </Text>
                )}

                {renderSettingItem(
                  'Quiet Hours End',
                  'End time for quiet hours',
                  <Text style={[styles.valueText, { color: themeColors.text }]}>
                    {notificationSettings.quietHoursEnd}
                  </Text>
                )}
              </>
            )}
          </>
        ))}

        {/* Data & Storage */}
        {renderSection('Data & Storage', (
          <>
            {renderSettingItem(
              'Cache Size Limit',
              'Maximum storage for cached content',
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {cacheSizeLimit} MB
              </Text>,
              () => openModal('cacheSizeLimit', cacheSizeLimit.toString())
            )}

            {renderSettingItem(
              'Cache Expiry',
              'How long to keep cached content',
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {cacheExpiryDays} days
              </Text>,
              () => openModal('cacheExpiryDays', cacheExpiryDays.toString())
            )}

            <TouchableOpacity
              style={[styles.settingItem, styles.destructiveButton]}
              onPress={handleClearCache}
            >
              <Text style={[styles.destructiveText, { color: '#E53E3E' }]}>
                Clear All Cache
              </Text>
            </TouchableOpacity>
          </>
        ))}

        {/* Privacy & Security */}
        {renderSection('Privacy & Security', (
          <>
            {renderSettingItem(
              'Analytics',
              'Help improve the app by sharing usage data',
              <Switch
                value={analyticsEnabled}
                onValueChange={(value) => {
                  setAnalyticsEnabled(value);
                  saveSetting('analyticsEnabled', value);
                }}
                trackColor={{ false: '#767577', true: themeColors.primary }}
                thumbColor={analyticsEnabled ? themeColors.card : '#f4f3f4'}
              />
            )}

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => Linking.openURL('https://sid-design.github.io/The-Postbox/privacy.html')}
            >
              <View style={styles.settingLeft}>
                <Text style={[styles.settingTitle, { color: themeColors.text }]}>
                  Privacy Policy
                </Text>
                <Text style={[styles.settingSubtitle, { color: themeColors.text, opacity: 0.7 }]}>
                  Learn how we protect your data
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.text} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </>
        ))}

        {/* About & Support */}
        {renderSection('About & Support', (
          <>
            <View style={styles.aboutItem}>
              <Text style={[styles.aboutLabel, { color: themeColors.text }]}>Version</Text>
              <Text style={[styles.aboutValue, { color: themeColors.text, opacity: 0.7 }]}>1.0.0</Text>
            </View>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => Linking.openURL('mailto:siddharth.daswani7@gmail.com?subject=The%20Postbox%20Support')}
            >
              <View style={styles.settingLeft}>
                <Text style={[styles.settingTitle, { color: themeColors.text }]}>
                  Contact Support
                </Text>
                <Text style={[styles.settingSubtitle, { color: themeColors.text, opacity: 0.7 }]}>
                  Get help with the app
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.text} style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => Linking.openURL('https://sid-design.github.io/The-Postbox/terms.html')}
            >
              <View style={styles.settingLeft}>
                <Text style={[styles.settingTitle, { color: themeColors.text }]}>
                  Terms of Service
                </Text>
                <Text style={[styles.settingSubtitle, { color: themeColors.text, opacity: 0.7 }]}>
                  Read our terms and conditions
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.text} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </>
        ))}

        {/* Advanced Settings */}
        {renderSection('Advanced Settings', (
          <>
            {renderSettingItem(
              'Export Data',
              'Export subscriptions and saved messages',
              <Ionicons name="chevron-forward" size={16} color={colors.text} style={{ marginLeft: 8 }} />,
              handleExportData
            )}

            {renderSettingItem(
              'Import Settings',
              'Import settings from backup',
              <Ionicons name="chevron-forward" size={16} color={colors.text} style={{ marginLeft: 8 }} />,
              () => Alert.alert('Import', 'Import functionality coming soon')
            )}

            {/* Dev/test-only tools — hidden in production builds */}
            {__DEV__ && renderSettingItem(
              'Add Test Sender',
              'Add test sender for notification testing',
              <Ionicons name="chevron-forward" size={16} color={colors.text} style={{ marginLeft: 8 }} />,
              handleAddTestSender
            )}

            {__DEV__ && renderSettingItem(
              'Debug Notifications',
              'Check notification setup status',
              <Ionicons name="chevron-forward" size={16} color={colors.text} style={{ marginLeft: 8 }} />,
              handleDebugNotifications
            )}

            {/* Test Notification Button (dev only) */}
            {__DEV__ && (
              <TouchableOpacity
                style={[styles.settingItem, styles.advancedButton]}
                onPress={handleTestNotification}
              >
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>
                    Test Notification
                  </Text>
                  <Text style={[styles.settingSubtitle, { color: colors.text, opacity: 0.7 }]}>
                    Send a test notification to your device
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.text} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            )}

            {renderSettingItem(
              'Reset App',
              'Reset all settings to default and clear all cached data',
              <Ionicons name="chevron-forward" size={16} color={colors.text} style={{ marginLeft: 8 }} />,
              handleResetApp
            )}
          </>
        ))}

        <View style={styles.bottomSpacer} />
      </ScrollView>

            {/* Modal for value input */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {modalType === 'fontSize' && 'Font Size'}
              {modalType === 'cacheSizeLimit' && 'Cache Size Limit (MB)'}
              {modalType === 'cacheExpiryDays' && 'Cache Expiry (Days)'}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={tempValue}
              onChangeText={setTempValue}
              keyboardType="numeric"
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, styles.cancelButtonText]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleModalSave}
              >
                <Text style={[styles.modalButtonText, styles.saveButtonText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
    </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    marginLeft: 16,
    color: themeColors.text,
  },
  sectionContent: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  settingLeft: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
    color: themeColors.text,
  },
  settingSubtitle: {
    fontSize: 14,
    color: themeColors.text,
    opacity: 0.7,
  },
  settingRight: {
    marginLeft: 16,
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
    color: themeColors.text,
  },
  accountInfo: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  accountEmail: {
    fontSize: 16,
    fontWeight: '500',
    color: themeColors.text,
  },
  logoutButton: {
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#E53E3E',
  },
  destructiveButton: {
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  destructiveText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#E53E3E',
  },
  aboutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  aboutLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: themeColors.text,
  },
  aboutValue: {
    fontSize: 16,
    color: themeColors.text,
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    margin: 20,
    borderRadius: 12,
    padding: 20,
    minWidth: 300,
    backgroundColor: themeColors.card,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: themeColors.text,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
    color: themeColors.text,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#F7FAFC',
  },
  saveButton: {
    backgroundColor: themeColors.primary,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  cancelButtonText: {
    color: themeColors.text,
  },
  saveButtonText: {
    color: '#ffffff',
  },
  bottomSpacer: {
    height: 32,
  },
  advancedButton: {
    backgroundColor: '#3182CE',  // Blue color
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default SettingsScreen; 
