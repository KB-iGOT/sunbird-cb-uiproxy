import { Request } from 'express'
import uuid from 'uuid'
export interface IAuthorizedRequest extends Request {
  kauth?: {
    grant: {
      access_token: {
        token: string
        content: {
          given_name: string;
          family_name: string;
          sub: string;
          name: string;
          email?: string;
          preferred_username?: string;
          session_state: string;
        };
      };
    };
  }
}
export const extractUserIdFromRequest = (req: IAuthorizedRequest): string => {
  const wid = req.header('wid')
  if (wid) {
    return wid
  }
  return (req.kauth && req.kauth.grant.access_token.content.sub)
}

export const extractUserId = (req: IAuthorizedRequest): string => {
  const wid = req.header('wid')
  if (wid) {
   return wid
  }
  const userId = (req.kauth && req.kauth.grant.access_token.content.sub)
  return userId.split(':')[2]
}

export const extractUserNameFromRequest = (req: IAuthorizedRequest) =>
  (req.kauth && req.kauth.grant.access_token.content.name)

export const extractUserEmailFromRequest = (req: IAuthorizedRequest) =>
  ((req.kauth && req.kauth.grant.access_token.content.email) ||
    (req.kauth &&
      req.kauth.grant.access_token.content.preferred_username))

export const extractUserSessionState = (req: IAuthorizedRequest) =>
  (req.kauth && req.kauth.grant.access_token.content.session_state)

export const extractUserTokenContent = (req: IAuthorizedRequest) => {
  return req.kauth && req.kauth.grant.access_token.content
}

export const extractUserToken = (req: IAuthorizedRequest) => {
  return req.kauth && req.kauth.grant.access_token.token
}

export const extractAuthorizationFromRequest = (req: IAuthorizedRequest): string => {
  const token = req.kauth && req.kauth.grant.access_token.token
  // Bearer is added as other areas are using split function to get the token
  return 'Bearer ' + token
}
export const extractUserTokenFromRequest = (req: IAuthorizedRequest): string => {
  const xAuthorization = req.header('X-Authenticated-User-Token') || req.header('x-authenticated-user-token')

  return xAuthorization as string

}

export const extractRootOrgFromRequest = (req: IAuthorizedRequest): string => {
  const rootOrg = req.header('rootorg')

  return rootOrg as string

}

export const getUUID = () => uuid.v1()

/**
 * Extracts a query parameter from an express Request object robustly.
 * Handles cases where:
 * 1. The parameter is present in `req.query` (either as a string or an array).
 * 2. `req.query` is empty/disabled, but the query string is present in `req.originalUrl`.
 * 3. `req.query` is empty/disabled, but the query string is present in `req.url`.
 * 4. The value contains special characters or is URL-encoded.
 */
export const extractQueryParam = (req: Request, paramName: string): string | undefined => {
  // 1. Try standard req.query first
  if (req.query && req.query[paramName]) {
    const val = req.query[paramName]
    if (Array.isArray(val)) {
      return val[0] as string
    }
    if (typeof val === 'string') {
      return val
    }
  }

  // 2. Try parsing from req.originalUrl
  if (req.originalUrl) {
    try {
      const urlParts = req.originalUrl.split('?')
      if (urlParts.length > 1) {
        const searchParams = new URLSearchParams(urlParts[1])
        const val = searchParams.get(paramName)
        if (val) {
          return val
        }
      }
    } catch (e) {
      // Ignore error and fall back
    }
  }

  // 3. Try parsing from req.url
  if (req.url) {
    try {
      const urlParts = req.url.split('?')
      if (urlParts.length > 1) {
        const searchParams = new URLSearchParams(urlParts[1])
        const val = searchParams.get(paramName)
        if (val) {
          return val
        }
      }
    } catch (e) {
      // Ignore error and fall back
    }
  }

  return undefined
}

