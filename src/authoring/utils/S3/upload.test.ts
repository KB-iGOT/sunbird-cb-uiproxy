jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import { CONSTANTS } from '../../../utils/env'
import { uploadToS3 } from './upload'

const mockedAxios = axios as unknown as { post: jest.Mock }

describe('uploadToS3', () => {
  it('uploads the JSON payload as multipart form data and returns the artifact/download urls', async () => {
    mockedAxios.post.mockResolvedValue({ data: { artifactURL: 'https://cdn/a.json', downloadURL: 'https://cdn/d.json' } })

    const result = await uploadToS3({ foo: 'bar' }, 'do_1/assets', 'meta.json')

    expect(result).toEqual({ artifactUrl: 'https://cdn/a.json', downloadUrl: 'https://cdn/d.json', error: null })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.CONTENT_API_BASE}/contentv3/upload/do_1%2Fassets`,
      expect.anything(),
      expect.objectContaining({ headers: expect.any(Object) })
    )
  })

  it('returns the upstream error message when the upload fails', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: 'upload rejected' } })
    const result = await uploadToS3({}, 'do_1', 'meta.json')
    expect(result).toEqual({ artifactUrl: null, downloadUrl: null, error: 'upload rejected' })
  })

  it('falls back to a generic error message when the failure has no response', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const result = await uploadToS3({}, 'do_1', 'meta.json')
    expect(result.error).toBe('Failed due to unkown reason')
  })
})
