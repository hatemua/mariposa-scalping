'use client';

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react';

interface OTPInputProps {
  length?: number;
  onComplete: (otp: string) => void;
  loading?: boolean;
  error?: string;
  autoFocus?: boolean;
}

export default function OTPInput({
  length = 6,
  onComplete,
  loading = false,
  error = '',
  autoFocus = true
}: OTPInputProps) {
  const [otp, setOtp] = useState<string[]>(new Array(length).fill(''));
  const [activeOTPIndex, setActiveOTPIndex] = useState<number>(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    // Check if OTP is complete
    if (otp.every(digit => digit !== '') && otp.join('').length === length) {
      onComplete(otp.join(''));
    }
  }, [otp, length, onComplete]);

  const handleChange = (value: string, index: number) => {
    // Only allow numeric input
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    // Move to next input if current is filled
    if (value && index < length - 1) {
      setActiveOTPIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    setActiveOTPIndex(index);

    // Handle backspace
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newOtp = [...otp];

      if (otp[index]) {
        // Clear current input
        newOtp[index] = '';
        setOtp(newOtp);
      } else if (index > 0) {
        // Move to previous input and clear it
        newOtp[index - 1] = '';
        setOtp(newOtp);
        setActiveOTPIndex(index - 1);
        inputRefs.current[index - 1]?.focus();
      }
    }

    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      setActiveOTPIndex(index - 1);
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      setActiveOTPIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain');

    // Only process if pasted data is numeric and matches expected length
    if (!/^\d+$/.test(pastedData)) return;

    const pastedOtp = pastedData.substring(0, length).split('');
    const newOtp = [...otp];

    pastedOtp.forEach((digit, index) => {
      if (index < length) {
        newOtp[index] = digit;
      }
    });

    setOtp(newOtp);

    // Focus on the next empty input or the last one
    const nextIndex = Math.min(pastedOtp.length, length - 1);
    setActiveOTPIndex(nextIndex);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleFocus = (index: number) => {
    setActiveOTPIndex(index);
  };

  // Clear OTP function (can be called from parent)
  const clearOTP = () => {
    setOtp(new Array(length).fill(''));
    setActiveOTPIndex(0);
    inputRefs.current[0]?.focus();
  };

  // Expose clearOTP method to parent
  useEffect(() => {
    if (error) {
      clearOTP();
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="flex space-x-3">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(ref) => {
              inputRefs.current[index] = ref;
            }}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(e.target.value, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onFocus={() => handleFocus(index)}
            onPaste={handlePaste}
            disabled={loading}
            className={`
              w-12 h-12 text-center text-xl font-semibold border-2 rounded-lg
              transition-all duration-200 outline-none
              ${activeOTPIndex === index
                ? 'border-primary-500 ring-2 ring-primary-200'
                : 'border-gray-300'
              }
              ${digit ? 'bg-primary-50 border-primary-400' : 'bg-white'}
              ${error ? 'border-red-400 bg-red-50' : ''}
              ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-400'}
              focus:border-primary-500 focus:ring-2 focus:ring-primary-200
            `}
            style={{
              caretColor: 'transparent',
            }}
          />
        ))}
      </div>

      {loading && (
        <div className="flex items-center space-x-2 text-gray-600">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
          <span className="text-sm">Verifying...</span>
        </div>
      )}

      {error && (
        <div className="text-red-600 text-sm text-center max-w-xs">
          {error}
        </div>
      )}
    </div>
  );
}