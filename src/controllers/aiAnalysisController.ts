import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
// API Response interface
interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}
import { aiAnalysisWorker, AnalysisJob } from '../services/aiAnalysisWorker';

// Start a new professional analysis job
export const startProfessionalAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbols, minStrength = 60 } = req.body;
    const userId = req.user?.id || 'anonymous';

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Symbols array is required and must not be empty'
      } as ApiResponse);
      return;
    }

    if (symbols.length > 6) {
      res.status(400).json({
        success: false,
        error: 'Maximum 6 symbols allowed per analysis for optimal performance'
      } as ApiResponse);
      return;
    }

    if (minStrength < 50 || minStrength > 100) {
      res.status(400).json({
        success: false,
        error: 'Minimum strength must be between 50 and 100'
      } as ApiResponse);
      return;
    }

    // Check if user already has a running job
    const userJobs = aiAnalysisWorker.getUserJobs(userId);
    const runningJob = userJobs.find(job => ['queued', 'processing'].includes(job.status));

    if (runningJob) {
      // Auto-resume existing job instead of throwing error
      console.log(`🔄 Auto-resuming existing analysis job ${runningJob.id} for user ${userId}`);

      res.status(202).json({
        success: true,
        message: 'Resuming existing analysis in progress',
        data: {
          jobId: runningJob.id,
          estimatedDuration: '30-45 seconds',
          symbols: runningJob.symbols,
          minStrength: runningJob.minStrength,
          statusEndpoint: `/api/market/analysis-status/${runningJob.id}`,
          resultsEndpoint: `/api/market/analysis-results/${runningJob.id}`,
          isResumed: true,
          currentProgress: runningJob.progress
        }
      } as ApiResponse);
      return;
    }

    // Create new analysis job
    const jobId = aiAnalysisWorker.createJob(userId, symbols, minStrength);

    console.log(`🚀 Started professional analysis job ${jobId} for user ${userId}`);

    res.status(202).json({
      success: true,
      message: 'Professional analysis started successfully',
      data: {
        jobId,
        estimatedDuration: '30-45 seconds',
        symbols: symbols.slice(0, 6),
        minStrength,
        statusEndpoint: `/api/market/analysis-status/${jobId}`,
        resultsEndpoint: `/api/market/analysis-results/${jobId}`
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error starting professional analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start professional analysis'
    } as ApiResponse);
  }
};

// Get analysis job status
export const getAnalysisStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.id || 'anonymous';

    if (!jobId) {
      res.status(400).json({
        success: false,
        error: 'Job ID is required'
      } as ApiResponse);
      return;
    }

    const job = aiAnalysisWorker.getJob(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Analysis job not found'
      } as ApiResponse);
      return;
    }

    // Check if user owns this job
    if (job.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this analysis job'
      } as ApiResponse);
      return;
    }

    // Calculate elapsed time
    const elapsedTime = Date.now() - job.startTime.getTime();
    const estimatedTotal = 45000; // 45 seconds for 6 symbols
    const remainingTime = Math.max(0, estimatedTotal - elapsedTime);

    res.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        currentSymbol: job.currentSymbol,
        processedSymbols: job.processedSymbols,
        totalSymbols: job.totalSymbols,
        startTime: job.startTime,
        endTime: job.endTime,
        elapsedTime: Math.round(elapsedTime / 1000), // seconds
        estimatedRemainingTime: Math.round(remainingTime / 1000), // seconds
        error: job.error,
        resultsCount: job.results?.length || 0
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting analysis status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analysis status'
    } as ApiResponse);
  }
};

// Get analysis results
export const getAnalysisResults = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.id || 'anonymous';

    if (!jobId) {
      res.status(400).json({
        success: false,
        error: 'Job ID is required'
      } as ApiResponse);
      return;
    }

    const job = aiAnalysisWorker.getJob(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Analysis job not found'
      } as ApiResponse);
      return;
    }

    // Check if user owns this job
    if (job.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this analysis job'
      } as ApiResponse);
      return;
    }

    if (job.status !== 'completed') {
      res.status(425).json({
        success: false,
        error: `Analysis not completed yet. Current status: ${job.status}`,
        data: {
          status: job.status,
          progress: job.progress
        }
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      message: `Professional analysis completed successfully with ${job.results?.length || 0} signals`,
      data: job.results || []
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting analysis results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analysis results'
    } as ApiResponse);
  }
};

// Cancel analysis job
export const cancelAnalysisJob = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.id || 'anonymous';

    if (!jobId) {
      res.status(400).json({
        success: false,
        error: 'Job ID is required'
      } as ApiResponse);
      return;
    }

    const job = aiAnalysisWorker.getJob(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Analysis job not found'
      } as ApiResponse);
      return;
    }

    // Check if user owns this job
    if (job.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this analysis job'
      } as ApiResponse);
      return;
    }

    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      res.status(400).json({
        success: false,
        error: `Cannot cancel job in ${job.status} status`
      } as ApiResponse);
      return;
    }

    const cancelled = aiAnalysisWorker.cancelJob(jobId);

    if (cancelled) {
      console.log(`❌ User ${userId} cancelled analysis job ${jobId}`);

      res.json({
        success: true,
        message: 'Analysis job cancelled successfully'
      } as ApiResponse);
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to cancel analysis job'
      } as ApiResponse);
    }

  } catch (error) {
    console.error('Error cancelling analysis job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel analysis job'
    } as ApiResponse);
  }
};

// Get user's analysis jobs
export const getUserAnalysisJobs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id || 'anonymous';
    const userJobs = aiAnalysisWorker.getUserJobs(userId);

    // Sort by start time (newest first)
    const sortedJobs = userJobs
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, 10); // Limit to last 10 jobs

    // Remove sensitive data and results for non-completed jobs
    const sanitizedJobs = sortedJobs.map(job => ({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      symbols: job.symbols,
      totalSymbols: job.totalSymbols,
      processedSymbols: job.processedSymbols,
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error,
      resultsCount: job.results?.length || 0,
      currentSymbol: job.currentSymbol
    }));

    res.json({
      success: true,
      data: sanitizedJobs
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting user analysis jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analysis jobs'
    } as ApiResponse);
  }
};