"use client"

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type OrderType = 'MARKET' | 'LIMIT';

interface OrderTypeDropdownProps {
  value: OrderType;
  onChange: (type: OrderType) => void;
}

export const OrderTypeDropdown: React.FC<OrderTypeDropdownProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (type: OrderType) => {
    onChange(type);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-background-light-sm text-foreground hover:bg-background-light-sm transition-colors"
      >
        <span className="font-medium">{value === 'MARKET' ? 'Market' : 'Limit'}</span>
        <ChevronDown className="w-4 h-4 text-foreground-light" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-48 rounded-lg bg-background border border-background-light-sm shadow-lg overflow-hidden z-50">
          <button
            onClick={() => handleSelect('MARKET')}
            className={`w-full px-4 py-3 text-left hover:bg-background-light-sm transition-colors ${
              value === 'MARKET' ? 'bg-background-light-sm' : ''
            }`}
          >
            <div className="font-medium text-foreground">Market</div>
            <div className="text-xs text-foreground-light mt-0.5">Instant execution</div>
          </button>

          <button
            onClick={() => handleSelect('LIMIT')}
            className={`w-full px-4 py-3 text-left hover:bg-background-light-sm transition-colors ${
              value === 'LIMIT' ? 'bg-background-light-sm' : ''
            }`}
          >
            <div className="font-medium text-foreground">Limit</div>
            <div className="text-xs text-foreground-light mt-0.5">Set your price</div>
          </button>

          <button
            disabled
            className="w-full px-4 py-3 text-left opacity-50 cursor-not-allowed flex items-center justify-between"
          >
            <div>
              <div className="font-medium text-foreground">More</div>
              <div className="text-xs text-foreground-light mt-0.5">Stop, OCO (Soon)</div>
            </div>
            <ChevronRight className="w-4 h-4 text-foreground-light" />
          </button>
        </div>
      )}
    </div>
  );
};
