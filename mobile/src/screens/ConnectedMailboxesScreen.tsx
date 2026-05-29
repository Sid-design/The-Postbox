import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectedMailboxesScreenProps } from '../navigation/types';

// Create theme colors that match the navigation theme structure
const themeColors = {
  primary: '#4A90E2',
  background: '#F4F6F8',
  card: '#FFFFFF',
  text: '#1A202C',
  textSecondary: '#718096',
  border: '#E2E8F0',
  destructive: '#E53E3E',
};

interface MailboxData {
  provider: string;
  email: string;
  displayName: string;
  isEditing: boolean;
}

const ConnectedMailboxesScreen: React.FC<ConnectedMailboxesScreenProps> = ({ navigation }) => {
  const { logout } = useAuth();
  const [mailbox, setMailbox] = useState<MailboxData>({
    provider: 'Gmail',
    email: 'user@gmail.com', // This should come from auth context
    displayName: 'User Name', // This should default to user's name
    isEditing: false,
  });

  useEffect(() => {
    loadMailboxData();
  }, []);

  const loadMailboxData = async () => {
    try {
      const savedData = await AsyncStorage.getItem('mailbox_data');
      if (savedData) {
        setMailbox(JSON.parse(savedData));
      }
    } catch (error) {
      console.error('Failed to load mailbox data:', error);
    }
  };

  const saveMailboxData = async (data: MailboxData) => {
    try {
      await AsyncStorage.setItem('mailbox_data', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save mailbox data:', error);
    }
  };

  const handleEditDisplayName = () => {
    setMailbox(prev => ({ ...prev, isEditing: true }));
  };

  const handleSaveDisplayName = () => {
    const updatedMailbox = { ...mailbox, isEditing: false };
    setMailbox(updatedMailbox);
    saveMailboxData(updatedMailbox);
  };

  const handleDisplayNameChange = (text: string) => {
    setMailbox(prev => ({ ...prev, displayName: text }));
  };

  const handleDisconnectMailbox = () => {
    Alert.alert(
      'Disconnect Mailbox',
      'Are you sure you want to disconnect this mailbox? You will need to reconnect it to access your newsletters.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.goBack();
          }
        },
      ]
    );
  };

  const renderMailboxItem = () => (
    <View style={styles.mailboxCard}>
      {/* Provider */}
      <View style={styles.providerSection}>
        <View style={styles.providerIcon}>
          <MaterialCommunityIcons name="gmail" size={24} color={themeColors.primary} />
        </View>
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>{mailbox.provider}</Text>
          <Text style={styles.providerLabel}>Email Provider</Text>
        </View>
      </View>

      {/* Display Name */}
      <View style={styles.displayNameSection}>
        <Text style={styles.sectionLabel}>Display Name</Text>
        {mailbox.isEditing ? (
          <View style={styles.editContainer}>
            <TextInput
              style={styles.displayNameInput}
              value={mailbox.displayName}
              onChangeText={handleDisplayNameChange}
              autoFocus
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveDisplayName}
            >
              <Ionicons name="checkmark" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.displayNameContainer}
            onPress={handleEditDisplayName}
          >
            <Text style={styles.displayNameText}>{mailbox.displayName}</Text>
            <Ionicons name="pencil" size={16} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Email Address */}
      <View style={styles.emailSection}>
        <Text style={styles.sectionLabel}>Email Address</Text>
        <Text style={styles.emailText}>{mailbox.email}</Text>
      </View>

      {/* Disconnect Option */}
      <TouchableOpacity
        style={styles.disconnectButton}
        onPress={handleDisconnectMailbox}
      >
        <Ionicons name="unlink" size={16} color={themeColors.destructive} />
        <Text style={styles.disconnectText}>Disconnect Mailbox</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connected Mailboxes</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {renderMailboxItem()}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.card,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: themeColors.text,
    marginLeft: 8,
  },
  headerSpacer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  mailboxCard: {
    backgroundColor: themeColors.card,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  providerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F7FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: themeColors.text,
    marginBottom: 2,
  },
  providerLabel: {
    fontSize: 14,
    color: themeColors.textSecondary,
  },
  displayNameSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  displayNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
  },
  displayNameText: {
    fontSize: 16,
    color: themeColors.text,
    flex: 1,
  },
  editContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
    paddingRight: 8,
  },
  displayNameInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: themeColors.text,
  },
  saveButton: {
    backgroundColor: themeColors.primary,
    borderRadius: 6,
    padding: 8,
  },
  emailSection: {
    marginBottom: 24,
  },
  emailText: {
    fontSize: 16,
    color: themeColors.text,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FEF5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEB2B2',
  },
  disconnectText: {
    fontSize: 16,
    color: themeColors.destructive,
    fontWeight: '500',
    marginLeft: 8,
  },
  bottomSpacer: {
    height: 32,
  },
});

export default ConnectedMailboxesScreen;
