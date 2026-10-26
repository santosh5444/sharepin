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
  const offerInitiatedRef = useRef(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const roleRef = useRef<PeerRole>(options.role);
  const sessionIdRef = useRef<string>(options.sessionId);

  if (options.role) roleRef.current = options.role;
  if (options.sessionId) sessionIdRef.current = options.sessionId;

  const initConnection = useCallback((explicitRole?: PeerRole, explicitSessionId?: string) => {
    if (explicitRole) roleRef.current = explicitRole;
    if (explicitSessionId) sessionIdRef.current = explicitSessionId;

    if (peerServiceRef.current) {
      return peerServiceRef.current;
    }

    const currentRole = explicitRole || roleRef.current;
    const isInitiator = currentRole === 'sender';

    const pc = new PeerConnectionService({
      onIceCandidate: (candidate) => {
        optionsRef.current.signalingService.sendMessage(
          'ICE_CANDIDATE',
          candidate.toJSON(),
          roleRef.current,
          sessionIdRef.current
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
      roleRef.current,
      sessionIdRef.current
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

  const startOffer = useCallback(async (force = false) => {
    if (!peerServiceRef.current) return;
    if (offerInitiatedRef.current && !force) {
      return;
    }
    offerInitiatedRef.current = true;
    try {
      const offer = await peerServiceRef.current.createOffer();
      optionsRef.current.signalingService.sendMessage(
        'OFFER',
        offer,
        roleRef.current,
        sessionIdRef.current
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
