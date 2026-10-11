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
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const initConnection = useCallback(() => {
    if (peerServiceRef.current) {
      return peerServiceRef.current;
    }

    const isInitiator = optionsRef.current.role === 'sender';

    const pc = new PeerConnectionService({
      onIceCandidate: (candidate) => {
        optionsRef.current.signalingService.sendMessage(
          'ICE_CANDIDATE',
          candidate.toJSON(),
          optionsRef.current.role,
          optionsRef.current.sessionId
        );
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
      onDataChannelOpened: (channel) => {
        optionsRef.current.onDataChannelReady(channel);
      },
      onError: (err) => {
        optionsRef.current.onError(err);
      },
    });

    peerServiceRef.current = pc;
    pc.initialize(isInitiator);

    while (pendingCandidatesRef.current.length > 0) {
      const c = pendingCandidatesRef.current.shift();
      if (c) {
        pc.addIceCandidate(c);
      }
    }

    return pc;
  }, []);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (!peerServiceRef.current) return;
    const answer = await peerServiceRef.current.handleOfferAndCreateAnswer(offer);
    optionsRef.current.signalingService.sendMessage(
      'ANSWER',
      answer,
      optionsRef.current.role,
      optionsRef.current.sessionId
    );
  }, []);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerServiceRef.current) return;
    await peerServiceRef.current.handleAnswer(answer);
  }, []);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!peerServiceRef.current) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }
    await peerServiceRef.current.addIceCandidate(candidate);
  }, []);

  const offerInitiatedRef = useRef(false);

  const startOffer = useCallback(async () => {
    if (!peerServiceRef.current) return;
    if (offerInitiatedRef.current) {
      return;
    }
    offerInitiatedRef.current = true;
    try {
      const offer = await peerServiceRef.current.createOffer();
      optionsRef.current.signalingService.sendMessage(
        'OFFER',
        offer,
        optionsRef.current.role,
        optionsRef.current.sessionId
      );
    } catch (err) {
      offerInitiatedRef.current = false;
      throw err;
    }
  }, []);

  const close = useCallback(() => {
    offerInitiatedRef.current = false;
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
