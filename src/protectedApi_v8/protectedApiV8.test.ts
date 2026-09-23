// tslint:disable: no-any
function marker(name: string) {
  return jest.fn((_req: any, res: any) => res.json({ marker: name }))
}

jest.mock('./admin/admin', () => ({ admin: marker('admin') }))
jest.mock('./attendent-content', () => ({ attendedContentApi: marker('attendedContentApi') }))
jest.mock('./catalog', () => ({ catalogApi: marker('catalogApi') }))
jest.mock('./certifications', () => ({ certificationApi: marker('certificationApi') }))
jest.mock('./cohorts', () => ({ cohortsApi: marker('cohortsApi') }))
jest.mock('./competency', () => ({ competencyApi: marker('competencyApi') }))
jest.mock('./concept', () => ({ conceptGraphApi: marker('conceptGraphApi') }))
jest.mock('./connections_v2', () => ({ connectionsV2Api: marker('connectionsV2Api') }))
jest.mock('./content', () => ({ contentApi: marker('contentApi') }))
jest.mock('./contentprivate', () => ({ contentPrivateApi: marker('contentPrivateApi') }))
jest.mock('./contentValidation', () => ({ contentValidationApi: marker('contentValidationApi') }))
jest.mock('./counter', () => ({ counterApi: marker('counterApi') }))
jest.mock('./departments', () => ({ deptApi: marker('deptApi') }))
jest.mock('./discussionHub/discussionHub', () => ({ discussionHubApi: marker('discussionHubApi') }))
jest.mock('./event-external', () => ({ externalEventsApi: marker('externalEventsApi') }))
jest.mock('./events', () => ({ eventsApi: marker('eventsApi') }))
jest.mock('./frac', () => ({ fracApi: marker('fracApi') }))
jest.mock('./khub', () => ({ knowledgeHubApi: marker('knowledgeHubApi') }))
jest.mock('./leaderboard', () => ({ leaderBoardApi: marker('leaderBoardApi') }))
jest.mock('./navigator', () => ({ navigatorApi: marker('navigatorApi') }))
jest.mock('./network', () => ({ networkConnectionApi: marker('networkConnectionApi') }))
jest.mock('./network-hub', () => ({ networkHubApi: marker('networkHubApi') }))
jest.mock('./portal-v3', () => ({ portalApi: marker('portalApi') }))
jest.mock('./recommendation', () => ({ recommendationApi: marker('recommendationApi') }))
jest.mock('./resource', () => ({
  userAuthKeyCloakApi: marker('userAuthKeyCloakApi'),
  userAuthKeyCloakAssessmentLoginApi: marker('userAuthKeyCloakAssessmentLoginApi'),
  userAuthKeyCloakEcApi: marker('userAuthKeyCloakEcApi'),
}))
jest.mock('./roleActivity', () => ({ roleActivityApi: marker('roleActivityApi') }))
jest.mock('./scoring', () => ({ scoringApi: marker('scoringApi') }))
jest.mock('./scrom', () => ({ scromApi: marker('scromApi') }))
jest.mock('./social', () => ({ socialApi: marker('socialApi') }))
jest.mock('./training', () => ({ trainingApi: marker('trainingApi') }))
jest.mock('./translate', () => ({ translateApi: marker('translateApi') }))
jest.mock('./user/user', () => ({ user: marker('user') }))
jest.mock('./workallocation', () => ({ workAllocationApi: marker('workAllocationApi') }))
jest.mock('./workflow-handler', () => ({ workflowHandlerApi: marker('workflowHandlerApi') }))

import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { protectedApiV8 } from './protectedApiV8'

function buildApp() {
  const app = express()
  app.use('/protected/v8', protectedApiV8)
  return app
}

describe('protectedApiV8 root', () => {
  it('reports the configured host on GET /', async () => {
    const res = await supertest(buildApp()).get('/protected/v8/')
    expect(res.status).toBe(200)
    expect(res.body.config).toBe(CONSTANTS.HTTPS_HOST)
  })
})

describe('protectedApiV8 route wiring', () => {
  const cases: Array<[string, string]> = [
    ['/protected/v8/admin', 'admin'],
    ['/protected/v8/catalog', 'catalogApi'],
    ['/protected/v8/certifications', 'certificationApi'],
    ['/protected/v8/cohorts', 'cohortsApi'],
    ['/protected/v8/concept', 'conceptGraphApi'],
    ['/protected/v8/content', 'contentApi'],
    ['/protected/v8/profanity', 'contentValidationApi'],
    ['/protected/v8/counter', 'counterApi'],
    ['/protected/v8/discussionHub', 'discussionHubApi'],
    ['/protected/v8/khub', 'knowledgeHubApi'],
    ['/protected/v8/leaderboard', 'leaderBoardApi'],
    ['/protected/v8/navigator', 'navigatorApi'],
    ['/protected/v8/networkHub', 'networkHubApi'],
    ['/protected/v8/recommendation', 'recommendationApi'],
    ['/protected/v8/scrom', 'scromApi'],
    ['/protected/v8/social', 'socialApi'],
    ['/protected/v8/training', 'trainingApi'],
    ['/protected/v8/user', 'user'],
    ['/protected/v8/events', 'eventsApi'],
    ['/protected/v8/translate', 'translateApi'],
    ['/protected/v8/attended-content', 'attendedContentApi'],
    ['/protected/v8/event-external', 'externalEventsApi'],
    ['/protected/v8/network', 'networkConnectionApi'],
    ['/protected/v8/connections', 'connectionsV2Api'],
    ['/protected/v8/competency', 'competencyApi'],
    ['/protected/v8/dept', 'deptApi'],
    ['/protected/v8/portal', 'portalApi'],
    ['/protected/v8/scroing', 'scoringApi'],
    ['/protected/v8/workflowhandler', 'workflowHandlerApi'],
    ['/protected/v8/roleactivity', 'roleActivityApi'],
    ['/protected/v8/resource', 'userAuthKeyCloakApi'],
    ['/protected/v8/workallocation', 'workAllocationApi'],
    ['/protected/v8/frac', 'fracApi'],
    ['/protected/v8/contentprivate', 'contentPrivateApi'],
    ['/protected/v8/eclogin', 'userAuthKeyCloakEcApi'],
    ['/protected/v8/aiassessmentlogin', 'userAuthKeyCloakAssessmentLoginApi'],
  ]

  it.each(cases)('mounts %s to the %s router', async (path, marker_) => {
    const res = await supertest(buildApp()).get(path)
    expect(res.body).toEqual({ marker: marker_ })
  })
})
