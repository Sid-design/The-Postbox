import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Button,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { apiClient, getUserSubscriptions, DiscoverableSender, getAuthToken } from '../api/client';
import { useNavigation } from '@react-navigation/native';
import { useSubscriptionChanges } from '../context/SubscriptionContext';

type FilterType = 'all' | 'active' | 'inactive';

type SenderItemProps = {
  name: string;
  email: string;
  subscribed: boolean;
  onToggle: () => void;
};

const SenderItem = ({ name, email, subscribed, onToggle }: SenderItemProps) => (
  <TouchableOpacity
    onPress={onToggle}
    style={styles.itemContainer}
    testID={`sender-item-${name}`}
  >
    <View style={{flex:1}}>
      <Text style={styles.senderName}>{name}</Text>
      <Text style={styles.senderEmail}>{email}</Text>
    </View>
    <View style={styles.actionsContainer}>
      <View style={[styles.checkbox, subscribed && styles.checkboxActive]}>
        {subscribed && (
          <Text style={styles.checkmark} testID={`checkmark-${name}`}>
            ✓
          </Text>
        )}
      </View>
    </View>
  </TouchableOpacity>
);

const FilterModal = ({ visible, onClose, onSelectFilter, currentFilter }: {
  visible: boolean;
  onClose: () => void;
  onSelectFilter: (filter: FilterType) => void;
  currentFilter: FilterType;
}) => (
  <Modal
    visible={visible}
    transparent={true}
    animationType="fade"
    onRequestClose={onClose}
  >
    <TouchableOpacity
      style={styles.modalOverlay}
      activeOpacity={1}
      onPress={onClose}
    >
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Filter Subscriptions</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.filterOptionsContainer}>
          {([
            { key: 'all', label: 'All Subscriptions' },
            { key: 'active', label: 'Active' },
            { key: 'inactive', label: 'Inactive' }
          ] as const).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterOption,
                currentFilter === key && styles.filterOptionActive
              ]}
              onPress={() => {
                onSelectFilter(key);
                onClose();
              }}
            >
              <View style={styles.filterOptionContent}>
                <Text style={[
                  styles.filterOptionLabel,
                  currentFilter === key && styles.filterOptionLabelActive
                ]}>
                  {label}
                </Text>
              </View>
              {currentFilter === key && (
                <View style={styles.selectedIndicator}>
                  <Text style={styles.selectedIndicatorText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  </Modal>
);

const ActionButton = ({ icon, label, onPress, isActive = false, disabled }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  disabled?: boolean;
}) => (
  <TouchableOpacity
    style={[styles.actionButton, isActive && styles.actionButtonActive, disabled && styles.actionButtonDisabled]}
    onPress={onPress}
    disabled={disabled}
  >
    <View style={styles.actionButtonContent}>
      <Ionicons 
        name={icon} 
        size={20} 
        color={isActive ? 'white' : disabled ? '#A0AEC0' : colors.light.textPrimary}
        style={styles.actionButtonIcon}
      />
      <Text style={[styles.actionButtonLabel, isActive && styles.actionButtonLabelActive, disabled && styles.actionButtonLabelDisabled]}>
        {label}
      </Text>
    </View>
  </TouchableOpacity>
);

const SenderManagementScreen = () => {
  const navigation = useNavigation();
  const { addChange } = useSubscriptionChanges();
  const [senders, setSenders] = useState<DiscoverableSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [currentFilter, setCurrentFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [isSelectAllLoading, setIsSelectAllLoading] = useState(false);
  const isOperationInProgress = useRef(false);

  const loadSenders = useCallback(async () => {
    setLoading(true);
    try {
      if (__DEV__) {
        console.log('[SENDER-MGMT] 📨 Loading senders...');
      }
      const sendersData = await getUserSubscriptions();
      if (__DEV__) {
        console.log('[SENDER-MGMT] ✅ Senders loaded:', sendersData.length);
      }
      setSenders(sendersData);
    } catch (error) {
      console.error('[SENDER-MGMT] ❌ Failed to load senders:', error);
      Alert.alert(
        'Connection Error',
        'Unable to load your senders. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSenders();
  }, [loadSenders]);

  // Update selectAllMode based on whether all senders are active
  useEffect(() => {
    const allActive = senders.length > 0 && senders.every(sender => sender.is_subscribed === 1);
    setSelectAllMode(allActive);
  }, [senders]);

  // Update navigation title with count
  useLayoutEffect(() => {
    const getFilterCount = () => {
      switch (currentFilter) {
        case 'active':
          return senders.filter(s => s.is_subscribed === 1).length;
        case 'inactive':
          return senders.filter(s => s.is_subscribed === 0).length;
        default:
          return senders.length;
      }
    };

    const count = getFilterCount();
    navigation.setOptions({
      title: `Subscriptions (${count})`
    });
  }, [navigation, currentFilter, senders]);

  const handleRescan = async () => {
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      await apiClient.get('/api/rescan', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      // Give the backend a moment to process before reloading
      setTimeout(() => {
        loadSenders();
        setIsRefreshing(false);
        Alert.alert('Success', 'Sender list has been refreshed.');
      }, 5000); // 5 seconds delay
    } catch (error) {
      console.error('Failed to trigger rescan', error);
      setIsRefreshing(false);
      Alert.alert('Error', 'Could not start the refresh process.');
    }
  };

  const handleToggleSubscription = async (senderId: number, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    
    // Optimistic UI update
    setSenders(currentSenders =>
      currentSenders.map(sender =>
        sender.id === senderId ? { ...sender, is_active: newStatus ? 1 : 0 } : sender
      )
    );

    // Track the change in context for later sync
    addChange(senderId, newStatus);
  };

  const handleSelectAll = async () => {
    // Prevent rapid clicking and concurrent operations
    if (isSelectAllLoading || isOperationInProgress.current) return;
    
    setIsSelectAllLoading(true);
    isOperationInProgress.current = true;
    
    // Determine if we should select all or deselect all based on current state
    const allActive = senders.every(sender => sender.is_subscribed === 1);
    const newStatus = !allActive; // If all are active, make them inactive, otherwise make them active

    // Optimistic UI update
    setSenders(currentSenders =>
      currentSenders.map(sender => ({ ...sender, is_active: newStatus ? 1 : 0 }))
    );

    // Track all changes in context for later sync
    senders.forEach(sender => {
      addChange(sender.id, newStatus);
    });

    // Reset loading states with a delay to prevent rapid clicking
    setTimeout(() => {
      setIsSelectAllLoading(false);
      isOperationInProgress.current = false;
    }, 500); // Reduced delay since no API calls
  };

  const filteredSenders = senders.filter(sender => {
    // Apply search filter
    const matchesSearch = searchQuery === '' || 
      sender.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sender.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Apply status filter
    let matchesStatus = true;
    switch (currentFilter) {
      case 'active':
        matchesStatus = sender.is_subscribed === 1;
        break;
      case 'inactive':
        matchesStatus = sender.is_active === 0;
        break;
      default:
        matchesStatus = true; // 'all'
    }
    
    return matchesSearch && matchesStatus;
  });

  const getFilterDisplayText = () => {
    switch (currentFilter) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      default:
        return 'All';
    }
  };

  const getFilterCount = () => {
    switch (currentFilter) {
      case 'active':
        return senders.filter(s => s.is_subscribed === 1).length;
      case 'inactive':
        return senders.filter(s => s.is_subscribed === 0).length;
      default:
        return senders.length;
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>
          Choose the newsletters you want to see in The Postbox.
        </Text>
        
        {/* Refresh Button */}
        <View style={styles.refreshButtonContainer}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRescan}
            disabled={isRefreshing}
          >
            <Text style={styles.refreshButtonText}>
              {isRefreshing ? 'Refreshing...' : 'Refresh Sender List'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Action Buttons Row */}
        <View style={styles.actionButtonsContainer}>
          <ActionButton
            icon="search"
            label="Search"
            onPress={() => {
              // TODO: Implement search functionality
              Alert.alert('Search', 'Search functionality coming soon!');
            }}
          />
          <ActionButton
            icon="funnel"
            label="Filter"
            onPress={() => setFilterModalVisible(true)}
            isActive={currentFilter !== 'all'}
          />
          <ActionButton
            icon="people"
            label="Groups"
            onPress={() => {
              setGroupMode(!groupMode);
              // TODO: Implement groups functionality
              Alert.alert('Groups', 'Groups functionality coming soon!');
            }}
            isActive={groupMode}
          />
          <ActionButton
            icon="checkbox"
            label="Select All"
            onPress={handleSelectAll}
            isActive={selectAllMode}
            disabled={isSelectAllLoading}
          />
        </View>
      </View>
      
      <FlatList
        data={filteredSenders}
        renderItem={({ item }) => (
          <SenderItem
            name={item.name}
            email={item.email}
            subscribed={item.is_subscribed === 1}
            onToggle={() => handleToggleSubscription(item.id, item.is_subscribed === 1)}
          />
        )}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 32 }} // Reduced from 96 since navigation bar now has proper spacing
      />

      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        onSelectFilter={setCurrentFilter}
        currentFilter={currentFilter}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.light.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.light.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    color: colors.light.textSecondary,
    marginTop: 4,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 0,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.light.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  actionButtonActive: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  actionButtonDisabled: {
    opacity: 0.7,
    backgroundColor: '#E2E8F0',
    borderColor: '#E2E8F0',
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButtonIcon: {
    marginRight: 1,
  },
  actionButtonLabel: {
    fontSize: 10,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  actionButtonLabelActive: {
    color: 'white',
  },
  actionButtonLabelDisabled: {
    color: '#A0AEC0',
  },
  refreshButtonContainer: {
    alignItems: 'center',
  },
  refreshButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  refreshButtonText: {
    fontSize: 16,
    color: colors.light.primary,
    fontWeight: '500',
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  senderName: {
    fontSize: 16,
    color: colors.light.textPrimary,
    flex: 1,
  },
  senderEmail: {
    fontSize: 12,
    color: colors.light.textSecondary,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#A0AEC0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 0,
    minWidth: 300,
    maxWidth: 350,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.light.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: colors.light.textSecondary,
    fontWeight: 'bold',
  },
  filterOptionsContainer: {
    padding: 16,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F7FAFC',
  },
  filterOptionActive: {
    backgroundColor: colors.light.primary,
  },
  filterOptionContent: {
    flex: 1,
  },
  filterOptionLabel: {
    fontSize: 16,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  filterOptionLabelActive: {
    color: 'white',
  },
  filterOptionDescription: {
    fontSize: 14,
    color: colors.light.textSecondary,
    marginTop: 2,
  },
  filterOptionDescriptionActive: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicatorText: {
    fontSize: 14,
    color: colors.light.primary,
    fontWeight: 'bold',
  },
});

export default SenderManagementScreen; 