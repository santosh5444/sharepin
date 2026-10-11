import React, { useState, useEffect, useRef } from 'react';
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
  const [activeDataChannel, setActiveDataChannel] = useState<RTCDataChannel | null>(null);
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
      setActiveDataChannel(channel);
    },
    onError: (err) => {
      setSessionState('FAILED');
      setErrorMessage(`WebRTC Connection Error: ${err.message}`);
    },
  });

  const {
    progress: transferProgress,
    receivedFiles,
    prepareManifest,
    startSending,
    startReceiving,
    cancel: cancelTransfer,
  } = useFileTransfer(activeDataChannel);

  const resetAll = () => {
    resetSession();
    closePeerConnection();
    setActiveDataChannel(null);
    setIncomingManifest(null);
    setSelectedFiles([]);
    setReceiverAccepted(false);
  };

  const handleNavigateHome = () => {
    resetAll();
    setCurrentView('home');
  };

  // Setup WebSocket Signaling listener
  const connectSignaling = (sId: string, tok: string, peerRole: 'sender' | 'receiver') => {
    signalingService.connectWebSocket(sId, tok, peerRole, {
      onMessage: async (msg) => {
        switch (msg.type) {
          case 'PEER_CONNECTED':
            if (peerRole === 'sender') {
              setSessionState('RECEIVER_JOINED');
            } else {
              setSessionState('RECEIVER_JOINED');
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
            }
            break;

          case 'SENDER_APPROVED':
            // Receiver accepted transfer
            if (peerRole === 'sender') {
              setReceiverAccepted(true);
            }
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

      // Initiate WebRTC Offer
      await startOffer();
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

  const isSendingRef = useRef(false);
  const isReceivingRef = useRef(false);

  // 6. SENDER: Start file stream when DataChannel is open AND receiver accepted
  useEffect(() => {
    if (
      role === 'sender' &&
      activeDataChannel &&
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
          setSessionState('FAILED');
          setErrorMessage(err.message || 'Transfer error');
        });
    }
  }, [role, activeDataChannel, receiverAccepted, selectedFiles, startSending, setSessionState, setErrorMessage]);

  // 7. RECEIVER: Start receiving files when DataChannel is open AND accepted
  useEffect(() => {
    if (
      role === 'receiver' &&
      activeDataChannel &&
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
          setSessionState('FAILED');
          setErrorMessage(err.message || 'Transfer failed');
        });
    }
  }, [role, activeDataChannel, receiverAccepted, incomingManifest, startReceiving, setSessionState, setErrorMessage]);

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
            incomingManifest={incomingManifest}
            receivedFiles={receivedFiles}
            transferProgress={transferProgress}
            errorMessage={errorMessage}
            onReset={resetAll}
          />
        )}
      </main>

      <footer className="w-full border-t border-slate-200/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
          <div>
            <strong>SharePin</strong> • Pure Peer-to-Peer File Transfer
          </div>
          <div className="text-slate-400">
            Encrypted WebRTC • No permanent storage • Temporary 3-min PIN
          </div>
        </div>
      </footer>
    </div>
  );
};
