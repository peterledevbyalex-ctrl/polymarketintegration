import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../db/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { authenticateWallet } from '../middleware/authenticateWallet';
import { commentsRateLimiter } from '../middleware/rateLimitComments';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const postCommentSchema = z.object({
  market_id: z.string().min(1).max(200),
  user_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  body: z.string().min(1).max(1000).trim(),
  parent_id: z.string().uuid().optional().nullable(),
  walletSignature: z.string().optional(), // Optional - will use stored signature if available
});

const deleteCommentSchema = z.object({
  user_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  walletSignature: z.string().optional(), // Optional - will use stored signature if available
});

/**
 * @swagger
 * /api/comments/{marketId}:
 *   get:
 *     summary: Get comments for a market
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of comments
 */
router.get('/:marketId', commentsRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { marketId } = req.params;
  
  // Validate marketId format (basic check)
  if (!marketId || marketId.length > 200) {
    res.status(400).json({ error: 'Invalid market_id' });
    return;
  }
  
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100); // 1-100
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  // Use RLS-enabled client (no JWT needed for public read)
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('market_comments')
    .select('*')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error('Failed to fetch comments', { marketId, error });
    res.status(500).json({ error: 'Failed to fetch comments' });
    return;
  }

  res.json({ comments: data || [] });
}));

/**
 * @swagger
 * /api/comments:
 *   post:
 *     summary: Post a new comment
 *     tags: [Comments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - market_id
 *               - user_address
 *               - body
 *             properties:
 *               market_id:
 *                 type: string
 *               user_address:
 *                 type: string
 *               body:
 *                 type: string
 *               parent_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created
 */
router.post('/', 
  commentsRateLimiter,
  authenticateWallet,
  validate(postCommentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { market_id, body, parent_id } = req.body;
    // Use authenticated address from middleware (prevents spoofing)
    const user_address = (req as any).authenticatedAddress;
    const jwtToken = (req as any).jwtToken; // JWT for RLS

    // Basic HTML sanitization - remove script tags and dangerous HTML
    const sanitizedBody = body
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();

    if (!sanitizedBody || sanitizedBody.length === 0) {
      res.status(400).json({ error: 'Comment body cannot be empty after sanitization' });
      return;
    }

    // Use RLS-enabled client with JWT token
    const client = getSupabaseClient(jwtToken);
    const { data, error } = await client
      .from('market_comments')
      .insert({
        market_id,
        user_address: user_address.toLowerCase(),
        body: sanitizedBody,
        parent_id: parent_id || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to post comment', { market_id, user_address, error });
      res.status(500).json({ error: 'Failed to post comment' });
      return;
    }

    res.status(201).json({ comment: data });
  })
);

/**
 * @swagger
 * /api/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment (only by author)
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_address
 *             properties:
 *               user_address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comment deleted
 */
router.delete('/:commentId', 
  commentsRateLimiter,
  authenticateWallet,
  validate(deleteCommentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { commentId } = req.params;
    // Use authenticated address from middleware (prevents spoofing)
    const user_address = (req as any).authenticatedAddress;
    const jwtToken = (req as any).jwtToken; // JWT for RLS

    // Validate commentId format (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(commentId)) {
      res.status(400).json({ error: 'Invalid comment ID format' });
      return;
    }

    // Use RLS-enabled client with JWT token
    // RLS will ensure user can only see/delete their own comments
    const client = getSupabaseClient(jwtToken);
    
    // First verify the comment exists and belongs to the user
    const { data: comment, error: fetchError } = await client
      .from('market_comments')
      .select('id, user_address')
      .eq('id', commentId)
      .single();

    if (fetchError || !comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    if (comment.user_address.toLowerCase() !== user_address.toLowerCase()) {
      logger.warn('Unauthorized comment deletion attempt', { 
        commentId, 
        requestedBy: user_address, 
        actualOwner: comment.user_address 
      });
      res.status(403).json({ error: 'Not authorized to delete this comment' });
      return;
    }

    // Only allow deletion by the comment author
    // RLS will enforce this at the database level
    const { error } = await client
      .from('market_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_address', user_address.toLowerCase());

    if (error) {
      logger.error('Failed to delete comment', { commentId, user_address, error });
      res.status(500).json({ error: 'Failed to delete comment' });
      return;
    }

    res.json({ success: true });
  })
);

export default router;
