import { Router, Request, Response } from 'express';
import { ReferralService } from '../services/referralService';
import { UserService } from '../services/userService';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { body, param, query, validationResult } from 'express-validator';

const router = Router();
const referralService = new ReferralService();
const userService = new UserService();
const isRefOnlyMode = process.env.REF_ONLY_MODE === 'true';
const refOnlyPassword = process.env.REF_ONLY_PASSWORD;

const assertRefOnlyAccess = (req: Request, res: Response): boolean => {
  if (!isRefOnlyMode) return true;
  if (!refOnlyPassword) {
    return res.status(500).json({ error: 'Ref-only mode misconfigured' }) as unknown as boolean;
  }
  const password =
    (req.headers['x-ref-only-password'] as string | undefined) ||
    (req.query.refOnlyPassword as string | undefined) ||
    (req.body?.refOnlyPassword as string | undefined);
  if (password !== refOnlyPassword) {
    res.status(403).json({ error: 'Ref-only password required' });
    return false;
  }
  return true;
};

/**
 * @swagger
 * /referrals/link:
 *   get:
 *     summary: Get referral link and stats for a user
 *     tags: [Referrals]
 *     parameters:
 *       - in: query
 *         name: megaethAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: User's MegaETH wallet address
 *     responses:
 *       200:
 *         description: Referral link and stats
 */
router.get(
  '/link',
  query('megaethAddress').isString().notEmpty(),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid address', details: errors.array() });
    }

    if (!assertRefOnlyAccess(req, res)) return;

    const { megaethAddress } = req.query;
    
    // Get or create user
    const user = await userService.getOrCreateUser(megaethAddress as string);
    
    // Get referral code and stats
    const referralCode = await referralService.getReferralCode(user.id);
    const referralLink = referralService.getReferralLink(referralCode);
    const stats = await referralService.getStats(user.id);

    res.json({
      referralCode,
      referralLink,
      stats: stats || {
        total_referrals: 0,
        active_referrals: 0,
        total_trades: 0,
        total_volume_usdc: 0,
      },
    });
  })
);

/**
 * @swagger
 * /referrals/apply:
 *   post:
 *     summary: Apply a referral code to a user (first contact attribution)
 *     tags: [Referrals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - megaethAddress
 *               - referralCode
 *             properties:
 *               megaethAddress:
 *                 type: string
 *               referralCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Referral applied successfully
 *       400:
 *         description: Invalid code or already referred
 */
router.post(
  '/apply',
  body('megaethAddress').isString().notEmpty(),
  body('referralCode').isString().isLength({ min: 6, max: 12 }),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { megaethAddress, referralCode } = req.body;

    // Get or create user
    const user = await userService.getOrCreateUser(megaethAddress);

    // Apply referral
    const result = await referralService.applyReferralCode(user.id, referralCode);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    logger.info('Referral code applied', { userId: user.id, referralCode });
    res.json({ success: true, message: 'Referral applied successfully' });
  })
);

/**
 * @swagger
 * /referrals/code:
 *   patch:
 *     summary: Update user's referral code (personalize)
 *     tags: [Referrals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [megaethAddress, referralCode]
 *             properties:
 *               megaethAddress: { type: string }
 *               referralCode: { type: string, minLength: 6, maxLength: 12 }
 *     responses:
 *       200: { description: Code updated }
 *       400: { description: Invalid input or code taken }
 */
router.patch(
  '/code',
  body('megaethAddress').isString().notEmpty(),
  body('referralCode').isString().isLength({ min: 6, max: 12 }).matches(/^[A-Za-z0-9]+$/),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    if (!assertRefOnlyAccess(req, res)) return;
    const { megaethAddress, referralCode } = req.body;
    const user = await userService.getUserByAddress(megaethAddress);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const result = await referralService.updateReferralCode(user.id, referralCode);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    const storedCode = result.storedCode ?? referralCode.trim().replace(/[^A-Za-z0-9]/g, '');
    const newLink = referralService.getReferralLink(storedCode);
    res.json({ success: true, referralCode: storedCode, referralLink: newLink });
  })
);

/**
 * @swagger
 * /referrals/stats:
 *   get:
 *     summary: Get detailed referral stats for a user
 *     tags: [Referrals]
 *     parameters:
 *       - in: query
 *         name: megaethAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Referral statistics
 */
router.get(
  '/stats',
  query('megaethAddress').isString().notEmpty(),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid address', details: errors.array() });
    }

    const { megaethAddress } = req.query;
    const user = await userService.getUserByAddress(megaethAddress as string);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await referralService.getStats(user.id);
    res.json(stats);
  })
);

/**
 * @swagger
 * /referrals/referred-users:
 *   get:
 *     summary: Get list of users referred by this user
 *     tags: [Referrals]
 *     parameters:
 *       - in: query
 *         name: megaethAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of referred users with their activity
 */
router.get(
  '/referred-users',
  query('megaethAddress').isString().notEmpty(),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid address', details: errors.array() });
    }

    const { megaethAddress } = req.query;
    const user = await userService.getUserByAddress(megaethAddress as string);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const referredUsers = await referralService.getReferredUsers(user.id);
    res.json({ referredUsers });
  })
);

/**
 * @swagger
 * /referrals/leaderboard:
 *   get:
 *     summary: Get referral leaderboard
 *     tags: [Referrals]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Leaderboard entries
 */
router.get(
  '/leaderboard',
  query('limit').optional().isInt({ min: 1, max: 100 }),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;
    const leaderboard = await referralService.getLeaderboard(limit);
    res.json({ leaderboard });
  })
);

/**
 * @swagger
 * /referrals/validate/{code}:
 *   get:
 *     summary: Validate a referral code
 *     tags: [Referrals]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Code is valid
 *       404:
 *         description: Invalid code
 */
router.get(
  '/validate/:code',
  param('code').isString().isLength({ min: 6, max: 12 }),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid code format' });
    }

    const { code } = req.params;
    const user = await referralService.getUserByReferralCode(code);

    if (!user) {
      return res.status(404).json({ valid: false, error: 'Invalid referral code' });
    }

    res.json({ 
      valid: true, 
      referrerAddress: user.megaeth_address,
    });
  })
);

export default router;
