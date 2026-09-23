jest.mock('../S3/upload', () => ({ uploadToS3: jest.fn() }))

import { uploadToS3 } from '../S3/upload'
import { uploadChannelData } from './channel'

const mockedUploadToS3 = uploadToS3 as jest.Mock

describe('uploadChannelData', () => {
  it('uploads the channel data as channel.json', async () => {
    mockedUploadToS3.mockResolvedValue({ artifactUrl: 'a', downloadUrl: 'd', error: null })
    const result = await uploadChannelData({ data: { name: 'ch' }, path: 'do_1' } as never)
    expect(result).toEqual({ artifactUrl: 'a', downloadUrl: 'd', error: null })
    expect(mockedUploadToS3).toHaveBeenCalledWith({ name: 'ch' }, 'do_1', 'channel.json')
  })
})
