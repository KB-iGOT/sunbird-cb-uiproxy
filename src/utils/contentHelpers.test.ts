import { IContent } from '../models/content.model'
import {
  appendProxiesUrl,
  appendUrl,
  getMinimalContent,
  processContent,
  processDisplayContentType,
  processDownloadUrl,
  processUrl,
  shuffleContent,
} from './contentHelpers'

function buildContent(overrides: Partial<IContent> = {}): IContent {
  return {
    appIcon: 'http://private-cdn.example.com/icon.png',
    artifactUrl: 'http://private-cdn.example.com/artifact.pdf',
    children: [],
    complexityLevel: 'easy',
    contentType: 'Course',
    downloadUrl: 'http://private-cdn.example.com/download.zip',
    identifier: 'do_123',
    isExternal: 'Yes',
    name: 'Sample Course',
    ...overrides,
    // tslint:disable-next-line: no-any
  } as any
}

describe('processUrl', () => {
  it('rewrites a private-cdn prefixed url to the proxied path', () => {
    expect(processUrl('http://private-cdn123.example.com/foo/bar.png')).toBe('/apis/proxies/v8/foo/bar.png')
  })

  it('leaves urls without the private prefix untouched', () => {
    expect(processUrl('https://cdn.example.com/foo.png')).toBe('https://cdn.example.com/foo.png')
  })

  it('returns an empty string for null/undefined input', () => {
    expect(processUrl(null)).toBe('')
    expect(processUrl(undefined)).toBe('')
  })
})

describe('appendUrl / appendProxiesUrl', () => {
  it('prefixes with /apis/proxies/v8', () => {
    expect(appendUrl('/foo')).toBe('/apis/proxies/v8/foo')
  })

  it('builds the navigator images proxy path', () => {
    expect(appendProxiesUrl('logo.png')).toBe('/apis/proxies/v8/web-hosted/navigator/images/logo.png')
  })
})

describe('processDisplayContentType', () => {
  it('prefers resourceType when present', () => {
    expect(processDisplayContentType('Course', 'Video')).toBe('Video')
  })

  it('falls back to contentType when resourceType is absent', () => {
    expect(processDisplayContentType('Course')).toBe('Course')
  })
})

describe('processDownloadUrl', () => {
  it('rewrites private-cdn urls the same way as processUrl', () => {
    expect(processDownloadUrl('http://private-abc.example.com/f.zip')).toBe('/apis/proxies/v8/f.zip')
  })
})

describe('processContent', () => {
  it('returns falsy input unchanged', () => {
    // tslint:disable-next-line: no-any
    expect(processContent(null as any)).toBeNull()
  })

  it('rewrites nested urls and derives displayContentType', () => {
    const content = buildContent({ resourceType: 'Video' } as Partial<IContent>)
    const result = processContent(content)
    expect(result.appIcon).toBe('/apis/proxies/v8/icon.png')
    expect(result.artifactUrl).toBe('/apis/proxies/v8/artifact.pdf')
    expect(result.downloadUrl).toBe('/apis/proxies/v8/download.zip')
    expect(result.displayContentType).toBe('Video')
    expect(result.isExternal).toBe(true)
  })

  it('recurses into children', () => {
    const child = buildContent({ identifier: 'child_1' })
    const parent = buildContent({ children: [child] })
    const result = processContent(parent)
    expect(result.children).toHaveLength(1)
    expect(result.children[0].identifier).toBe('child_1')
  })

  it('defaults children to an empty array when not an array', () => {
    // tslint:disable-next-line: no-any
    const content = buildContent({ children: undefined as any })
    expect(processContent(content).children).toEqual([])
  })
})

describe('getMinimalContent', () => {
  it('picks a minimal projection of the content fields', () => {
    const content = buildContent({ resourceType: 'Video', description: 'desc' } as Partial<IContent>)
    const minimal = getMinimalContent(content)
    expect(minimal).toMatchObject({
      appIcon: '/apis/proxies/v8/icon.png',
      complexityLevel: 'easy',
      contentType: 'Course',
      displayContentType: 'Video',
      identifier: 'do_123',
      name: 'Sample Course',
    })
  })
})

describe('shuffleContent', () => {
  it('returns an array with the same elements (possibly reordered)', () => {
    const items = [buildContent({ identifier: 'a' }), buildContent({ identifier: 'b' }), buildContent({ identifier: 'c' })]
    const shuffled = shuffleContent([...items])
    expect(shuffled).toHaveLength(3)
    expect(shuffled.map((c) => c.identifier).sort()).toEqual(['a', 'b', 'c'])
  })

  it('handles an empty array', () => {
    expect(shuffleContent([])).toEqual([])
  })
})
