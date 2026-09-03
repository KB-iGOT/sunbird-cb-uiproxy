jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import { CONSTANTS } from '../../utils/env'
import { fetchTranslatedContents } from './fetch-related-content'

const mockedAxios = axios as unknown as { post: jest.Mock }

describe('fetchTranslatedContents', () => {
  it('returns just the query id when there is no matching search result', async () => {
    mockedAxios.post.mockResolvedValue({ result: { response: { result: [] } } })
    const ids = await fetchTranslatedContents('do_1', 'user-1')
    expect(ids).toEqual(['do_1'])
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/authsearch5`,
      expect.objectContaining({ request: expect.objectContaining({ query: 'do_1', rootOrg: 'iGOT', uuid: 'user-1' }) }),
      expect.any(Object)
    )
  })

  it('includes isTranslationOf and hasTranslations identifiers', async () => {
    mockedAxios.post.mockResolvedValue({
      result: {
        response: {
          result: [
            {
              hasTranslations: [{ identifier: 'do_hi' }],
              identifier: 'do_1',
              isTranslationOf: [{ identifier: 'do_en' }],
            },
          ],
        },
      },
    })

    const ids = await fetchTranslatedContents('do_1', 'user-1')
    expect(ids).toEqual(['do_1', 'do_en', 'do_hi'])
  })

  it('uses a custom rootOrg when given', async () => {
    mockedAxios.post.mockResolvedValue({ result: { response: { result: [] } } })
    await fetchTranslatedContents('do_1', 'user-1', 'customOrg')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ request: expect.objectContaining({ rootOrg: 'customOrg' }) }),
      expect.any(Object)
    )
  })

  it('returns just the query id when the search request fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('search down'))
    const ids = await fetchTranslatedContents('do_1', 'user-1')
    expect(ids).toEqual(['do_1'])
  })
})
