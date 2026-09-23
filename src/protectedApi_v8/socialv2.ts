import { Router } from 'express'
import { registerSocialRoutes, SHARED_SOCIAL_ROUTES as ROUTES } from './socialHelpers'

export const socialApi = Router()

registerSocialRoutes(socialApi, [
  ROUTES.publish,
  ROUTES.draft,
  ROUTES.editTags,
  ROUTES.editMeta,
  ROUTES.deletePost,
  ROUTES.autocomplete,
  ROUTES.viewConversation,
  ROUTES.viewConversationV2,
  ROUTES.timeline,
  ROUTES.timelineV2,
  ROUTES.activityCreate,
  ROUTES.acceptAnswer,
  ROUTES.activityUsers,
  ROUTES.search,
  ROUTES.catalog,
])
