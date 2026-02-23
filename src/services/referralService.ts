import { supabase } from '../db/supabase';
import { 
  ReferralActionType, 
  ReferralStats, 
  ReferredUser,
  ReferralLeaderboardEntry,
  User 
} from '../types';
import logger from '../utils/logger';

export class ReferralService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.REFERRAL_BASE_URL || 'https://prismfi.cc';
  }

  /**
   * Get or generate referral code for a user
   */
  async getReferralCode(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', userId)
      .single();

    if (error || !data?.referral_code) {
      logger.error('Failed to get referral code', { userId, error });
      throw new Error('Failed to get referral code');
    }

    return data.referral_code;
  }

  /**
   * Get full referral link for a user
   */
  getReferralLink(referralCode: string): string {
    return `${this.baseUrl}?ref=${referralCode}`;
  }

  /**
   * Apply a referral code to a new user (first contact attribution)
   * Only works if user hasn't been referred yet
   */
  async applyReferralCode(
    userId: string, 
    referralCode: string
  ): Promise<{ success: boolean; referrerId?: string; message?: string }> {
    // Check if user already has a referrer
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, referred_by')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return { success: false, message: 'User not found' };
    }

    if (user.referred_by) {
      return { success: false, message: 'User already has a referrer' };
    }

    // Find referrer by code (case-insensitive)
    const referrer = await this.getUserByReferralCode(referralCode.trim());
    if (!referrer) {
      return { success: false, message: 'Invalid referral code' };
    }

    // Can't refer yourself
    if (referrer.id === userId) {
      return { success: false, message: 'Cannot use your own referral code' };
    }

    // Apply referral
    const { error: updateError } = await supabase
      .from('users')
      .update({
        referred_by: referrer.id,
        referred_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      logger.error('Failed to apply referral', { userId, referralCode, error: updateError });
      return { success: false, message: 'Failed to apply referral' };
    }

    // Track signup action
    await this.trackAction(userId, ReferralActionType.SIGNUP, {
      referral_code: referralCode,
    });

    logger.info('Referral applied', { userId, referrerId: referrer.id, referralCode });
    return { success: true, referrerId: referrer.id };
  }

  /**
   * Track an action by a referred user
   */
  async trackAction(
    userId: string,
    actionType: ReferralActionType,
    actionData?: Record<string, unknown>,
    intentId?: string
  ): Promise<void> {
    // Get user's referrer
    const { data: user } = await supabase
      .from('users')
      .select('referred_by')
      .eq('id', userId)
      .single();

    if (!user?.referred_by) {
      // User wasn't referred, nothing to track
      return;
    }

    // Check if this is a "first" action that should be deduplicated
    if (actionType === ReferralActionType.FIRST_TRADE || 
        actionType === ReferralActionType.FIRST_DEPOSIT ||
        actionType === ReferralActionType.WALLET_CREATED) {
      const { data: existing } = await supabase
        .from('referral_actions')
        .select('id')
        .eq('user_id', userId)
        .eq('action_type', actionType)
        .limit(1);

      if (existing && existing.length > 0) {
        // Already tracked this "first" action
        return;
      }
    }

    const { error } = await supabase
      .from('referral_actions')
      .insert({
        user_id: userId,
        referrer_id: user.referred_by,
        action_type: actionType,
        action_data: actionData,
        intent_id: intentId,
      });

    if (error) {
      logger.error('Failed to track referral action', { userId, actionType, error });
      // Don't throw - tracking failures shouldn't break main flow
    } else {
      logger.debug('Referral action tracked', { userId, actionType, referrerId: user.referred_by });
    }
  }

  /**
   * Get referral stats for a user
   */
  async getStats(userId: string): Promise<ReferralStats | null> {
    // Always get live total_referrals count so it matches the referred-users list (materialized view can be stale)
    const { count: liveTotalReferrals } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', userId);

    // Try materialized view first (faster for volume/trades)
    const { data: stats, error } = await supabase
      .from('referral_stats')
      .select('*')
      .eq('referrer_id', userId)
      .single();

    if (!error && stats) {
      const result = stats as ReferralStats;
      result.total_referrals = liveTotalReferrals ?? result.total_referrals ?? 0;
      return result;
    }

    // Fallback to live query
    const { data: user } = await supabase
      .from('users')
      .select('id, megaeth_address, referral_code')
      .eq('id', userId)
      .single();

    if (!user) return null;

    // Count referrals
    const { count: totalReferrals } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', userId);

    // Get action aggregates
    const { data: actions } = await supabase
      .from('referral_actions')
      .select('action_type, action_data, user_id')
      .eq('referrer_id', userId);

    const uniqueTraders = new Set(
      actions?.filter((a: any) => a.action_type === 'first_trade').map((a: any) => a.user_id) || []
    );

    const tradeActions = actions?.filter((a: any) => 
      a.action_type === 'trade' || a.action_type === 'first_trade'
    ) || [];

    const totalVolume = tradeActions.reduce((sum: number, a: any) => {
      const vol = parseFloat(String(a.action_data?.volume_usdc || 0));
      return sum + (isNaN(vol) ? 0 : vol);
    }, 0);

    return {
      referrer_id: user.id,
      referrer_address: user.megaeth_address,
      referral_code: user.referral_code,
      total_referrals: totalReferrals || 0,
      active_referrals: uniqueTraders.size,
      total_trades: tradeActions.length,
      total_volume_usdc: totalVolume,
      last_activity: actions?.[0]?.created_at,
    } as ReferralStats;
  }

  /**
   * Get list of users referred by this user
   */
  async getReferredUsers(userId: string): Promise<ReferredUser[]> {
    const { data: referrals, error } = await supabase
      .from('users')
      .select(`
        id,
        megaeth_address,
        referred_at,
        polymarket_wallets!left(id)
      `)
      .eq('referred_by', userId)
      .order('referred_at', { ascending: false });

    if (error || !referrals) {
      logger.error('Failed to get referred users', { userId, error });
      return [];
    }

    // Get action stats for each referred user
    const result: ReferredUser[] = [];

    for (const ref of referrals) {
      const { data: actions } = await supabase
        .from('referral_actions')
        .select('action_type, action_data')
        .eq('user_id', ref.id)
        .eq('referrer_id', userId);

      const activityCount = actions?.length ?? 0;
      // 0–100 score from activity (referrer doesn't see per-user volume)
      const activityScore = Math.min(100, activityCount * 10);

      result.push({
        megaeth_address: ref.megaeth_address,
        referred_at: ref.referred_at,
        connected: true,
        has_wallet: Array.isArray(ref.polymarket_wallets) && ref.polymarket_wallets.length > 0,
        has_traded: actions?.some((a: any) => a.action_type === 'first_trade') || false,
        activity_count: activityCount,
        activity_score: activityScore,
      });
    }

    return result;
  }

  /**
   * Get referral leaderboard
   */
  async getLeaderboard(limit: number = 20): Promise<ReferralLeaderboardEntry[]> {
    // Try materialized view
    const { data, error } = await supabase
      .from('referral_stats')
      .select('*')
      .gt('total_referrals', 0)
      .order('total_volume_usdc', { ascending: false })
      .limit(limit);

    if (error || !data) {
      logger.error('Failed to get leaderboard', { error });
      return [];
    }

    return data.map((entry: any, index: number) => ({
      rank: index + 1,
      referrer_address: entry.referrer_address,
      referral_code: entry.referral_code,
      total_referrals: entry.total_referrals,
      active_referrals: entry.active_referrals,
      total_volume_usdc: entry.total_volume_usdc,
    }));
  }

  /**
   * Update a user's referral code (custom/personalized). Must be unique, 6–12 alphanumeric.
   * Stores user's preferred casing. Old code is saved in referral_code_aliases so old ref links still resolve.
   */
  async updateReferralCode(userId: string, newCode: string): Promise<{ success: boolean; message?: string; storedCode?: string }> {
    const trimmed = newCode.trim().replace(/[^A-Za-z0-9]/g, '');
    if (trimmed.length < 6 || trimmed.length > 12) {
      return { success: false, message: 'Code must be 6–12 letters and numbers' };
    }

    const existing = await this.getUserByReferralCode(trimmed);
    if (existing && existing.id !== userId) {
      return { success: false, message: 'This code is already taken' };
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', userId)
      .single();

    const oldCode = currentUser?.referral_code;
    if (oldCode && oldCode.toLowerCase() !== trimmed.toLowerCase()) {
      const { error: aliasErr } = await supabase
        .from('referral_code_aliases')
        .insert({ code_lower: oldCode.toLowerCase(), user_id: userId });
      if (aliasErr && aliasErr.code !== '23505') {
        logger.warn('Could not store referral code alias', { userId, oldCode, error: aliasErr });
      }
    }

    const { error } = await supabase
      .from('users')
      .update({ referral_code: trimmed })
      .eq('id', userId);

    if (error) {
      logger.error('Failed to update referral code', { userId, error });
      return { success: false, message: 'Failed to update code' };
    }
    logger.info('Referral code updated', { userId, referralCode: trimmed });
    return { success: true, storedCode: trimmed };
  }

  /**
   * Lookup user by referral code (case-insensitive).
   * Checks current users.referral_code first, then referral_code_aliases (old codes) so old ref links still work.
   */
  async getUserByReferralCode(code: string): Promise<User | null> {
    const trimmed = code?.trim();
    if (!trimmed) return null;
    const codeLower = trimmed.toLowerCase();

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_by_referral_code', { code: trimmed });
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) return rpcData[0] as User;

    const { data: aliasRow, error: aliasError } = await supabase
      .from('referral_code_aliases')
      .select('user_id')
      .eq('code_lower', codeLower)
      .maybeSingle();

    if (aliasError || !aliasRow?.user_id) return null;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', aliasRow.user_id)
      .single();

    if (userError || !user) return null;
    return user as User;
  }

  /**
   * Refresh materialized view (call periodically)
   */
  async refreshStats(): Promise<void> {
    try {
      await supabase.rpc('refresh_referral_stats');
      logger.info('Referral stats refreshed');
    } catch (error) {
      logger.error('Failed to refresh referral stats', error);
    }
  }
}
