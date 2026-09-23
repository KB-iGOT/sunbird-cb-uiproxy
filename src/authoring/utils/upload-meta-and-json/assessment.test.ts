jest.mock('../S3/upload', () => ({ uploadToS3: jest.fn() }))

import { uploadToS3 } from '../S3/upload'
import { uploadAssessmentData } from './assessment'

const mockedUploadToS3 = uploadToS3 as jest.Mock

function buildQuiz() {
  return {
    questions: [
      { options: [{ isCorrect: true, text: 'a' }], questionType: 'mcq-sca' },
      { options: [{ isCorrect: true, text: 'right' }, { isCorrect: false, text: 'wrong' }], questionType: 'fitb' },
      { options: [{ isCorrect: true, match: 'm1' }, { isCorrect: false, match: 'm2' }], questionType: 'mtf' },
      { options: [{ isCorrect: true, text: 'kept' }], questionType: 'subjective' },
    ],
  }
}

describe('uploadAssessmentData', () => {
  it('uploads the raw key and the stripped question set, returning the question upload on success', async () => {
    mockedUploadToS3
      .mockResolvedValueOnce({ artifactUrl: 'key-url', downloadUrl: 'key-download', error: null })
      .mockResolvedValueOnce({ artifactUrl: 'question-url', downloadUrl: 'question-download', error: null })

    const data = buildQuiz()
    const result = await uploadAssessmentData({ data, path: 'do_1' } as never)

    expect(result).toEqual({ artifactUrl: 'question-url', downloadUrl: 'question-download', error: null })
    expect(mockedUploadToS3).toHaveBeenNthCalledWith(1, data, 'do_1', 'assessment-key.json')

    const stripped = mockedUploadToS3.mock.calls[1][0]
    expect(stripped.questions[0].options[0].isCorrect).toBe(false)
    expect(stripped.questions[1].options[0]).toEqual({ isCorrect: false, text: '' })
    expect(stripped.questions[2].options.every((o: { isCorrect: boolean }) => o.isCorrect === false)).toBe(true)
    // subjective questions are left untouched
    expect(stripped.questions[3].options[0].isCorrect).toBe(true)
    // original input must not be mutated
    expect(data.questions[0].options[0].isCorrect).toBe(true)
  })

  it('returns an error when either upload fails', async () => {
    mockedUploadToS3
      .mockResolvedValueOnce({ artifactUrl: 'key-url', downloadUrl: 'key-download', error: null })
      .mockResolvedValueOnce({ artifactUrl: null, downloadUrl: null, error: 'question upload failed' })

    const result = await uploadAssessmentData({ data: buildQuiz(), path: 'do_1' } as never)

    expect(result).toEqual({ artifactUrl: null, downloadUrl: null, error: 'question upload failed' })
  })
})
