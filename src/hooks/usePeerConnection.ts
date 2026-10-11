import { useState, useCallback, useRef } from 'react';
import { PeerConnectionService } from '../services/peerConnection';
import { SignalingService } from '../services/signaling';
import { PeerRole } from '../types/session';

interface UsePeerConnectionOptions {
  sessionId: string;
  role: PeerRole;
  signalingService: SignalingService;
  onDataChannelReady: (channel: RTCDataChannel) => void;
  onError: (error: Error) => void;
}

export function usePeerConnection(options: UsePeerConnectionOptions) {
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const peerServiceRef = useRef<PeerConnectionService | null>(null);

  const initConnection = useCallback(() => {
    const isInitiator = options.role === 'sender';

    const pc = new PeerConnectionService({
      onIceCandidate: (candidate) => {
        options.signalingService.sendMessage(
          'ICE_CANDIDATE',
          candidate.toJSON(),
          options.role,
          options.sessionId
        );
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
      onDataChannelOpened: (channel) => {
        options.onDataChannelReady(channel);
      },
      onError: (err) => {
        options.onError(err);
      },
    });

    peerServiceRef.current = pc;
    pc.initialize(isInitiator);

    return pc;
  }, [options]);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (!peerServiceRef.current) return;
    const answer = await peerServiceRef.current.handleOfferAndCreateAnswer(offer);
    options.signalingService.sendMessage('ANSWER', answer, options.role, options.sessionId);
  }, [options]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerServiceRef.current) return;
    await peerServiceRef.current.handleAnswer(answer);
  }, []);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!peerServiceRef.current) return;
    await peerServiceRef.current.addIceCandidate(candidate);
  }, []);

  const startOffer = useCallback(async () => {
    if (!peerServiceRef.current) return;
    const offer = await peerServiceRef.current.createOffer();
    options.signalingService.sendMessage('OFFER', offer, options.role, options.sessionId);
  }, [options]);

  const close = useCallback(() => {
    peerServiceRef.current?.close();
    peerServiceRef.current = null;
    setConnectionState('closed');
  }, []);

  return {
    connectionState,
    initConnection,
    startOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    close,
  };
}
