// tslint:disable: no-any
function marker(name: string) {
  return jest.fn((_req: any, res: any) => res.json({ marker: name }))
}

jest.mock('../../../../src/protectedApi_v8/user/accessControl', () => ({ accessControlApi: marker('accessControlApi') }))
jest.mock('../../../../src/protectedApi_v8/user/account-settings', () => ({ accountSettingsApi: marker('accountSettingsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/activity', () => ({ activity: marker('activity') }))
jest.mock('../../../../src/protectedApi_v8/user/admin-users', () => ({ usersApi: marker('usersApi') }))
jest.mock('../../../../src/protectedApi_v8/user/auto-complete', () => ({ autocompleteApi: marker('autocompleteApi') }))
jest.mock('../../../../src/protectedApi_v8/user/badge', () => ({ badgeApi: marker('badgeApi') }))
jest.mock('../../../../src/protectedApi_v8/user/changeEmail', () => ({ changeEmailApi: marker('changeEmailApi') }))
jest.mock('../../../../src/protectedApi_v8/user/classDiagram', () => ({ classDiagramApi: marker('classDiagramApi') }))
jest.mock('../../../../src/protectedApi_v8/user/code', () => ({ codeApi: marker('codeApi') }))
jest.mock('../../../../src/protectedApi_v8/user/content', () => ({ userContentApi: marker('userContentApi') }))
jest.mock('../../../../src/protectedApi_v8/user/content-assign', () => ({ contentAssignApi: marker('contentAssignApi') }))
jest.mock('../../../../src/protectedApi_v8/user/dashboard', () => ({ dashboardApi: marker('dashboardApi') }))
jest.mock('../../../../src/protectedApi_v8/user/details', () => ({ detailsApi: marker('detailsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/email', () => ({ emailApi: marker('emailApi') }))
jest.mock('../../../../src/protectedApi_v8/user/emailToUserId', () => ({ emailToUserIdApi: marker('emailToUserIdApi') }))
jest.mock('../../../../src/protectedApi_v8/user/evaluate', () => ({ evaluateApi: marker('evaluateApi') }))
jest.mock('../../../../src/protectedApi_v8/user/exercise', () => ({ exerciseApi: marker('exerciseApi') }))
jest.mock('../../../../src/protectedApi_v8/user/feedback', () => ({ feedbackApi: marker('feedbackApi') }))
jest.mock('../../../../src/protectedApi_v8/user/feedbackV2', () => ({ feedbackV2Api: marker('feedbackV2Api') }))
jest.mock('../../../../src/protectedApi_v8/user/follow', () => ({ followApi: marker('followApi') }))
jest.mock('../../../../src/protectedApi_v8/user/goals', () => ({ goalsApi: marker('goalsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/group', () => ({ userGroupApi: marker('userGroupApi') }))
jest.mock('../../../../src/protectedApi_v8/user/history', () => ({ historyApi: marker('historyApi') }))
jest.mock('../../../../src/protectedApi_v8/user/iconBadge', () => ({ iconBadgeApi: marker('iconBadgeApi') }))
jest.mock('../../../../src/protectedApi_v8/user/mandatoryContent', () => ({ mandatoryContent: marker('mandatoryContent') }))
jest.mock('../../../../src/protectedApi_v8/user/miniProfile', () => ({ userMiniProfile: marker('userMiniProfile') }))
jest.mock('../../../../src/protectedApi_v8/user/myAnalytics', () => ({ myAnalyticsApi: marker('myAnalyticsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/notifications', () => ({ notificationsApi: marker('notificationsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/ocm', () => ({ ocmApi: marker('ocmApi') }))
jest.mock('../../../../src/protectedApi_v8/user/playlist', () => ({ playlistApi: marker('playlistApi') }))
jest.mock('../../../../src/protectedApi_v8/user/preference', () => ({ protectedPreference: marker('protectedPreference') }))
jest.mock('../../../../src/protectedApi_v8/user/profile', () => ({ profileApi: marker('profileApi') }))
jest.mock('../../../../src/protectedApi_v8/user/profile-details', () => ({ profileDeatailsApi: marker('profileDeatailsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/profile-registry', () => ({ profileRegistryApi: marker('profileRegistryApi') }))
jest.mock('../../../../src/protectedApi_v8/user/progress', () => ({ progressApi: marker('progressApi') }))
jest.mock('../../../../src/protectedApi_v8/user/rating', () => ({ ratingApi: marker('ratingApi') }))
jest.mock('../../../../src/protectedApi_v8/user/rdbms', () => ({ rdbmsApi: marker('rdbmsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/realTimeProgress', () => ({ realTimeProgressApi: marker('realTimeProgressApi') }))
jest.mock('../../../../src/protectedApi_v8/user/roles', () => ({ rolesApi: marker('rolesApi') }))
jest.mock('../../../../src/protectedApi_v8/user/share', () => ({ shareApi: marker('shareApi') }))
jest.mock('../../../../src/protectedApi_v8/user/skills', () => ({ skillsApi: marker('skillsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/telemetry', () => ({ telemetryApi: marker('telemetryApi') }))
jest.mock('../../../../src/protectedApi_v8/user/tnc', () => ({ protectedTnc: marker('protectedTnc') }))
jest.mock('../../../../src/protectedApi_v8/user/token', () => ({ userTokenApi: marker('userTokenApi') }))
jest.mock('../../../../src/protectedApi_v8/user/topic', () => ({ topicApi: marker('topicApi') }))
jest.mock('../../../../src/protectedApi_v8/user/topics', () => ({ topicsApi: marker('topicsApi') }))
jest.mock('../../../../src/protectedApi_v8/user/validate', () => ({ validateApi: marker('validateApi') }))
jest.mock('../../../../src/protectedApi_v8/user/viewprofile', () => ({ viewProfileApi: marker('viewProfileApi') }))

import express from 'express'
import supertest from 'supertest'
import { user } from '../../../../src/protectedApi_v8/user/user'

function buildApp() {
  const app = express()
  app.use('/user', user)
  return app
}

describe('user router wiring', () => {
  const cases: Array<[string, string]> = [
    ['/user/group', 'userGroupApi'],
    ['/user/accessControl', 'accessControlApi'],
    ['/user/content-assign', 'contentAssignApi'],
    ['/user/account-settings', 'accountSettingsApi'],
    ['/user/mini-profile', 'userMiniProfile'],
    ['/user/activity', 'activity'],
    ['/user/change-email', 'changeEmailApi'],
    ['/user/autocomplete', 'autocompleteApi'],
    ['/user/badge', 'badgeApi'],
    ['/user/class-diagram', 'classDiagramApi'],
    ['/user/code', 'codeApi'],
    ['/user/content', 'userContentApi'],
    ['/user/dashboard', 'dashboardApi'],
    ['/user/details', 'detailsApi'],
    ['/user/email', 'emailApi'],
    ['/user/emailToUserId', 'emailToUserIdApi'],
    ['/user/evaluate', 'evaluateApi'],
    ['/user/feedback', 'feedbackApi'],
    ['/user/feedbackV2', 'feedbackV2Api'],
    ['/user/follow', 'followApi'],
    ['/user/goals', 'goalsApi'],
    ['/user/history', 'historyApi'],
    ['/user/iconBadge', 'iconBadgeApi'],
    ['/user/myAnalytics', 'myAnalyticsApi'],
    ['/user/notifications', 'notificationsApi'],
    ['/user/ocm', 'ocmApi'],
    ['/user/playlist', 'playlistApi'],
    ['/user/preference', 'protectedPreference'],
    ['/user/profile', 'profileApi'],
    ['/user/profileDetails', 'profileDeatailsApi'],
    ['/user/progress', 'progressApi'],
    ['/user/rating', 'ratingApi'],
    ['/user/rdbms', 'rdbmsApi'],
    ['/user/roles', 'rolesApi'],
    ['/user/share', 'shareApi'],
    ['/user/skills', 'skillsApi'],
    ['/user/telemetry', 'telemetryApi'],
    ['/user/tnc', 'protectedTnc'],
    ['/user/token', 'userTokenApi'],
    ['/user/topic', 'topicApi'],
    ['/user/topics', 'topicsApi'],
    ['/user/viewprofile', 'viewProfileApi'],
    ['/user/validate', 'validateApi'],
    ['/user/realTimeProgress', 'realTimeProgressApi'],
    ['/user/exercise', 'exerciseApi'],
    ['/user/users', 'usersApi'],
    ['/user/mandatoryContent', 'mandatoryContent'],
    ['/user/profileRegistry', 'profileRegistryApi'],
  ]

  it.each(cases)('mounts %s to the %s router', async (path, marker_) => {
    const res = await supertest(buildApp()).get(path)
    expect(res.body).toEqual({ marker: marker_ })
  })
})
