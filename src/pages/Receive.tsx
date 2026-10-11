import React, { useState } from 'react';
import { PinInput } from '../components/PinInput';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { TransferProgress } from '../components/TransferProgress';
import { ErrorMessage } from '../components/ErrorMessage';
import { SessionState } from '../types/session';
import { TransferManifest, TransferProgress as TransferProgressType } from '../types/transfer';
import { CompletedFileItem } from '../hooks/useFileTransfer';
import { formatBytes } from '../utils/formatBytes';
import { downloadFilesAsZip } from '../utils/zipArchive';
import { FilePreviewModal, PreviewableFile } from '../components/FilePreviewModal';
import {
  Download,
  Check,
  ShieldCheck,
  ArrowLeft,
  RotateCcw,
  FileBox,
  Loader2,
  Archive,
  Eye,
  FileImage,
  FileText,
  FileVideo,
  FileAudio,
  File,
} from 'lucide-react';

interface ReceiveProps {
  onBack: () => void;
  onJoinSession?: (pin: string) => Promise<void>;
  onAcceptTransfer?: () => void;
  onDeclineTransfer?: () => void;
  onCancelTransfer?: () => void;
  sessionState?: SessionState;
  incomingManifest?: TransferManifest | null;
  receivedFiles?: CompletedFileItem[];
  transferProgress?: TransferProgressType;
  errorMessage?: string | null;
  onReset?: () => void;
}

function getFileIcon(name: string, type: string) {
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].some(ext => name.endsWith(ext))) {
    return <FileImage className="w-4 h-4 text-indigo-500" />;
  }
  if (type.startsWith('video/') || ['mp4', 'mkv', 'webm'].some(ext => name.endsWith(ext))) {
    return <FileVideo className="w-4 h-4 text-rose-500" />;
  }
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg'].some(ext => name.endsWith(ext))) {
    return <FileAudio className="w-4 h-4 text-amber-500" />;
  }
  if (type.startsWith('text/') || ['pdf', 'txt', 'md'].some(ext => name.endsWith(ext))) {
    return <FileText className="w-4 h-4 text-blue-500" />;
  }
  return <File className="w-4 h-4 text-slate-400" />;
}

