import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Top-level error boundary. Catches any React render/lifecycle error and
 * displays it as readable text instead of a blank white screen.
 *
 * In production this doubles as the friendly "Something went wrong" screen
 * once Sentry is wired up (Sentry.ErrorBoundary wraps this component in App.tsx).
 * Keep it permanent — remove the detailed stack trace section before App Store.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Render error caught:', error.message);
    console.error('[ErrorBoundary] Stack:', error.stack);
    console.error('[ErrorBoundary] Component tree:', errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          {__DEV__ ? 'Debug details below' : 'The app encountered an unexpected error.'}
        </Text>

        {/* Show full error in all builds until the root crash is identified and fixed.
            Remove or gate on __DEV__ before App Store submission. */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.errorLabel}>Error</Text>
          <Text style={styles.errorMessage}>{this.state.error?.message ?? 'Unknown error'}</Text>

          {this.state.error?.stack ? (
            <>
              <Text style={styles.errorLabel}>Stack</Text>
              <Text style={styles.stack}>{this.state.error.stack}</Text>
            </>
          ) : null}

          {this.state.errorInfo?.componentStack ? (
            <>
              <Text style={styles.errorLabel}>Component tree</Text>
              <Text style={styles.stack}>{this.state.errorInfo.componentStack}</Text>
            </>
          ) : null}
        </ScrollView>

        <TouchableOpacity style={styles.button} onPress={this.handleReset}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#c0392b',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
  },
  scroll: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginBottom: 16,
  },
  scrollContent: {
    padding: 12,
  },
  errorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: '#c0392b',
    fontFamily: 'monospace',
  },
  stack: {
    fontSize: 11,
    color: '#333',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#2c3e50',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
