import { UserService } from '../../services/userService';
import { createSupabaseMock } from '../mocks/supabase';

// Store mock instance globally
declare global {
  // eslint-disable-next-line no-var
  var __userServiceSupabaseMock__: ReturnType<typeof createSupabaseMock> | undefined;
}

jest.mock('../../db/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSupabaseMock } = require('../mocks/supabase');
  const mock = createSupabaseMock();
  global.__userServiceSupabaseMock__ = mock;
  return { supabase: { from: mock.from } };
});

const getMock = () => global.__userServiceSupabaseMock__!;

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(getMock().mockData).forEach(key => delete getMock().mockData[key]);
    userService = new UserService();
  });

  describe('getOrCreateUser', () => {
    it('should return existing user if found', async () => {
      getMock().mockData['users'] = [{
        id: 'user-123',
        megaeth_address: '0x1234567890123456789012345678901234567890',
      }];

      const user = await userService.getOrCreateUser('0x1234567890123456789012345678901234567890');

      expect(user.id).toBe('user-123');
      expect(user.megaeth_address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should create new user if not found', async () => {
      getMock().mockData['users'] = [];

      const user = await userService.getOrCreateUser('0xNewAddress1234567890123456789012345678');

      expect(user.megaeth_address).toBe('0xnewaddress1234567890123456789012345678'); // lowercase
    });

    it('should normalize address to lowercase', async () => {
      getMock().mockData['users'] = [{
        id: 'user-456',
        megaeth_address: '0xabcdef1234567890123456789012345678901234',
      }];

      const user = await userService.getOrCreateUser('0xABCDEF1234567890123456789012345678901234');

      expect(user.megaeth_address).toBe('0xabcdef1234567890123456789012345678901234');
    });
  });

  describe('getUserByAddress', () => {
    it('should return user if found', async () => {
      getMock().mockData['users'] = [{
        id: 'user-789',
        megaeth_address: '0x9876543210987654321098765432109876543210',
      }];

      const user = await userService.getUserByAddress('0x9876543210987654321098765432109876543210');

      expect(user?.id).toBe('user-789');
    });

    it('should return null if user not found', async () => {
      getMock().mockData['users'] = [];

      const user = await userService.getUserByAddress('0xNonExistent123456789012345678901234567890');

      expect(user).toBeNull();
    });
  });
});
