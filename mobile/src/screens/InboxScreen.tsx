import React, { useCallback, useEffect, useState, useMemo, useLayoutEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Button,
  TextInput,
  Alert,
  useWindowDimensions,
  Image,
  RefreshControl,
  Modal,
  PanResponder,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useMessages } from '../context/MessagesContext';
import { GroupsRow } from '../components/GroupsUI';
import { useGroups } from '../context/GroupsContext';
import { useSubscriptionChanges } from '../context/SubscriptionContext';
import { colors } from '../theme';
import { InboxScreenProps, Message } from '../navigation/types';
import { apiClient, debugAuth } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getSenders, getMessages, Sender, triggerBackfill } from '../api/client';
import * as Crypto from 'expo-crypto';

/**
 * Safely parses a variety of date representations coming from the backend.
 * - ISO strings (e.g. 2025-07-28T12:34:56.000Z)
 * - Epoch milliseconds as number or numeric string
 * Returns `null` if the value cannot be parsed.
 */
const parseDate = (value?: string | number | null) => {
  if (!value) return null;
  if (typeof value === 'number') {
    const millis = value < 1e12 ? value * 1000 : value;
    return new Date(millis);
  }
  if (/^\\d+$/.test(String(value))) {
    const num = Number(value);
    const millis = num < 1e12 ? num * 1000 : num;
    return new Date(millis);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

// Relative time helper used in summary metadata
function timeAgo(value?: string | number | null) {
  const d = parseDate(value);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  const w = Math.floor(days / 7);
  if (w < 4) return `${w}w`;
  const mo = Math.floor(days / 30);
  return `${mo}mo`;
}

type ItemProps = {
  message: Message;
  onPress: () => void;
};

const Item = ({ message, onPress, onOpenMoreOptions, onToggleRead, onToggleSave, onDelete, selectionMode, selected, onToggleSelect, queuedAction, queuedState, onEnterSelection, summaryMode }: ItemProps & { onOpenMoreOptions: () => void; onToggleRead: () => void; onToggleSave: () => void; onDelete: () => void; selectionMode: boolean; selected: boolean; onToggleSelect: () => void; queuedAction: 'read' | 'save' | 'delete' | null; queuedState: 'on' | 'off'; onEnterSelection: () => void; summaryMode: boolean; }) => {
  const { colors: themeColors } = useTheme();

  const renderLeftActions = () => (
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: '#4A5568' }]}
        disabled={summaryMode}
        onPress={async () => {
          try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          onOpenMoreOptions();
        }}
      >
        <MaterialCommunityIcons name="dots-horizontal" color="#fff" size={24} />
      </TouchableOpacity>
    <TouchableOpacity
      style={[styles.swipeAction, { backgroundColor: '#718096' }]}
      onPress={onToggleRead}
    >
      <Ionicons name={message.is_read ? 'mail-unread' : 'mail'} color="#fff" size={24} />
    </TouchableOpacity>
    </View>
  );

  const renderRightActions = () => (
    <View style={{ flexDirection: 'row' }}>
      {/* Only delete on left-swipe */}
    <TouchableOpacity
      style={[styles.swipeAction, { backgroundColor: '#E53E3E' }]}
      onPress={onDelete}
    >
        <MaterialCommunityIcons name="trash-can-outline" color="#fff" size={22} />
    </TouchableOpacity>
    </View>
  );


  const dateLabel = useMemo(() => {
    const d = parseDate(message.received_at);
    if (!d) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, [message.received_at]);

  const isVisuallyRead = message.is_read || (selectionMode && selected && queuedAction === 'read' && queuedState === 'on');
  const isVisuallySaved = message.is_saved || (selectionMode && selected && queuedAction === 'save' && queuedState === 'on');

  const unreadBadge = useMemo(() => {
    return !isVisuallyRead && (
      <View
        style={[styles.unreadBadge, { backgroundColor: themeColors.primary }]}
        testID="unread-badge"
      />
    );
  }, [isVisuallyRead, themeColors.primary]);

  return (
    <Swipeable renderLeftActions={renderLeftActions} renderRightActions={renderRightActions} enabled={!selectionMode && !summaryMode}>
      <TouchableOpacity
        onPress={selectionMode ? onToggleSelect : onPress}
        onLongPress={async () => {
          try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          onEnterSelection();
        }}
        delayLongPress={250}
        testID={`message-item-${message.id}`}
      >
        <View style={[
          styles.item,
          { backgroundColor: themeColors.card },
          selectionMode && selected && queuedAction === 'delete' && queuedState === 'on' ? { borderWidth: 2, borderColor: '#E53E3E' } : null
        ]}>
          {selectionMode ? (
            <View style={[styles.selectionBox, selected && styles.selectionBoxSelected]}>
              {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
          ) : null}
          {/* Content */}
          <View style={{ flex: 1 }}>
            <Text style={[styles.sender, { color: themeColors.text, fontSize: 18 }]}>{message.sender_name}</Text>
            <Text style={[styles.title, { color: themeColors.text, fontSize: 16 }]} numberOfLines={3}>{message.subject}</Text>
            {dateLabel ? (
              <Text style={styles.dateChip}>{dateLabel}</Text>
            ) : null}
            {message.snippet ? (
              <Text style={[styles.snippet, { color: themeColors.text }]} numberOfLines={1}>
                {message.snippet}
              </Text>
            ) : null}
          </View>
          {/* Inline bookmark at bottom-right (smaller icon) */}
          <TouchableOpacity onPress={onToggleSave} style={styles.bookmarkButton}>
            <Ionicons
              name={isVisuallySaved ? 'bookmark' : 'bookmark-outline'}
              size={16}
              color={themeColors.text}
            />
          </TouchableOpacity>
          {unreadBadge}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};


function stripHtml(html?: string) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Stronger sanitizer for email HTML → plain text
function sanitizeEmailHtmlToText(html?: string) {
  if (!html) return '';
  let out = html;

  // Remove whole blocks that leak raw CSS/JS
  out = out.replace(/<style[\s\S]*?<\/style>/gi, ' ')
           .replace(/<script[\s\S]*?<\/script>/gi, ' ')
           .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
           .replace(/<head[\s\S]*?<\/head>/gi, ' ');

  // Remove hidden sections
  out = out.replace(/<([a-z0-9]+)([^>]*?)(style="[^"]*display\s*:\s*none[^"]*"|hidden|aria-hidden="true")[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  // Keep link text but drop link tags
  out = out.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // Strip the remaining tags
  out = stripHtml(out);

  // Decode common entities and normalize spaces
  out = out.replace(/&nbsp;/g, ' ')
           .replace(/&amp;/g, '&')
           .replace(/&lt;/g, '<')
           .replace(/&gt;/g, '>')
           .replace(/&#39;/g, "'")
           .replace(/&quot;/g, '"')
           .replace(/\s+/g, ' ')
           .trim();

  return out;
}

function generateLocalSummary(m: Message) {
  const base = (m.snippet && m.snippet.trim())
    ? m.snippet.trim()
    : sanitizeEmailHtmlToText(m.body_html);
  if (!base) return 'No preview available.';
  const parts = (base || '').split(/(?<=[.!?])\s+/).slice(0, 6);
  const text = parts.join(' ');
  return text.length > 700 ? text.slice(0, 697) + '…' : text;
}

function extractBestImageSrc(html?: string): string | null {
  if (!html) return null;
  
  // Priority 1: Images with newsletter/header/logo keywords in class, alt, or title
  const headerMatch = html.match(/<img[^>]*(?:class|alt|title)="[^"]*(?:header|logo|brand|newsletter|banner|hero)[^"]*"[^>]*src=["']([^"']+)["']/i);
  if (headerMatch && isGoodImage(headerMatch[1])) return headerMatch[1];
  
  // Priority 2: Large images (width > 300px or height > 200px)
  const allImageMatches = html.matchAll(/<img[^>]*>/gi);
  const largeImages: string[] = [];
  
  for (const match of allImageMatches) {
    const imgTag = match[0];
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    const widthMatch = imgTag.match(/width=["']?([0-9]+)/i);
    const heightMatch = imgTag.match(/height=["']?([0-9]+)/i);
    
    if (srcMatch && isGoodImage(srcMatch[1])) {
      const width = widthMatch ? parseInt(widthMatch[1]) : 0;
      const height = heightMatch ? parseInt(heightMatch[1]) : 0;
      
      if (width > 300 || height > 200) {
        largeImages.push(srcMatch[1]);
      }
    }
  }
  
  if (largeImages.length > 0) return largeImages[0];
  
  // Priority 3: First valid image (current behavior)
  const firstImageMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (firstImageMatch && isGoodImage(firstImageMatch[1])) {
    return firstImageMatch[1];
  }
  
  return null;
}

// Helper function to filter out tracking pixels and unwanted images
function isGoodImage(src: string): boolean {
  if (!src) return false;
  
  // Filter out obvious tracking pixels and analytics
  const trackingPatterns = [
    /pixel/i,
    /track/i,
    /analytics/i,
    /beacon/i,
    /1x1/i,
    /transparent/i
  ];
  
  for (const pattern of trackingPatterns) {
    if (pattern.test(src)) return false;
  }
  
  // Filter out very small images (likely icons or spacers)
  const smallImagePatterns = [
    /spacer/i,
    /divider/i,
    /icon/i,
    /arrow/i
  ];
  
  for (const pattern of smallImagePatterns) {
    if (pattern.test(src)) return false;
  }
  
  // Filter out social media icons
  const socialPatterns = [
    /facebook/i,
    /twitter/i,
    /linkedin/i,
    /instagram/i,
    /youtube/i,
    /social/i
  ];
  
  for (const pattern of socialPatterns) {
    if (pattern.test(src)) return false;
  }
  
  return true;
}

// Format like "29th Aug 2025"
function formatDateOrdinal(value?: string | number | null) {
  const d = parseDate(value);
  if (!d) return '';
  const day = d.getDate();
  const suffix = (n: number) => {
    if (n % 10 === 1 && n % 100 !== 11) return 'st';
    if (n % 10 === 2 && n % 100 !== 12) return 'nd';
    if (n % 10 === 3 && n % 100 !== 13) return 'rd';
    return 'th';
  };
  const month = d.toLocaleString(undefined, { month: 'short' });
  const year = d.getFullYear();
  return `${day}${suffix(day)} ${month} ${year}`;
}

const InboxScreen = ({ navigation }: InboxScreenProps) => {
  const { colors: themeColors } = useTheme();
  const { messages, setMessages } = useMessages();
  const { height: windowHeight } = useWindowDimensions();
  const { selectedGroupId, groups } = useGroups();
  const { getChanges, clearChanges } = useSubscriptionChanges();
  const { authToken, logout, isFirstLogin, consumeFirstLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [searchText, setSearchText] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [queuedAction, setQueuedAction] = useState<'read' | 'save' | 'delete' | null>(null);
  const [queuedState, setQueuedState] = useState<'on' | 'off'>('on');
  const [summaryMode, setSummaryMode] = useState(false); // Disabled for MVP - always false
  const [searchOverlayVisible, setSearchOverlayVisible] = useState(false);
  const [searchOverlayQuery, setSearchOverlayQuery] = useState('');
  const [summaryHeaderHeight, setSummaryHeaderHeight] = useState(0);
  const [senders, setSenders] = useState<Sender[]>([]);
  // Cache for MD5 hashes to avoid recalculating
  const [avatarHashCache, setAvatarHashCache] = useState<Record<string, string>>({});
  // Track whether to show group rows based on scroll position
  const [showGroupRows, setShowGroupRows] = useState(true);
  const overlayPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: () => {},
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 80 && Math.abs(gestureState.vx) > 0.3) {
          setSearchOverlayVisible(false);
        }
      },
    })
  ).current;

  const unreadCount = useMemo(() => (messages || []).filter(m => !m.is_read).length, [messages]);

  // Configure header: left three-dots to enter selection, right search or Done, title search when not selecting
  const filteredMessages = useMemo(() => {
    // Unified selection: selectedGroupId can be 'all' | 'unread' | groupId
    let base = messages || [];
    if (selectedGroupId === 'unread') {
      base = base.filter(m => !m.is_read);
    } else if (selectedGroupId !== 'all') {
      const group = groups.find(g => g.id === selectedGroupId);
      if (group) {
        const allowedIds = new Set(group.subscriptionSenderIds || []);
        const allowedNames = new Set((group.subscriptionSenderNames || []).map(n => n.toLowerCase()));
        base = base.filter(m => {
          const sid = (m as any).sender_id as number | undefined;
          if (sid != null) return allowedIds.size === 0 ? true : allowedIds.has(sid);
          // fallback to name contains
          const name = (m.sender_name || '').toLowerCase();
          return allowedNames.size === 0 ? true : allowedNames.has(name);
        });
      }
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      base = base.filter(m =>
        m.subject.toLowerCase().includes(q) || m.sender_name.toLowerCase().includes(q)
      );
    }
    return base;
  }, [messages, searchText, selectedGroupId, groups]);

  // snapToOffsets removed - was only used for summary mode

  const handleApplyQueuedAction = useCallback(() => {
    if (selectedIds.size > 0 && queuedAction) {
      const ids = new Set(selectedIds);
      if (queuedAction === 'read') {
        const setTo = queuedState === 'on';
        setMessages(current => current.map(m => ids.has(m.id) ? { ...m, is_read: setTo ? (1 as any) : (0 as any) } : m));
      }
      if (queuedAction === 'save') {
        const setTo = queuedState === 'on';
        setMessages(current => current.map(m => ids.has(m.id) ? { ...m, is_saved: setTo } : m));
      }
      if (queuedAction === 'delete') {
        if (queuedState === 'on') {
          setMessages(current => current.filter(m => !ids.has(m.id)));
        }
      }
    }
    setSelectionMode(false);
    setSelectedIds(new Set());
    setQueuedAction(null);
    setQueuedState('on');
  }, [selectedIds, queuedAction, queuedState, setMessages]);

  // Body prefetching removed - was only used for summary mode

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => null,
      headerShadowVisible: false,
      headerLeft: () => (
        selectionMode ? (
          <TouchableOpacity
            onPress={() => {
              setSelectedIds(prev => {
                const all = new Set<number>(filteredMessages.map(m => m.id));
                // toggle: if everything already selected, clear; else select all
                const isAllSelected = all.size > 0 && [...all].every(id => prev.has(id));
                return isAllSelected ? new Set() : all;
              });
            }}
            style={{ paddingHorizontal: 12, opacity: 1 }}
            activeOpacity={1}
          >
            <Text style={{ color: themeColors.text, opacity: 1, fontWeight: '600' }}>
              {selectedIds.size > 0 && selectedIds.size === filteredMessages.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => {
                  setSelectionMode(true);
                  setSelectedIds(new Set());
                  setQueuedAction(null);
              }}
              style={styles.headerIconChip}
            >
              <MaterialCommunityIcons name="dots-horizontal" size={18} color={themeColors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setSearchOverlayQuery(''); setSearchOverlayVisible(true); }}
              style={styles.headerIconChip}
              accessibilityLabel="Search"
              activeOpacity={0.8}
            >
              <Ionicons name="search" size={18} color={themeColors.text} />
            </TouchableOpacity>
          </View>
        )
      ),
      headerRight: () => (
        selectionMode ? (
          <TouchableOpacity
            onPress={handleApplyQueuedAction}
            style={{ paddingHorizontal: 16 }}
          >
            <Text style={{ color: themeColors.primary, fontWeight: '600' }}>Done</Text>
          </TouchableOpacity>
        ) : (
          // Summary mode toggle disabled for MVP - removed
          null
        )
      ),
    });
  }, [navigation, selectionMode, searchText, themeColors.text, themeColors.primary, filteredMessages, selectedIds, queuedAction, queuedState, handleApplyQueuedAction, summaryMode]);

  // Update title based on mode: Mailbox (N) or Select (N)
  useLayoutEffect(() => {
    if (selectionMode) {
      navigation.setOptions({ title: `Select (${selectedIds.size})` });
    } else {
      navigation.setOptions({ title: `Mailbox (${filteredMessages.length})` });
    }
  }, [navigation, selectionMode, selectedIds.size, filteredMessages.length]);

  // Scroll-to-top button visibility and behavior
  const listRef = useRef<any>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const handleScroll = (e: any) => {
    const y = e?.nativeEvent?.contentOffset?.y ?? 0;
    setShowScrollTop(y > 250);
  };
  const scrollToTop = () => {
    try {
        // For SectionList, scrollToLocation is reliable
        listRef.current?.scrollToLocation?.({ sectionIndex: 0, itemIndex: 0, animated: true });
    } catch {
      // Fallback to scrollToOffset
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    }
  };

  // Hide/show bottom tab bar when entering/leaving selection mode
  useEffect(() => {
    const parent = (navigation as any).getParent?.();
    if (parent) {
      if (selectionMode) {
        parent.setOptions({ tabBarStyle: { display: 'none' } });
      } else {
        parent.setOptions({ tabBarStyle: undefined });
      }
    }
    return () => {
      if (parent) parent.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation, selectionMode]);

  // Group by date label for SectionList
  const formatDateLabel = (val?: string) => {
    const d = parseDate(val);
    if (!d) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const sections = useMemo(() => {
    const map: { [key: string]: Message[] } = {};
    filteredMessages.forEach(m => {
      const label = formatDateLabel(m.received_at);
      if (!map[label]) map[label] = [];
      map[label].push(m);
    });
    return Object.keys(map).map(title => ({ title, data: map[title] }));
  }, [filteredMessages]);

  useEffect(() => {
    if (isFirstLogin) {
      // Navigate to Subscriptions tab which contains SenderManagement screen
      navigation.navigate('SubscriptionsTab' as any);
      consumeFirstLogin(); // Ensure this only happens once
    }
  }, [isFirstLogin, navigation, consumeFirstLogin]);

  // Remove previous headerLeft nulling behavior

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (__DEV__) {
        console.log('[INBOX] 📨 Loading messages...');
      }
      const messages = await getMessages();
      if (__DEV__) {
        console.log('[INBOX] ✅ Messages loaded:', messages.length);
      }
      setMessages(messages);
    } catch (e) {
      console.error('[INBOX] ❌ Failed to load messages:', e);
      setError(e as Error);
      // Don't fall back to empty data silently - show error to user
      Alert.alert(
        'Connection Error',
        'Unable to load your messages. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (authToken) {
      loadMessages();
    }
  }, [loadMessages, authToken]);

  // Load senders data for email addresses
  useEffect(() => {
    const loadSendersData = async () => {
      try {
        const sendersData = await getSenders();
        setSenders(sendersData);
      } catch (error) {
        console.error('Error loading senders:', error);
      }
    };
    loadSendersData();
  }, []);

  // Helper function to get email address for a message
  const getSenderEmail = useCallback((message: Message): string => {
    // Try to match by sender_id first
    const senderId = (message as any).sender_id;
    if (senderId) {
      const sender = senders.find(s => s.id === senderId);
      if (sender) return sender.email;
    }

    // Fallback to matching by sender name
    const sender = senders.find(s => s.name === message.sender_name);
    return sender ? sender.email : 'No email available';
  }, [senders]);

  // Helper function to get sender profile picture URL
  const getSenderAvatarUrl = useCallback((message: Message): string | null => {
    const email = getSenderEmail(message);
    if (email && email !== 'No email available') {
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check cache first
      if (avatarHashCache[normalizedEmail]) {
        return `https://www.gravatar.com/avatar/${avatarHashCache[normalizedEmail]}?s=200&d=identicon&r=g`;
      }
      
      // Generate MD5 hash asynchronously and cache it
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, normalizedEmail)
        .then(hash => {
          setAvatarHashCache(prev => ({
            ...prev,
            [normalizedEmail]: hash
          }));
        })
        .catch(error => {
          console.warn('Failed to generate avatar hash:', error);
        });
      
      // Return fallback with simple hash while MD5 is being calculated
      const fallbackHash = simpleHash(normalizedEmail);
      return `https://www.gravatar.com/avatar/${fallbackHash}?s=200&d=identicon&r=g`;
    }
    return null;
  }, [getSenderEmail, avatarHashCache]);

  // Simple hash function for Gravatar
  const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  };

  // Body prefetching effect removed - was only used for summary mode

  // Precompute avatar hashes for visible messages
  useEffect(() => {
    const computeAvatarHashes = async () => {
      const visibleMessages = filteredMessages.slice(0, 10); // Process first 10 messages
      const emailsToProcess = visibleMessages
        .map(msg => getSenderEmail(msg))
        .filter(email => email && email !== 'No email available')
        .map(email => email!.toLowerCase().trim())
        .filter(email => !avatarHashCache[email]); // Only process uncached emails

      for (const email of emailsToProcess) {
        try {
          const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, email);
          setAvatarHashCache(prev => ({
            ...prev,
            [email]: hash
          }));
        } catch (error) {
          console.warn('Failed to precompute avatar hash for:', email, error);
        }
      }
    };

    if (filteredMessages.length > 0) {
      computeAvatarHashes();
    }
  }, [filteredMessages, getSenderEmail, avatarHashCache]);

  // Initial positioning effect removed - was only used for summary mode

  const onRefresh = async () => {
    try {
      setLoading(true);

      // First, sync any pending subscription changes to the backend
      await syncSubscriptionChanges();

      // Then backfill fresh data
      await triggerBackfill();
      // Give a moment for the backend to start processing
      // then load whatever is available.
      setTimeout(() => {
        loadMessages();
        // Reset loading state after messages are loaded
        setTimeout(() => {
          setLoading(false);
        }, 1000); // Additional delay to ensure loading is complete
      }, 3000); // 3-second delay
    } catch (e: any) {
      setLoading(false);
      // Show a helpful, actionable message instead of replacing the whole inbox
      // with the raw error screen. triggerBackfill throws a friendly message
      // when Gmail access has expired (401 needsReauth).
      const message =
        typeof e?.message === 'string' && e.message.toLowerCase().includes('gmail access')
          ? e.message
          : 'Could not fetch new newsletters. Please check your connection and try again.';
      Alert.alert('Refresh failed', message, [{ text: 'OK' }]);
      // Still surface whatever messages already exist on the backend.
      loadMessages();
    }
  };

  // Sync subscription changes to backend
  const syncSubscriptionChanges = async () => {
    try {
      const pendingChanges = getChanges();
      
      if (pendingChanges.length === 0) {
        return; // No changes to sync
      }

      // Sync all pending changes to backend
      await apiClient.post('/api/subscriptions/sync', {
        subscriptions: pendingChanges
      });

      // Clear the pending changes after successful sync
      clearChanges();
    } catch (error) {
      console.error('Failed to sync subscription changes:', error);
      // Don't throw error - let the refresh continue
    }
  };

  // Debug function to check authentication status
  const handleDebugAuth = async () => {
    try {
      console.log('[DEBUG] Checking authentication status...');
      const debugInfo = await debugAuth();
      console.log('[DEBUG] Authentication debug info:', debugInfo);
      
      // Show debug info in an alert (for now)
      Alert.alert('Debug Info', `User ID: ${debugInfo.userId}\n` +
        `Email: ${debugInfo.email}\n` +
        `Has Refresh Token: ${debugInfo.hasRefreshToken}\n` +
        `Can Authenticate: ${debugInfo.canAuthenticateWithGoogle}\n` +
        `Initial Scan Complete: ${debugInfo.initialScanComplete}\n` +
        `Active Subscriptions: ${debugInfo.activeSubscriptions}\n` +
        `Available Messages: ${debugInfo.availableMessages}`);
    } catch (error) {
      console.error('[DEBUG] Error checking auth:', error);
      Alert.alert('Error', 'Failed to check authentication status. See console for details.');
    }
  };

  if (loading && (messages || []).length === 0) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.background }]}>
        <Text style={{ color: themeColors.text }}>
          Error fetching messages.
        </Text>
        <Button title="Debug Auth" onPress={handleDebugAuth} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <>
        {/* Fixed GroupsRow overlay for list view */}
        {showGroupRows && !loading && (
          <View style={[styles.groupsOverlay, { top: 0 }]}>
            <View style={{ height: 8 }} />
            <View onLayout={(e) => {
              const measuredHeight = e.nativeEvent.layout.height + 8;
              // Only update if significantly different from default to avoid unnecessary re-renders
              if (Math.abs(measuredHeight - summaryHeaderHeight) > 5) {
                setSummaryHeaderHeight(measuredHeight);
              }
            }}>
              <GroupsRow />
            </View>
          </View>
        )}
        <SectionList
          ref={listRef}
          sections={sections}
          contentContainerStyle={{ paddingTop: summaryHeaderHeight }}
          ListHeaderComponent={
            <View style={{ height: 12 }} />
          }
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={onRefresh}
              tintColor={themeColors.primary}
              colors={[themeColors.primary]}
            />
          }
          onScroll={(e) => {
            // Hide group rows when scrolling in list view
            const scrollY = e.nativeEvent.contentOffset.y;
            const threshold = summaryHeaderHeight + 50; // Small threshold
            setShowGroupRows(scrollY < threshold);
            // Also handle scroll-to-top button
            handleScroll(e);
          }}
          scrollEventThrottle={16}
        ListEmptyComponent={
          <View style={[styles.centerContainer, { backgroundColor: themeColors.background }]}>
            <Text style={{ color: themeColors.text }}>Your inbox is empty.</Text>
            <Text style={{ color: themeColors.text, marginTop: 8, textAlign: 'center' }}>
              Newsletters you are subscribed to will appear here.
            </Text>
            <Text style={styles.pullDownText}>
              Pull down to fetch newsletters from the past week.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Item
            message={item}
            onPress={() => navigation.navigate('Detail', { messageId: item.id })}
            onOpenMoreOptions={() => {
              // Enter selection mode via swipe more-options
              if (summaryMode) return; // disabled in summary view
              setSelectionMode(true);
              setSelectedIds(new Set([item.id]));
              setQueuedAction(null);
              setQueuedState('on');
            }}
            onToggleRead={async () => {
              try {
                // Optimistic update
                setMessages(current =>
                  current.map(m =>
                    m.id === item.id ? { ...m, is_read: !m.is_read } : m
                  )
                );
                if (!item.is_read) {
                  // Include auth token in the request
                  await apiClient.post(`/api/messages/${item.id}/read`, {}, {
                    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
                  });
                } else {
                  // Include auth token in the request
                  await apiClient.post(`/api/messages/${item.id}/unread`, {}, {
                    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
                  });
                }
              } catch (error) {
                // Revert on error
                setMessages(current =>
                  current.map(m =>
                    m.id === item.id ? { ...m, is_read: item.is_read } : m
                  )
                );
              }
            }}
            onToggleSave={() => {
              setMessages(current =>
                current.map(m =>
                  m.id === item.id ? { ...m, is_saved: !m.is_saved } : m
                )
              );
            }}
            onDelete={() => {
              setMessages(current => current.filter(m => m.id !== item.id));
            }}
            selectionMode={selectionMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={() => {
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                return next;
              });
            }}
            queuedAction={queuedAction}
            queuedState={queuedState}
            onEnterSelection={() => {
              if (summaryMode) return;
              setSelectionMode(true);
              setSelectedIds(prev => new Set(prev).add(item.id));
              setQueuedAction(null);
              setQueuedState('on');
            }}
            summaryMode={summaryMode}
          />
        )}
        keyExtractor={(item) => item.id.toString()}
        renderSectionHeader={() => null}
        stickySectionHeadersEnabled={false}
      />

      {showScrollTop ? (
        <TouchableOpacity
          onPress={scrollToTop}
          accessibilityLabel="Scroll to top"
          style={styles.scrollTopButton}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* Context menu modal removed - was only used for summary mode */}

      {/* Full-screen search overlay */}
      <Modal
        visible={searchOverlayVisible}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setSearchOverlayVisible(false)}
      >
        <View style={[styles.searchOverlayBackdrop, { backgroundColor: themeColors.background }]} {...overlayPanResponder.panHandlers}>
          <View style={styles.searchOverlayBar}>
            <TouchableOpacity onPress={() => setSearchOverlayVisible(false)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
              <Ionicons name="chevron-back" size={22} color={themeColors.text} />
            </TouchableOpacity>
            <View style={[styles.searchBarContainer, { flex: 1, alignItems: 'center' }]}>
              <Ionicons name="search" size={18} color={themeColors.text} style={{ marginRight: 8 }} />
              <TextInput
                autoFocus
                placeholder="Search"
                placeholderTextColor={themeColors.text}
                value={searchOverlayQuery}
                onChangeText={setSearchOverlayQuery}
                style={[styles.centerSearchInput, { color: themeColors.text }]}
                returnKeyType="search"
              />
            </View>
          </View>
          <FlatList
            data={searchOverlayQuery.trim() ? filteredMessages.filter(m =>
              m.subject.toLowerCase().includes(searchOverlayQuery.toLowerCase()) ||
              m.sender_name.toLowerCase().includes(searchOverlayQuery.toLowerCase())
            ) : []}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setSearchOverlayVisible(false);
                  navigation.navigate('Detail', { messageId: item.id });
                }}
                style={{ paddingVertical: 10 }}
              >
                <Text style={{ color: themeColors.text, fontWeight: '600' }}>{item.subject}</Text>
                <Text style={{ color: themeColors.text, opacity: 0.8, marginTop: 2 }} numberOfLines={2}>{generateLocalSummary(item)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<View style={{ padding: 24 }} />}
          />
        </View>
      </Modal>

      {selectionMode ? (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            onPress={() => {
              setQueuedAction('read');
              setQueuedState(prev => (queuedAction === 'read' ? (prev === 'on' ? 'off' : 'on') : 'on'));
            }}
            disabled={selectedIds.size === 0}
          >
            <Text
              style={[
                styles.bottomBarText,
                queuedAction === 'read' && styles.bottomBarTextActive,
                selectedIds.size === 0 && { opacity: 0.5 }
              ]}
            >
              Read
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setQueuedAction('save');
              setQueuedState(prev => (queuedAction === 'save' ? (prev === 'on' ? 'off' : 'on') : 'on'));
            }}
            disabled={selectedIds.size === 0}
          >
            <Text
              style={[
                styles.bottomBarText,
                queuedAction === 'save' && styles.bottomBarTextActive,
                selectedIds.size === 0 && { opacity: 0.5 }
              ]}
            >
              Save
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setQueuedAction('delete');
              setQueuedState(prev => (queuedAction === 'delete' ? (prev === 'on' ? 'off' : 'on') : 'on'));
            }}
            disabled={selectedIds.size === 0}
          >
            <Text
              style={[
                styles.bottomBarText,
                queuedAction === 'delete' && styles.bottomBarTextActive,
                selectedIds.size === 0 && { opacity: 0.5 }
              ]}
            >
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pullDownText: {
    color: '#718096',
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  item: {
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'relative',
    flexDirection: 'row', // Added for avatar and star
    alignItems: 'center', // Added for avatar and star
  },
  sender: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    marginBottom: 4,
  },
  snippet: {
    fontSize: 12,
  },
  dateChip: {
    fontSize: 11,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    color: '#4A5568',
    marginBottom: 2,
  },
  unreadBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bookmarkButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    padding: 4,
    borderRadius: 12,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 0,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#A0AEC0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chipActive: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  headerSearchInput: {
    width: 220,
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  searchBarContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  centerSearchInput: {
    flex: 1,
    paddingVertical: 0,
  },
  summaryCard: {
    flex: 1,
    padding: 8,
    justifyContent: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  summaryHero: {
    height: 240, // Reduced from 280
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHeroImage: {
    height: 260, // Reduced from 260
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#E5E7EB',
  },
  summaryHeroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHeroAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 24 },
  summaryAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  summaryAvatarText: { color: '#fff', fontWeight: 'bold' },
  summarySender: { fontSize: 14, opacity: 0.8 },
  summarySenderSection: {
    position: 'absolute',
    bottom: 0, // Touch the bottom edge
    left: 0, // Touch the left edge
    right: 0, // Touch the right edge
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  summarySenderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summarySubject: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  summaryBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  summaryActions: {
    flexDirection: 'row',
    gap: 24,
  },
  // Metadata styles
  summaryMeta: { fontSize: 12, opacity: 0.7 },
  // Context menu styles
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 8, // Reduced from 12 for more rectangular look
    paddingVertical: 16, // Increased from 8
    paddingHorizontal: 8, // Added horizontal padding
    minWidth: 280, // Set minimum width to make it more rectangular
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20, // Increased from 16
    paddingVertical: 16, // Increased from 12
  },
  menuText: { color: '#111827', fontSize: 16 },
  // Groups overlay - fixed position above FlatList
  groupsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    // Add subtle shadow for separation
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  // Search overlay
  searchOverlayBackdrop: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingRight: 16,
    paddingTop: 64,
  },
  searchOverlayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 64,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
  },
  sectionHeaderText: {
    fontWeight: 'bold',
    color: '#4A5568',
  },
  scrollTopButton: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: 'rgba(26,32,44,0.7)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  headerIconChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(248, 248, 248, 0.28)',
    borderRadius: 10,
    marginHorizontal: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(155, 155, 155, 0.5)'
  },
  selectionBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#4A90E2',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  selectionBoxSelected: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 50, // Reduced from 72
    paddingTop: 8, // Reduced from 14
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
  },
  bottomBarText: {
    color: '#9CA3AF',
    fontWeight: '600',
  },
  bottomBarTextActive: {
    color: '#FFFFFF',
  },
  summaryToggle: {
    width: 52,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
  },
  summaryToggleOn: {
    backgroundColor: '#E5E7EB',
  },
  summaryToggleOff: {
    backgroundColor: '#E2E8F0',
  },
  summaryToggleKnob: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryActionButton: {
    padding: 8,
  },
  // Enhanced hero image styles
  heroImageContainer: {
    position: 'relative',
    height: 260, // Reduced from 280
    marginHorizontal: -8, // Extend to card edges
    marginTop: -8, // Extend to top edge
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  heroImageGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  heroImageOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlayAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  overlayAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroBrandedFallback: {
    height: 260,
    marginHorizontal: -8, // Extend to card edges
    marginTop: -8, // Extend to top edge
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  largeSenderAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  largeSenderAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 28,
  },
  senderNameLarge: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  senderDomain: {
    fontSize: 13,
    opacity: 0.6,
    textAlign: 'center',
  },
  senderNameStyled: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  senderEmailStyled: {
    fontSize: 12,
    opacity: 0.7,
  },
  summaryContentContainer: {
    paddingHorizontal: 16,
  },
  heroDotsOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    padding: 6,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  upArrowButton: {
    backgroundColor: 'rgba(26,32,44,0.4)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginLeft: 8,
    marginRight: 8,
  },
  overlaySenderName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  overlaySenderEmail: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Fallback design styles
  patternOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  patternGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
  },
  patternDot: {
    margin: 15,
    opacity: 0.6,
  },
  fallbackGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  fallbackSenderInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  fallbackSenderName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  fallbackSenderEmail: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default InboxScreen;
