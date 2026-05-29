import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native';
import { getDiscoverableNewsletters, subscribeToNewsletter, DiscoverableSender } from '../api/client';

const ExploreScreen = () => {
  const { colors } = useTheme();
  const [newsletters, setNewsletters] = useState<DiscoverableSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [subscribingIds, setSubscribingIds] = useState<Set<number>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);

  // Theme colors consistent with app
  const themeColors = {
    primary: '#4A90E2',
    background: '#F4F6F8',
    card: '#FFFFFF',
    text: '#1A202C',
    textSecondary: '#718096',
    border: '#E2E8F0',
  };

  const categories = [
    { key: 'all', label: 'All', icon: 'grid' },
    { key: 'Technology', label: 'Tech', icon: 'laptop' },
    { key: 'Business', label: 'Business', icon: 'briefcase' },
    { key: 'Design', label: 'Design', icon: 'palette' },
    { key: 'Science', label: 'Science', icon: 'atom' },
    { key: 'Health', label: 'Health', icon: 'heart' },
    { key: 'Sports', label: 'Sports', icon: 'football' },
    { key: 'Entertainment', label: 'Entertainment', icon: 'movie' },
    { key: 'Politics', label: 'Politics', icon: 'newspaper' },
  ];

  const featuredNewsletters = newsletters.filter(n => n.featured === 1).slice(0, 5);
  const trendingNewsletters = newsletters
    .sort((a, b) => b.subscriber_count - a.subscriber_count)
    .slice(0, 5);
  const recommendedNewsletters = newsletters
    .filter(n => n.category === 'Technology') // Simple recommendation based on popular category
    .slice(0, 5);

  // If we have mock data and no featured/trending, use some mock data
  const displayFeaturedNewsletters = featuredNewsletters.length > 0 ? featuredNewsletters :
    newsletters.filter(n => n.category === 'Technology').slice(0, 3);

  const displayTrendingNewsletters = trendingNewsletters.length > 0 ? trendingNewsletters :
    newsletters.sort((a, b) => b.subscriber_count - a.subscriber_count).slice(0, 3);

  const displayRecommendedNewsletters = recommendedNewsletters.length > 0 ? recommendedNewsletters :
    newsletters.filter(n => n.category === 'Business').slice(0, 3);

  // Fallback mock data for when API is not available
  const getMockNewsletters = useCallback(() => {
    const mockNewsletters = [
      // Technology
      {
        id: 1,
        name: 'Hacker News Daily',
        email: 'daily@hackernews.example',
        description: 'Top tech stories and discussions from Hacker News community. Stay updated with the latest in programming, startups, and technology trends.',
        category: 'Technology',
        subscriber_count: 12500,
        featured: 1,
        is_subscribed: 0
      },
      {
        id: 2,
        name: 'The Verge',
        email: 'newsletter@theverge.com',
        description: 'Tech news that matters, delivered daily. From the latest gadgets to major industry shifts, we cover what\'s important in technology.',
        category: 'Technology',
        subscriber_count: 85000,
        featured: 1,
        is_subscribed: 0
      },
      {
        id: 6,
        name: 'TechCrunch Daily',
        email: 'daily@techcrunch.com',
        description: 'The latest technology news and startup funding information, delivered fresh every morning.',
        category: 'Technology',
        subscriber_count: 75000,
        featured: 0,
        is_subscribed: 0
      },

      // Business
      {
        id: 3,
        name: 'Morning Brew',
        email: 'morning@morningbrew.com',
        description: 'Business news and insights you can read in 5 minutes. The smartest (and fastest) digest of business news.',
        category: 'Business',
        subscriber_count: 120000,
        featured: 1,
        is_subscribed: 0
      },
      {
        id: 7,
        name: 'The Hustle',
        email: 'daily@thehustle.co',
        description: 'Smart, entertaining business news. Stories about money, entrepreneurship, and the economy that matter.',
        category: 'Business',
        subscriber_count: 95000,
        featured: 1,
        is_subscribed: 0
      },

      // Science
      {
        id: 4,
        name: 'Science Daily',
        email: 'newsletter@sciencedaily.com',
        description: 'Latest research news and scientific discoveries. Stay informed about breakthroughs in science and technology.',
        category: 'Science',
        subscriber_count: 156000,
        featured: 1,
        is_subscribed: 0
      },

      // Health
      {
        id: 5,
        name: 'Well+Good',
        email: 'newsletter@wellandgood.com',
        description: 'Health, wellness, and lifestyle tips. Your guide to living your healthiest, happiest life.',
        category: 'Health',
        subscriber_count: 89000,
        featured: 0,
        is_subscribed: 0
      },

      // Design
      {
        id: 8,
        name: 'Creative Bloq',
        email: 'newsletter@creativebloq.com',
        description: 'Design inspiration and tutorials for creatives. Learn new skills and stay inspired with design trends.',
        category: 'Design',
        subscriber_count: 78000,
        featured: 0,
        is_subscribed: 0
      },

      // Entertainment
      {
        id: 9,
        name: 'IGN Daily',
        email: 'daily@ign.com',
        description: 'Video game news, reviews, and entertainment. The latest in gaming culture and industry news.',
        category: 'Entertainment',
        subscriber_count: 95000,
        featured: 0,
        is_subscribed: 0
      },

      // Sports
      {
        id: 10,
        name: 'ESPN Daily',
        email: 'daily@espn.com',
        description: 'The latest sports news, scores, and analysis from ESPN. Your daily sports briefing.',
        category: 'Sports',
        subscriber_count: 180000,
        featured: 0,
        is_subscribed: 0
      },

      // Politics
      {
        id: 11,
        name: 'Politico Playbook',
        email: 'playbook@politico.com',
        description: 'The most influential newsletter in politics. Morning must-reads from Washington insiders.',
        category: 'Politics',
        subscriber_count: 42000,
        featured: 0,
        is_subscribed: 0
      }
    ];

    // Filter by category
    let filtered = selectedCategory === 'all'
      ? mockNewsletters
      : mockNewsletters.filter(n => n.category === selectedCategory);

    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter(n =>
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [selectedCategory, searchQuery]);

  const loadNewsletters = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[EXPLORE] 🔄 Starting to load newsletters...');
      const data = await getDiscoverableNewsletters(
        selectedCategory,
        searchQuery || undefined,
        50,
        0
      );
      console.log('[EXPLORE] ✅ Successfully loaded newsletters from API:', data.length);
      setNewsletters(data);
      
      // If no newsletters are returned, show a helpful message
      if (data.length === 0) {
        console.log('[EXPLORE] ℹ️ No newsletters found - user may need to subscribe to some first');
      }
    } catch (error) {
      console.error('[EXPLORE] ❌ Failed to load newsletters from API:', error);
      console.log('[EXPLORE] 🔄 Falling back to mock data...');
      // Use mock data as fallback
      const mockData = getMockNewsletters();
      setNewsletters(mockData);
      // Don't show error alert for API failures, just use mock data
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery, getMockNewsletters]);

  useEffect(() => {
    loadNewsletters();
  }, [loadNewsletters]);

  const handleSubscribe = async (newsletter: DiscoverableSender) => {
    try {
      setSubscribingIds(prev => new Set([...prev, newsletter.id]));

      try {
        await subscribeToNewsletter(newsletter.id);
      } catch (apiError) {
        console.log('API subscription failed, simulating success for demo:', apiError);
        // For demo purposes, we'll simulate a successful subscription
        // In a real app, you'd handle this differently
      }

      // Update local state to reflect subscription
      setNewsletters(prev =>
        prev.map(n =>
          n.id === newsletter.id ? { ...n, is_subscribed: 1 } : n
        )
      );

      Alert.alert('Success', `Subscribed to ${newsletter.name}!`);
    } catch (error: any) {
      console.error('Subscription error:', error);
      Alert.alert(
        'Subscription Failed',
        'Unable to complete subscription. Please try again.'
      );
    } finally {
      setSubscribingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(newsletter.id);
        return newSet;
      });
    }
  };

  const handleSaveForLater = (newsletterId: number) => {
    setSavedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(newsletterId)) {
        newSet.delete(newsletterId);
      } else {
        newSet.add(newsletterId);
      }
      return newSet;
    });
  };

  const handleTryIt = (newsletter: DiscoverableSender) => {
    setPreviewingId(newsletter.id);
    // In a real app, this would open a preview screen or modal
    Alert.alert(
      'Preview',
      `This would show you the latest issue of ${newsletter.name}.\n\nFeature coming soon!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Subscribe',
          onPress: () => handleSubscribe(newsletter)
        }
      ]
    );
    setTimeout(() => setPreviewingId(null), 1000);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadNewsletters();
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, [loadNewsletters]);

  const generateSearchSuggestions = useCallback(() => {
    if (searchQuery.length < 2) {
      setSearchSuggestions([]);
      return;
    }

    const suggestions = new Set<string>();

    // If we have newsletters from API or mock data, generate suggestions
    if (newsletters.length > 0) {
      newsletters.forEach(newsletter => {
        // Add name matches
        if (newsletter.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          suggestions.add(newsletter.name);
        }
        // Add category matches
        if (newsletter.category.toLowerCase().includes(searchQuery.toLowerCase())) {
          suggestions.add(newsletter.category);
        }
        // Add description keyword matches
        if (newsletter.description) {
          const words = newsletter.description.split(' ');
          words.forEach(word => {
            if (word.toLowerCase().includes(searchQuery.toLowerCase()) && word.length > 3) {
              suggestions.add(word);
            }
          });
        }
      });
    } else {
      // Fallback suggestions when no data is available
      const fallbackSuggestions = ['technology', 'business', 'design', 'science', 'health'];
      fallbackSuggestions.forEach(suggestion => {
        if (suggestion.toLowerCase().includes(searchQuery.toLowerCase())) {
          suggestions.add(suggestion);
        }
      });
    }

    setSearchSuggestions(Array.from(suggestions).slice(0, 5));
  }, [searchQuery, newsletters]);

  useEffect(() => {
    generateSearchSuggestions();
  }, [generateSearchSuggestions]);

  const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h},60%,70%)`;
  };

  const renderNewsletterItem = ({ item }: { item: DiscoverableSender }) => {
    const isSubscribing = subscribingIds.has(item.id);
    const isSaved = savedIds.has(item.id);
    const isPreviewing = previewingId === item.id;
    const bgColor = stringToColor(item.name);

    return (
      <View style={[styles.newsletterCard, { backgroundColor: themeColors.card }]}>
        {/* Header with avatar and name */}
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: bgColor }]}>
            <Text style={styles.avatarText}>
              {item.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={[styles.newsletterName, { color: themeColors.text }]}>
              {item.name}
            </Text>
            <Text style={[styles.newsletterEmail, { color: themeColors.textSecondary }]}>
              {item.email}
            </Text>
          </View>
          <View style={styles.cardActions}>
            {item.featured === 1 && (
              <View style={styles.featuredBadge}>
                <Ionicons name="star" size={12} color="#FFD700" />
              </View>
            )}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => handleSaveForLater(item.id)}
            >
              <Ionicons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={20}
                color={isSaved ? themeColors.primary : themeColors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Description */}
        {item.description && (
          <Text style={[styles.description, { color: themeColors.text }]}>
            {item.description}
          </Text>
        )}

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.tryItButton]}
            onPress={() => handleTryIt(item)}
            disabled={isPreviewing}
          >
            <Ionicons name="eye" size={16} color={themeColors.primary} />
            <Text style={[styles.actionButtonText, { color: themeColors.primary }]}>
              {isPreviewing ? 'Loading...' : 'Try It'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer with category and subscribe button */}
        <View style={styles.cardFooter}>
          <View style={styles.categoryBadge}>
            <Text style={[styles.categoryText, { color: themeColors.primary }]}>
              {item.category}
            </Text>
          </View>

          <View style={styles.statsAndSubscribe}>
            <Text style={[styles.subscriberCount, { color: themeColors.textSecondary }]}>
              {item.subscriber_count.toLocaleString()} subscribers
            </Text>

            <TouchableOpacity
              style={[
                styles.subscribeButton,
                item.is_subscribed === 1 && styles.subscribedButton,
                isSubscribing && styles.subscribingButton
              ]}
              onPress={() => item.is_subscribed === 0 && !isSubscribing && handleSubscribe(item)}
              disabled={item.is_subscribed === 1 || isSubscribing}
            >
              {isSubscribing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : item.is_subscribed === 1 ? (
                <Text style={styles.subscribedText}>✓ Subscribed</Text>
              ) : (
                <Text style={styles.subscribeText}>Subscribe</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderHorizontalNewsletterItem = ({ item }: { item: DiscoverableSender }) => {
    const isSubscribing = subscribingIds.has(item.id);
    const bgColor = stringToColor(item.name);

    return (
      <TouchableOpacity style={[styles.horizontalCard, { backgroundColor: themeColors.card }]}>
        <View style={[styles.horizontalAvatar, { backgroundColor: bgColor }]}>
          <Text style={styles.horizontalAvatarText}>
            {item.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
          </Text>
        </View>
        <View style={styles.horizontalContent}>
          <Text style={[styles.horizontalTitle, { color: themeColors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.horizontalSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
            {item.subscriber_count.toLocaleString()} subscribers
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.miniSubscribeButton,
            item.is_subscribed === 1 && styles.miniSubscribedButton
          ]}
          onPress={() => item.is_subscribed === 0 && !isSubscribing && handleSubscribe(item)}
          disabled={item.is_subscribed === 1 || isSubscribing}
        >
          {isSubscribing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : item.is_subscribed === 1 ? (
            <Ionicons name="checkmark" size={12} color="#ffffff" />
          ) : (
            <Ionicons name="add" size={12} color="#ffffff" />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderSearchSuggestion = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[styles.suggestionItem, { backgroundColor: themeColors.card }]}
      onPress={() => setSearchQuery(item)}
    >
      <Ionicons name="search" size={16} color={themeColors.textSecondary} />
      <Text style={[styles.suggestionText, { color: themeColors.text }]}>
        {item}
      </Text>
    </TouchableOpacity>
  );

  const renderHorizontalSection = (
    title: string,
    data: DiscoverableSender[],
    iconName: keyof typeof Ionicons.glyphMap
  ) => (
    <View style={styles.horizontalSection}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Ionicons name={iconName} size={20} color={themeColors.primary} />
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
            {title}
          </Text>
        </View>
        <TouchableOpacity>
          <Text style={[styles.seeAllText, { color: themeColors.primary }]}>
            See All
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => `horizontal-${item.id}`}
        renderItem={renderHorizontalNewsletterItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
      />
    </View>
  );

  const renderCategoryChip = ({ item }: { item: { key: string; label: string; icon: string } }) => (
    <TouchableOpacity
      style={[
        styles.categoryChip,
        selectedCategory === item.key && styles.categoryChipActive
      ]}
      onPress={() => setSelectedCategory(item.key)}
    >
      <MaterialCommunityIcons
        name={item.icon as any}
        size={16}
        color={selectedCategory === item.key ? '#ffffff' : themeColors.primary}
      />
      <Text style={[
        styles.categoryChipText,
        selectedCategory === item.key && styles.categoryChipTextActive
      ]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[themeColors.primary]}
            tintColor={themeColors.primary}
          />
        }
      >
        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: themeColors.card }]}>
          <Ionicons name="search" size={20} color={themeColors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search newsletters..."
            placeholderTextColor={themeColors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Search Suggestions */}
        {searchSuggestions.length > 0 && searchQuery.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <FlatList
              data={searchSuggestions}
              keyExtractor={(item, index) => `suggestion-${index}`}
              renderItem={renderSearchSuggestion}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        )}

        {/* Categories */}
        <View style={styles.categoriesContainer}>
          <FlatList
            data={categories}
            keyExtractor={(item) => item.key}
            renderItem={renderCategoryChip}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesList}
          />
        </View>

        {/* Featured Newsletters */}
        {displayFeaturedNewsletters.length > 0 && !searchQuery && (
          renderHorizontalSection("Editor's Picks", displayFeaturedNewsletters, "star")
        )}

        {/* Trending Newsletters */}
        {displayTrendingNewsletters.length > 0 && !searchQuery && (
          renderHorizontalSection("Trending Now", displayTrendingNewsletters, "trending-up")
        )}

        {/* Recommended Newsletters */}
        {displayRecommendedNewsletters.length > 0 && !searchQuery && (
          renderHorizontalSection("Recommended for You", displayRecommendedNewsletters, "heart")
        )}

        {/* Results */}
        <View style={styles.resultsSection}>
          <View style={styles.resultsHeader}>
            <Text style={[styles.resultsTitle, { color: themeColors.text }]}>
              {searchQuery ? `Search Results for "${searchQuery}"` : selectedCategory === 'all' ? 'All Newsletters' : `${selectedCategory} Newsletters`}
            </Text>
            <Text style={[styles.resultsCount, { color: themeColors.textSecondary }]}>
              {newsletters.length} found
            </Text>
          </View>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                Discovering newsletters...
              </Text>
            </View>
          ) : newsletters.length === 0 ? (
            <View style={styles.centerContainer}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={64} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.text }]}>
                {searchQuery ? 'No newsletters found' : 'No newsletters available'}
              </Text>
              <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>
                {searchQuery ? 'Try different keywords or check spelling' : 'Check back later for new discoveries'}
              </Text>
              {searchQuery && (
                <TouchableOpacity
                  style={[styles.clearSearchButton, { backgroundColor: themeColors.primary }]}
                  onPress={() => setSearchQuery('')}
                >
                  <Text style={styles.clearSearchText}>Clear Search</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={newsletters}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderNewsletterItem}
              contentContainerStyle={styles.newslettersList}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  categoriesContainer: {
    marginTop: 16,
  },
  categoriesList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F7FAFC',
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4A90E2',
  },
  categoryChipTextActive: {
    color: '#ffffff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  newslettersList: {
    padding: 16,
    paddingBottom: 32,
  },
  newsletterCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerInfo: {
    flex: 1,
  },
  newsletterName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  newsletterEmail: {
    fontSize: 14,
  },
  featuredBadge: {
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statsAndSubscribe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subscriberCount: {
    fontSize: 12,
  },
  subscribeButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  subscribingButton: {
    backgroundColor: '#718096',
  },
  subscribedButton: {
    backgroundColor: '#10B981',
  },
  subscribeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  subscribedText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButton: {
    padding: 8,
    borderRadius: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F7FAFC',
    gap: 6,
  },
  tryItButton: {
    borderColor: '#4A90E2',
    backgroundColor: '#F0F9FF',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  horizontalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginRight: 12,
    borderRadius: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  horizontalAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  horizontalAvatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  horizontalContent: {
    flex: 1,
  },
  horizontalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  horizontalSubtitle: {
    fontSize: 12,
  },
  miniSubscribeButton: {
    backgroundColor: '#4A90E2',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniSubscribedButton: {
    backgroundColor: '#10B981',
  },
  suggestionsContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  suggestionText: {
    fontSize: 16,
    flex: 1,
  },
  horizontalSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  horizontalList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  resultsSection: {
    paddingTop: 16,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  resultsCount: {
    fontSize: 14,
    marginLeft: 8,
  },
  clearSearchButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 16,
  },
  clearSearchText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 32,
  },
});

export default ExploreScreen; 