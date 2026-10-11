import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, FolderUp, FilePlus, AlertCircle } from 'lucide-react';

interface FilePickerProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const FilePicker: React.FC<FilePickerProps> = ({ onFilesSelected, disabled = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [folderSupported, setFolderSupported] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Detect folder upload support in current browser
    const input = document.createElement('input');
    setFolderSupported('webkitdirectory' in input || 'directory' in input);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesSelected(filesArray);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesSelected(filesArray);
      // Reset input value so same files can be re-selected if removed
      e.target.value = '';
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center transition-all ${
          isDragOver
            ? 'border-brand-500 bg-brand-50/50 scale-[1.01]'
            : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />

        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard for folder picker in modern browsers
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center">
            <UploadCloud className="w-8 h-8" />
          </div>

          <div>
            <p className="text-base sm:text-lg font-semibold text-slate-800">
              Drag and drop files here, or{' '}
              <span className="text-brand-600 underline underline-offset-2">browse</span>
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Any file type • Streamed in chunks • Direct device-to-device
            </p>
          </div>

          <div
            className="flex items-center space-x-3 pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition"
            >
              <FilePlus className="w-4 h-4 text-brand-600" />
              <span>Select Files</span>
            </button>

            {folderSupported ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition"
              >
                <FolderUp className="w-4 h-4 text-amber-600" />
                <span>Select Folder</span>
              </button>
            ) : (
              <span className="text-xs text-slate-400 flex items-center space-x-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Folder selection not supported on this browser</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
