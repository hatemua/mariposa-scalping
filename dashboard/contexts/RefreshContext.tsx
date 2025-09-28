'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { RefreshSpeed, REFRESH_SPEEDS } from '@/hooks/useSmartRefresh';

interface RefreshState {
  globalEnabled: boolean;
  refreshSpeed: RefreshSpeed;
  componentStates: Record<string, {
    enabled: boolean;
    lastRefresh: Date | null;
    isRefreshing: boolean;
  }>;
}

type RefreshAction =
  | { type: 'TOGGLE_GLOBAL'; enabled: boolean }
  | { type: 'SET_REFRESH_SPEED'; speed: RefreshSpeed }
  | { type: 'TOGGLE_COMPONENT'; componentId: string; enabled: boolean }
  | { type: 'SET_COMPONENT_REFRESHING'; componentId: string; isRefreshing: boolean }
  | { type: 'SET_COMPONENT_LAST_REFRESH'; componentId: string; lastRefresh: Date }
  | { type: 'RESET_ALL' };

interface RefreshContextValue {
  state: RefreshState;
  toggleGlobal: (enabled: boolean) => void;
  setRefreshSpeed: (speed: RefreshSpeed) => void;
  toggleComponent: (componentId: string, enabled: boolean) => void;
  setComponentRefreshing: (componentId: string, isRefreshing: boolean) => void;
  setComponentLastRefresh: (componentId: string, lastRefresh: Date) => void;
  isComponentEnabled: (componentId: string) => boolean;
  getEffectiveInterval: (baseInterval: number) => number;
  resetAll: () => void;
}

const initialState: RefreshState = {
  globalEnabled: true,
  refreshSpeed: 'NORMAL',
  componentStates: {},
};

function refreshReducer(state: RefreshState, action: RefreshAction): RefreshState {
  switch (action.type) {
    case 'TOGGLE_GLOBAL':
      return {
        ...state,
        globalEnabled: action.enabled,
      };

    case 'SET_REFRESH_SPEED':
      return {
        ...state,
        refreshSpeed: action.speed,
      };

    case 'TOGGLE_COMPONENT':
      return {
        ...state,
        componentStates: {
          ...state.componentStates,
          [action.componentId]: {
            ...state.componentStates[action.componentId],
            enabled: action.enabled,
            lastRefresh: state.componentStates[action.componentId]?.lastRefresh || null,
            isRefreshing: state.componentStates[action.componentId]?.isRefreshing || false,
          },
        },
      };

    case 'SET_COMPONENT_REFRESHING':
      return {
        ...state,
        componentStates: {
          ...state.componentStates,
          [action.componentId]: {
            ...state.componentStates[action.componentId],
            enabled: state.componentStates[action.componentId]?.enabled ?? true,
            lastRefresh: state.componentStates[action.componentId]?.lastRefresh || null,
            isRefreshing: action.isRefreshing,
          },
        },
      };

    case 'SET_COMPONENT_LAST_REFRESH':
      return {
        ...state,
        componentStates: {
          ...state.componentStates,
          [action.componentId]: {
            ...state.componentStates[action.componentId],
            enabled: state.componentStates[action.componentId]?.enabled ?? true,
            isRefreshing: state.componentStates[action.componentId]?.isRefreshing || false,
            lastRefresh: action.lastRefresh,
          },
        },
      };

    case 'RESET_ALL':
      return initialState;

    default:
      return state;
  }
}

const RefreshContext = createContext<RefreshContextValue | undefined>(undefined);

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(refreshReducer, initialState);

  // Load saved preferences from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('dashboard-refresh-preferences');
        if (saved) {
          const preferences = JSON.parse(saved);
          if (preferences.globalEnabled !== undefined) {
            dispatch({ type: 'TOGGLE_GLOBAL', enabled: preferences.globalEnabled });
          }
          if (preferences.refreshSpeed && preferences.refreshSpeed in REFRESH_SPEEDS) {
            dispatch({ type: 'SET_REFRESH_SPEED', speed: preferences.refreshSpeed });
          }
        }
      } catch (error) {
        console.warn('Failed to load refresh preferences:', error);
      }
    }
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const preferences = {
          globalEnabled: state.globalEnabled,
          refreshSpeed: state.refreshSpeed,
        };
        localStorage.setItem('dashboard-refresh-preferences', JSON.stringify(preferences));
      } catch (error) {
        console.warn('Failed to save refresh preferences:', error);
      }
    }
  }, [state.globalEnabled, state.refreshSpeed]);

  const toggleGlobal = useCallback((enabled: boolean) => {
    dispatch({ type: 'TOGGLE_GLOBAL', enabled });
  }, []);

  const setRefreshSpeed = useCallback((speed: RefreshSpeed) => {
    dispatch({ type: 'SET_REFRESH_SPEED', speed });
  }, []);

  const toggleComponent = useCallback((componentId: string, enabled: boolean) => {
    dispatch({ type: 'TOGGLE_COMPONENT', componentId, enabled });
  }, []);

  const setComponentRefreshing = useCallback((componentId: string, isRefreshing: boolean) => {
    dispatch({ type: 'SET_COMPONENT_REFRESHING', componentId, isRefreshing });
  }, []);

  const setComponentLastRefresh = useCallback((componentId: string, lastRefresh: Date) => {
    dispatch({ type: 'SET_COMPONENT_LAST_REFRESH', componentId, lastRefresh });
  }, []);

  const isComponentEnabled = useCallback((componentId: string) => {
    if (!state.globalEnabled) return false;
    return state.componentStates[componentId]?.enabled ?? true;
  }, [state.globalEnabled, state.componentStates]);

  const getEffectiveInterval = useCallback((baseInterval: number) => {
    return Math.round(baseInterval * REFRESH_SPEEDS[state.refreshSpeed]);
  }, [state.refreshSpeed]);

  const resetAll = useCallback(() => {
    dispatch({ type: 'RESET_ALL' });
  }, []);

  const value: RefreshContextValue = {
    state,
    toggleGlobal,
    setRefreshSpeed,
    toggleComponent,
    setComponentRefreshing,
    setComponentLastRefresh,
    isComponentEnabled,
    getEffectiveInterval,
    resetAll,
  };

  return (
    <RefreshContext.Provider value={value}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefreshContext() {
  const context = useContext(RefreshContext);
  if (context === undefined) {
    throw new Error('useRefreshContext must be used within a RefreshProvider');
  }
  return context;
}

// Hook for components to use smart refresh with global context
export function useComponentRefresh(componentId: string, baseInterval: number, refreshFn: () => void | Promise<void>) {
  const {
    isComponentEnabled,
    getEffectiveInterval,
    setComponentRefreshing,
    setComponentLastRefresh,
  } = useRefreshContext();

  const enabled = isComponentEnabled(componentId);
  const effectiveInterval = getEffectiveInterval(baseInterval);

  const wrappedRefreshFn = useCallback(async () => {
    try {
      setComponentRefreshing(componentId, true);
      await refreshFn();
      setComponentLastRefresh(componentId, new Date());
    } finally {
      setComponentRefreshing(componentId, false);
    }
  }, [refreshFn, componentId, setComponentRefreshing, setComponentLastRefresh]);

  return {
    enabled,
    interval: effectiveInterval,
    refreshFn: wrappedRefreshFn,
  };
}