export const Receive: React.FC<ReceiveProps> = ({
  onBack,
  onJoinSession,
  onAcceptTransfer,
  onDeclineTransfer,
  onCancelTransfer,
  sessionState = 'IDLE',
  incomingManifest = null,
  receivedFiles = [],
  transferProgress,
  errorMessage = null,
  onReset,
}) => {
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAccepted, setHasAccepted] = useState(false);
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  const handlePinChange = (newPin: string) => {
    setPin(newPin);
  };

  const handleAccept = () => {
    setHasAccepted(true);
    onAcceptTransfer?.();
  };

  const handleJoin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.length !== 5 || !onJoinSession) return;

    try {
      setIsSubmitting(true);
      await onJoinSession(pin);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAllZip = async () => {
    if (receivedFiles.length === 0) return;
    try {
      setIsZipping(true);
      await downloadFilesAsZip(receivedFiles, `sharepin_${pin || 'files'}.zip`);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8">
      {/* Header Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1.5 text-xs sm:text-sm font-medium text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <ConnectionStatus state={sessionState} role="receiver" />
      </div>

      {errorMessage && (
        <ErrorMessage
          message={errorMessage}
          onRetry={onReset}
          onHome={onBack}
        />
      )}

      {/* Step 1: PIN Input */}
      {sessionState === 'IDLE' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Download className="w-7 h-7" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Enter 5-Digit PIN
          </h2>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            Type the 5-digit PIN provided by the sender. Leading zeros are preserved.
          </p>

          <form onSubmit={handleJoin} className="mt-8">
            <PinInput
              value={pin}
              onChange={handlePinChange}
              disabled={isSubmitting}
              hasError={Boolean(errorMessage)}
            />

            <div className="mt-8">
              <button
                type="submit"
                disabled={pin.length !== 5 || isSubmitting}
                className={`w-full max-w-xs py-3.5 px-6 rounded-2xl font-bold text-sm sm:text-base shadow-md transition-all ${
                  pin.length === 5 && !isSubmitting
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-95'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isSubmitting ? 'Joining Session...' : 'Connect & Receive'}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center space-x-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Encrypted WebRTC • No files stored in cloud</span>
          </div>
        </div>
      )}

      {/* Step 2: Waiting for Sender Approval */}
      {(sessionState === 'CONNECTING' || sessionState === 'RECEIVER_JOINED') && !incomingManifest && (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            Connected to Sender!
          </h3>
          <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
            Please approve the transfer on the sender's device. Once the sender approves, you will be able to review and download the incoming files.
          </p>
          <div className="mt-6 inline-flex items-center space-x-2 text-xs font-semibold text-brand-700 bg-brand-50 px-4 py-2 rounded-full border border-brand-200">
            <span className="w-2 h-2 rounded-full bg-brand-600 animate-ping" />
            <span>Waiting for sender to click "Approve & Send"</span>
          </div>
        </div>
      )}

      {/* Step 3: Incoming Manifest Preview (After Sender Approves) */}
      {(sessionState === 'RECEIVER_JOINED' || sessionState === 'CONNECTING') && incomingManifest && !hasAccepted && (
        <div className="bg-white border-2 border-emerald-500 rounded-3xl p-6 sm:p-8 shadow-md">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <FileBox className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              Incoming Files
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Sender is offering {incomingManifest.totalFiles} {incomingManifest.totalFiles === 1 ? 'file' : 'files'} ({formatBytes(incomingManifest.totalBytes)}).
            </p>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl p-2 bg-slate-50/50 mb-6">
            {incomingManifest.files.map((file, idx) => (
              <div key={file.id || idx} className="py-2.5 px-3 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2.5 truncate max-w-xs">
                  {getFileIcon(file.name, file.type)}
                  <span className="font-medium text-slate-800 truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <span className="text-slate-500 font-mono font-medium">
                  {formatBytes(file.size)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center space-x-4">
            <button
              type="button"
              onClick={handleAccept}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Accept & Download</span>
            </button>
            <button
              type="button"
              onClick={onDeclineTransfer}
              className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-semibold text-sm transition"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Connecting / Transferring */}
      {(sessionState === 'CONNECTING' || sessionState === 'CONNECTED' || sessionState === 'TRANSFERRING') && incomingManifest && hasAccepted && (
        <div className="space-y-6">
          {transferProgress ? (
            <TransferProgress
              progress={transferProgress}
              onCancel={onCancelTransfer}
              role="receiver"
            />
          ) : (
            <div className="bg-white border-2 border-emerald-500 rounded-3xl p-8 text-center shadow-md">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Download className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Connecting & Receiving...</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Opening encrypted direct peer-to-peer data channel. Your download will start automatically in a moment.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Completed with Preview & ZIP */}
      {sessionState === 'COMPLETED' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 text-center">Files Received!</h3>
          <p className="text-sm text-slate-600 mt-2 text-center">
            All files were verified with SHA-256 integrity and saved locally.
          </p>

          {/* Received Files List with In-Browser Preview */}
          {receivedFiles.length > 0 && (
            <div className="mt-6 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-slate-50/50">
              <div className="px-4 py-2.5 bg-slate-100/70 text-xs font-semibold text-slate-600 flex items-center justify-between">
                <span>Received Files ({receivedFiles.length})</span>
                <span>Actions</span>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                {receivedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-white transition">
                    <div className="flex items-center space-x-2.5 truncate max-w-xs sm:max-w-sm">
                      {getFileIcon(file.name, file.type)}
                      <div className="truncate">
                        <p className="font-medium text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition"
                        title="Preview file in browser"
                        aria-label={`Preview ${file.name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons: ZIP bundle & New session */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            {receivedFiles.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={isZipping}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-semibold text-xs shadow transition"
              >
                <Archive className="w-4 h-4 text-brand-400" />
                <span>{isZipping ? 'Bundling ZIP...' : 'Download All as Single ZIP'}</span>
              </button>
            )}

            <button
              onClick={onReset}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow transition active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Receive Another File</span>
            </button>
          </div>
        </div>
      )}

      {/* Inline Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
};
