'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { useIsClient } from '@/hooks/useIsClient';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import {
  LayoutDashboard,
  TrendingUp,
  Brain,
  Bot,
  Plus,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  Home,
  Activity,
  BarChart3,
  Zap,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Market Data', href: '/dashboard/market', icon: TrendingUp },
  { name: 'AI Recommendations', href: '/dashboard/recommendations', icon: Brain },
  { name: 'Trading Agents', href: '/dashboard/agents', icon: Bot },
  { name: 'Create Agent', href: '/dashboard/agents/create', icon: Plus },
];

function DashboardLayoutInner({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isClient = useIsClient();

  useEffect(() => {
    if (!isClient) return;

    // Check if user is authenticated
    const token = storage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Load user data (you can replace this with actual user data fetching)
    const userData = {
      name: 'Trading User',
      email: storage.getItem('userEmail') || 'user@example.com',
      avatar: null
    };
    setUser(userData);
  }, [isClient, router]);

  const handleLogout = () => {
    storage.removeItem('token');
    storage.removeItem('userEmail');
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Implement search functionality here
      console.log('Search:', searchQuery);
    }
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const toggleSidebarCollapse = () => setSidebarCollapsed(!sidebarCollapsed);

  if (!user || !isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-dark-50 dark:via-dark-100 dark:to-dark-200 flex items-center justify-center">
        <div className="glass-effect rounded-2xl p-8 text-center animate-fade-in">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <span className="text-gray-600 dark:text-gray-300 font-medium">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-dark-50 dark:via-dark-100 dark:to-dark-200 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black bg-opacity-25 dark:bg-opacity-50 backdrop-blur-sm animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 lg:flex lg:flex-shrink-0 ${
        sidebarCollapsed ? 'w-20' : 'w-72'
      } ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex h-screen flex-col glass-effect border-r border-gray-200/50 dark:border-gray-700/50 shadow-xl w-full animate-slide-in-left">
          {/* Logo and Controls */}
          <div className={`flex h-16 items-center ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-6'} border-b border-gray-200/50 dark:border-gray-700/50`}>
            {!sidebarCollapsed && (
              <div className="flex items-center space-x-3 animate-fade-in">
                <div className="w-8 h-8 gradient-primary rounded-xl flex items-center justify-center shadow-lg">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gradient">
                  Mariposa
                </span>
              </div>
            )}

            {sidebarCollapsed && (
              <div className="w-8 h-8 gradient-primary rounded-xl flex items-center justify-center shadow-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
            )}

            <div className="flex items-center space-x-1">
              {/* Desktop collapse toggle */}
              <button
                onClick={toggleSidebarCollapse}
                className="hidden lg:flex p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>

              {/* Mobile close button */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 space-y-2 ${sidebarCollapsed ? 'px-2' : 'px-4'} py-6 overflow-y-auto scrollbar-thin`}>
            {navigation.map((item, index) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <div
                  key={item.name}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <a
                    href={item.href}
                    className={`group flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-3 text-sm font-medium rounded-xl transition-all duration-300 hover:scale-105 ${
                      active
                        ? 'gradient-primary text-white shadow-medium transform scale-105'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800/60 hover:text-primary-600 dark:hover:text-primary-400 hover:shadow-soft'
                    }`}
                    title={sidebarCollapsed ? item.name : undefined}
                  >
                    <Icon className={`${sidebarCollapsed ? '' : 'mr-3'} h-5 w-5 transition-all duration-300 ${
                      active ? 'text-white' : 'text-gray-400 dark:text-gray-500 group-hover:text-primary-500'
                    }`} />
                    {!sidebarCollapsed && (
                      <span className="truncate">{item.name}</span>
                    )}
                  </a>
                </div>
              );
            })}
          </nav>

          {/* User Profile */}
          <div className={`border-t border-gray-200/50 dark:border-gray-700/50 ${sidebarCollapsed ? 'p-2' : 'p-4'}`}>
            {!sidebarCollapsed ? (
              <div className="animate-fade-in">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 gradient-primary rounded-full flex items-center justify-center shadow-medium">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {user.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => router.push('/dashboard/settings')}
                    className="w-full flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-105"
                  >
                    <Settings className="mr-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    Settings
                  </button>
                  <ThemeToggle variant="dropdown" className="w-full" showLabel />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center px-3 py-2 text-sm text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 hover:scale-105"
                  >
                    <LogOut className="mr-3 h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => router.push('/dashboard/settings')}
                  className="w-full flex justify-center p-3 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-105"
                  title="Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <div className="flex justify-center">
                  <ThemeToggle />
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex justify-center p-3 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 hover:scale-105"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation */}
        <header className="glass-effect border-b border-gray-200/50 dark:border-gray-700/50 px-4 lg:px-6 flex-shrink-0 animate-fade-in-down">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleSidebar}
                className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-105"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Breadcrumb */}
              <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Home className="h-4 w-4" />
                <span>/</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium capitalize">
                  {pathname.split('/').pop() || 'dashboard'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Search */}
              <form onSubmit={handleSearch} className="hidden md:block">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dashboard..."
                    className="pl-10 pr-4 py-2 w-64 glass-effect border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-transparent text-sm transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
              </form>

              {/* Theme Toggle */}
              <ThemeToggle className="hidden lg:flex" />

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 hover:scale-105"
                >
                  <Bell className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-bounce-gentle">
                    <span className="absolute inset-0 h-3 w-3 bg-red-400 rounded-full animate-ping"></span>
                  </span>
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowNotifications(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 z-20 w-80 glass-effect rounded-xl shadow-hard border border-gray-200/50 dark:border-gray-700/50 py-2 animate-scale-in">
                      <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/50">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                          No new notifications
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* User Menu */}
              <div className="relative group">
                <button className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-105">
                  <div className="w-8 h-8 gradient-primary rounded-full flex items-center justify-center shadow-medium">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user.name}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="h-full animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// Main component with theme provider
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <ThemeProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </ThemeProvider>
  );
}