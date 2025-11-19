'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Settings,
  Key,
  Shield,
  User,
  Bell,
  ChevronRight,
  ExternalLink,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface SettingCard {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  href: string;
  status?: 'connected' | 'required' | 'optional';
  external?: boolean;
}

export default function SettingsPage() {
  const router = useRouter();

  const settingCards: SettingCard[] = [
    {
      id: 'okx',
      title: 'OKX API Configuration',
      description: 'Connect your OKX account to enable automated trading',
      icon: Key,
      href: '/dashboard/settings/okx',
      status: 'required'
    },
    {
      id: 'mt4',
      title: 'MT4 Configuration',
      description: 'Connect your MT4 broker account for MetaTrader 4 trading',
      icon: Key,
      href: '/dashboard/settings/mt4',
      status: 'required'
    },
    {
      id: 'api-keys',
      title: 'API Keys',
      description: 'Manage API keys for external integrations and automation',
      icon: Key,
      href: '/dashboard/settings/api-keys',
      status: 'optional'
    },
    {
      id: 'profile',
      title: 'Profile Settings',
      description: 'Manage your account information and preferences',
      icon: User,
      href: '/dashboard/settings/profile',
      status: 'optional'
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Configure alerts and notification preferences',
      icon: Bell,
      href: '/dashboard/settings/notifications',
      status: 'optional'
    },
    {
      id: 'security',
      title: 'Security Settings',
      description: 'Manage your account security and authentication',
      icon: Shield,
      href: '/dashboard/settings/security',
      status: 'optional'
    }
  ];

  const handleCardClick = (card: SettingCard) => {
    if (card.external) {
      window.open(card.href, '_blank');
    } else {
      router.push(card.href);
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'required':
        return <AlertTriangle className="h-5 w-5 text-orange-600" />;
      default:
        return null;
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'required':
        return 'Setup Required';
      case 'optional':
        return 'Optional';
      default:
        return '';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 bg-green-50';
      case 'required':
        return 'text-orange-600 bg-orange-50';
      case 'optional':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <DashboardLayout>
      <div className="responsive-container py-6 space-y-8">
        {/* Header */}
        <div className="animate-fade-in-down">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 glass-effect rounded-xl shadow-medium">
                <Settings className="h-8 w-8 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
                <p className="text-gray-600 dark:text-gray-400 text-lg">
                  Configure your trading environment and preferences
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce-gentle"></div>
              <span>Auto-save enabled</span>
            </div>
          </div>
        </div>

        {/* Quick Setup Notice */}
        <div className="glass-effect border border-blue-200/50 dark:border-blue-800/50 rounded-2xl p-6 animate-fade-in-up">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <AlertTriangle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-3">Quick Setup Required</h3>
              <p className="text-blue-800 dark:text-blue-200 mb-6 leading-relaxed">
                To unlock the full potential of automated trading, configure your OKX API credentials.
                This secure, one-time setup enables real-time trading and portfolio management.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => router.push('/dashboard/settings/okx')}
                  className="inline-flex items-center gap-2 px-6 py-3 gradient-primary text-white rounded-xl hover:shadow-medium transition-all duration-300 font-medium hover:scale-105"
                >
                  <Key className="h-4 w-4" />
                  Setup OKX API Now
                </button>
                <button className="inline-flex items-center gap-2 px-6 py-3 glass-effect text-blue-700 dark:text-blue-300 rounded-xl hover:shadow-soft transition-all duration-300 font-medium">
                  <ExternalLink className="h-4 w-4" />
                  View Setup Guide
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          {settingCards.map((card, index) => {
            const IconComponent = card.icon;
            return (
              <div
                key={card.id}
                onClick={() => handleCardClick(card)}
                className="group glass-effect border border-gray-200/50 dark:border-gray-700/50 rounded-2xl p-6 card-hover cursor-pointer animate-scale-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl transition-all duration-300 group-hover:scale-110 ${
                      card.status === 'required'
                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                        : card.status === 'connected'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-200">
                        {card.title}
                      </h3>
                      {card.status && (
                        <div className="flex items-center gap-2 mt-2">
                          {getStatusIcon(card.status)}
                          <span className={`text-xs px-3 py-1 rounded-full font-medium transition-all duration-300 group-hover:scale-105 ${getStatusColor(card.status)}`}>
                            {getStatusText(card.status)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors duration-200">
                    {card.external && <ExternalLink className="h-4 w-4" />}
                    <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </div>
                </div>

                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  {card.description}
                </p>

                {/* Progress indicator for required items */}
                {card.status === 'required' && (
                  <div className="mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
                    <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce-gentle"></div>
                      <span>Action required to continue</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Additional Information */}
        <div className="space-y-8 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          {/* Security Section */}
          <div className="glass-effect rounded-2xl p-8 border border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Security & Privacy</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Enterprise-grade security for your trading data</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Data Protection
                </h4>
                <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                  {[
                    'AES-256 encryption for all API credentials',
                    'Zero-knowledge architecture for sensitive data',
                    'SOC 2 Type II compliant infrastructure',
                    'Regular penetration testing and audits'
                  ].map((item, index) => (
                    <div key={index} className="flex items-center gap-3 animate-fade-in-right" style={{ animationDelay: `${index * 100}ms` }}>
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  Trading Security
                </h4>
                <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                  {[
                    'Read-only API permissions by default',
                    'Real-time anomaly detection',
                    'Automated risk management protocols',
                    'Multi-factor authentication support'
                  ].map((item, index) => (
                    <div key={index} className="flex items-center gap-3 animate-fade-in-right" style={{ animationDelay: `${(index + 4) * 100}ms` }}>
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Support Section */}
          <div className="glass-effect rounded-2xl p-8 border border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Need Help?</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Resources to get you started quickly</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: 'Documentation',
                  description: 'Comprehensive guides and API references',
                  action: 'View Docs',
                  icon: '📚',
                  color: 'blue'
                },
                {
                  title: 'Video Tutorials',
                  description: 'Step-by-step setup walkthroughs',
                  action: 'Watch Videos',
                  icon: '🎥',
                  color: 'purple'
                },
                {
                  title: 'Live Support',
                  description: '24/7 assistance from our team',
                  action: 'Get Help',
                  icon: '💬',
                  color: 'green'
                }
              ].map((item, index) => (
                <div
                  key={index}
                  className="group glass-effect rounded-xl p-6 text-center card-hover-subtle border border-gray-200/30 dark:border-gray-700/30 animate-scale-in"
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  <div className="text-2xl mb-3 group-hover:scale-110 transition-transform duration-300">
                    {item.icon}
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{item.title}</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 leading-relaxed">
                    {item.description}
                  </p>
                  <button className={`text-${item.color}-600 dark:text-${item.color}-400 hover:text-${item.color}-700 dark:hover:text-${item.color}-300 font-medium text-sm transition-colors duration-200 hover:underline`}>
                    {item.action} →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}