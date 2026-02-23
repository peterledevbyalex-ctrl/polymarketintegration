"use client"

import React, { useState, useEffect } from 'react';
import { UserPositionsResponse } from '@/types/polymarket.types';
import { useApp } from '@/providers/AppProvider';
import { polymarketAPI } from '@/lib/polymarket/api';
import { Button } from '@/components/ui/button';
import { useSignMessage, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { useRouter } from 'next/navigation';

const WALLET_DERIVATION_MESSAGE = 
  'Authorize Prism to manage your Polygon trading wallet.\n\n' +
  'This signature derives your wallet keys. Only sign this on trusted sites.\n\n' +
  'Chain: MegaETH → Polygon\nVersion: 1';

interface PositionsViewProps {
  positions: UserPositionsResponse | null;
  isLoading: boolean;
  error: Error | null;
  onRefetch: () => void;
}

export const PositionsView: React.FC<PositionsViewProps> = ({ positions, isLoading, error, onRefetch }) => {
  const { userAddress, isConnected, lastEthPrice } = useApp();
  const { signMessageAsync } = useSignMessage();
  const router = useRouter();
  const [safeBalance, setSafeBalance] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [walletSignature, setWalletSignature] = useState<string | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  // Fix: parseFloat("0") returns 0, not falsy, so || doesn't work
  const ethPriceParsed = parseFloat(lastEthPrice);
  const ethPrice = ethPriceParsed > 0 ? ethPriceParsed : 3000; // From Redstone via useApp
  
  const { data: ethBalance } = useBalance({
    address: userAddress as `0x${string}` | undefined,
  });

  useEffect(() => {
    if (isConnected && userAddress) {
      fetchSafeBalance();
    }
  }, [isConnected, userAddress]);

  const getSignature = async (): Promise<string> => {
    if (walletSignature) return walletSignature;
    return '';
  };

  const fetchSafeBalance = async () => {
    if (!userAddress) return;
    
    setLoadingBalance(true);
    try {
      const signature = await getSignature();
      const balanceData = await polymarketAPI.getSafeBalance(userAddress, signature);
      setSafeBalance(balanceData.balanceUsdc);
      setSafeAddress(balanceData.safeAddress);
    } catch (err) {
      console.error('Failed to fetch Safe balance:', err);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleWithdraw = async () => {
    if (!userAddress || !withdrawAmount) return;

    setWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);

    try {
      const signature = await getSignature();
      const result = await polymarketAPI.initiateWithdrawal({
        megaethAddress: userAddress,
        walletSignature: signature,
        amountUsdc: withdrawAmount,
        destCurrency: 'native',
      });
      
      setWithdrawSuccess(`Withdrawal initiated! ID: ${result.withdrawalId}`);
      setWithdrawAmount('');
      
      setTimeout(() => {
        fetchSafeBalance();
        onRefetch();
      }, 2000);
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Withdraw Modal */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsWithdrawModalOpen(false)}>
          <div className="bg-background-light rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-foreground">💰 Withdraw from Polymarket</h3>
              <button onClick={() => setIsWithdrawModalOpen(false)} className="text-foreground-light hover:text-foreground">
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Safe Balance */}
              <div className="rounded-lg bg-background p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-foreground-light">Safe Wallet Balance</span>
                  <Button 
                    onClick={fetchSafeBalance} 
                    disabled={loadingBalance}
                    variant="ghost"
                    size="sm"
                  >
                    {loadingBalance ? 'Loading...' : 'Refresh'}
                  </Button>
                </div>
                {safeAddress && (
                  <div className="text-xs text-foreground-light mb-2 font-mono">
                    {safeAddress.slice(0, 6)}...{safeAddress.slice(-4)}
                  </div>
                )}
                <div className="text-2xl font-bold text-foreground">
                  {loadingBalance ? '...' : safeBalance ? `$${safeBalance}` : '$0.00'}
                </div>
              </div>

              {/* Withdraw Form */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-foreground-light mb-2 block">
                    Amount to Withdraw (USDC)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={safeBalance || undefined}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2 rounded-lg bg-background border border-foreground/10 text-foreground focus:outline-none focus:border-blue-500"
                  />
                </div>

                <Button
                  onClick={handleWithdraw}
                  disabled={withdrawing || !withdrawAmount || Number(withdrawAmount) <= 0}
                  className="w-full"
                  size="lg"
                >
                  {withdrawing ? 'Processing...' : 'Withdraw to MegaETH'}
                </Button>

                {withdrawError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                    <p className="text-sm text-red-500">{withdrawError}</p>
                  </div>
                )}

                {withdrawSuccess && (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
                    <p className="text-sm text-green-500">{withdrawSuccess}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Panel
      <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/20 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-foreground mb-2">🔧 Debug Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-foreground-light">Wallet Connected:</span>
                <span className={`font-semibold ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                  {isConnected ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground-light">Wallet Address:</span>
                <span className="font-mono text-xs text-foreground">
                  {userAddress || 'Not connected'}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground-light">Loading:</span>
                <span className={`font-semibold ${isLoading ? 'text-yellow-500' : 'text-foreground'}`}>
                  {isLoading ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground-light">Error:</span>
                <span className={`font-semibold ${error ? 'text-red-500' : 'text-green-500'}`}>
                  {error ? error.message : 'None'}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground-light">Positions Data:</span>
                <span className="font-semibold text-foreground">
                  {positions ? `${positions.openOrders.length} positions` : 'null'}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground-light">API Endpoint:</span>
                <span className="font-mono text-xs text-foreground">
                  {userAddress ? `/api/positions/eoa/${userAddress}` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onRefetch}
            disabled={isLoading || !userAddress}
            className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-lg text-yellow-500 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Fetching...' : '🔄 Fetch Positions'}
          </button>
        </div>
      </div> */}

      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-foreground-light mt-4">Loading positions...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error.message}</p>
        </div>
      ) : !positions || positions.openOrders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-foreground-light">No active positions</p>
          <p className="text-foreground-light text-sm mt-2">Place a trade to see your positions here</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-background-light p-6 relative">
              <div className="text-xs text-foreground-light mb-2">Safe Balance (USDC)</div>
              <div className="text-2xl font-bold text-foreground">{formatCurrency(positions.usdcBalance)}</div>
              <button
                onClick={() => setIsWithdrawModalOpen(true)}
                className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-500 transition-colors"
              >
                Withdraw
              </button>
            </div>
            
            <div className="rounded-2xl bg-background-light p-6">
              <div className="text-xs text-foreground-light mb-2">Wallet Balance (ETH)</div>
              <div className="text-2xl font-bold text-foreground">
                {ethBalance ? formatCurrency(parseFloat(formatUnits(ethBalance.value, 18)) * ethPrice) : '$0.00'}
              </div>
              <div className="text-xs text-foreground-light mt-1">
                {ethBalance ? `${parseFloat(formatUnits(ethBalance.value, 18)).toFixed(4)} ETH` : '0 ETH'}
              </div>
            </div>
            
            <div className="rounded-2xl bg-background-light p-6">
              <div className="text-xs text-foreground-light mb-2">Total Invested</div>
              <div className="text-2xl font-bold text-foreground">{formatCurrency(positions.totalInvested)}</div>
            </div>
            
            <div className="rounded-2xl bg-background-light p-6">
              <div className="text-xs text-foreground-light mb-2">Potential Payout</div>
              <div className="text-2xl font-bold text-green-500">{formatCurrency(positions.totalPotentialPayout)}</div>
              <div className="text-xs text-foreground-light mt-1">
                +{formatCurrency(positions.totalPotentialPayout - positions.totalInvested)} profit
              </div>
            </div>
          </div>

          {/* Open Positions */}
          <div>
            <h2 className="text-xl font-bold text-foreground mb-4">Open Positions ({positions.openOrders.length})</h2>
            
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs text-foreground-light uppercase tracking-wider border-b border-background-light-sm">
              <div className="col-span-1">Type</div>
              <div className="col-span-7">Market</div>
              <div className="col-span-4 text-right">Amount</div>
            </div>

            {/* Position Rows */}
            <div className="space-y-1">
              {positions.openOrders.map((position) => (
                <div
                  key={position.orderId}
                  onClick={() => router.push(`/polymarket?market=${position.market.id}`)}
                  className="grid grid-cols-1 md:grid-cols-12 gap-4 px-4 py-4 hover:bg-background-light transition-colors rounded-lg cursor-pointer"
                >
                  {/* Type */}
                  <div className="col-span-1 flex items-center">
                    <span className="text-sm font-medium text-foreground">Buy</span>
                  </div>

                  {/* Market Info */}
                  <div className="col-span-7 flex items-center gap-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-foreground mb-1">
                        {position.market.question}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            position.outcome === 'YES'
                              ? 'text-green-500'
                              : 'text-red-500'
                          }`}
                        >
                          {position.outcome} {(position.price * 100).toFixed(0)}¢
                        </span>
                        <span className="text-xs text-foreground-light">
                          {position.size.toFixed(1)} shares
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="col-span-4 flex items-center justify-end">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-foreground">
                        {formatCurrency(position.totalCost)}
                      </div>
                      <div className="text-xs text-foreground-light">
                        {/* Time placeholder - could be added to backend */}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
