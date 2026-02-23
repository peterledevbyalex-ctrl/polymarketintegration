import { supabase } from '../db/supabase';
import { User } from '../types';
import logger from '../utils/logger';

export class UserService {
  async getOrCreateUser(megaethAddress: string): Promise<User> {
    // Normalize address
    const normalizedAddress = megaethAddress.toLowerCase();

    // Try to find existing user
    const { data: existing, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('megaeth_address', normalizedAddress)
      .single();

    if (existing) {
      return existing as User;
    }

    if (findError && findError.code !== 'PGRST116') {
      logger.error('Error finding user', findError);
      throw new Error('Failed to query user');
    }

    // Create new user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        megaeth_address: normalizedAddress,
      })
      .select()
      .single();

    if (createError || !newUser) {
      logger.error('Error creating user', createError);
      throw new Error('Failed to create user');
    }

    logger.info(`Created new user: ${newUser.id} for address ${normalizedAddress}`);
    return newUser as User;
  }

  async getUserByAddress(megaethAddress: string): Promise<User | null> {
    const normalizedAddress = megaethAddress.toLowerCase();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('megaeth_address', normalizedAddress)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Error getting user', error);
      throw new Error('Failed to get user');
    }

    return data as User | null;
  }
}

