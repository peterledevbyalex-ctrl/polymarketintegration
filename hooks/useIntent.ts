import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { IntentUpdate, StateTransition, IntentError } from '@/types/polymarket.types';
import { POLYMARKET_API_URL, POLL_INTERVAL_MS } from '@/lib/polymarket/constants';
import { polymarketAPI } from '@/lib/polymarket/api';

interface UseIntentReturn {
  status: IntentUpdate | null;
  connected: boolean;
  error: IntentError | null;
  lastTransition: StateTransition | null;
}

const TERMINAL_STATES = ['FILLED', 'PARTIAL_FILL', 'FAILED', 'CANCELLED'];

export const useIntent = (intentId: string | null): UseIntentReturn => {
  const [status, setStatus] = useState<IntentUpdate | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<IntentError | null>(null);
  const [lastTransition, setLastTransition] = useState<StateTransition | null>(null);
  const [usePolling, setUsePolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!intentId) {
      setStatus(null);
      setError(null);
      setLastTransition(null);
      return;
    }

    let socket: Socket | null = null;
    let wsConnectionTimeout: NodeJS.Timeout;

    const startPolling = async () => {
      console.log('[useIntent] Starting polling fallback for:', intentId);
      setUsePolling(true);
      setConnected(true);

      const poll = async () => {
        try {
          const response = await polymarketAPI.getIntentStatus(intentId);
          setStatus({
            intentId: response.intentId,
            state: response.state,
            relayStatus: response.relayStatus,
            originTxHash: response.originTxHash,
            polygonFundingTxHash: response.polygonFundingTxHash,
            polymarketOrderId: response.polymarketOrderId,
            fill: response.fill,
            error: response.error,
          });

          if (TERMINAL_STATES.includes(response.state)) {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        } catch (err) {
          console.error('[useIntent] Polling error:', err);
        }
      };

      await poll();
      pollingIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    };

    wsConnectionTimeout = setTimeout(() => {
      console.log('[useIntent] WebSocket timeout, falling back to polling');
      if (socket) {
        socket.disconnect();
      }
      startPolling();
    }, 1500); // Faster fallback - 1.5s instead of 3s

    socket = io(POLYMARKET_API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 3,
    });

    socket.on('connect', () => {
      clearTimeout(wsConnectionTimeout);
      setConnected(true);
      setUsePolling(false);
      socket?.emit('subscribe:intent', intentId);
      console.log('[useIntent] WebSocket connected');
      
      // Immediately fetch current status (don't wait for first WS message)
      polymarketAPI.getIntentStatus(intentId).then((response) => {
        setStatus({
          intentId: response.intentId,
          state: response.state,
          relayStatus: response.relayStatus,
          originTxHash: response.originTxHash,
          polygonFundingTxHash: response.polygonFundingTxHash,
          polymarketOrderId: response.polymarketOrderId,
          fill: response.fill,
          error: response.error,
        });
      }).catch(() => {}); // Ignore errors, WS will update
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('subscribed', ({ intentId: subscribedId }: { intentId: string }) => {
      console.log('[useIntent] Subscribed to:', subscribedId);
    });

    socket.on('intent:update', (data: IntentUpdate) => {
      setStatus(data);
      if (data.error) {
        setError({ intentId: data.intentId, error: data.error });
      }
    });

    socket.on('intent:state-transition', (transition: StateTransition) => {
      setLastTransition(transition);
    });

    socket.on('intent:error', (errorData: IntentError) => {
      setError(errorData);
    });

    socket.on('connect_error', (err: Error) => {
      console.error('[useIntent] WebSocket connection error:', err.message);
    });

    return () => {
      clearTimeout(wsConnectionTimeout);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (socket) {
        socket.emit('unsubscribe:intent', intentId);
        socket.disconnect();
      }
    };
  }, [intentId]);

  return { status, connected, error, lastTransition };
};
