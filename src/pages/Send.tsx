import React, { useState, useEffect } from 'react';
import { FilePicker } from '../components/FilePicker';
import { FileList } from '../components/FileList';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { TransferProgress } from '../components/TransferProgress';
import { ErrorMessage } from '../components/ErrorMessage';
import { SessionState } from '../types/session';
import { TransferProgress as TransferProgressType } from '../types/transfer';
import { formatBytes } from '../utils/formatBytes';
import { Copy, Check, Clock, UserCheck, ArrowLeft, RotateCcw } from 'lucide-react';

interface SendProps {
  onBack: () => void;
  // External hooks or callbacks will inject real networking in Phase 4
  onCreateSession?: (files: File[]) => Promise<{ pin: string; expiresAt: number }>;
  onApproveTransfer?: () => void;
  onRejectTransfer?: () => void;
  onCancelTransfer?: () => void;
  sessionState?: SessionState;
  pin?: string;
  expiresAt?: number;
  transferProgress?: TransferProgressType;
  errorMessage?: string | null;
  onReset?: () => void;
}

export const Send: React.FC<SendProps> = ({
  onBack,
  onCreateSession,
  onApproveTransfer,
  onRejectTransfer,
  onCancelTransfer,
  sessionState = 'IDLE',
  pin = '',
  expiresAt = 0,
  transferProgress,
  errorMessage = null,
  onReset,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [copiedPin, setCopiedPin] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(180);

  // 3-minute countdown timer logic
  useEffect(() => {
    if (!expiresAt || sessionState === 'IDLE' || sessionState === 'EXPIRED' || sessionState === 'COMPLETED') {
      return;
    }

    const interval = setInterval(() => {
      const remainingMs = expiresAt - Date.now();
      const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
      setTimeLeftSeconds(remainingSec);
    }, 500);

    return () => clearInterval(interval);
  }, [expiresAt, sessionState]);

  const handleFilesSelected = (newFiles: File[]) => {
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
  };

  const handleCopyPin = async () => {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    } catch {
      // Fallback
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    }
  };

  const handleStartSession = async () => {
    if (selectedFiles.length === 0 || !onCreateSession) return;
    await onCreateSession(selectedFiles);
  };

  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8">
      {/* Top Header / Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1.5 text-xs sm:text-sm font-medium text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <ConnectionStatus state={sessionState} role="sender" />
      </div>

      {errorMessage && (
        <ErrorMessage
          message={errorMessage}
          onRetry={onReset}
          onHome={onBack}
        />
      )}

      {/* Step 1: File Selection (Before PIN is generated) */}
      {sessionState === 'IDLE' && (
        <div className="space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Select files to send
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Select one or multiple files or folders. A temporary 5-digit PIN will be generated.
            </p>
          </div>

          <FilePicker onFilesSelected={handleFilesSelected} />

          <FileList
            files={selectedFiles}
            onRemoveFile={handleRemoveFile}
            onClearAll={handleClearAll}
          />

          {selectedFiles.length > 0 && (
            <div className="pt-4">
              <button
                type="button"
                onClick={handleStartSession}
                className="w-full py-4 px-6 rounded-2xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-bold text-base sm:text-lg shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center space-x-2"
              >
                <span>Generate 5-Digit PIN</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/20">
                  {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} • {formatBytes(totalBytes)}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: PIN Generated - Waiting for Receiver */}
      {(sessionState === 'WAITING_FOR_RECEIVER' || sessionState === 'CREATING') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
            Share this temporary PIN
          </span>

          {/* Large 5-digit PIN display with leading zeroes */}
          <div className="my-6 inline-flex items-center justify-center px-6 py-4 bg-slate-50 border-2 border-brand-200 rounded-3xl space-x-3">
            <span className="font-mono text-4xl sm:text-6xl font-black tracking-widest text-brand-700 select-all">
              {pin || '-----'}
            </span>
            <button
              onClick={handleCopyPin}
              className="p-3 rounded-2xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-95 text-slate-600 hover:text-brand-600 transition"
              title="Copy PIN"
              aria-label="Copy 5-digit PIN"
            >
              {copiedPin ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>

          {/* 2-Minute Expiry Countdown */}
          <div className="flex items-center justify-center space-x-2 text-sm text-slate-600 mb-6">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>PIN expires in</span>
            <span className="font-mono font-bold text-slate-900 bg-amber-50 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-200">
              {formatCountdown(timeLeftSeconds)}
            </span>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-500 leading-relaxed mb-6">
            Open <strong className="text-slate-700">SharePin</strong> on the receiving device and enter this PIN. The file transfer will begin directly device-to-device once approved.
          </div>

          <div className="flex items-center justify-center space-x-4">
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition"
            >
              Cancel session
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Receiver Joined - Sender Approval Step */}
      {sessionState === 'RECEIVER_JOINED' && (
        <div className="bg-white border-2 border-brand-500 rounded-3xl p-6 sm:p-8 shadow-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-7 h-7" />
          </div>

          <h3 className="text-xl font-bold text-slate-900">
            Recipient is ready!
          </h3>
          <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
            A receiver entered PIN <span className="font-mono font-bold text-brand-700">{pin}</span> and requested to receive:
          </p>

          <div className="my-5 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 max-w-sm mx-auto">
            {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} • {formatBytes(totalBytes)}
          </div>

          <div className="flex items-center justify-center space-x-3">
            <button
              type="button"
              onClick={onApproveTransfer}
              className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-95 text-white font-bold text-sm shadow-md shadow-brand-600/20 transition"
            >
              Approve & Send
            </button>
            <button
              type="button"
              onClick={onRejectTransfer}
              className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-semibold text-sm transition"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Transferring or Connected */}
      {(sessionState === 'CONNECTING' || sessionState === 'CONNECTED' || sessionState === 'TRANSFERRING') && (
        <div className="space-y-6">
          {transferProgress && (
            <TransferProgress
              progress={transferProgress}
              onCancel={onCancelTransfer}
              role="sender"
            />
          )}
        </div>
      )}

      {/* Step 5: Completed */}
      {sessionState === 'COMPLETED' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900">Transfer Completed!</h3>
          <p className="text-sm text-slate-600 mt-2">
            Successfully sent {selectedFiles.length} files ({formatBytes(totalBytes)}) directly to recipient.
          </p>

          <div className="mt-8 flex items-center justify-center space-x-4">
            <button
              onClick={onReset}
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm shadow hover:bg-brand-500 transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Send More Files</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Expired or Cancelled */}
      {sessionState === 'EXPIRED' && (
        <div className="bg-white border border-amber-200 rounded-3xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">PIN Expired</h3>
          <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
            The 3-minute joining window for PIN <span className="font-mono font-bold">{pin}</span> has elapsed. Active reservations are automatically cleared.
          </p>

          <div className="mt-6">
            <button
              onClick={onReset}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-sm shadow hover:bg-brand-500 transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Create New PIN</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
