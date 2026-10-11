import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Music, Image as ImageIcon, File } from 'lucide-react';
import { formatBytes } from '../utils/formatBytes';
import { FileTransferService } from '../services/fileTransfer';

export interface PreviewableFile {
  name: string;
  size: number;
  type: string;
  blob: Blob;
  sha256?: string;
}

interface FilePreviewModalProps {
  file: PreviewableFile | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      setTextContent(null);
      return;
    }

    const url = URL.createObjectURL(file.blob);
    setObjectUrl(url);

    // If text or code, read sample
    if (file.type.startsWith('text/') || ['json', 'js', 'ts', 'py', 'md', 'html', 'css'].some(ext => file.name.endsWith(ext))) {
      file.blob.slice(0, 10000).text().then(setTextContent).catch(() => {});
    }

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!file) return null;

  const isImage = file.type.startsWith('image/');
  const isAudio = file.type.startsWith('audio/');
  const isText = Boolean(textContent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-2.5 min-w-0 pr-2">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600 flex-shrink-0">
              {isImage ? <ImageIcon className="w-5 h-5" /> : isAudio ? <Music className="w-5 h-5" /> : isText ? <FileText className="w-5 h-5" /> : <File className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 truncate" title={file.name}>
                {file.name}
              </h4>
              <p className="text-xs text-slate-500">
                {formatBytes(file.size)} {file.type ? `• ${file.type}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-6 flex flex-col items-center justify-center">
          {isImage && objectUrl && (
            <img
              src={objectUrl}
              alt={file.name}
              className="max-h-80 max-w-full rounded-2xl object-contain shadow-sm border border-slate-100"
            />
          )}

          {isAudio && objectUrl && (
            <div className="w-full px-4 py-8 bg-slate-50 rounded-2xl border border-slate-100 text-center">
              <Music className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <audio controls className="w-full" src={objectUrl}>
                Your browser does not support audio playback.
              </audio>
            </div>
          )}

          {isText && textContent && (
            <pre className="w-full max-h-72 overflow-y-auto p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs text-slate-800 whitespace-pre-wrap select-all">
              {textContent}
            </pre>
          )}

          {!isImage && !isAudio && !isText && (
            <div className="text-center py-8">
              <File className="w-16 h-16 text-slate-300 mx-auto mb-3" />
              <p className="text-xs text-slate-500">
                Binary file preview not available in browser.
              </p>
            </div>
          )}

          {file.sha256 && (
            <div className="mt-4 w-full text-center">
              <span className="text-[10px] font-mono text-slate-400 block truncate" title={`SHA-256: ${file.sha256}`}>
                SHA-256: {file.sha256}
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => FileTransferService.triggerDownload(file.blob, file.name)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            <span>Download File</span>
          </button>
        </div>
      </div>
    </div>
  );
};
