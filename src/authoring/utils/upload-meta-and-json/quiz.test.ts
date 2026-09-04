jest.mock('../S3/upload', () => ({ uploadToS3: jest.fn() }))

import { uploadToS3 } from '../S3/upload'
import { uploadQuizData } from './quiz'

const mockedUploadToS3 = uploadToS3 as jest.Mock

describe('uploadQuizData', () => {
  it('uploads the quiz data as quiz.json', async () => {
    mockedUploadToS3.mockResolvedValue({ artifactUrl: 'a', downloadUrl: 'd', error: null })
    const result = await uploadQuizData({ data: { questions: [] }, path: 'do_1' } as never)
    expect(result).toEqual({ artifactUrl: 'a', downloadUrl: 'd', error: null })
    expect(mockedUploadToS3).toHaveBeenCalledWith({ questions: [] }, 'do_1', 'quiz.json')
  })
})
