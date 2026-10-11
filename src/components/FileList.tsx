import React from 'react';
import { FileText, FileCode, FileImage, FileVideo, FileAudio, FileArchive, File, X, Trash2 } from 'lucide-react';
import { formatBytes } from '../utils/formatBytes';

interface FileListProps {
  files: File[];
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
  disabled?: boolean;
}

function getFileIcon(fileName: string, mimeType: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
    return <FileImage className="w-5 h-5 text-indigo-500" />;
  }
  if (mimeType.startsWith('video/') || ['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) {
    return <FileVideo className="w-5 h-5 text-rose-500" />;
  }
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) {
    return <FileAudio className="w-5 h-5 text-amber-500" />;
  }
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) {
    return <FileArchive className="w-5 h-5 text-emerald-500" />;
  }
  if (['ts', 'js', 'tsx', 'jsx', 'json', 'py', 'rs', 'go', 'html', 'css'].includes(ext)) {
    return <FileCode className="w-5 h-5 text-sky-500" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) {
    return <FileText className="w-5 h-5 text-blue-500" />;
  }
  return <File className="w-5 h-5 text-slate-400" />;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  onRemoveFile,
  onClearAll,
  disabled = false,
}) => {
  if (files.length === 0) return null;

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-4">
      <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-semibold text-slate-700">
            Selected Files ({files.length})
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium">
            {formatBytes(totalBytes)}
          </span>
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-slate-500 hover:text-red-600 flex items-center space-x-1 font-medium transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear all</span>
          </button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
        {files.map((file, idx) => {
          // Check webkitRelativePath for folder structure
          const relativePath = (file as any).webkitRelativePath || file.name;

          return (
            <div
              key={`${file.name}-${file.size}-${idx}`}
              className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition group"
            >
              <div className="flex items-center space-x-3 min-w-0 pr-3">
                <div className="flex-shrink-0">
                  {getFileIcon(file.name, file.type)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate" title={relativePath}>
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {formatBytes(file.size)}
                    {relativePath !== file.name && ` • ${relativePath}`}
                  </p>
                </div>
              </div>

              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(idx)}
                  className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                  title="Remove file"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
