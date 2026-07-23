import type { Request, Response, NextFunction, RequestHandler } from 'express'

// Wrap an async route handler so any rejection is forwarded to Express's error
// middleware instead of becoming an unhandled rejection (which would leave the
// request hanging with no response — and, on Node, could terminate the process).
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next)
  }
