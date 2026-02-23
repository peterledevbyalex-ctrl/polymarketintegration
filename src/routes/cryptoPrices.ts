import { Router, Request, Response as ExpressResponse } from 'express';
import { cryptoPriceStreamService, CryptoPriceSymbol } from '../services/cryptoPriceStreamService';

const router = Router();

const SUPPORTED_SYMBOLS: CryptoPriceSymbol[] = ['btc/usd', 'eth/usd', 'sol/usd', 'xrp/usd'];

const getDurationSeconds = (range: string): number => {
  switch (range.toUpperCase()) {
    case '5M':
      return 5 * 60;
    case '10M':
      return 10 * 60;
    case '1H':
      return 60 * 60;
    case '6H':
      return 6 * 60 * 60;
    case '1D':
      return 24 * 60 * 60;
    case '1W':
      return 7 * 24 * 60 * 60;
    case '1M':
      return 30 * 24 * 60 * 60;
    case 'ALL':
      return 365 * 24 * 60 * 60;
    default:
      return 24 * 60 * 60;
  }
};

router.get('/history', (req: Request, res: ExpressResponse) => {
  const symbolRaw = String(req.query.symbol || '').toLowerCase();
  const range = String(req.query.range || '1D');

  if (!SUPPORTED_SYMBOLS.includes(symbolRaw as CryptoPriceSymbol)) {
    res.status(400).json({
      error: 'Invalid symbol. Use one of btc/usd, eth/usd, sol/usd, xrp/usd',
    });
    return;
  }

  cryptoPriceStreamService.start();
  const symbol = symbolRaw as CryptoPriceSymbol;
  const durationSeconds = getDurationSeconds(range);
  const history = cryptoPriceStreamService.getHistory(symbol, durationSeconds);

  res.json({
    symbol,
    range: range.toUpperCase(),
    durationSeconds,
    pointCount: history.length,
    history,
  });
});

router.get('/stream', (req: Request, res: ExpressResponse) => {
  const symbolRaw = String(req.query.symbol || '').toLowerCase();
  if (!SUPPORTED_SYMBOLS.includes(symbolRaw as CryptoPriceSymbol)) {
    res.status(400).json({
      error: 'Invalid symbol. Use one of btc/usd, eth/usd, sol/usd, xrp/usd',
    });
    return;
  }

  const symbol = symbolRaw as CryptoPriceSymbol;
  cryptoPriceStreamService.start();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  const sendPoint = (point: { t: number; p: number }) => {
    res.write(`event: price\ndata: ${JSON.stringify(point)}\n\n`);
  };

  const recent = cryptoPriceStreamService.getHistory(symbol, 60);
  if (recent.length > 0) {
    sendPoint(recent[recent.length - 1]);
  }

  const unsubscribe = cryptoPriceStreamService.subscribe(symbol, sendPoint);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;

