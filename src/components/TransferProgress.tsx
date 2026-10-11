import React from 'react';
import { TransferProgress as TransferProgressType } from '../types/transfer';
import { formatBytes, formatSpeed, formatDuration } from '../utils/formatBytes';
import { ShieldCheck, XOctagon } from 'lucide-react';

interface TransferProgressProps {
  progress: TransferProgressType;
  onCancel?: () => void;
  role: 'sender' | 'receiver';
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  progress,
  onCancel,
  role,
}) => {
  const percent = progress.totalBytes > 0
    ? Math.min(100, Math.round((progress.totalBytesTransferred / progress.totalBytes) * 100))
    : 0;

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            {role === 'sender' ? 'Uploading to Peer' : 'Receiving from Peer'}
          </span>
          <h4 className="text-base font-bold text-slate-800 truncate max-w-md">
            {progress.currentFileName || 'Preparing transfer...'}
          </h4>
        </div>

        <div className="text-right">
          <span className="text-2xl font-black font-mono text-slate-900">
            {percent}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-3">
        <div
          className="bg-gradient-to-r from-brand-600 to-brand-400 h-3 rounded-full transition-all duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Keep tab open guidance */}
      <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-1.5 mb-3 flex items-center justify-between">
        <span>💡 Keep this browser tab open until the transfer completes.</span>
        <span className="font-mono text-brand-600 font-semibold">{formatBytes(progress.totalBytesTransferred)} / {formatBytes(progress.totalBytes)}</span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600 py-2 border-y border-slate-100 mb-4">
        <div>
          <span className="text-slate-400 block mb-0.5">Speed</span>
          <span className="font-semibold text-slate-800 font-mono">
            {formatSpeed(progress.speedBps)}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block mb-0.5">Estimated Time</span>
          <span className="font-semibold text-slate-800 font-mono">
            {formatDuration(progress.etaSeconds)}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block mb-0.5">Transferred</span>
          <span className="font-semibold text-slate-800 font-mono">
            {formatBytes(progress.totalBytesTransferred)} / {formatBytes(progress.totalBytes)}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block mb-0.5">Files</span>
          <span className="font-semibold text-slate-800 font-mono">
            {progress.currentFileIndex + 1} of {progress.totalFiles}
          </span>
        </div>
      </div>

      {/* Footer & Controls */}
      <div className="flex items-center justify-between">
        {progress.status === 'VERIFYING_INTEGRITY' ? (
          <div className="flex items-center space-x-1.5 text-xs text-brand-600 font-medium">
            <ShieldCheck className="w-4 h-4 animate-pulse" />
            <span>Verifying SHA-256 integrity...</span>
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            Direct peer-to-peer connection
          </div>
        )}

        {onCancel && progress.status !== 'COMPLETED' && progress.status !== 'FAILED' && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
          >
            <XOctagon className="w-3.5 h-3.5" />
            <span>Cancel Transfer</span>
          </button>
        )}
      </div>
    </div>
  );
};
