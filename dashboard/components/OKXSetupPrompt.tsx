'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Key,
  AlertTriangle,
  X,
  ArrowRight,
  Shield,
  Zap,
  TrendingUp,
  ExternalLink
} from 'lucide-react';

interface OKXSetupPromptProps {
  onDismiss?: () => void;
  variant?: 'banner' | 'modal' | 'card';
  showFeatures?: boolean;
  className?: string;
}

export default function OKXSetupPrompt({
  onDismiss,
  variant = 'banner',
  showFeatures = true,
  className = ''
}: OKXSetupPromptProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);

  const handleSetupClick = () => {
    router.push('/dashboard/settings/okx');
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isDismissed) return null;

  const features = [
    {
      icon: TrendingUp,
      title: 'Automated Trading',
      description: 'Create and manage trading agents'
    },
    {
      icon: Shield,
      title: 'Real-time Monitoring',
      description: 'Live portfolio tracking and alerts'
    },
    {
      icon: Zap,
      title: 'Smart Analytics',
      description: 'AI-powered market insights'
    }
  ];

  if (variant === 'banner') {
    return (
      <div className={`gradient-warning text-white shadow-medium ${className}`}>
        <div className="px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg animate-bounce-gentle">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <span className="font-semibold block">
                  Setup Required: Connect your OKX account
                </span>
                <span className="text-orange-100 text-sm">
                  Unlock automated trading and advanced features
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSetupClick}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-orange-600 rounded-xl hover:bg-gray-50 transition-all duration-300 font-medium hover:scale-105 shadow-soft"
              >
                <Key className="h-4 w-4" />
                Setup Now
              </button>
              {onDismiss && (
                <button
                  onClick={handleDismiss}
                  className="p-2 text-orange-100 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
        <div className="glass-effect rounded-2xl max-w-lg w-full p-8 shadow-hard animate-scale-in">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 gradient-warning rounded-xl shadow-medium">
                <Key className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Setup Required</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Connect your trading account</p>
              </div>
            </div>
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="mb-6">
            <p className="text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
              To unlock automated trading and advanced portfolio management, connect your OKX account.
              This secure setup takes just a few minutes.
            </p>

            <div className="glass-effect rounded-xl p-4 border border-blue-200/50 dark:border-blue-800/50">
              <div className="flex items-center gap-3 mb-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-900 dark:text-blue-100">100% Secure Setup</span>
              </div>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Your API keys are encrypted and stored securely</li>
                <li>• Only read-only permissions are required</li>
                <li>• You maintain full control of your funds</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSetupClick}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 gradient-primary text-white rounded-xl hover:shadow-medium transition-all duration-300 font-medium hover:scale-105"
            >
              <Key className="h-4 w-4" />
              Setup OKX API
            </button>
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className="px-6 py-3 glass-effect text-gray-700 dark:text-gray-300 rounded-xl hover:shadow-soft transition-all duration-300 font-medium"
              >
                Maybe Later
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Card variant
  return (
    <div className={`glass-effect border-2 border-orange-200/50 dark:border-orange-800/50 rounded-2xl shadow-medium animate-fade-in ${className}`}>
      <div className="p-8">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 gradient-warning rounded-xl shadow-medium animate-float">
              <Key className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Connect Your OKX Account
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                Unlock the full potential of automated cryptocurrency trading
              </p>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {showFeatures && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group text-center p-4 glass-effect-strong rounded-xl card-hover-subtle animate-fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg w-fit mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">
                  {feature.title}
                </h4>
                <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSetupClick}
              className="flex-1 group inline-flex items-center justify-center gap-2 px-6 py-4 gradient-primary text-white rounded-xl hover:shadow-medium transition-all duration-300 font-medium hover:scale-105"
            >
              <span>Setup Now</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
            </button>
            <button className="px-6 py-4 glass-effect text-gray-700 dark:text-gray-300 rounded-xl hover:shadow-soft transition-all duration-300 font-medium flex items-center justify-center gap-2">
              <span>Learn More</span>
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-500" />
              <span>Secure</span>
            </div>
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            <div className="flex items-center gap-2">
              <span>Encrypted</span>
            </div>
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            <div className="flex items-center gap-2">
              <span>Your control</span>
            </div>
          </div>

          {/* Progress steps indicator */}
          <div className="mt-6 pt-6 border-t border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Quick setup</span>
              <span>~3 minutes</span>
            </div>
            <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
              <div className="bg-gradient-to-r from-orange-500 to-orange-400 h-1 rounded-full w-0 animate-[width_2s_ease-in-out_forwards]" style={{width: '100%'}}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}