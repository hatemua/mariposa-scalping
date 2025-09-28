'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  Brain,
  Bot,
  Plus,
  Settings,
  Menu,
  X,
  Home,
  ChevronRight
} from 'lucide-react';
import { TouchUtils } from '@/lib/responsive';

interface MobileNavProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Market Data', href: '/dashboard/market', icon: TrendingUp },
  { name: 'AI Recommendations', href: '/dashboard/recommendations', icon: Brain },
  { name: 'Trading Agents', href: '/dashboard/agents', icon: Bot },
  { name: 'Create Agent', href: '/dashboard/agents/create', icon: Plus },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function MobileNav({ isOpen, onToggle, onClose }: MobileNavProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  // Set initial active index
  useEffect(() => {
    const currentIndex = navigation.findIndex(item => isActive(item.href));
    if (currentIndex !== -1) {
      setActiveIndex(currentIndex);
    }
  }, [pathname]);

  // Setup swipe to close
  useEffect(() => {
    if (!navRef.current || !isOpen) return;

    const cleanup = TouchUtils.createSwipeDetector(navRef.current, {
      onSwipeLeft: onClose,
      threshold: 50
    });

    return cleanup;
  }, [isOpen, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(prev => (prev > 0 ? prev - 1 : navigation.length - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(prev => (prev < navigation.length - 1 ? prev + 1 : 0));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          const activeItem = navigation[activeIndex];
          window.location.href = activeItem.href;
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeIndex, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile Navigation Panel */}
      <div
        ref={navRef}
        className="fixed top-0 left-0 z-50 h-full w-80 max-w-sm glass-effect-strong border-r border-gray-200/50 dark:border-gray-700/50 shadow-2xl animate-slide-in-left lg:hidden"
        role="navigation"
        aria-label="Mobile navigation"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 gradient-primary rounded-xl flex items-center justify-center shadow-medium">
              <Home className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">
              Mariposa
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-6 overflow-y-auto" role="menu">
          <div className="px-4 space-y-2">
            {navigation.map((item, index) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const focused = index === activeIndex;

              return (
                <a
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    group flex items-center justify-between w-full px-4 py-4 rounded-xl
                    transition-all duration-200 text-left
                    ${
                      active
                        ? 'gradient-primary text-white shadow-medium scale-105'
                        : focused
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                  `}
                  role="menuitem"
                  tabIndex={focused ? 0 : -1}
                  onFocus={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <div className="flex items-center gap-4">
                    <Icon className={`h-5 w-5 transition-transform duration-200 ${
                      active ? 'text-white' : 'text-gray-400 dark:text-gray-500 group-hover:text-primary-500'
                    } ${focused ? 'scale-110' : ''}`} />
                    <span className="font-medium text-base">{item.name}</span>
                  </div>
                  <ChevronRight className={`h-4 w-4 transition-all duration-200 ${
                    active ? 'text-white' : 'text-gray-400 dark:text-gray-500'
                  } ${focused ? 'translate-x-1' : ''}`} />
                </a>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200/50 dark:border-gray-700/50">
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Swipe left to close
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <div className="w-1 h-1 bg-green-500 rounded-full animate-bounce-gentle"></div>
              <span>Real-time data</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Mobile Navigation Trigger Button
export function MobileNavTrigger({ onClick, className = '' }: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        p-3 rounded-xl glass-effect hover:shadow-medium transition-all duration-200
        text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100
        hover:scale-110 active:scale-95 lg:hidden
        ${className}
      `}
      aria-label="Open navigation menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}