import { decoder } from './decode'

function encode(data: unknown): string {
  const json = JSON.stringify(data)
  const uint16 = new Uint16Array(json.length)
  for (let i = 0; i < json.length; i++) {
    uint16[i] = json.charCodeAt(i)
  }
  const bytes = new Uint8Array(uint16.buffer)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return Buffer.from(binary, 'binary').toString('base64')
}

describe('decoder', () => {
  it('decodes a base64-encoded UTF-16 JSON payload back into an object', () => {
    const payload = { foo: 'bar', num: 42 }
    expect(decoder(encode(payload))).toEqual(payload)
  })

  it('decodes an array payload', () => {
    const payload = [1, 2, 3]
    expect(decoder(encode(payload))).toEqual(payload)
  })
})
