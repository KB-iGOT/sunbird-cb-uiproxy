jest.mock('../S3/upload', () => ({ uploadToS3: jest.fn() }))

import { uploadToS3 } from '../S3/upload'
import { uploadClassdiagramData } from './class-diagram'

const mockedUploadToS3 = uploadToS3 as jest.Mock

function buildClassDiagram() {
  return {
    options: {
      classes: [{ access: 'public', belongsTo: 'x', type: 'y' }],
      relations: [{ from: 'a', to: 'b' }],
    },
  }
}

describe('uploadClassdiagramData', () => {
  it('uploads both the keyed and stripped versions, returning the stripped result on success', async () => {
    mockedUploadToS3
      .mockResolvedValueOnce({ artifactUrl: 'key-url', downloadUrl: 'key-download', error: null })
      .mockResolvedValueOnce({ artifactUrl: 'clean-url', downloadUrl: 'clean-download', error: null })

    const data = buildClassDiagram()
    const result = await uploadClassdiagramData({ data, path: 'do_1' } as never)

    expect(result).toEqual({ artifactUrl: 'clean-url', downloadUrl: 'clean-download', error: null })
    expect(mockedUploadToS3).toHaveBeenNthCalledWith(1, data, 'do_1', 'class-diagram-key.json')

    const strippedArg = mockedUploadToS3.mock.calls[1][0]
    expect(strippedArg.options.classes[0]).toEqual({ access: '', belongsTo: '', type: '' })
    expect(strippedArg.options.relations).toEqual([])
    // the original input object must not be mutated
    expect(data.options.classes[0].belongsTo).toBe('x')
  })

  it('returns an error when either upload fails', async () => {
    mockedUploadToS3
      .mockResolvedValueOnce({ artifactUrl: null, downloadUrl: null, error: 'key upload failed' })
      .mockResolvedValueOnce({ artifactUrl: 'clean-url', downloadUrl: 'clean-download', error: null })

    const result = await uploadClassdiagramData({ data: buildClassDiagram(), path: 'do_1' } as never)

    expect(result).toEqual({ artifactUrl: null, downloadUrl: null, error: 'key upload failed' })
  })
})
