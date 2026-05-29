import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
  isLoading: boolean;
}

export const useNetwork = (): NetworkState => {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: null,
    type: 'unknown',
    isLoading: true,
  });

  useEffect(() => {
    let isMounted = true;

    const checkNetworkState = async () => {
      try {
        const networkStateResult = await Network.getNetworkStateAsync();
        if (isMounted) {
          setNetworkState({
            isConnected: networkStateResult.isConnected ?? false,
            isInternetReachable: networkStateResult.isInternetReachable ?? null,
            type: networkStateResult.type ?? 'unknown',
            isLoading: false,
          });
        }
      } catch (error) {
        console.warn('Error checking network state:', error);
        if (isMounted) {
          setNetworkState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    // Check initial state
    checkNetworkState();

    // Set up periodic checks (every 30 seconds)
    const interval = setInterval(checkNetworkState, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return networkState;
};

export default useNetwork;
