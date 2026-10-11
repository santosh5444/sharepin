import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onHome?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  title = 'An error occurred',
  message,
  onRetry,
  onHome,
}) => {
  return (
    <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-5 my-4">
      <div className="flex items-start space-x-3">
        <div className="p-2 bg-rose-100 rounded-xl text-rose-600 flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-rose-900">{title}</h4>
          <p className="text-sm text-rose-700 mt-1 leading-relaxed">{message}</p>

          {(onRetry || onHome) && (
            <div className="flex items-center space-x-3 mt-4">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              )}
              {onHome && (
                <button
                  type="button"
                  onClick={onHome}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-white border border-rose-300 hover:bg-rose-50 text-rose-800 rounded-lg text-xs font-semibold transition active:scale-95"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Return Home</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
