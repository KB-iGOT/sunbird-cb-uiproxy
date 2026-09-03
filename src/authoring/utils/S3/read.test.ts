jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import { CONSTANTS } from '../../../utils/env'
import { readFromS3 } from './read'

const mockedAxios = axios as unknown as { get: jest.Mock }

describe('readFromS3', () => {
  it('strips the first four url segments and fetches the parsed JSON content', async () => {
    mockedAxios.get.mockResolvedValue({ data: JSON.stringify({ foo: 'bar' }) })
    const result = await readFromS3('/apis/proxies/v8/content-store/abc/def/file.json')
    expect(result).toEqual({ foo: 'bar' })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.CONTENT_API_BASE}/contentv3/download/content-store%2Fabc%2Fdef%2Ffile.json`,
      expect.any(Object)
    )
  })

  it('returns the raw response data when it is not valid JSON', async () => {
    mockedAxios.get.mockResolvedValue({ data: 'not-json' })
    const result = await readFromS3('/a/b/c/d/file.txt')
    expect(result).toBe('not-json')
  })
})
