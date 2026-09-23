// tslint:disable: no-any
function marker(name: string) {
  return jest.fn((_req: any, res: any) => res.json({ marker: name }))
}

jest.mock('../../../src/protectedApi_v8/admin/admin', () => ({ admin: marker('admin') }))
jest.mock('../../../src/protectedApi_v8/attendent-content', () => ({ attendedContentApi: marker('attendedContentApi') }))
jest.mock('../../../src/protectedApi_v8/catalog', () => ({ catalogApi: marker('catalogApi') }))
jest.mock('../../../src/protectedApi_v8/certifications', () => ({ certificationApi: marker('certificationApi') }))
jest.mock('../../../src/protectedApi_v8/cohorts', () => ({ cohortsApi: marker('cohortsApi') }))
jest.mock('../../../src/protectedApi_v8/competency', () => ({ competencyApi: marker('competencyApi') }))
jest.mock('../../../src/protectedApi_v8/concept', () => ({ conceptGraphApi: marker('conceptGraphApi') }))
jest.mock('../../../src/protectedApi_v8/connections_v2', () => ({ connectionsV2Api: marker('connectionsV2Api') }))
jest.mock('../../../src/protectedApi_v8/content', () => ({ contentApi: marker('contentApi') }))
jest.mock('../../../src/protectedApi_v8/contentprivate', () => ({ contentPrivateApi: marker('contentPrivateApi') }))
jest.mock('../../../src/protectedApi_v8/contentValidation', () => ({ contentValidationApi: marker('contentValidationApi') }))
jest.mock('../../../src/protectedApi_v8/counter', () => ({ counterApi: marker('counterApi') }))
jest.mock('../../../src/protectedApi_v8/departments', () => ({ deptApi: marker('deptApi') }))
jest.mock('../../../src/protectedApi_v8/discussionHub/discussionHub', () => ({ discussionHubApi: marker('discussionHubApi') }))
jest.mock('../../../src/protectedApi_v8/event-external', () => ({ externalEventsApi: marker('externalEventsApi') }))
jest.mock('../../../src/protectedApi_v8/events', () => ({ eventsApi: marker('eventsApi') }))
jest.mock('../../../src/protectedApi_v8/frac', () => ({ fracApi: marker('fracApi') }))
jest.mock('../../../src/protectedApi_v8/khub', () => ({ knowledgeHubApi: marker('knowledgeHubApi') }))
jest.mock('../../../src/protectedApi_v8/leaderboard', () => ({ leaderBoardApi: marker('leaderBoardApi') }))
jest.mock('../../../src/protectedApi_v8/navigator', () => ({ navigatorApi: marker('navigatorApi') }))
jest.mock('../../../src/protectedApi_v8/network', () => ({ networkConnectionApi: marker('networkConnectionApi') }))
jest.mock('../../../src/protectedApi_v8/network-hub', () => ({ networkHubApi: marker('networkHubApi') }))
jest.mock('../../../src/protectedApi_v8/portal-v3', () => ({ portalApi: marker('portalApi') }))
jest.mock('../../../src/protectedApi_v8/recommendation', () => ({ recommendationApi: marker('recommendationApi') }))
jest.mock('../../../src/protectedApi_v8/resource', () => ({
  userAuthKeyCloakApi: marker('userAuthKeyCloakApi'),
  userAuthKeyCloakAssessmentLoginApi: marker('userAuthKeyCloakAssessmentLoginApi'),
  userAuthKeyCloakEcApi: marker('userAuthKeyCloakEcApi'),
}))
jest.mock('../../../src/protectedApi_v8/roleActivity', () => ({ roleActivityApi: marker('roleActivityApi') }))
jest.mock('../../../src/protectedApi_v8/scoring', () => ({ scoringApi: marker('scoringApi') }))
jest.mock('../../../src/protectedApi_v8/scrom', () => ({ scromApi: marker('scromApi') }))
jest.mock('../../../src/protectedApi_v8/social', () => ({ socialApi: marker('socialApi') }))
jest.mock('../../../src/protectedApi_v8/training', () => ({ trainingApi: marker('trainingApi') }))
jest.mock('../../../src/protectedApi_v8/translate', () => ({ translateApi: marker('translateApi') }))
jest.mock('../../../src/protectedApi_v8/user/user', () => ({ user: marker('user') }))
jest.mock('../../../src/protectedApi_v8/workallocation', () => ({ workAllocationApi: marker('workAllocationApi') }))
jest.mock('../../../src/protectedApi_v8/workflow-handler', () => ({ workflowHandlerApi: marker('workflowHandlerApi') }))

import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../../src/utils/env'
import { protectedApiV8 } from '../../../src/protectedApi_v8/protectedApiV8'

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
