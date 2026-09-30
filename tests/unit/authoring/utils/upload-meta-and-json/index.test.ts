jest.mock('../../../../../src/authoring/utils/upload-meta-and-json/assessment', () => ({ uploadAssessmentData: jest.fn() }))
jest.mock('../../../../../src/authoring/utils/upload-meta-and-json/channel', () => ({ uploadChannelData: jest.fn() }))
jest.mock('../../../../../src/authoring/utils/upload-meta-and-json/class-diagram', () => ({ uploadClassdiagramData: jest.fn() }))
jest.mock('../../../../../src/authoring/utils/upload-meta-and-json/quiz', () => ({ uploadQuizData: jest.fn() }))
jest.mock('../../../../../src/authoring/utils/upload-meta-and-json/unkown', () => ({ uploadUnKownData: jest.fn() }))
jest.mock('../../../../../src/authoring/utils/upload-meta-and-json/web-module', () => ({ uploadWebModuleData: jest.fn() }))

import { uploadAssessmentData } from '../../../../../src/authoring/utils/upload-meta-and-json/assessment'
import { uploadChannelData } from '../../../../../src/authoring/utils/upload-meta-and-json/channel'
import { uploadClassdiagramData } from '../../../../../src/authoring/utils/upload-meta-and-json/class-diagram'
import { uploadJSONData } from '../../../../../src/authoring/utils/upload-meta-and-json/index'
import { uploadQuizData } from '../../../../../src/authoring/utils/upload-meta-and-json/quiz'
import { uploadUnKownData } from '../../../../../src/authoring/utils/upload-meta-and-json/unkown'
import { uploadWebModuleData } from '../../../../../src/authoring/utils/upload-meta-and-json/web-module'

const mocks = {
  assessment: uploadAssessmentData as jest.Mock,
  channel: uploadChannelData as jest.Mock,
  classDiagram: uploadClassdiagramData as jest.Mock,
  quiz: uploadQuizData as jest.Mock,
  unknown: uploadUnKownData as jest.Mock,
  webModule: uploadWebModuleData as jest.Mock,
}

// tslint:disable-next-line: no-any
function buildContent(overrides: any): any {
  return { categoryType: '', mimeType: '', ...overrides }
}

describe('uploadJSONData', () => {
  afterEach(() => jest.clearAllMocks())

  it('routes channel content to uploadChannelData', () => {
    const content = buildContent({ mimeType: 'application/channel' })
    uploadJSONData(content)
    expect(mocks.channel).toHaveBeenCalledWith(content)
  })

  it('routes Quiz content to uploadQuizData', () => {
    const content = buildContent({ categoryType: 'Quiz', mimeType: 'application/quiz' })
    uploadJSONData(content)
    expect(mocks.quiz).toHaveBeenCalledWith(content)
  })

  it('routes Assessment content to uploadAssessmentData', () => {
    const content = buildContent({ categoryType: 'Assessment', mimeType: 'application/quiz' })
    uploadJSONData(content)
    expect(mocks.assessment).toHaveBeenCalledWith(content)
  })

  it('routes web-module content to uploadWebModuleData', () => {
    const content = buildContent({ mimeType: 'application/web-module' })
    uploadJSONData(content)
    expect(mocks.webModule).toHaveBeenCalledWith(content)
  })

  it('routes class-diagram content to uploadClassdiagramData', () => {
    const content = buildContent({ mimeType: 'application/class-diagram' })
    uploadJSONData(content)
    expect(mocks.classDiagram).toHaveBeenCalledWith(content)
  })

  it('routes anything else to uploadUnKownData', () => {
    const content = buildContent({ mimeType: 'application/octet-stream' })
    uploadJSONData(content)
    expect(mocks.unknown).toHaveBeenCalledWith(content)
  })
})
