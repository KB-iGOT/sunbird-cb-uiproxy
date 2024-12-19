import axios from 'axios'
import crypto from 'crypto'
import express from 'express'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

export const lookerDashboard = express.Router()

interface IUser {
  external_user_id: string
  first_name: string
  last_name: string
  permissions: string[]
  models: string[]
  access_filters: Record<string, unknown>
  user_attributes: Record<string, string>
  group_ids: number[]
  external_group_id: string
  host?: string  // Added host to IUser interface if it's needed in the user object
}

class SignedCookie {
  private looker: { host: string, secret: string }
  private user: IUser
  private sessionLength: number
  private nonce = '' // Default value
  private time = 0   // Default value
  private signature = '' // Default value

  constructor(looker: { host: string, secret: string }, user: IUser, sessionLength: number) {
    this.looker = looker
    this.user = user
    this.sessionLength = sessionLength
  }

  generateCookie(): string {
    this.setTime()
    this.setNonce()
    this.sign()

    const payload = {
      access_filters: JSON.stringify(this.user.access_filters),
      external_group_id: this.user.external_group_id,
      external_user_id: this.user.external_user_id,
      group_ids: JSON.stringify(this.user.group_ids),
      models: JSON.stringify(this.user.models),
      nonce: this.nonce,
      permissions: JSON.stringify(this.user.permissions),
      sessionLength: this.sessionLength,
      signature: this.signature,
      time: this.time,
      user_attributes: JSON.stringify(this.user.user_attributes),
    }

    return Buffer.from(JSON.stringify(payload)).toString('base64')
  }

  private toAscii(s: string): string {
    return s.split('').map((ch) => String.fromCharCode(ch.charCodeAt(0))).join('')
  }

  private setTime() {
    this.time = Math.floor(Date.now() / 1000)
  }

  private setNonce() {
    this.nonce = this.toAscii(crypto.randomBytes(16).toString('base64'))
  }

  private sign() {
    const stringToSign = [
      this.looker.host,
      this.nonce,
      this.time,
      this.sessionLength,
      this.user.external_user_id,
      JSON.stringify(this.user.permissions),
      JSON.stringify(this.user.models),
      JSON.stringify(this.user.group_ids),
      JSON.stringify(this.user.external_group_id),
      JSON.stringify(this.user.user_attributes),
      JSON.stringify(this.user.access_filters),
    ].join('\n')

    const signer = crypto.createHmac('sha1', this.looker.secret)
    this.signature = signer.update(stringToSign).digest('base64')
  }
}

lookerDashboard.use('/*', async (req, res) => {
  const fifteenMinutes = 15 * 60

  const user: IUser = {
  access_filters: { fake_model: { id: 1 } },
  external_group_id: '5',
  external_user_id: req.query.externalUserId || '31fa43e8-8123-43b9-997c-5c46d381ef7c',
  first_name: req.query.firstName || 'Sahil',
  group_ids: [4, 5],
  host: CONSTANTS.LOOKER_HOST,
  last_name: req.query.lastName || 'Chaudhary',
  models: ['employee_enrolment', 'igot'],
  permissions: ['see_user_dashboards', 'see_lookml_dashboards', 'access_data', 'see_looks'],
  user_attributes: { example_attribute: 'attribute_value' },
}

  const lookerOptions = {
    host: CONSTANTS.LOOKER_HOST,
    secret: CONSTANTS.LOOKER_SECRET,
  }

  try {
    const signedCookie = new SignedCookie(lookerOptions, user, fifteenMinutes).generateCookie()

    logInfo(`Generated signed cookie for Looker embed` + signedCookie)
    res.cookie('looker_auth', signedCookie, { httpOnly: true, secure: true })

    const dashboardUrl = `https://${CONSTANTS.LOOKER_HOST}/dashboards/9`
    const response = await axios.get(dashboardUrl, {
      headers: {
        Cookie: `looker_auth=${signedCookie}`,
      },
    })

    logInfo(`Dashboard content retrieved successfully`)
    res.status(200).json({ message: 'Cookie set and dashboard data retrieved successfully', data: response.data })
  } catch (err) {
    logError('Error generating Looker signed cookie or retrieving dashboard data:', err)
    res.status(500).json({ error: 'Failed to generate Looker signed cookie or retrieve dashboard data' })
  }
})
