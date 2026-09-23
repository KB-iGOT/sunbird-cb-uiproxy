jest.mock('../protectedApi_v8/content', () => ({
  searchV5: jest.fn(),
}))

import { IFilterUnitContent } from '../models/catalog.model'
import { searchV5 } from '../protectedApi_v8/content'
import { getFilterUnitByType, getFilters } from './catalog'

const mockedSearchV5 = searchV5 as jest.Mock

describe('getFilters', () => {
  it('returns the content of the matching filter type', async () => {
    mockedSearchV5.mockResolvedValue({
      filters: [
        { content: ['a', 'b'], type: 'department' },
        { content: ['x'], type: 'other' },
      ],
    })

    const result = await getFilters('user-1', 'org-1', 'department')

    expect(result).toEqual(['a', 'b'])
    expect(mockedSearchV5).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ rootOrg: 'org-1', uuid: 'user-1' }),
      })
    )
  })

  it('returns an empty array when no filter of that type is found', async () => {
    mockedSearchV5.mockResolvedValue({ filters: [{ content: ['x'], type: 'other' }] })
    const result = await getFilters('user-1', 'org-1', 'department')
    expect(result).toEqual([])
  })
})

describe('getFilterUnitByType', () => {
  it('returns null when filter is undefined', () => {
    expect(getFilterUnitByType(undefined, 'department')).toBeNull()
  })

  it('returns the filter itself when its type matches', () => {
    const filter: IFilterUnitContent = { children: [], type: 'department' } as unknown as IFilterUnitContent
    expect(getFilterUnitByType(filter, 'department')).toBe(filter)
  })

  it('recurses into children to find a matching type', () => {
    const match: IFilterUnitContent = { children: [], type: 'target' } as unknown as IFilterUnitContent
    const root: IFilterUnitContent = {
      children: [{ children: [], type: 'other' } as unknown as IFilterUnitContent, match],
      type: 'root',
    } as unknown as IFilterUnitContent

    expect(getFilterUnitByType(root, 'target')).toBe(match)
  })

  it('returns null when nothing in the tree matches', () => {
    const root: IFilterUnitContent = {
      children: [{ children: [], type: 'other' } as unknown as IFilterUnitContent],
      type: 'root',
    } as unknown as IFilterUnitContent
    expect(getFilterUnitByType(root, 'missing')).toBeNull()
  })
})
