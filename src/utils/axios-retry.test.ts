jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const mockAxios: any = jest.fn()
  mockAxios.interceptors = {
    response: {
      // tslint:disable-next-line: no-any
      use: jest.fn((_onFulfilled: any, onRejected: any) => {
        mockAxios.__rejectedHandler = onRejected
      }),
    },
  }
  return mockAxios
})

// tslint:disable-next-line: no-var-requires
const mockedAxios = require('axios')
// Importing for its side effect: registers the retry interceptor on the mocked axios above.
import './axios-retry'

function getRejectedHandler() {
  return mockedAxios.__rejectedHandler
}

describe('axios retry interceptor', () => {
  it('registers a response interceptor on import', () => {
    // clearMocks wipes call history between tests, so we assert on the durable
    // side effect (the captured handler) rather than the .use() call record.
    expect(typeof getRejectedHandler()).toBe('function')
  })

  it('rejects immediately for a client error (status < 500)', async () => {
    const err = { config: { retry: 3 }, response: { status: 404 } }
    await expect(getRejectedHandler()(err)).rejects.toBe(err)
    expect(mockedAxios).not.toHaveBeenCalled()
  })

  it('rejects immediately when the config has no retry option set', async () => {
    const err = { config: {}, response: { status: 500 } }
    await expect(getRejectedHandler()(err)).rejects.toBe(err)
  })

  it('rejects immediately when there is no config at all', async () => {
    const err = { response: { status: 500 } }
    await expect(getRejectedHandler()(err)).rejects.toBe(err)
  })

  it('sets err.code to 404 once the retry budget is exhausted', async () => {
    // tslint:disable-next-line: no-any
    const err: any = { config: { __retryCount: 2, retry: 2 }, response: { status: 500 } }
    await expect(getRejectedHandler()(err)).rejects.toBe(err)
    expect(err.code).toBe('404')
  })

  it('retries the request via axios(config) when under the retry budget', async () => {
    mockedAxios.mockResolvedValueOnce({ data: 'ok' })
    // tslint:disable-next-line: no-any
    const err: any = { config: { retry: 3, retryDelay: 0 }, response: { status: 500 } }
    await expect(getRejectedHandler()(err)).resolves.toEqual({ data: 'ok' })
    expect(err.config.__retryCount).toBe(1)
    expect(mockedAxios).toHaveBeenCalledWith(err.config)
  })

  it('increments __retryCount on each successive retry', async () => {
    mockedAxios.mockResolvedValueOnce({ data: 'ok' })
    // tslint:disable-next-line: no-any
    const err: any = { config: { __retryCount: 1, retry: 3, retryDelay: 0 }, response: { status: 502 } }
    await getRejectedHandler()(err)
    expect(err.config.__retryCount).toBe(2)
  })
})
