import axios from 'axios'
import { allocationService, extractCourseId, extractPartner, validateKeycloak } from './authz'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('validateKeycloak', () => {
  it('returns null when no cookie is present', () => {
    expect(validateKeycloak(undefined)).toBeNull()
  })

  it('returns null when the cookie has no access_token', () => {
    expect(validateKeycloak('some=cookie')).toBeNull()
  })

  it('returns a user when the cookie contains an access_token', () => {
    expect(validateKeycloak('access_token=123')).toEqual({ id: 'user-123' })
  })
})

describe('extractPartner', () => {
  it('returns null when the header is missing', () => {
    expect(extractPartner(undefined)).toBeNull()
  })

  it('returns null when the uri has no partner segment', () => {
    expect(extractPartner('/some/path')).toBeNull()
  })

  it('extracts the partner id from the uri', () => {
    expect(extractPartner('/partner/my-partner/action')).toBe('my-partner')
  })

  it('reads the first value when the header is an array', () => {
    expect(extractPartner(['/partner/my-partner/action', '/partner/other'])).toBe('my-partner')
  })
})

describe('extractCourseId', () => {
  it('returns null when the header is missing', () => {
    expect(extractCourseId(undefined)).toBeNull()
  })

  it('returns null when the uri has no course segment', () => {
    expect(extractCourseId('/some/path')).toBeNull()
  })

  it('extracts the course id from the uri', () => {
    expect(extractCourseId('/course/my-course-id/action')).toBe('my-course-id')
  })

  it('reads the first value when the header is an array', () => {
    expect(extractCourseId(['/course/my-course-id/action'])).toBe('my-course-id')
  })
})

describe('allocationService.isEnrolledToCourse', () => {
  it('returns false when userId is missing', async () => {
    const allowed = await allocationService.isEnrolledToCourse('', 'p1', 'c1', 'token')
    expect(allowed).toBe(false)
  })

  it('returns false when partner is missing', async () => {
    const allowed = await allocationService.isEnrolledToCourse('u1', null, 'c1', 'token')
    expect(allowed).toBe(false)
  })

  it('returns false when courseName is missing', async () => {
    const allowed = await allocationService.isEnrolledToCourse('u1', 'p1', null, 'token')
    expect(allowed).toBe(false)
  })

  it('returns true when the enrollment lookup resolves with data', async () => {
    const spy = jest.spyOn(allocationService, 'readByUserIdCourseId').mockResolvedValue({ some: 'data' })
    const allowed = await allocationService.isEnrolledToCourse('u1', 'p1', 'c1', 'token')
    expect(allowed).toBe(true)
    spy.mockRestore()
  })

  it('returns false when the enrollment lookup resolves with no data', async () => {
    const spy = jest.spyOn(allocationService, 'readByUserIdCourseId').mockResolvedValue(null)
    const allowed = await allocationService.isEnrolledToCourse('u1', 'p1', 'c1', 'token')
    expect(allowed).toBe(false)
    spy.mockRestore()
  })

  it('returns false when the enrollment lookup throws', async () => {
    const spy = jest.spyOn(allocationService, 'readByUserIdCourseId').mockRejectedValue(new Error('boom'))
    const allowed = await allocationService.isEnrolledToCourse('u1', 'p1', 'c1', 'token')
    expect(allowed).toBe(false)
    spy.mockRestore()
  })
})

describe('allocationService.readByUserIdCourseId', () => {
  it('returns the response data on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: { enrolled: true } })
    const result = await allocationService.readByUserIdCourseId('u1', 'c1', 'token')
    expect(result).toEqual({ enrolled: true })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/proxies/v8/cios-enroll/v1/readby/useridcourseid/c1'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-authenticated-user-token': 'token',
          'x-authenticated-userid': 'u1',
        }),
      })
    )
  })

  it('returns null when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network error'))
    const result = await allocationService.readByUserIdCourseId('u1', 'c1', 'token')
    expect(result).toBeNull()
  })
})
