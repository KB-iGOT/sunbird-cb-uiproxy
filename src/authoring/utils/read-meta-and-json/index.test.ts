jest.mock('../S3/read', () => ({ readFromS3: jest.fn() }))
jest.mock('./channel', () => ({ extractChannelData: jest.fn() }))

import { readFromS3 } from '../S3/read'
import { extractChannelData } from './channel'
import { extractWebModuleData, readJSONData } from './index'

const mockedReadFromS3 = readFromS3 as jest.Mock
const mockedExtractChannelData = extractChannelData as jest.Mock

describe('readJSONData', () => {
  it('resolves null when there is no artifactUrl', async () => {
    expect(await readJSONData({ artifactUrl: '' } as never)).toBeNull()
  })

  it('routes channel content to extractChannelData', async () => {
    mockedExtractChannelData.mockResolvedValue({ name: 'ch' })
    const result = await readJSONData({ artifactUrl: '/a/channel.json', mimeType: 'application/channel' } as never)
    expect(result).toEqual({ name: 'ch' })
    expect(mockedExtractChannelData).toHaveBeenCalledWith('/a/channel.json')
  })

  it('reads the raw artifact for a Quiz-category quiz', async () => {
    mockedExtractChannelData.mockResolvedValue({ questions: [] })
    await readJSONData({ artifactUrl: '/a/quiz.json', categoryType: 'Quiz', mimeType: 'application/quiz' } as never)
    expect(mockedExtractChannelData).toHaveBeenCalledWith('/a/quiz.json')
  })

  it('reads the -key.json variant for a non-Quiz-category quiz/class-diagram', async () => {
    mockedExtractChannelData.mockResolvedValue({})
    await readJSONData({ artifactUrl: '/a/class-diagram.json', categoryType: 'Other', mimeType: 'application/class-diagram' } as never)
    expect(mockedExtractChannelData).toHaveBeenCalledWith('/a/class-diagram-key.json')
  })

  it('routes web-module content to extractWebModuleData', async () => {
    mockedReadFromS3.mockResolvedValue([])
    const result = await readJSONData({ artifactUrl: '/a/manifest.json', mimeType: 'application/web-module' } as never)
    expect(result).toEqual({ pageJson: [], pages: [] })
  })

  it('resolves null for an unrecognized mimeType', async () => {
    expect(await readJSONData({ artifactUrl: '/a/x.json', mimeType: 'application/other' } as never)).toBeNull()
  })
})

describe('extractWebModuleData', () => {
  it('fetches the manifest and every page it references', async () => {
    mockedReadFromS3
      .mockResolvedValueOnce([{ URL: '/page1.json' }, {}])
      .mockResolvedValueOnce({ title: 'Page 1' })

    const result = await extractWebModuleData('/a/manifest.json')

    // the page-mapping callback is itself `async`, so every entry becomes a resolved
    // (truthy) Promise even when there is no URL to fetch - the `null` survives through
    expect(result.pageJson).toEqual([{ URL: '/page1.json' }, {}])
    expect(result.pages).toEqual([{ title: 'Page 1' }, null])
    expect(mockedReadFromS3).toHaveBeenCalledWith('/a/page1.json')
  })
})
