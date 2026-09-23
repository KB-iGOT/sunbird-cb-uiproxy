jest.mock('axios', () => jest.fn())

import axios from 'axios'
import { request } from './request-adapter'

const mockedAxios = axios as unknown as jest.Mock

function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('request.get', () => {
  it('calls axios with a GET method and the given url', async () => {
    mockedAxios.mockResolvedValue({ data: { ok: true }, headers: {}, status: 200 })
    const cb = jest.fn()
    request.get('https://example.com/foo', cb)
    await flush()
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: 'https://example.com/foo' }))
  })

  it('invokes the callback with (err, response, body) on success, stringifying object bodies by default', async () => {
    mockedAxios.mockResolvedValue({ data: { ok: true }, headers: { 'x-test': '1' }, status: 200 })
    const cb = jest.fn()
    request.get('https://example.com/foo', cb)
    await flush()
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ body: { ok: true }, headers: { 'x-test': '1' }, statusCode: 200 }),
      JSON.stringify({ ok: true })
    )
  })

  it('accepts an options object with url and headers', async () => {
    mockedAxios.mockResolvedValue({ data: {}, headers: {}, status: 200 })
    request.get({ headers: { Authorization: 'token' }, url: 'https://example.com/bar' }, jest.fn())
    await flush()
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'token' }),
        url: 'https://example.com/bar',
      })
    )
  })

  it('invokes the callback with the error when the request fails', async () => {
    const err = new Error('network down')
    mockedAxios.mockRejectedValue(err)
    const cb = jest.fn()
    request.get('https://example.com/foo', cb)
    await flush()
    expect(cb).toHaveBeenCalledWith(err, null, null)
  })

  it('logs instead of throwing when there is no callback and the request fails', async () => {
    mockedAxios.mockRejectedValue(new Error('network down'))
    expect(() => request.get('https://example.com/foo')).not.toThrow()
    await flush()
  })
})

describe('request.post', () => {
  it('form-encodes the body and sets the content-type header', async () => {
    mockedAxios.mockResolvedValue({ data: 'OK', headers: {}, status: 200 })
    request.post({ form: { a: '1', b: '2' }, url: 'https://example.com/form' }, jest.fn())
    await flush()
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'a=1&b=2',
        headers: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }),
        method: 'POST',
      })
    )
  })

  it('sends a JSON body and returns the parsed object as-is (json mode)', async () => {
    mockedAxios.mockResolvedValue({ data: { created: true }, headers: {}, status: 201 })
    const cb = jest.fn()
    request.post('https://example.com/json', { json: { name: 'x' } }, cb)
    await flush()
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'x' },
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    )
    expect(cb).toHaveBeenCalledWith(null, expect.objectContaining({ statusCode: 201 }), { created: true })
  })

  it('supports json:true with a separate body field', async () => {
    mockedAxios.mockResolvedValue({ data: {}, headers: {}, status: 200 })
    request.post('https://example.com/json', { body: { name: 'y' }, json: true }, jest.fn())
    await flush()
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'y' },
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    )
  })
})

describe('.pipe() support', () => {
  it('streams the response into the destination on success', async () => {
    const dataStream = { pipe: jest.fn() }
    mockedAxios.mockResolvedValue({ data: dataStream })
    const destination = { status: jest.fn(), write: jest.fn() }

    const result = request.get('https://example.com/stream')
    result.pipe(destination)
    await flush()

    expect(mockedAxios).toHaveBeenLastCalledWith(expect.objectContaining({ responseType: 'stream' }))
    expect(dataStream.pipe).toHaveBeenCalledWith(destination)
  })

  it('responds 502 on the destination when the streaming request fails', async () => {
    mockedAxios.mockRejectedValue(new Error('upstream unavailable'))
    const destination = { send: jest.fn(), status: jest.fn().mockReturnThis() }

    const result = request.get('https://example.com/stream')
    result.pipe(destination)
    await flush()
    await flush()

    expect(destination.status).toHaveBeenCalledWith(502)
    expect(destination.send).toHaveBeenCalledWith({ error: 'Upstream request failed' })
  })
})
