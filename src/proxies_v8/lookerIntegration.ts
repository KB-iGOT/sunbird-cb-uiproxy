import crypto from 'crypto'
import express from 'express'
import querystring from 'querystring'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

export const lookerDashboard = express.Router()

interface ILookerOptions {
  access_filters: Record<string, unknown>
  embed_url: string
  external_group_id: string
  external_user_id: string
  first_name: string
  force_logout_login: boolean
  group_ids: number[]
  host: string
  last_name: string
  models: string[]
  permissions: string[]
  secret: string
  session_length: number
  user_attributes: Record<string, string>
}

lookerDashboard.get('/looker/*', async (req, res) => {
  const fifteenMinutes = 15 * 60

  const lookerOptions: ILookerOptions = {
    access_filters: { fake_model: { id: 1 } },
    embed_url: req.query.embedUrl || '/embed/dashboards/9',
    external_group_id: '5',
    external_user_id: req.query.externalUserId || 'default-user-id',
    first_name: req.query.firstName || 'First Name',
    force_logout_login: false,
    group_ids: [4, 5],
    host: CONSTANTS.LOOKER_HOST,
    last_name: req.query.lastName || 'Last Name',
    models: ['employee_enrolment', 'igot'],
    permissions: ['see_user_dashboards', 'see_lookml_dashboards', 'access_data', 'see_looks'],
    secret: CONSTANTS.LOOKER_SECRET,
    session_length: fifteenMinutes,
    user_attributes: { example_attribute: 'attribute_value' },
  }

  try {
    const signedUrl = createSignedEmbedUrl(lookerOptions)
    const encodedUrl = encodeURIComponent(signedUrl)

    logInfo(`Generated Looker dashboard URL: ${signedUrl}`)
    res.status(200).json({ encodedUrl })
  } catch (err) {
    logError('Error generating Looker dashboard URL:', err)
    res.status(500).json({ error: 'Failed to generate Looker dashboard URL' })
  }
})

function createSignedEmbedUrl(options: ILookerOptions): string {
  const { secret, host, external_user_id, first_name, last_name, group_ids, external_group_id,
    permissions, models, access_filters, user_attributes, session_length, embed_url,
    force_logout_login } = options

  const nonce = () => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from({ length: 16 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('')
  }

  const forceUnicodeEncoding = (str: string) => decodeURIComponent(encodeURIComponent(str))

  const embedPath = `/login/embed/${encodeURIComponent(embed_url)}`
  const time = Math.floor(Date.now() / 1000)
  const jsonNonce = nonce()

  const stringToSign = [
    host,
    embedPath,
    jsonNonce,
    time,
    session_length,
    external_user_id,
    JSON.stringify(permissions),
    JSON.stringify(models),
    JSON.stringify(group_ids),
    JSON.stringify(external_group_id),
    JSON.stringify(user_attributes),
    JSON.stringify(access_filters),
  ].join('\n')

  const signature = crypto.createHmac('sha1', secret).update(forceUnicodeEncoding(stringToSign)).digest('base64').trim()

  const queryParams = {
    access_filters: JSON.stringify(access_filters),
    embed_path: embedPath,
    external_group_id,
    external_user_id,
    first_name,
    force_logout_login,
    group_ids: JSON.stringify(group_ids),
    last_name,
    models: JSON.stringify(models),
    nonce: jsonNonce,
    permissions: JSON.stringify(permissions),
    session_length,
    signature,
    time,
    user_attributes: JSON.stringify(user_attributes),
  }

  return `${host}${embedPath}?${querystring.stringify(queryParams)}`
}
