import { API_LIST } from '../../../src/utils/whitelistApis'
import { ROLE } from '../../../src/utils/roles'

describe('whitelistApis API_LIST', () => {
  describe('contentpartner v2 create/update', () => {
    it('whitelists create with SPV_ADMIN role check', () => {
      const entry = API_LIST.URL['/proxies/v8/contentpartner/v2/create']
      expect(entry).toBeDefined()
      expect(entry.checksNeeded).toContain('ROLE_CHECK')
      expect(entry.ROLE_CHECK).toEqual([ROLE.SPV_ADMIN])
    })

    it('whitelists update with SPV_ADMIN role check', () => {
      const entry = API_LIST.URL['/proxies/v8/contentpartner/v2/update']
      expect(entry).toBeDefined()
      expect(entry.checksNeeded).toContain('ROLE_CHECK')
      expect(entry.ROLE_CHECK).toEqual([ROLE.SPV_ADMIN])
    })

    it('registers create and update as URL_PATTERN entries', () => {
      expect(API_LIST.URL_PATTERN).toContain('/proxies/v8/contentpartner/v2/create')
      expect(API_LIST.URL_PATTERN).toContain('/proxies/v8/contentpartner/v2/update')
    })
  })

  describe('ciosIntegration lti ssotest', () => {
    it('whitelists the parameterised route with SPV_ADMIN role check', () => {
      const entry = API_LIST.URL['/proxies/v8/ciosIntegration/lti/ssotest/:partnerCode']
      expect(entry).toBeDefined()
      expect(entry.checksNeeded).toContain('ROLE_CHECK')
      expect(entry.ROLE_CHECK).toEqual([ROLE.SPV_ADMIN])
    })

    it('registers the route as a URL_PATTERN entry', () => {
      expect(API_LIST.URL_PATTERN).toContain('/proxies/v8/ciosIntegration/lti/ssotest/:partnerCode')
    })
  })

  describe('cios-enroll lti redirect', () => {
    it('whitelists the parameterised route with PUBLIC role check', () => {
      const entry = API_LIST.URL['/proxies/v8/cios-enroll/lti/redirect/:providerId/:courseId']
      expect(entry).toBeDefined()
      expect(entry.checksNeeded).toContain('ROLE_CHECK')
      expect(entry.ROLE_CHECK).toEqual([ROLE.PUBLIC])
    })

    it('registers the route as a URL_PATTERN entry', () => {
      expect(API_LIST.URL_PATTERN).toContain('/proxies/v8/cios-enroll/lti/redirect/:providerId/:courseId')
    })
  })

  describe('ciosIntegration lti deeplinking initiate', () => {
    it('whitelists the parameterised route with SPV_ADMIN and SPV_PUBLISHER role checks', () => {
      const entry = API_LIST.URL['/proxies/v8/ciosIntegration/lti/deeplinking/initiate/:partnerCode']
      expect(entry).toBeDefined()
      expect(entry.checksNeeded).toContain('ROLE_CHECK')
      expect(entry.ROLE_CHECK).toEqual([ROLE.SPV_ADMIN, ROLE.SPV_PUBLISHER])
    })

    it('registers the route as a URL_PATTERN entry', () => {
      expect(API_LIST.URL_PATTERN).toContain('/proxies/v8/ciosIntegration/lti/deeplinking/initiate/:partnerCode')
    })
  })
})
