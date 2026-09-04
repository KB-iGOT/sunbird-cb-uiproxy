jest.mock('../S3/upload', () => ({ uploadToS3: jest.fn() }))

import { uploadToS3 } from '../S3/upload'
import { uploadUnKownData } from './unkown'

const mockedUploadToS3 = uploadToS3 as jest.Mock

describe('uploadUnKownData', () => {
  it('uploads using the given file name when present', async () => {
    mockedUploadToS3.mockResolvedValue({ artifactUrl: 'a', downloadUrl: 'd', error: null })
    await uploadUnKownData({ data: {}, name: 'custom.json', path: 'do_1' } as never)
    expect(mockedUploadToS3).toHaveBeenCalledWith({}, 'do_1', 'custom.json')
  })

  it('falls back to "unkown" when no file name is given', async () => {
    mockedUploadToS3.mockResolvedValue({ artifactUrl: 'a', downloadUrl: 'd', error: null })
    await uploadUnKownData({ data: {}, path: 'do_1' } as never)
    expect(mockedUploadToS3).toHaveBeenCalledWith({}, 'do_1', 'unkown')
  })
})
