import React from 'react';
import { SessionState } from '../types/session';
import { CheckCircle2, AlertCircle, Loader2, Clock, XCircle, ArrowRightLeft } from 'lucide-react';

interface ConnectionStatusProps {
  state: SessionState;
  role?: 'sender' | 'receiver';
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ state, role }) => {
  switch (state) {
    case 'WAITING_FOR_RECEIVER':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
          <Clock className="w-3.5 h-3.5 animate-spin" />
          <span>Waiting for recipient to enter PIN</span>
        </div>
      );

    case 'RECEIVER_JOINED':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
          <span>Recipient joined • Awaiting confirmation</span>
        </div>
      );

    case 'CONNECTING':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
          <span>Establishing P2P WebRTC connection...</span>
        </div>
      );

    case 'CONNECTED':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
          <span>Direct P2P DataChannel open</span>
        </div>
      );

    case 'TRANSFERRING':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-xs font-medium">
          <ArrowRightLeft className="w-3.5 h-3.5 animate-pulse text-brand-600" />
          <span>{role === 'sender' ? 'Streaming files...' : 'Receiving files...'}</span>
        </div>
      );

    case 'COMPLETED':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Transfer finished successfully</span>
        </div>
      );

    case 'EXPIRED':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-xs font-medium">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>PIN expired (2-minute limit)</span>
        </div>
      );

    case 'CANCELLED':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-xs font-medium">
          <XCircle className="w-3.5 h-3.5 text-slate-500" />
          <span>Session cancelled</span>
        </div>
      );

    case 'FAILED':
      return (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          <span>Connection or transfer error</span>
        </div>
      );

    default:
      return null;
  }
};
