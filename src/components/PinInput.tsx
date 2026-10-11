import React, { useRef, useEffect } from 'react';

interface PinInputProps {
  value: string; // Exactly 5 chars or partial
  onChange: (pin: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
}

export const PinInput: React.FC<PinInputProps> = ({
  value,
  onChange,
  disabled = false,
  autoFocus = true,
  hasError = false,
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Array of 5 chars padded with empty strings
  const digits = Array.from({ length: 5 }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && inputRefs.current[0] && !disabled) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus, disabled]);

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      const currentDigits = [...digits];
      if (currentDigits[index]) {
        currentDigits[index] = '';
        onChange(currentDigits.join(''));
      } else if (index > 0) {
        currentDigits[index - 1] = '';
        onChange(currentDigits.join(''));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 4) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    const char = e.target.value.slice(-1);
    // Allow only numeric digits 0-9
    if (!/^[0-9]$/.test(char)) return;

    const currentDigits = [...digits];
    currentDigits[index] = char;
    const newPin = currentDigits.join('');
    onChange(newPin);

    // Auto-advance to next input
    if (index < 4) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    // Extract only digits
    const numericOnly = pastedData.replace(/[^0-9]/g, '').slice(0, 5);

    if (numericOnly.length > 0) {
      onChange(numericOnly);
      const nextIndex = Math.min(numericOnly.length, 4);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center space-x-2 sm:space-x-3.5 my-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl sm:text-3xl font-mono font-bold rounded-xl border-2 transition-all outline-none ${
            hasError
              ? 'border-red-400 bg-red-50 text-red-700 focus:border-red-500 focus:ring-4 focus:ring-red-100'
              : digit
              ? 'border-brand-500 bg-brand-50/30 text-slate-900 focus:border-brand-600 focus:ring-4 focus:ring-brand-100'
              : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
          aria-label={`Digit ${index + 1} of 5-digit PIN`}
        />
      ))}
    </div>
  );
};
