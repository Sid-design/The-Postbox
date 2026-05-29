import { Alert } from 'react-native';

export interface ApiError {
  status?: number;
  message: string;
  data?: any;
}

export class ErrorHandler {
  static handleApiError(error: any, context?: string): void {
    console.error(`[ERROR] ${context || 'API Error'}:`, error);
    
    let errorMessage = 'An unexpected error occurred';
    let shouldShowAlert = true;
    
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          errorMessage = data?.error || 'Invalid request. Please check your input.';
          break;
        case 401:
          errorMessage = 'Authentication failed. Please log in again.';
          // Don't show alert for auth errors, handle in interceptor
          shouldShowAlert = false;
          break;
        case 403:
          errorMessage = 'Access denied. You don\'t have permission to perform this action.';
          break;
        case 404:
          errorMessage = 'The requested resource was not found.';
          break;
        case 409:
          errorMessage = 'Conflict detected. The resource may have been modified by another user.';
          break;
        case 422:
          errorMessage = data?.error || 'Validation failed. Please check your input.';
          break;
        case 429:
          errorMessage = 'Too many requests. Please wait a moment and try again.';
          break;
        case 500:
          errorMessage = 'Server error. Please try again later.';
          break;
        case 502:
        case 503:
        case 504:
          errorMessage = 'Service temporarily unavailable. Please try again later.';
          break;
        default:
          errorMessage = data?.error || `Server error (${status}). Please try again.`;
      }
    } else if (error.request) {
      // Network error
      errorMessage = 'Network error. Please check your internet connection.';
    } else if (error.message) {
      // Other error
      errorMessage = error.message;
    }
    
    if (shouldShowAlert) {
      Alert.alert(
        'Error',
        errorMessage,
        [{ text: 'OK' }]
      );
    }
  }
  
  static handleNetworkError(error: any, context?: string): void {
    console.error(`[NETWORK_ERROR] ${context || 'Network Error'}:`, error);
    
    Alert.alert(
      'Connection Error',
      'Unable to connect to the server. Please check your internet connection and try again.',
      [{ text: 'OK' }]
    );
  }
  
  static handleValidationError(errors: any[], context?: string): void {
    console.error(`[VALIDATION_ERROR] ${context || 'Validation Error'}:`, errors);
    
    const errorMessages = errors.map(err => err.message || err).join('\n');
    
    Alert.alert(
      'Validation Error',
      errorMessages,
      [{ text: 'OK' }]
    );
  }
  
  static handleUnexpectedError(error: any, context?: string): void {
    console.error(`[UNEXPECTED_ERROR] ${context || 'Unexpected Error'}:`, error);
    
    Alert.alert(
      'Unexpected Error',
      'Something went wrong. Please try again or contact support if the problem persists.',
      [{ text: 'OK' }]
    );
  }
  
  static logError(error: any, context?: string, additionalData?: any): void {
    const errorInfo = {
      context: context || 'Unknown',
      error: error.message || error,
      stack: error.stack,
      additionalData,
      timestamp: new Date().toISOString()
    };
    
    console.error(`[ERROR_LOG] ${context || 'Error'}:`, errorInfo);
    
    // In production, you might want to send this to a logging service
    // like Sentry, LogRocket, or your own logging endpoint
  }
}

export default ErrorHandler;







