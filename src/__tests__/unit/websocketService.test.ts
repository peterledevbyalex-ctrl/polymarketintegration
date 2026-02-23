import { WebSocketService } from '../../services/websocketService';
import { Server } from 'http';
import { IntentState } from '../../types';

// Mock socket.io
const mockEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockOn = jest.fn();

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({
    on: mockOn,
    to: mockTo,
    emit: mockEmit,
  })),
}));

describe('WebSocketService', () => {
  let wsService: WebSocketService;
  let mockHttpServer: Server;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHttpServer = {} as Server;
    wsService = new WebSocketService();
  });

  describe('initialize', () => {
    it('should initialize socket.io server', () => {
      wsService.initialize(mockHttpServer);
      
      // Should set up connection handler
      expect(mockOn).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('emitIntentUpdate', () => {
    it('should emit intent update to room', () => {
      wsService.initialize(mockHttpServer);
      
      const mockIntent = {
        intent_id: 'intent-123',
        user_id: 'user-456',
        state: IntentState.RELAY_QUOTED,
      } as any;

      wsService.emitIntentUpdate(mockIntent);
      
      expect(mockTo).toHaveBeenCalledWith('intent:intent-123');
      expect(mockEmit).toHaveBeenCalledWith('intent:update', expect.objectContaining({
        intentId: 'intent-123',
      }));
    });

    it('should handle uninitialized state gracefully', () => {
      const mockIntent = {
        intent_id: 'intent-123',
        user_id: 'user-456',
        state: IntentState.RELAY_QUOTED,
      } as any;

      // Should not throw even when not initialized
      expect(() => wsService.emitIntentUpdate(mockIntent)).not.toThrow();
    });
  });

  describe('emitStateTransition', () => {
    it('should emit state transition event', () => {
      wsService.initialize(mockHttpServer);
      
      wsService.emitStateTransition(
        'intent-123',
        IntentState.RELAY_QUOTED,
        IntentState.ORIGIN_TX_SUBMITTED,
        { txHash: '0x123' }
      );
      
      expect(mockTo).toHaveBeenCalledWith('intent:intent-123');
      expect(mockEmit).toHaveBeenCalledWith('intent:state-transition', expect.objectContaining({
        intentId: 'intent-123',
        fromState: IntentState.RELAY_QUOTED,
        toState: IntentState.ORIGIN_TX_SUBMITTED,
      }));
    });
  });

  describe('emitError', () => {
    it('should emit error event', () => {
      wsService.initialize(mockHttpServer);
      
      wsService.emitError('intent-123', { code: 'RELAY_FAILED', detail: 'Relay execution failed' });
      
      expect(mockTo).toHaveBeenCalledWith('intent:intent-123');
      expect(mockEmit).toHaveBeenCalledWith('intent:error', expect.objectContaining({
        intentId: 'intent-123',
      }));
    });
  });
});
