import {
  formContentRequestObj,
  formGoalRequestObj,
  formPlaylistupdateObj,
  transformGoalUpsertRequest,
  transformGoalUpsertResponse,
  transformResourceProgress,
  transformToCommonGoal,
  transformToCommonGoalGroup,
  transformToGoalForOthers,
  transformToSbExtPatchRequest,
  transformToTrackStatus,
  transformToUserGoals,
} from './goals'

describe('transformToGoalForOthers', () => {
  it('maps a v1 sb-ext goal to the app-level shape', () => {
    const goal = transformToGoalForOthers({
      content_data: [{ contentType: 'Course', resourceType: 'Video' }],
      goal_content_id: ['c1'],
      goal_desc: 'desc',
      goal_duration: 10,
      goal_end_date: '2024-02-01',
      goal_id: 'g1',
      goal_start_date: '2024-01-01',
      goal_title: 'My Goal',
      goal_type: 'user',
      goalProgess: 50,
      recipient_list: ['u2'],
      resource_progress: [],
      shared_by: 'u1',
      shared_on: '2024-01-05',
      user: 'u1',
    } as never)

    expect(goal.id).toBe('g1')
    expect(goal.name).toBe('My Goal')
    expect(goal.goalFor).toBe('me')
    expect(goal.isShared).toBe(false)
    expect(goal.contents[0].displayContentType).toBe('Video')
  })

  it('marks common_shared/custom_shared goal types as shared and "others"', () => {
    const goal = transformToGoalForOthers({
      goal_content_details: [],
      goal_content_id: [],
      goal_type: 'common_shared',
      resource_progress: [],
    } as never)
    expect(goal.isShared).toBe(true)
    expect(goal.goalFor).toBe('others')
  })
})

describe('transformToCommonGoal', () => {
  it('maps a v2 sb-ext goal to the app-level shape', () => {
    const goal = transformToCommonGoal({
      createdForOthers: 1,
      createdForSelf: 2,
      goalContentId: ['c1'],
      goalDescription: 'desc',
      goalTitle: 'My Goal',
      id: 'g1',
      resources: [],
    } as never)
    expect(goal).toMatchObject({
      duration: 0,
      goalFor: 'me',
      id: 'g1',
      isShared: false,
      name: 'My Goal',
      type: 'common',
    })
  })
})

describe('transformToCommonGoalGroup', () => {
  it('maps each goal in the group', () => {
    const group = transformToCommonGoalGroup({
      goals: [{ goalContentId: [], goalTitle: 'g1', id: 'g1', resources: [] }],
      group_id: 'grp1',
      group_name: 'My Group',
    } as never)
    expect(group.id).toBe('grp1')
    expect(group.goals).toHaveLength(1)
    expect(group.goals[0].name).toBe('g1')
  })
})

describe('transformToUserGoals', () => {
  it('maps completed and in-progress goal lists', () => {
    const result = transformToUserGoals({
      completed_goals: [{ goal_content_id: [], goal_type: 'user', resource_progress: [] }],
      goals_in_progress: [],
    } as never)
    expect(result.completedGoals).toHaveLength(1)
    expect(result.goalsInProgress).toEqual([])
  })
})

describe('transformGoalUpsertRequest', () => {
  it('maps the app-level upsert request to the sb-ext shape', () => {
    expect(
      transformGoalUpsertRequest({
        contentIds: ['c1'], description: 'd', duration: 5, id: 'g1', name: 'n', type: 'user',
      } as never)
    ).toEqual({
      goal_content_id: ['c1'], goal_desc: 'd', goal_duration: 5, goal_id: 'g1', goal_title: 'n', goal_type: 'user',
    })
  })
})

describe('transformGoalUpsertResponse', () => {
  it('maps a known error code to its message', () => {
    const result = transformGoalUpsertResponse({ errors: [{ code: 'Goal already exists' }] } as never)
    expect(result.error).toBe('ERROR_GOAL_EXISTS')
  })

  it('falls back to the raw error code when unmapped', () => {
    const result = transformGoalUpsertResponse({ errors: [{ code: 'SOME_UNKNOWN_CODE' }] } as never)
    expect(result.error).toBe('SOME_UNKNOWN_CODE')
  })

  it('returns an empty object when there are no errors', () => {
    expect(transformGoalUpsertResponse({ errors: [] } as never)).toEqual({})
  })
})

describe('transformResourceProgress', () => {
  it('maps a resource progress entry', () => {
    const result = transformResourceProgress({
      content_type: 'Course',
      mime_type: 'video/mp4',
      resource_duration: 100,
      resource_id: 'r1',
      resource_name: 'Res 1',
      resource_progress: 50,
      resourceType: 'Video',
      time_left: 50,
    } as never)
    expect(result).toEqual({
      contentType: 'Course',
      displayContentType: 'Video',
      duration: 100,
      id: 'r1',
      mimeType: 'video/mp4',
      name: 'Res 1',
      progress: 50,
      timeLeft: 50,
    })
  })
})

describe('transformToTrackStatus', () => {
  it('maps accepted/pending/rejected lists, defaulting missing lists to empty arrays', () => {
    const result = transformToTrackStatus({
      accepted: [
        {
          goal_end_date: 'd',
          goal_progress: 1,
          goal_start_date: 's',
          last_updated_on: 'l',
          resource_progress_tracker: [],
          shared_with: ['u1'],
          status: 'accepted',
        },
      ],
    } as never)
    expect(result.accepted).toHaveLength(1)
    expect(result.pending).toEqual([])
    expect(result.rejected).toEqual([])
  })
})

describe('formPlaylistupdateObj', () => {
  it('builds an update request with the new name and version key', () => {
    expect(formPlaylistupdateObj({ name: 'New', versionKey: 'v2' })).toEqual({
      request: { content: { name: 'New', versionKey: 'v2' } },
    })
  })
})

describe('transformToSbExtPatchRequest', () => {
  it('builds a hierarchy patch request keyed by goalId', () => {
    expect(transformToSbExtPatchRequest({ contentIds: ['c1'] }, 'g1')).toEqual({
      request: { data: { hierarchy: { g1: { children: ['c1'], contentType: 'Collection', root: true } }, nodesModified: {} } },
    })
  })
})

describe('formGoalRequestObj', () => {
  it('builds a create-content request for a new goal', () => {
    const result = formGoalRequestObj({ createdBy: 'creator-1', description: 'd', name: 'My Goal' }, 'user-1')
    expect(result.request.content).toMatchObject({
      contentType: 'Collection', createdBy: 'user-1', creator: 'creator-1', name: 'My Goal', primaryCategory: 'Goals',
    })
  })
})

describe('formContentRequestObj', () => {
  it('builds a hierarchy request keyed by the response identifier', () => {
    const result = formContentRequestObj({ contentIds: ['c1'] }, { result: { identifier: 'g1' } }, 'user-1')
    expect(result).toEqual({
      request: { data: { hierarchy: { g1: { children: ['c1'], contentType: 'Collection', root: true } }, nodesModified: {} } },
    })
  })
})
