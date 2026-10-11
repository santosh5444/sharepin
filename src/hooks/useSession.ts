import { useState, useCallback, useRef, useEffect } from 'react';
import { SessionState, PeerRole } from '../types/session';
import { SignalingService } from '../services/signaling';

export function useSession() {
  const [sessionState, setSessionState] = useState<SessionState>('IDLE');
  const [sessionId, setSessionId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [role, setRole] = useState<PeerRole>('sender');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const signalingRef = useRef<SignalingService>(new SignalingService());

  const reset = useCallback(() => {
    signalingRef.current.close();
    setSessionState('IDLE');
    setSessionId('');
    setPin('');
    setToken('');
    setExpiresAt(0);
    setErrorMessage(null);
  }, []);

  const createSession = useCallback(async () => {
    try {
      setSessionState('CREATING');
      setErrorMessage(null);
      setRole('sender');

      const data = await signalingRef.current.createSession();
      setSessionId(data.sessionId);
      setPin(data.pin);
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setSessionState('WAITING_FOR_RECEIVER');

      return data;
    } catch (err: any) {
      setSessionState('FAILED');
      setErrorMessage(err.message || 'Failed to generate PIN');
      throw err;
    }
  }, []);

  const joinSession = useCallback(async (enteredPin: string) => {
    try {
      setSessionState('CONNECTING');
      setErrorMessage(null);
      setRole('receiver');

      const data = await signalingRef.current.joinSession(enteredPin);
      setSessionId(data.sessionId);
      setPin(enteredPin);
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setSessionState('RECEIVER_JOINED');

      return data;
    } catch (err: any) {
      setSessionState('FAILED');
      setErrorMessage(err.message || 'Failed to join session');
      throw err;
    }
  }, []);

  // Expiry check
  useEffect(() => {
    if (!expiresAt || sessionState === 'IDLE' || sessionState === 'COMPLETED' || sessionState === 'TRANSFERRING' || sessionState === 'CONNECTED') {
      return;
    }

    const timer = setInterval(() => {
      if (Date.now() >= expiresAt && sessionState === 'WAITING_FOR_RECEIVER') {
        setSessionState('EXPIRED');
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, sessionState]);

  return {
    sessionState,
    setSessionState,
    sessionId,
    pin,
    token,
    expiresAt,
    role,
    errorMessage,
    setErrorMessage,
    signalingService: signalingRef.current,
    createSession,
    joinSession,
    reset,
  };
}
