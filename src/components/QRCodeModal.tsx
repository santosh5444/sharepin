import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, QrCode } from 'lucide-react';

interface QRCodeModalProps {
  pin: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ pin, isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const shareUrl = `${window.location.origin}/?pin=${encodeURIComponent(pin)}`;

  useEffect(() => {
    if (pin && isOpen) {
      QRCode.toDataURL(shareUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a', // Slate 900
          light: '#ffffff',
        },
      })
        .then(setQrDataUrl)
        .catch(console.error);
    }
  }, [pin, isOpen, shareUrl]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          aria-label="Close QR Modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
          <QrCode className="w-6 h-6" />
        </div>

        <h3 className="text-xl font-bold text-slate-900">
          Scan to Receive
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          Scan with your phone's camera to open SharePin and pair immediately.
        </p>

        {/* QR Code Canvas */}
        <div className="my-6 p-4 bg-white rounded-2xl border-2 border-slate-100 inline-block shadow-inner">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for PIN ${pin}`}
              className="w-52 h-52 sm:w-60 sm:h-60 mx-auto rounded-lg"
            />
          ) : (
            <div className="w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center text-xs text-slate-400">
              Generating QR Code...
            </div>
          )}
        </div>

        <div className="flex items-center justify-center space-x-2 text-xs font-mono font-bold text-brand-700 bg-brand-50 py-1.5 px-3 rounded-full mb-4 inline-block">
          PIN: {pin}
        </div>

        {/* Copy Share Link Button */}
        <div>
          <button
            onClick={handleCopyLink}
            className="w-full inline-flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition active:scale-95"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
            <span>{copiedLink ? 'Link Copied to Clipboard!' : 'Copy Direct Share Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
