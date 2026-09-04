import { ERROR } from './error'

describe('ERROR constant', () => {
  it('exposes the general error message', () => {
    expect(ERROR.GENERAL).toBe('Some error occurred')
  })
})
