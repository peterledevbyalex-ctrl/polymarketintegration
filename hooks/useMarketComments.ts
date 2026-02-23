"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import { POLYMARKET_API_URL } from '@/lib/polymarket/constants';

export interface MarketComment {
  id: string;
  market_id: string;
  user_address: string;
  body: string;
  parent_id: string | null;
  created_at: string;
}

export interface MarketCommentInsert {
  market_id: string;
  user_address: string;
  body: string;
  parent_id?: string | null;
}

interface UseMarketCommentsOptions {
  marketId: string;
  autoFetch?: boolean;
  pollInterval?: number; // Poll for new comments (ms)
}

export const useMarketComments = ({ 
  marketId, 
  autoFetch = true,
  pollInterval = 10000, // Poll every 10 seconds
}: UseMarketCommentsOptions) => {
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch comments from backend API
  const fetchComments = useCallback(async () => {
    if (!marketId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${POLYMARKET_API_URL}/api/comments/${marketId}?limit=50`, {
        signal: AbortSignal.timeout(5000), // 5s timeout
      });
      if (!res.ok) throw new Error('Failed to fetch comments');
      
      const data = await res.json();
      setComments(data.comments || []);
    } catch (err) {
      // Silently fail if backend unavailable - don't spam console
      if ((err as Error).name !== 'AbortError') {
        setError(err as Error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [marketId]);

  // Post a new comment
  const postComment = useCallback(async (comment: MarketCommentInsert) => {
    const res = await fetch(`${POLYMARKET_API_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comment),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to post comment');
    }
    
    const data = await res.json();
    
    // Add to local state immediately
    if (data.comment) {
      setComments(prev => [data.comment, ...prev]);
    }
    
    return data.comment;
  }, []);

  // Delete a comment
  const deleteComment = useCallback(async (commentId: string, userAddress: string) => {
    try {
      const res = await fetch(`${POLYMARKET_API_URL}/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_address: userAddress }),
      });
      
      if (!res.ok) throw new Error('Failed to delete comment');
      
      // Remove from local state
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      console.error('Error deleting comment:', err);
      throw err;
    }
  }, []);

  // Auto-fetch and polling
  useEffect(() => {
    if (!marketId || !autoFetch) return;

    // Initial fetch
    fetchComments();

    // Set up polling for new comments
    if (pollInterval > 0) {
      pollRef.current = setInterval(fetchComments, pollInterval);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [marketId, autoFetch, pollInterval, fetchComments]);

  return {
    comments,
    isLoading,
    error,
    postComment,
    deleteComment,
    refetch: fetchComments,
  };
};
