jest.mock('../S3/upload', () => ({ uploadToS3: jest.fn() }))

import { uploadToS3 } from '../S3/upload'
import { uploadWebModuleData } from './web-module'

const mockedUploadToS3 = uploadToS3 as jest.Mock

describe('uploadWebModuleData', () => {
  it('uploads every module file, using the json subResult as the top-level artifact', async () => {
    // artifactUrl must literally end in "json" — that's how uploadWebModuleData decides
    // which uploaded file becomes the top-level artifact.
    mockedUploadToS3.mockImplementation((_content, _path, name) => {
      return Promise.resolve({ artifactUrl: `https://cdn/${name}`, downloadUrl: `https://cdn/download/${name}`, error: null })
    })

    const result = await uploadWebModuleData({
      data: [
        { content: '<html></html>', name: 'index.html' },
        { content: '{}', name: 'meta.json' },
      ],
      path: 'do_1',
    } as never)

    expect(result.artifactUrl).toBe('https://cdn/meta.json')
    expect(result.downloadUrl).toBe('https://cdn/download/meta.json')
    expect(result.subResult).toHaveLength(2)
    expect(mockedUploadToS3).toHaveBeenCalledWith('<html></html>', 'do_1/assets', 'index.html')
    expect(mockedUploadToS3).toHaveBeenCalledWith('{}', 'do_1', 'meta.json')
  })

  it('leaves artifactUrl/downloadUrl null when no json file is present', async () => {
    mockedUploadToS3.mockResolvedValue({ artifactUrl: 'index.html-url', downloadUrl: 'index.html-download', error: null })

    const result = await uploadWebModuleData({
      data: [{ content: '<html></html>', name: 'index.html' }],
      path: 'do_1',
    } as never)

    expect(result.artifactUrl).toBeNull()
    expect(result.downloadUrl).toBeNull()
  })
})
