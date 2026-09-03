import { INsoData } from '../models/navigator.model'
import { filterOnTopics, findRoleVariant, transformNsoData } from './navigator'

// tslint:disable-next-line: no-any
function buildRole(overrides: any = {}) {
  return {
    role_id: 'role-1',
    variants: [],
    ...overrides,
  }
}

describe('transformNsoData', () => {
  it('strips variant_image, variant_description and group from every role variant', () => {
    // tslint:disable-next-line: no-any
    const nsoData: any = {
      roles: [
        {
          role_id: 'role-1',
          variants: [
            { group: 'g1', variant_description: 'desc', variant_id: 'v1', variant_image: 'img.png' },
          ],
        },
      ],
    } as unknown as INsoData

    const result = transformNsoData(nsoData)

    expect(result.roles[0].variants[0]).toEqual({ variant_id: 'v1' })
  })

  it('returns the same nsoData object (mutated in place)', () => {
    // tslint:disable-next-line: no-any
    const nsoData: any = { roles: [] } as unknown as INsoData
    expect(transformNsoData(nsoData)).toBe(nsoData)
  })
})

describe('findRoleVariant', () => {
  const variant = { variant_id: 'v1' }
  const nsoData = [
    { roles: [buildRole({ role_id: 'role-1', variants: [variant] })] },
  ] as unknown as INsoData[]

  it('returns the matching variant when both role and variant exist', () => {
    expect(findRoleVariant(nsoData, 'role-1', 'v1')).toEqual({ error: undefined, roleVariant: variant })
  })

  it('returns a "Variant Id incorrect" error when the role exists but the variant does not', () => {
    expect(findRoleVariant(nsoData, 'role-1', 'missing-variant')).toEqual({
      error: 'Variant Id incorrect',
      roleVariant: undefined,
    })
  })

  it('returns a "Role Id incorrect" error when the role does not exist', () => {
    expect(findRoleVariant(nsoData, 'missing-role', 'v1')).toEqual({
      error: 'Role Id incorrect',
      roleVariant: undefined,
    })
  })

  it('searches across every arm in the nsoData array', () => {
    const otherVariant = { variant_id: 'v2' }
    const multiArmData = [
      { roles: [buildRole({ role_id: 'role-1', variants: [variant] })] },
      { roles: [buildRole({ role_id: 'role-2', variants: [otherVariant] })] },
    ] as unknown as INsoData[]

    expect(findRoleVariant(multiArmData, 'role-2', 'v2')).toEqual({ error: undefined, roleVariant: otherVariant })
  })
})

describe('filterOnTopics', () => {
  // tslint:disable-next-line: no-any
  function buildLp(technology: string[]): any {
    return { profiles: [{ technology }] }
  }

  it('keeps learning paths whose profile technologies intersect the given topics', () => {
    const lps = [buildLp(['java', 'sql']), buildLp(['python'])]
    expect(filterOnTopics(lps, ['sql'])).toEqual([lps[0]])
  })

  it('returns an empty array when nothing matches', () => {
    const lps = [buildLp(['java'])]
    expect(filterOnTopics(lps, ['ruby'])).toEqual([])
  })

  it('aggregates technologies across multiple profiles on the same learning path', () => {
    // tslint:disable-next-line: no-any
    const lp: any = { profiles: [{ technology: ['java'] }, { technology: ['go'] }] }
    expect(filterOnTopics([lp], ['go'])).toEqual([lp])
  })
})
