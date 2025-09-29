'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Home, Eye } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href: string;
  icon?: React.ComponentType<any>;
}

interface ProfessionalLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  badge?: string;
  badgeColor?: string;
}

const ProfessionalLayout: React.FC<ProfessionalLayoutProps> = ({
  children,
  title,
  description,
  icon: Icon,
  badge,
  badgeColor = 'emerald'
}) => {
  const pathname = usePathname();

  const getBreadcrumbs = (): BreadcrumbItem[] => {
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard/market', icon: Home },
      { label: 'Professional Suite', href: '/dashboard/professional', icon: Eye }
    ];

    // Add current page based on pathname
    if (pathname.includes('/opportunities')) {
      breadcrumbs.push({ label: 'Market Opportunities', href: '/dashboard/professional/opportunities' });
    } else if (pathname.includes('/intelligence')) {
      breadcrumbs.push({ label: 'Trading Intelligence', href: '/dashboard/professional/intelligence' });
    } else if (pathname.includes('/analytics')) {
      breadcrumbs.push({ label: 'Advanced Analytics', href: '/dashboard/professional/analytics' });
    } else if (pathname.includes('/risk')) {
      breadcrumbs.push({ label: 'Risk Management', href: '/dashboard/professional/risk' });
    } else if (pathname.includes('/portfolio')) {
      breadcrumbs.push({ label: 'Portfolio Analysis', href: '/dashboard/professional/portfolio' });
    } else if (pathname.includes('/agents')) {
      breadcrumbs.push({ label: 'Trading Agents', href: '/dashboard/professional/agents' });
    } else if (pathname.includes('/monitoring')) {
      breadcrumbs.push({ label: 'Market Monitoring', href: '/dashboard/professional/monitoring' });
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();
  const isCurrentPath = (href: string) => pathname === href;

  const getBadgeClasses = (color: string) => {
    const colors = {
      emerald: 'bg-emerald-100 text-emerald-700',
      blue: 'bg-blue-100 text-blue-700',
      purple: 'bg-purple-100 text-purple-700',
      red: 'bg-red-100 text-red-700',
      indigo: 'bg-indigo-100 text-indigo-700',
      cyan: 'bg-cyan-100 text-cyan-700',
      orange: 'bg-orange-100 text-orange-700'
    };
    return colors[color as keyof typeof colors] || colors.emerald;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Navigation Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
            {breadcrumbs.map((item, index) => {
              const ItemIcon = item.icon;
              const isLast = index === breadcrumbs.length - 1;
              const isCurrent = isCurrentPath(item.href);

              return (
                <React.Fragment key={item.href}>
                  {index > 0 && <span className="text-gray-400">/</span>}
                  {isLast || isCurrent ? (
                    <div className="flex items-center gap-1.5 text-gray-900 font-medium">
                      {ItemIcon && <ItemIcon className="h-4 w-4" />}
                      <span>{item.label}</span>
                    </div>
                  ) : (
                    <Link
                      href={item.href}
                      className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      {ItemIcon && <ItemIcon className="h-4 w-4" />}
                      <span>{item.label}</span>
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/professional"
                className="text-gray-500 hover:text-gray-700 transition-colors"
                title="Back to Professional Suite"
              >
                <ArrowLeft className="h-6 w-6" />
              </Link>
              <Icon className="h-7 w-7 text-gray-700" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                  {badge && (
                    <span className={`px-2 py-1 ${getBadgeClasses(badgeColor)} text-xs font-medium rounded-full`}>
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 mt-1">{description}</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/professional"
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                All Modules
              </Link>
              <Link
                href="/dashboard/market"
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Market Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </div>

      {/* Footer Navigation */}
      <div className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span>Professional Trading Suite</span>
              <span className="text-gray-400">•</span>
              <span>Real-time data</span>
              <span className="text-gray-400">•</span>
              <span>Optimized performance</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/dashboard/professional" className="hover:text-gray-900 transition-colors">
                All Modules
              </Link>
              <Link href="/dashboard/market" className="hover:text-gray-900 transition-colors">
                Market Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalLayout;