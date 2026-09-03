jest.mock('../configs/samlSpProviders.config', () => ({
  buildIgotSpLink: jest.fn(),
}))

import express from 'express'
import supertest from 'supertest'
import { buildIgotSpLink } from '../configs/samlSpProviders.config'
import { CONSTANTS } from '../utils/env'
import { samlDeeplink } from './samlDeeplink'

const mockedBuild = buildIgotSpLink as jest.Mock

function buildApp() {
  const app = express()
  app.use('/public/v8/saml', samlDeeplink)
  return app
}

describe('samlDeeplink', () => {
  afterEach(() => {
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).SAML_SP_DEFAULT_IDP = 'sbi'
  })

  it('redirects to the built SAML login url using the default IdP when none is given', async () => {
    mockedBuild.mockReturnValue('https://kc.example.com/auth?state=1')
    const res = await supertest(buildApp()).get('/public/v8/saml/deeplink')
    expect(res.status).toBe(302)
    expect(res.header.location).toBe('https://kc.example.com/auth?state=1')
    expect(mockedBuild).toHaveBeenCalledWith(CONSTANTS.SAML_SP_DEFAULT_IDP, expect.any(String), expect.any(String))
  })

  it('uses the idp query param over the default when provided', async () => {
    mockedBuild.mockReturnValue('https://kc.example.com/auth?state=2')
    await supertest(buildApp()).get('/public/v8/saml/deeplink?idp=other-idp')
    expect(mockedBuild).toHaveBeenCalledWith('other-idp', expect.any(String), expect.any(String))
  })

  it('returns 400 when there is no idp available at all', async () => {
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).SAML_SP_DEFAULT_IDP = ''
    const res = await supertest(buildApp()).get('/public/v8/saml/deeplink')
    expect(res.status).toBe(400)
    expect(mockedBuild).not.toHaveBeenCalled()
  })

  it('returns 500 when building the deeplink throws', async () => {
    mockedBuild.mockImplementation(() => {
      throw new Error('boom')
    })
    const res = await supertest(buildApp()).get('/public/v8/saml/deeplink')
    expect(res.status).toBe(500)
  })
})
