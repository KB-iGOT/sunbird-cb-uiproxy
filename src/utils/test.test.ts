import { test } from './test'

describe('test constant', () => {
  it('exposes the expected static keys', () => {
    expect(test).toEqual({ key: 'a', key1: 'b', key2: 'c' })
  })
})
