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
  return req.header('X-Authenticated-User-Token')
}

export const extractRootOrgFromRequest = (req: IAuthorizedRequest): string => {
  return req.header('rootorg')
}

export const getUUID = () => uuid.v1()
