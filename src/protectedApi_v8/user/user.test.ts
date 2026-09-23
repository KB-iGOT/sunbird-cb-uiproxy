// tslint:disable: no-any
function marker(name: string) {
  return jest.fn((_req: any, res: any) => res.json({ marker: name }))
}

jest.mock('./accessControl', () => ({ accessControlApi: marker('accessControlApi') }))
jest.mock('./account-settings', () => ({ accountSettingsApi: marker('accountSettingsApi') }))
jest.mock('./activity', () => ({ activity: marker('activity') }))
jest.mock('./admin-users', () => ({ usersApi: marker('usersApi') }))
jest.mock('./auto-complete', () => ({ autocompleteApi: marker('autocompleteApi') }))
jest.mock('./badge', () => ({ badgeApi: marker('badgeApi') }))
jest.mock('./changeEmail', () => ({ changeEmailApi: marker('changeEmailApi') }))
jest.mock('./classDiagram', () => ({ classDiagramApi: marker('classDiagramApi') }))
jest.mock('./code', () => ({ codeApi: marker('codeApi') }))
jest.mock('./content', () => ({ userContentApi: marker('userContentApi') }))
jest.mock('./content-assign', () => ({ contentAssignApi: marker('contentAssignApi') }))
jest.mock('./dashboard', () => ({ dashboardApi: marker('dashboardApi') }))
jest.mock('./details', () => ({ detailsApi: marker('detailsApi') }))
jest.mock('./email', () => ({ emailApi: marker('emailApi') }))
jest.mock('./emailToUserId', () => ({ emailToUserIdApi: marker('emailToUserIdApi') }))
jest.mock('./evaluate', () => ({ evaluateApi: marker('evaluateApi') }))
jest.mock('./exercise', () => ({ exerciseApi: marker('exerciseApi') }))
jest.mock('./feedback', () => ({ feedbackApi: marker('feedbackApi') }))
jest.mock('./feedbackV2', () => ({ feedbackV2Api: marker('feedbackV2Api') }))
jest.mock('./follow', () => ({ followApi: marker('followApi') }))
jest.mock('./goals', () => ({ goalsApi: marker('goalsApi') }))
jest.mock('./group', () => ({ userGroupApi: marker('userGroupApi') }))
jest.mock('./history', () => ({ historyApi: marker('historyApi') }))
jest.mock('./iconBadge', () => ({ iconBadgeApi: marker('iconBadgeApi') }))
jest.mock('./mandatoryContent', () => ({ mandatoryContent: marker('mandatoryContent') }))
jest.mock('./miniProfile', () => ({ userMiniProfile: marker('userMiniProfile') }))
jest.mock('./myAnalytics', () => ({ myAnalyticsApi: marker('myAnalyticsApi') }))
jest.mock('./notifications', () => ({ notificationsApi: marker('notificationsApi') }))
jest.mock('./ocm', () => ({ ocmApi: marker('ocmApi') }))
jest.mock('./playlist', () => ({ playlistApi: marker('playlistApi') }))
jest.mock('./preference', () => ({ protectedPreference: marker('protectedPreference') }))
jest.mock('./profile', () => ({ profileApi: marker('profileApi') }))
jest.mock('./profile-details', () => ({ profileDeatailsApi: marker('profileDeatailsApi') }))
jest.mock('./profile-registry', () => ({ profileRegistryApi: marker('profileRegistryApi') }))
jest.mock('./progress', () => ({ progressApi: marker('progressApi') }))
jest.mock('./rating', () => ({ ratingApi: marker('ratingApi') }))
jest.mock('./rdbms', () => ({ rdbmsApi: marker('rdbmsApi') }))
jest.mock('./realTimeProgress', () => ({ realTimeProgressApi: marker('realTimeProgressApi') }))
jest.mock('./roles', () => ({ rolesApi: marker('rolesApi') }))
jest.mock('./share', () => ({ shareApi: marker('shareApi') }))
jest.mock('./skills', () => ({ skillsApi: marker('skillsApi') }))
jest.mock('./telemetry', () => ({ telemetryApi: marker('telemetryApi') }))
jest.mock('./tnc', () => ({ protectedTnc: marker('protectedTnc') }))
jest.mock('./token', () => ({ userTokenApi: marker('userTokenApi') }))
jest.mock('./topic', () => ({ topicApi: marker('topicApi') }))
jest.mock('./topics', () => ({ topicsApi: marker('topicsApi') }))
jest.mock('./validate', () => ({ validateApi: marker('validateApi') }))
jest.mock('./viewprofile', () => ({ viewProfileApi: marker('viewProfileApi') }))

import express from 'express'
import supertest from 'supertest'
import { user } from './user'

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
