import { returnData } from './dataAlterer'

describe('returnData', () => {
  it('returns false when the data object is empty', () => {
    expect(returnData({})).toBe(false)
  })

  describe('flat level (default)', () => {
    it('renames Collection to CourseUnit under the master object key', () => {
      const data = {
        request: {
          content: { contentType: 'Collection', name: 'unit-1' },
        },
      }
      const result = returnData(data, 'request')
      expect(result.request.content.contentType).toBe('CourseUnit')
    })

    it('renames CourseUnit back to Collection', () => {
      const data = {
        request: {
          content: { contentType: 'CourseUnit', name: 'unit-1' },
        },
      }
      const result = returnData(data, 'request')
      expect(result.request.content.contentType).toBe('Collection')
    })

    it('leaves other content types untouched', () => {
      const data = {
        request: {
          content: { contentType: 'Resource', name: 'res-1' },
        },
      }
      const result = returnData(data, 'request')
      expect(result.request.content.contentType).toBe('Resource')
    })

    it('returns false when the master object value is null', () => {
      const result = returnData({ request: null }, 'request')
      expect(result.request).toBe(false)
    })
  })

  describe('hierarchy level', () => {
    it('rewrites the contentType inside a request.data.hierarchy map', () => {
      const data = {
        request: {
          data: {
            hierarchy: {
              node1: { contentType: 'Collection' },
            },
          },
        },
      }
      const result = returnData(data, null, 'hierarchy')
      expect(result.request.data.hierarchy.node1.contentType).toBe('CourseUnit')
    })

    it('rewrites contentType on successful result children', () => {
      const data = {
        params: { status: 'successful' },
        result: {
          content: {
            children: [{ contentType: 'CourseUnit' }, { contentType: 'Resource' }],
          },
        },
      }
      const result = returnData(data, null, 'hierarchy')
      expect(result.result.content.children[0].contentType).toBe('Collection')
      expect(result.result.content.children[1].contentType).toBe('Resource')
    })

    it('passes through unchanged when status is not successful', () => {
      const data = { params: { status: 'failed' }, result: {} }
      const result = returnData(data, null, 'hierarchy')
      expect(result).toBe(data)
    })
  })
})
