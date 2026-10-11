import React from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

interface HeaderProps {
  currentView?: 'home' | 'send' | 'receive';
  onNavigateHome?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView = 'home', onNavigateHome }) => {
  return (
    <header className="w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {currentView !== 'home' && onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="mr-1 p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Return home"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div
            onClick={onNavigateHome}
            className="flex items-center space-x-2.5 cursor-pointer select-none group"
          >
            <div className="w-9 h-9 rounded-xl overflow-hidden shadow-sm shadow-brand-500/20 group-hover:scale-105 transition-transform flex items-center justify-center">
              <img src="/logo.png" alt="SharePin Icon" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-slate-900">
                Share<span className="text-brand-600">Pin</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/60 text-xs font-medium text-slate-600">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Zero Cloud Storage</span>
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs font-medium text-brand-700">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
            <span>Direct P2P WebRTC</span>
          </div>
        </div>
      </div>
    </header>
  );
};
