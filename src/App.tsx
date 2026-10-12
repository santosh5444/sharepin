import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { Send } from './pages/Send';
import { Receive } from './pages/Receive';
import { useSession } from './hooks/useSession';
import { usePeerConnection } from './hooks/usePeerConnection';
import { useFileTransfer } from './hooks/useFileTransfer';
import { TransferManifest } from './types/transfer';
import { playSuccessChime } from './utils/audioFeedback';

type View = 'home' | 'send' | 'receive';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeTransport, setActiveTransport] = useState<RTCDataChannel | WebSocket | null>(null);
  const [incomingManifest, setIncomingManifest] = useState<TransferManifest | null>(null);
  const [receiverAccepted, setReceiverAccepted] = useState(false);

  const {
    sessionState,
    setSessionState,
    sessionId,
    pin,
    expiresAt,
    role,
    errorMessage,
    setErrorMessage,
    signalingService,
    createSession,
    joinSession,
    reset: resetSession,
  } = useSession();

  const {
    initConnection,
    startOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    close: closePeerConnection,
  } = usePeerConnection({
    sessionId,
    role,
    signalingService,
    onDataChannelReady: (channel) => {
      setActiveTransport(channel);
    },
    onError: (err) => {
      // If WebRTC fails (e.g. strict NAT/5G), fall back seamlessly to signaling WebSocket
      const ws = signalingService.getWebSocketTransport();
      if (ws) {
        console.warn('WebRTC failed, falling back to instant WebSocket relay:', err.message);
        setActiveTransport(ws);
      } else {
        setSessionState('FAILED');
        setErrorMessage(`Connection Error: ${err.message}`);
      }
    },
  });

  const {
    progress: transferProgress,
    receivedFiles,
    prepareManifest,
    startSending,
    startReceiving,
    cancel: cancelTransfer,
  } = useFileTransfer(activeTransport);

  const isSendingRef = useRef(false);
  const isReceivingRef = useRef(false);

  const resetAll = () => {
    resetSession();
    closePeerConnection();
    setActiveTransport(null);
    setIncomingManifest(null);
    setSelectedFiles([]);
    setReceiverAccepted(false);
    isSendingRef.current = false;
    isReceivingRef.current = false;
  };

  const handleNavigateHome = () => {
    resetAll();
    setCurrentView('home');
  };

  // Setup WebSocket Signaling listener
  const connectSignaling = (sId: string, tok: string, peerRole: 'sender' | 'receiver') => {
    signalingService.connectWebSocket(sId, tok, peerRole, {
      onOpen: () => {
        if (peerRole === 'receiver') {
          // Notify sender receiver has connected in case of race
          signalingService.sendMessage('RECIPIENT_READY', null, 'receiver', sId);
        }
      },
      onMessage: async (msg) => {
        switch (msg.type) {
          case 'PEER_CONNECTED':
          case 'RECIPIENT_READY' as any:
            setSessionState('RECEIVER_JOINED');
            if (peerRole === 'sender') {
              try { playSuccessChime(); } catch {}
              // Pre-warm WebRTC connection early in background while awaiting sender approval
              initConnection();
              startOffer().catch(() => {});
            } else {
              initConnection();
            }
            break;

          case 'OFFER':
            if (peerRole === 'receiver') {
              initConnection();
              await handleOffer(msg.payload);
            }
            break;

          case 'ANSWER':
            if (peerRole === 'sender') {
              await handleAnswer(msg.payload);
            }
            break;

          case 'ICE_CANDIDATE':
            await handleIceCandidate(msg.payload);
            break;

          case 'SENDER_APPROVAL_REQUEST':
            if (peerRole === 'receiver') {
              setIncomingManifest(msg.payload.manifest);
              setSessionState('RECEIVER_JOINED');
              initConnection();
            }
            break;

          case 'SENDER_APPROVED':
            // Receiver accepted transfer
            if (peerRole === 'sender') {
              setReceiverAccepted(true);
            }
            break;

          case 'FALLBACK_TO_RELAY':
            console.log('Peer requested Cloudflare Edge Relay fallback');
            fallbackToRelayTransport();
            break;

          case 'SENDER_REJECTED':
            setSessionState('CANCELLED');
            setErrorMessage('Transfer was declined by the sender.');
            break;

          case 'SESSION_CANCELLED':
            setSessionState('CANCELLED');
            setErrorMessage('Session was cancelled by the other device.');
            break;

          case 'PEER_DISCONNECTED':
            if (sessionState !== 'COMPLETED') {
              setSessionState('FAILED');
              setErrorMessage('The other device disconnected.');
            }
            break;
        }
      },
      onError: () => {
        console.warn('Signaling WebSocket error or offline');
      },
    });
  };

  const fallbackToRelayTransport = useCallback(() => {
    const ws = signalingService.getWebSocketTransport();
    if (ws) {
      console.log('Engaging instant Cloudflare Edge WebSocket Relay transport');
      isSendingRef.current = false;
      isReceivingRef.current = false;
      setActiveTransport(ws);
    }
  }, [signalingService]);

  // 1. SENDER: Create session
  const handleCreateSession = async (files: File[]) => {
    try {
      setSelectedFiles(files);
      const data = await createSession();
      connectSignaling(data.sessionId, data.token, 'sender');
      return { pin: data.pin, expiresAt: data.expiresAt };
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not create session');
      throw err;
    }
  };

  // 2. RECEIVER: Join session
  const handleJoinSession = async (enteredPin: string) => {
    try {
      const data = await joinSession(enteredPin);
      connectSignaling(data.sessionId, data.token, 'receiver');
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not join session');
      throw err;
    }
  };

  // 3. SENDER: Approves recipient
  const handleApproveTransfer = async () => {
    try {
      setSessionState('CONNECTING');
      initConnection();

      // Send manifest preview to receiver
      const manifest = await prepareManifest(selectedFiles);
      signalingService.sendMessage(
        'SENDER_APPROVAL_REQUEST',
        { manifest },
        'sender',
        sessionId
      );

      // Initiate WebRTC Offer if not already established
      if (!activeTransport || (activeTransport instanceof RTCDataChannel && activeTransport.readyState !== 'open')) {
        await startOffer();
      }
    } catch (err: any) {
      setSessionState('FAILED');
      setErrorMessage(`Failed to initiate connection: ${err.message}`);
    }
  };

  // 4. SENDER: Rejects recipient
  const handleRejectTransfer = () => {
    signalingService.sendMessage('SENDER_REJECTED', null, 'sender', sessionId);
    setSessionState('CANCELLED');
  };

  // 5. RECEIVER: Accepts transfer
  const handleAcceptTransfer = () => {
    setReceiverAccepted(true);
    setSessionState('CONNECTING');
    signalingService.sendMessage('SENDER_APPROVED', null, 'receiver', sessionId);
  };

  // Synchronized NAT Traversal / 5G Fallback timer:
  // Give direct WebRTC STUN NAT punch-through 5.0 seconds across cellular/Wi-Fi carriers
  // before switching peers to high-throughput Cloudflare edge WebSocket relay.
  useEffect(() => {
    if (receiverAccepted && (!activeTransport || (activeTransport instanceof RTCDataChannel && activeTransport.readyState !== 'open'))) {
      const timer = setTimeout(() => {
        const ws = signalingService.getWebSocketTransport();
        if (ws && (activeTransport as any) !== ws) {
          console.log('WebRTC connection not open within 5.0s (likely symmetric NAT). Engaging Cloudflare Edge Relay.');
          signalingService.sendMessage('FALLBACK_TO_RELAY', null, role, sessionId);
          fallbackToRelayTransport();
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [receiverAccepted, activeTransport, signalingService, role, sessionId, fallbackToRelayTransport]);

  // 6. SENDER: Start file stream when transport is open AND receiver accepted
  useEffect(() => {
    if (
      role === 'sender' &&
      activeTransport &&
      receiverAccepted &&
      selectedFiles.length > 0 &&
      !isSendingRef.current
    ) {
      isSendingRef.current = true;
      setSessionState('TRANSFERRING');
      startSending(selectedFiles)
        .then(() => {
          setSessionState('COMPLETED');
        })
        .catch((err) => {
          const ws = signalingService.getWebSocketTransport();
          if (activeTransport !== ws && ws) {
            console.warn('WebRTC transfer attempt failed. Falling back to Cloudflare relay:', err.message);
            signalingService.sendMessage('FALLBACK_TO_RELAY', null, 'sender', sessionId);
            fallbackToRelayTransport();
          } else {
            setSessionState('FAILED');
            setErrorMessage(err.message || 'Transfer error');
          }
        });
    }
  }, [role, activeTransport, receiverAccepted, selectedFiles, startSending, setSessionState, setErrorMessage, signalingService, sessionId, fallbackToRelayTransport]);

  // 7. RECEIVER: Start receiving files when transport is open AND accepted
  useEffect(() => {
    if (
      role === 'receiver' &&
      activeTransport &&
      receiverAccepted &&
      incomingManifest &&
      !isReceivingRef.current
    ) {
      isReceivingRef.current = true;
      setSessionState('TRANSFERRING');
      startReceiving(incomingManifest)
        .then(() => {
          setSessionState('COMPLETED');
        })
        .catch((err) => {
          const ws = signalingService.getWebSocketTransport();
          if (activeTransport !== ws && ws) {
            console.warn('WebRTC receive failed. Falling back to Cloudflare relay:', err.message);
            signalingService.sendMessage('FALLBACK_TO_RELAY', null, 'receiver', sessionId);
            fallbackToRelayTransport();
          } else {
            setSessionState('FAILED');
            setErrorMessage(err.message || 'Transfer failed');
          }
        });
    }
  }, [role, activeTransport, receiverAccepted, incomingManifest, startReceiving, setSessionState, setErrorMessage, signalingService, sessionId, fallbackToRelayTransport]);

  // Audio Chime on Completion
  useEffect(() => {
    if (sessionState === 'COMPLETED') {
      playSuccessChime();
    }
  }, [sessionState]);

  // Scan-to-Receive: Detect ?pin=XXXXX query parameter on load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('pin');
    if (pinParam && /^[0-9]{5}$/.test(pinParam)) {
      setCurrentView('receive');
      handleJoinSession(pinParam);
      // Clean up URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        currentView={currentView}
        onNavigateHome={handleNavigateHome}
      />

      <main className="flex-1 flex flex-col items-center justify-center">
        {currentView === 'home' && (
          <Home
            onSelectSend={() => {
              resetAll();
              setCurrentView('send');
            }}
            onSelectReceive={() => {
              resetAll();
              setCurrentView('receive');
            }}
          />
        )}

        {currentView === 'send' && (
          <Send
            onBack={handleNavigateHome}
            onCreateSession={handleCreateSession}
            onApproveTransfer={handleApproveTransfer}
            onRejectTransfer={handleRejectTransfer}
            onCancelTransfer={() => {
              cancelTransfer();
              resetAll();
            }}
            sessionState={sessionState}
            pin={pin}
            expiresAt={expiresAt}
            transferProgress={transferProgress}
            errorMessage={errorMessage}
            onReset={resetAll}
            isDirectP2P={activeTransport instanceof RTCDataChannel}
          />
        )}

        {currentView === 'receive' && (
          <Receive
            onBack={handleNavigateHome}
            onJoinSession={handleJoinSession}
            onAcceptTransfer={handleAcceptTransfer}
            onDeclineTransfer={() => {
              signalingService.sendMessage('SESSION_CANCELLED', null, 'receiver', sessionId);
              setSessionState('CANCELLED');
            }}
            onCancelTransfer={() => {
              cancelTransfer();
              resetAll();
            }}
            sessionState={sessionState}
            pin={pin}
            incomingManifest={incomingManifest}
            receivedFiles={receivedFiles}
            transferProgress={transferProgress}
            errorMessage={errorMessage}
            onReset={resetAll}
            isDirectP2P={activeTransport instanceof RTCDataChannel}
          />
        )}
      </main>

      <footer className="w-full border-t border-slate-200/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <strong className="text-slate-800">SharePin</strong>
            <span className="text-slate-300">•</span>
            <span>Pure Peer-to-Peer File Transfer</span>
          </div>

          {/* Crafted with love credit */}
          <div className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-slate-100/90 border border-slate-200/80 shadow-sm text-xs text-slate-600 transition hover:border-brand-200">
            <span>Made with</span>
            <span className="text-rose-500 text-sm animate-pulse inline-block select-none leading-none">❤️</span>
            <span>by</span>
            <span className="font-extrabold tracking-wide bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Santosh
            </span>
          </div>

          <div className="text-slate-400">
            Encrypted WebRTC • Zero Storage • Ephemeral P2P
          </div>
        </div>
      </footer>
    </div>
  );
};
