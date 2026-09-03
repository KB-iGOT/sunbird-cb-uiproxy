jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import { CONSTANTS } from '../../utils/env'
import { searchForOtherLanguage } from './language-search'

const mockedAxios = axios as unknown as { post: jest.Mock }

describe('searchForOtherLanguage', () => {
  it('returns just the query id when there is no matching result', async () => {
    mockedAxios.post.mockResolvedValue({ data: { result: [] } })
    const ids = await searchForOtherLanguage('do_1', 'user-1', 'igot')
    expect(ids).toEqual(['do_1'])
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SEARCH_API_BASE}/v6/search/auth`,
      expect.objectContaining({ query: 'do_1', rootOrg: 'igot', uuid: 'user-1' }),
      expect.any(Object)
    )
  })

  it('includes hasTranslations and isTranslationOf identifiers', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        result: [
          {
            hasTranslations: [{ identifier: 'do_hi' }],
            identifier: 'do_1',
            isTranslationOf: [{ identifier: 'do_en' }],
          },
        ],
      },
    })
    const ids = await searchForOtherLanguage('do_1', 'user-1', 'igot')
    expect(ids).toEqual(['do_1', 'do_hi', 'do_en'])
  })

  it('returns just the query id when the search fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const ids = await searchForOtherLanguage('do_1', 'user-1', 'igot')
    expect(ids).toEqual(['do_1'])
  })
})
