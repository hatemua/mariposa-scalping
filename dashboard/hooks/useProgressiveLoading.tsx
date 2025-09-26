import { useState, useEffect, useCallback, useRef } from 'react';

interface ProgressiveLoadingState {
  isLoading: boolean;
  loadingStages: string[];
  currentStage: string | null;
  progress: number;
  error: string | null;
  data: any;
}

interface UseProgressiveLoadingOptions {
  stages: Array<{
    name: string;
    loader: () => Promise<any>;
    timeout?: number;
    retries?: number;
    optional?: boolean;
  }>;
  onStageComplete?: (stage: string, data: any) => void;
  onError?: (stage: string, error: Error) => void;
  onComplete?: (data: any) => void;
}

export const useProgressiveLoading = (options: UseProgressiveLoadingOptions) => {
  const [state, setState] = useState<ProgressiveLoadingState>({
    isLoading: false,
    loadingStages: options.stages.map(s => s.name),
    currentStage: null,
    progress: 0,
    error: null,
    data: {}
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const clearTimeouts = () => {
    Object.values(timeoutRefs.current).forEach(clearTimeout);
    timeoutRefs.current = {};
  };

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    clearTimeouts();
    setState(prev => ({ ...prev, isLoading: false, currentStage: null }));
  }, []);

  const loadStage = async (
    stage: UseProgressiveLoadingOptions['stages'][0],
    stageIndex: number,
    retryCount = 0
  ): Promise<any> => {
    const { name, loader, timeout = 30000, retries = 2, optional = false } = stage;

    try {
      setState(prev => ({
        ...prev,
        currentStage: name,
        progress: (stageIndex / options.stages.length) * 100
      }));

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        timeoutRefs.current[name] = setTimeout(() => {
          reject(new Error(`Stage "${name}" timed out after ${timeout}ms`));
        }, timeout);
      });

      // Create abort promise
      const abortPromise = new Promise((_, reject) => {
        if (abortControllerRef.current?.signal.aborted) {
          reject(new Error('Loading was aborted'));
        }
        abortControllerRef.current?.signal.addEventListener('abort', () => {
          reject(new Error('Loading was aborted'));
        });
      });

      // Race between loader, timeout, and abort
      const result = await Promise.race([
        loader(),
        timeoutPromise,
        abortPromise
      ]);

      // Clear the timeout for this stage
      if (timeoutRefs.current[name]) {
        clearTimeout(timeoutRefs.current[name]);
        delete timeoutRefs.current[name];
      }

      options.onStageComplete?.(name, result);
      return result;

    } catch (error: any) {
      // Clear timeout on error
      if (timeoutRefs.current[name]) {
        clearTimeout(timeoutRefs.current[name]);
        delete timeoutRefs.current[name];
      }

      if (error.message === 'Loading was aborted') {
        throw error;
      }

      console.warn(`Stage "${name}" failed:`, error);

      // Retry if retries are available
      if (retryCount < retries) {
        console.log(`Retrying stage "${name}" (${retryCount + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, retryCount), 10000)));
        return loadStage(stage, stageIndex, retryCount + 1);
      }

      // If optional, continue with null data
      if (optional) {
        console.warn(`Optional stage "${name}" failed, continuing...`);
        options.onError?.(name, error);
        return null;
      }

      // If not optional, throw the error
      throw error;
    }
  };

  const load = useCallback(async () => {
    if (state.isLoading) {
      console.warn('Loading already in progress');
      return;
    }

    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: true,
      currentStage: null,
      progress: 0,
      error: null,
      data: {}
    }));

    try {
      const results: { [key: string]: any } = {};

      for (let i = 0; i < options.stages.length; i++) {
        const stage = options.stages[i];

        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Loading was aborted');
        }

        try {
          const result = await loadStage(stage, i);
          results[stage.name] = result;

          // Update state with partial data
          setState(prev => ({
            ...prev,
            data: { ...prev.data, [stage.name]: result },
            progress: ((i + 1) / options.stages.length) * 100
          }));

        } catch (error: any) {
          if (error.message === 'Loading was aborted') {
            return; // Exit silently if aborted
          }
          throw error;
        }
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        currentStage: null,
        progress: 100,
        data: results
      }));

      options.onComplete?.(results);

    } catch (error: any) {
      if (error.message !== 'Loading was aborted') {
        console.error('Progressive loading failed:', error);

        setState(prev => ({
          ...prev,
          isLoading: false,
          currentStage: null,
          error: error.message || 'Loading failed'
        }));

        options.onError?.('general', error);
      }
    } finally {
      clearTimeouts();
    }
  }, [options, state.isLoading]);

  const retry = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
    load();
  }, [load]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abort();
    };
  }, [abort]);

  return {
    ...state,
    load,
    retry,
    abort,
    isStageLoading: (stageName: string) => state.currentStage === stageName,
    isStageComplete: (stageName: string) => stageName in state.data,
    isStageError: (stageName: string) => state.error?.includes(stageName) || false,
    getStageData: (stageName: string) => state.data[stageName]
  };
};