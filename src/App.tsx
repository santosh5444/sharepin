import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { Send } from './pages/Send';
import { Receive } from './pages/Receive';
import { useSession } from './hooks/useSession';
import { usePeerConnection } from './hooks/usePeerConnection';
import { useFileTransfer } from './hooks/useFileTransfer';
import { TransferManifest } from './types/transfer';

type View = 'home' | 'send' | 'receive';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeDataChannel, setActiveDataChannel] = useState<RTCDataChannel | null>(null);
  const [incomingManifest, setIncomingManifest] = useState<TransferManifest | null>(null);

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
      setSessionState('CONNECTED');
    },
    onError: (err) => {
      setSessionState('FAILED');
      setErrorMessage(`WebRTC Connection Error: ${err.message}`);
    },
  });

  const {
    progress: transferProgress,
    prepareManifest,
    startSending,
    startReceiving,
    cancel: cancelTransfer,
  } = useFileTransfer(activeDataChannel);

  const isSenderRef = useRef(false);
  isSenderRef.current = role === 'sender';

  const resetAll = () => {
    resetSession();
    closePeerConnection();
    setActiveDataChannel(null);
    setIncomingManifest(null);
    setSelectedFiles([]);
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
              setSessionState('CONNECTING');
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
            if (peerRole === 'receiver') {
              setSessionState('CONNECTING');
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
        // Fallback for offline or local preview
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

      // Send approval & manifest to receiver
      const manifest = await prepareManifest(selectedFiles);
      signalingService.sendMessage(
        'SENDER_APPROVAL_REQUEST',
        { manifest },
        'sender',
        sessionId
      );

      // Start WebRTC Offer
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
  const handleAcceptTransfer = async () => {
    setSessionState('TRANSFERRING');
    signalingService.sendMessage('SENDER_APPROVED', null, 'receiver', sessionId);

    if (incomingManifest && activeDataChannel) {
      try {
        await startReceiving(incomingManifest);
        setSessionState('COMPLETED');
      } catch (err: any) {
        setSessionState('FAILED');
        setErrorMessage(err.message || 'Transfer failed');
      }
    }
  };

  // 6. When DataChannel opens and sender is ready, start file streaming
  useEffect(() => {
    if (activeDataChannel && role === 'sender' && sessionState === 'CONNECTED' && selectedFiles.length > 0) {
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
  }, [activeDataChannel, role, sessionState, selectedFiles, startSending, setSessionState, setErrorMessage]);

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
            Encrypted WebRTC • No permanent storage • Temporary 2-min PIN
          </div>
        </div>
      </footer>
    </div>
  );
};
