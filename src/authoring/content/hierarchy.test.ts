jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import { CONSTANTS } from '../../utils/env'
import { getHierarchy, getHierarchyV2, getMultipleHierarchyV2 } from './hierarchy'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

// tslint:disable-next-line: no-any
function buildReq(): any {
  return {
    header: () => undefined,
    kauth: { grant: { access_token: { content: { sub: 'user-1' } } } },
  }
}

describe('getHierarchy', () => {
  it('fetches the v1 hierarchy for the given content id', async () => {
    mockedAxios.get.mockResolvedValue({ data: { identifier: 'do_1' } })
    const result = await getHierarchy('do_1', 'dopt', 'igot', buildReq())
    expect(result).toEqual({ identifier: 'do_1' })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.AUTHORING_BACKEND}/action/content/hierarchy/do_1?org=dopt&rootOrg=igot`,
      expect.any(Object)
    )
  })
})

describe('getHierarchyV2', () => {
  it('posts the DEFAULT_META fields to the v2 hierarchy endpoint', async () => {
    mockedAxios.post.mockResolvedValue({ data: { identifier: 'do_1' } })
    const result = await getHierarchyV2('do_1', 'dopt', 'igot', buildReq())
    expect(result).toEqual({ identifier: 'do_1' })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.AUTHORING_BACKEND}/action/content/v2/hierarchy/do_1?org=dopt&rootOrg=igot`,
      expect.objectContaining({ fields: expect.any(Array) }),
      expect.any(Object)
    )
  })
})

describe('getMultipleHierarchyV2', () => {
  it('posts the identifier list to the multiple-hierarchy endpoint', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ identifier: 'do_1' }, { identifier: 'do_2' }] })
    const result = await getMultipleHierarchyV2(['do_1', 'do_2'], 'dopt', 'igot', buildReq())
    expect(result).toEqual([{ identifier: 'do_1' }, { identifier: 'do_2' }])
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.AUTHORING_BACKEND}/action/content/multiple/hierarchy?org=dopt&rootOrg=igot`,
      expect.objectContaining({ identifier: ['do_1', 'do_2'] }),
      expect.any(Object)
    )
  })
})
