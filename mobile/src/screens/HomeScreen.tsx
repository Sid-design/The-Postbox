import React from 'react';
import { Text, View, Button, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { testCompleteFlow } from '../api/client';

const HomeScreen = () => {
  const { logout } = useAuth();

  const runAPITests = async () => {
    console.log('🚀 Starting API Tests from Home Screen...');
    await testCompleteFlow();
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 20 }}>
      <Text style={styles.title}>Newsletter Reader</Text>
      <Text style={styles.subtitle}>Home Screen</Text>

      <TouchableOpacity style={styles.testButton} onPress={runAPITests}>
        <Text style={styles.testButtonText}>🧪 Test API Connection</Text>
      </TouchableOpacity>

      <View style={styles.buttonContainer}>
        <Button title="Logout" onPress={logout} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    color: '#666',
  },
  testButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  testButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContainer: {
    marginTop: 20,
  },
});

export default HomeScreen; 