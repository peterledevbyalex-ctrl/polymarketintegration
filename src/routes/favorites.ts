import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../db/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { authenticateWallet, optionalAuthenticateWallet } from '../middleware/authenticateWallet';
import { favoritesRateLimiter } from '../middleware/rateLimitComments';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const addFavoriteSchema = z.object({
  user_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  market_id: z.string().min(1).max(200),
  walletSignature: z.string().optional(), // Optional - will use stored signature if available
});

/**
 * @swagger
 * /api/favorites/{userAddress}:
 *   get:
 *     summary: Get all favorites for a user
 *     tags: [Favorites]
 *     parameters:
 *       - in: path
 *         name: userAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of favorite market IDs
 */
router.get('/:userAddress', 
  favoritesRateLimiter,
  optionalAuthenticateWallet, // Optional - allow viewing own favorites without auth
  asyncHandler(async (req: Request, res: Response) => {
    const { userAddress } = req.params;

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      res.status(400).json({ error: 'Invalid Ethereum address format' });
      return;
    }

    // If authenticated, verify they're viewing their own favorites
    const authenticatedAddress = (req as any).authenticatedAddress;
    const jwtToken = (req as any).jwtToken;
    if (authenticatedAddress && authenticatedAddress.toLowerCase() !== userAddress.toLowerCase()) {
      res.status(403).json({ error: 'Not authorized to view this user\'s favorites' });
      return;
    }

    // Use RLS-enabled client (JWT optional for public viewing)
    const client = getSupabaseClient(jwtToken);
    const { data, error } = await client
      .from('market_favorites')
      .select('market_id, created_at')
      .eq('user_address', userAddress.toLowerCase())
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch favorites', { userAddress, error });
      res.status(500).json({ error: 'Failed to fetch favorites' });
      return;
    }

    res.json({ favorites: data || [] });
  })
);

/**
 * @swagger
 * /api/favorites/{userAddress}/{marketId}:
 *   get:
 *     summary: Check if a market is favorited by a user
 *     tags: [Favorites]
 *     parameters:
 *       - in: path
 *         name: userAddress
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Favorite status
 */
router.get('/:userAddress/:marketId', 
  favoritesRateLimiter,
  optionalAuthenticateWallet,
  asyncHandler(async (req: Request, res: Response) => {
    const { userAddress, marketId } = req.params;

    // Validate formats
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      res.status(400).json({ error: 'Invalid Ethereum address format' });
      return;
    }
    if (!marketId || marketId.length > 200) {
      res.status(400).json({ error: 'Invalid market_id' });
      return;
    }

    // If authenticated, verify they're checking their own favorites
    const authenticatedAddress = (req as any).authenticatedAddress;
    const jwtToken = (req as any).jwtToken;
    if (authenticatedAddress && authenticatedAddress.toLowerCase() !== userAddress.toLowerCase()) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    // Use RLS-enabled client (JWT optional for public viewing)
    const client = getSupabaseClient(jwtToken);
    const { data, error } = await client
      .from('market_favorites')
      .select('id')
      .eq('user_address', userAddress.toLowerCase())
      .eq('market_id', marketId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to check favorite', { userAddress, marketId, error });
      res.status(500).json({ error: 'Failed to check favorite' });
      return;
    }

    res.json({ isFavorite: !!data });
  })
);

/**
 * @swagger
 * /api/favorites:
 *   post:
 *     summary: Add a market to favorites
 *     tags: [Favorites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_address
 *               - market_id
 *             properties:
 *               user_address:
 *                 type: string
 *               market_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Favorite added
 *       409:
 *         description: Already favorited
 */
router.post('/', 
  favoritesRateLimiter,
  authenticateWallet, // Uses stored signature if available
  validate(addFavoriteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { market_id } = req.body;
    // Use authenticated address from middleware (prevents spoofing)
    const user_address = (req as any).authenticatedAddress;
    const jwtToken = (req as any).jwtToken; // JWT for RLS

    if (!market_id) {
      res.status(400).json({ error: 'market_id is required' });
      return;
    }

    // Use RLS-enabled client with JWT token
    const client = getSupabaseClient(jwtToken);

    // Check if already exists
    const { data: existing } = await client
      .from('market_favorites')
      .select('id')
      .eq('user_address', user_address.toLowerCase())
      .eq('market_id', market_id)
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: 'Already favorited' });
      return;
    }

    const { data, error } = await client
      .from('market_favorites')
      .insert({
        user_address: user_address.toLowerCase(),
        market_id,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to add favorite', { user_address, market_id, error });
      res.status(500).json({ error: 'Failed to add favorite' });
      return;
    }

    logger.info('Favorite added', { user_address, market_id });
    res.status(201).json({ favorite: data });
  })
);

/**
 * @swagger
 * /api/favorites/{userAddress}/{marketId}:
 *   delete:
 *     summary: Remove a market from favorites
 *     tags: [Favorites]
 *     parameters:
 *       - in: path
 *         name: userAddress
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Favorite removed
 *       404:
 *         description: Favorite not found
 */
router.delete('/:userAddress/:marketId', 
  favoritesRateLimiter,
  authenticateWallet, // Uses stored signature if available
  asyncHandler(async (req: Request, res: Response) => {
    const { userAddress, marketId } = req.params;
    // Use authenticated address from middleware (prevents spoofing)
    const authenticatedAddress = (req as any).authenticatedAddress;
    const jwtToken = (req as any).jwtToken; // JWT for RLS

    // Verify they're deleting their own favorite
    if (authenticatedAddress.toLowerCase() !== userAddress.toLowerCase()) {
      res.status(403).json({ error: 'Not authorized to delete this favorite' });
      return;
    }

    // Validate marketId
    if (!marketId || marketId.length > 200) {
      res.status(400).json({ error: 'Invalid market_id' });
      return;
    }

    // Use RLS-enabled client with JWT token
    // RLS will enforce this at the database level
    const client = getSupabaseClient(jwtToken);
    const { data, error } = await client
      .from('market_favorites')
      .delete()
      .eq('user_address', authenticatedAddress.toLowerCase())
      .eq('market_id', marketId)
      .select();

    if (error) {
      logger.error('Failed to remove favorite', { userAddress: authenticatedAddress, marketId, error });
      res.status(500).json({ error: 'Failed to remove favorite' });
      return;
    }

    if (!data || data.length === 0) {
      res.status(404).json({ error: 'Favorite not found' });
      return;
    }

    logger.info('Favorite removed', { userAddress: authenticatedAddress, marketId });
    res.json({ success: true });
  })
);

export default router;
