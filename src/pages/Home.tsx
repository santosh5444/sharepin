import React from 'react';
import { Upload, Download, ShieldCheck, Zap, HardDrive, KeyRound, ArrowRight } from 'lucide-react';

interface HomeProps {
  onSelectSend: () => void;
  onSelectReceive: () => void;
}

export const Home: React.FC<HomeProps> = ({ onSelectSend, onSelectReceive }) => {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 sm:py-16">
      {/* Hero Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs sm:text-sm font-medium mb-6">
          <Zap className="w-4 h-4 text-brand-600" />
          <span>Peer-to-Peer • 5-Digit PIN • No Sign-up</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Share files. <br className="hidden sm:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-500">
            Not your storage.
          </span>
        </h1>

        <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
          Transfer documents, photos, videos, and folders directly from your browser to another device.
          No accounts, no cloud file uploads, no permanent storage.
        </p>
      </div>

      {/* Main Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
        {/* Send Card */}
        <div
          onClick={onSelectSend}
          className="group relative bg-white border-2 border-slate-200/80 hover:border-brand-500 rounded-3xl p-8 sm:p-10 shadow-sm hover:shadow-xl hover:shadow-brand-500/5 transition-all duration-300 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors flex items-center justify-center mb-6">
              <Upload className="w-7 h-7" />
            </div>

            <h3 className="text-2xl font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
              Send Files
            </h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Pick files or entire folders to generate a temporary 5-digit PIN. Your files stay on your device until the receiver connects.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center text-sm font-semibold text-brand-600 group-hover:translate-x-1 transition-transform">
            <span>Choose files & create PIN</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </div>
        </div>

        {/* Receive Card */}
        <div
          onClick={onSelectReceive}
          className="group relative bg-white border-2 border-slate-200/80 hover:border-emerald-500 rounded-3xl p-8 sm:p-10 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors flex items-center justify-center mb-6">
              <Download className="w-7 h-7" />
            </div>

            <h3 className="text-2xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
              Receive Files
            </h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Got a 5-digit PIN from someone? Enter it here to securely pair devices and download the files directly.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center text-sm font-semibold text-emerald-600 group-hover:translate-x-1 transition-transform">
            <span>Enter 5-digit PIN</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </div>
        </div>
      </div>

      {/* Feature / Architecture Guarantees */}
      <div className="border-t border-slate-200/80 pt-12">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center mb-8">
          Built for security, speed, and privacy
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="flex items-start space-x-3.5 p-4 rounded-2xl bg-white/60 border border-slate-200/50">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600 flex-shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-800">3-Minute Temporary PIN</h5>
              <p className="text-xs text-slate-500 mt-1">
                PINs expire automatically after 3 minutes. Each PIN is single-use and locked to one receiver.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3.5 p-4 rounded-2xl bg-white/60 border border-slate-200/50">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 flex-shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-800">Zero Cloud Storage</h5>
              <p className="text-xs text-slate-500 mt-1">
                Files are streamed directly peer-to-peer via encrypted WebRTC DataChannels. No cloud servers ever touch your files.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3.5 p-4 rounded-2xl bg-white/60 border border-slate-200/50">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-800">Sender Approval</h5>
              <p className="text-xs text-slate-500 mt-1">
                Before any bytes leave your device, you review and approve the receiver's connection request.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
