jest.mock('../S3/read', () => ({ readFromS3: jest.fn() }))

import { readFromS3 } from '../S3/read'
import { extractChannelData } from './channel'

const mockedReadFromS3 = readFromS3 as jest.Mock

describe('extractChannelData', () => {
  it('delegates to readFromS3 with the given url', async () => {
    mockedReadFromS3.mockResolvedValue({ name: 'ch-1' })
    const result = await extractChannelData('/content-store/do_1/channel.json')
    expect(result).toEqual({ name: 'ch-1' })
    expect(mockedReadFromS3).toHaveBeenCalledWith('/content-store/do_1/channel.json')
  })
})
