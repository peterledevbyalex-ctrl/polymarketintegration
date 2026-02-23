import { useState, useEffect } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { Tag } from '@/types/polymarket.types';

interface UseTagsReturn {
  tags: Tag[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const CACHE_KEY = 'polymarket_tags';
const CACHE_DURATION = 24 * 60 * 60 * 1000;

const getCachedTags = (): { tags: Tag[]; timestamp: number } | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const now = Date.now();
    
    if (now - data.timestamp > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return data;
  } catch {
    return null;
  }
};

const setCachedTags = (tags: Tag[]) => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      tags,
      timestamp: Date.now(),
    }));
  } catch (err) {
    console.error('Failed to cache tags:', err);
  }
};

export const useTags = (): UseTagsReturn => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTags = async () => {
    const cached = getCachedTags();
    if (cached) {
      setTags(cached.tags);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await polymarketAPI.getTags();
      setTags(response.tags || []);
      setCachedTags(response.tags || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch tags');
      setError(error);
      console.error('Failed to fetch tags:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  return {
    tags,
    isLoading,
    error,
    refetch: fetchTags,
  };
};
