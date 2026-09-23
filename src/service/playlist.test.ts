import {
  formContentRequestObj,
  formPlaylistRequestObj,
  formPlaylistupdateObj,
  transformToPlaylistV2,
  transformToPlaylistV3,
  transformToSbExtCreateRequest,
  transformToSbExtDeleteRequest,
  transformToSbExtPatchRequest,
  transformToSbExtSyncRequest,
  transformToSbExtUpdateRequest,
  transformToSbExtUpsertRequest,
} from './playlist'

describe('transformToPlaylistV2', () => {
  it('maps a shared sb-ext playlist to the app-level shape', () => {
    // tslint:disable-next-line: no-any
    const sbExt: any = {
      content_meta: [{ appIcon: 'icon.png' }],
      created_on: '2024-01-01',
      playlist_id: 'p1',
      playlist_title: 'My Playlist',
      resource_ids: ['r1'],
      shared_by: { name: 'Jane', user_id: 'u1' },
      shared_on: '2024-01-02',
      status: 'Live',
      visibility: 'Private',
    }

    expect(transformToPlaylistV2(sbExt)).toEqual({
      contents: [{ appIcon: 'icon.png' }],
      createdOn: '2024-01-01',
      icon: 'icon.png',
      id: 'p1',
      name: 'My Playlist',
      resourceIds: ['r1'],
      sharedBy: 'u1',
      sharedByDisplayName: 'Jane',
      sharedOn: '2024-01-02',
      status: 'Live',
      type: 'share',
      visibility: 'Private',
    })
  })

  it('marks a playlist without shared_by as type "user" with a null icon', () => {
    // tslint:disable-next-line: no-any
    const sbExt: any = {
      content_meta: [],
      created_on: '2024-01-01',
      playlist_id: 'p1',
      playlist_title: 'My Playlist',
      resource_ids: [],
      status: 'Live',
      visibility: 'Private',
    }
    const result = transformToPlaylistV2(sbExt)
    expect(result.type).toBe('user')
    expect(result.icon).toBeNull()
    expect(result.sharedBy).toBeUndefined()
  })
})

describe('transformToPlaylistV3', () => {
  it('maps a v3 playlist response and sums resource durations', () => {
    // tslint:disable-next-line: no-any
    const sbExt: any = {
      createdOn: '2024-01-01',
      playlistTitle: 'My Playlist',
      resource_ids: [{ appIcon: 'icon.png', duration: 10 }, { duration: 20 }],
      resourceIds: ['r1', 'r2'],
      sharedBy: 'u1',
      status: 'Live',
      visibility: 'Private',
    }

    const result = transformToPlaylistV3(sbExt, 'p1')
    expect(result.id).toBe('p1')
    expect(result.duration).toBe(30)
    expect(result.icon).toBe('icon.png')
    expect(result.type).toBe('share')
  })
})

describe('sb-ext request transformers', () => {
  it('transformToSbExtCreateRequest maps content_ids/title/visibility', () => {
    expect(
      transformToSbExtCreateRequest({ content_ids: ['c1'], playlist_title: 'x', visibility: 'Private' } as never)
    ).toEqual({ content_ids: ['c1'], playlist_title: 'x', visibility: 'Private' })
  })

  it('transformToSbExtSyncRequest maps only_sharedby_playlist_content to content', () => {
    expect(transformToSbExtSyncRequest({ only_sharedby_playlist_content: true } as never)).toEqual({ content: true })
  })

  it('transformToSbExtUpsertRequest maps contentIds to content_ids', () => {
    expect(transformToSbExtUpsertRequest({ contentIds: ['c1', 'c2'] } as never)).toEqual({ content_ids: ['c1', 'c2'] })
  })

  it('transformToSbExtDeleteRequest maps contentIds to content', () => {
    expect(transformToSbExtDeleteRequest({ contentIds: ['c1'] } as never)).toEqual({ content: ['c1'] })
  })

  it('transformToSbExtUpdateRequest extracts identifiers from content_ids objects', () => {
    const result = transformToSbExtUpdateRequest({
      content_ids: [{ identifier: 'c1' }, { identifier: 'c2' }],
      playlist_title: 'new title',
      visibility: 'Public',
    } as never)
    expect(result).toEqual({ content_ids: ['c1', 'c2'], playlist_title: 'new title', visibility: 'Public' })
  })
})

describe('transformToSbExtPatchRequest', () => {
  it('builds a hierarchy patch request keyed by playlistId', () => {
    const result = transformToSbExtPatchRequest({ contentIds: ['c1', 'c2'] }, 'p1')
    expect(result).toEqual({
      request: { data: { hierarchy: { p1: { children: ['c1', 'c2'], contentType: 'Collection', root: true } }, nodesModified: {} } },
    })
  })
})

describe('formPlaylistRequestObj', () => {
  it('builds a create-content request for a new playlist', () => {
    const result = formPlaylistRequestObj(
      { content_ids: [], createdBy: 'creator-1', playlist_title: 'My List', shareWith: ['u2'] } as never,
      'user-1',
      'Jane'
    )
    expect(result.request.content).toMatchObject({
      contentType: 'Collection',
      createdBy: 'user-1',
      creator: 'creator-1',
      name: 'My List',
      primaryCategory: 'Playlist',
      sharedWith: ['u2'],
    })
  })
})

describe('formPlaylistupdateObj', () => {
  it('builds an update request with the new title and version key', () => {
    expect(formPlaylistupdateObj({ playlist_title: 'New Title', versionKey: 'v2' })).toEqual({
      request: { content: { name: 'New Title', versionKey: 'v2' } },
    })
  })
})

describe('formContentRequestObj', () => {
  it('builds a hierarchy request keyed by the response identifier', () => {
    const result = formContentRequestObj({ content_ids: ['c1'] }, { result: { identifier: 'p1' } }, 'user-1')
    expect(result).toEqual({
      request: { data: { hierarchy: { p1: { children: ['c1'], contentType: 'Collection', root: true } }, nodesModified: {} } },
    })
  })
})
