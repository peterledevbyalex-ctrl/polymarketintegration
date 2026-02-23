import { NextRequest, NextResponse } from 'next/server'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis/cloudflare'

import { isRateLimitEnabled, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW, UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from '@/server/config.rateLimit'

const redis = isRateLimitEnabled
    ? new Redis({
          url: UPSTASH_REDIS_REST_URL as string,
          token: UPSTASH_REDIS_REST_TOKEN as string,
      })
    : null

const ratelimit = redis
    ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW),
          analytics: true,
          prefix: 'prism:ratelimit',
      })
    : null

const getClientIp = (req: NextRequest): string => {
    const forwardedFor = req.headers.get('x-forwarded-for')
    if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown'

    const realIp = req.headers.get('x-real-ip')
    if (realIp) return realIp

    return 'unknown'
}

export async function middleware(req: NextRequest) {
    if (!ratelimit) return NextResponse.next()

    const ip = getClientIp(req)
    const path = req.nextUrl.pathname

    const key = `${ip}:${path.startsWith('/api/') ? '/api/*' : path}`

    const result = await ratelimit.limit(key)

    const res = result.success
        ? NextResponse.next()
        : NextResponse.json(
              {
                  success: false,
                  error: 'rate limit exceeded',
              },
              { status: 429 }
          )

    res.headers.set('RateLimit-Limit', String(result.limit))
    res.headers.set('RateLimit-Remaining', String(result.remaining))
    res.headers.set('RateLimit-Reset', String(result.reset))

    return res
}

export const config = {
    matcher: ['/api/:path*', '/tokenlist.json', '/pools.json', '/stats.json'],
}
