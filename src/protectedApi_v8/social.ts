import { Buffer } from 'buffer'
import { Request, Router } from 'express'
import { UploadedFile } from 'express-fileupload'
import FormData from 'form-data'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { sendUpstreamError } from '../utils/errors'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import {
  GENERAL_ERROR_MSG,
  registerSocialRoutes,
  requireOrgHeaders,
  SHARED_SOCIAL_ROUTES as ROUTES,
  socialTimeoutConfig,
  withUser,
} from './socialHelpers'

const API_END_POINTS = {
  adminDeletePosts: `${CONSTANTS.NODE_API_BASE}/admin/deletepost`,
  adminPostsTimeline: `${CONSTANTS.NODE_API_BASE}/admin/timeline`,
  adminReactivatePost: `${CONSTANTS.NODE_API_BASE}/admin/reactivatepost`,
  createForum: `${CONSTANTS.NODE_API_BASE}/forum/createforum`,
  editForum: `${CONSTANTS.NODE_API_BASE}/forum/editforum`,
  moderatorPostsTimeline: `${CONSTANTS.NODE_API_BASE}/moderator/timeline`,
  moderatorReact: `${CONSTANTS.NODE_API_BASE}/moderator/moderatepost`,
  uploadImage: `${CONSTANTS.CONTENT_API_BASE}/contentv3/upload-live`,
  viewForum: `${CONSTANTS.NODE_API_BASE}/forum/viewforum`,
  viewForumlist: `${CONSTANTS.NODE_API_BASE}/forum/forumtimeline`,
}

const socialTimeout = () => socialTimeoutConfig

export const socialApi = Router()

socialApi.post('/post/upload/:contentId', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const contentId = req.params.contentId
    if (req.files && req.files.content) {
      const url = `${rootOrg}/${org}/Public/${contentId}/artifacts`
      const file: UploadedFile = req.files.content as UploadedFile
      const formData = new FormData()
      formData.append('content', Buffer.from(file.data), {
        contentType: file.mimetype,
        filename: file.name,
      })
      formData.submit(
        `${API_END_POINTS.uploadImage}/${url.replace(/\//g, '%2F')}`,
        (err, response) => {
          if (response.statusCode === 200 || response.statusCode === 201) {
            response.on('data', (data) => {
              res.send(JSON.parse(data.toString('utf8')))
            })
          } else {
            res.send(
              (err && err.message) || {
                error: GENERAL_ERROR_MSG,
              }
            )
          }
        }
      )
    } else {
      throw new Error('File not found')
    }
  } catch (err) {
    sendUpstreamError(res, err, { error: GENERAL_ERROR_MSG })
  }
})

registerSocialRoutes(socialApi, [
  ROUTES.publish,
  ROUTES.draft,
  ROUTES.editTags,
  ROUTES.editMeta,
  ROUTES.deletePost,
  // v1 autocomplete sends org/rootOrg as upstream headers instead of merging them into the body
  {
    ...ROUTES.autocomplete,
    body: (req) => req.body,
    config: ({ org, rootOrg }) => ({ ...axiosRequestConfig, headers: { org, rootOrg } }),
  },
  ROUTES.viewConversation,
  ROUTES.viewConversationV2,
  ROUTES.timeline,
  {
    ...ROUTES.timelineV2,
    body: withUser('userId', 'after', (req: Request) => req.query.wid || extractUserIdFromRequest(req)),
  },
  // moderator content-approve/reject
  { path: '/moderator/moderatepost', url: API_END_POINTS.moderatorReact, body: withUser('moderatorId', 'before'), config: socialTimeout },
  { path: '/moderator/timeline', url: API_END_POINTS.moderatorPostsTimeline, body: withUser('userId'), config: socialTimeout },
  // admin
  { path: '/admin/timeline', url: API_END_POINTS.adminPostsTimeline, body: withUser('userId'), config: socialTimeout },
  { path: '/admin/deletePost', url: API_END_POINTS.adminDeletePosts, body: withUser('adminId', 'before'), upstreamMethod: 'delete' },
  { path: '/admin/reactivatePost', url: API_END_POINTS.adminReactivatePost, body: withUser('adminId', 'before'), config: socialTimeout },
  // forums
  { path: '/viewForum', url: API_END_POINTS.viewForum, body: withUser('userId'), config: socialTimeout },
  { path: '/forum/forumtimeline', url: API_END_POINTS.viewForumlist, body: withUser('userId'), config: socialTimeout },
  { ...ROUTES.activityCreate, body: withUser('userId') },
  { path: '/createForum', url: API_END_POINTS.createForum, body: withUser('forumCreator', 'before') },
  { path: '/editForum', url: API_END_POINTS.editForum, body: withUser('forumEditor', 'before') },
  ROUTES.acceptAnswer,
  ROUTES.activityUsers,
  { ...ROUTES.search, body: withUser('userId') },
  ROUTES.catalog,
])
