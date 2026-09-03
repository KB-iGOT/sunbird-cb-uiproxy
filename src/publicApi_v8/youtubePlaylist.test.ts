jest.mock('axios', () => jest.fn())

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { youtubePlaylist } from './youtubePlaylist'

const mockedAxios = axios as unknown as jest.Mock

function buildApp() {
  const app = express()
  app.use(youtubePlaylist)
  return app
}

describe('youtubePlaylist', () => {
  it('returns a data map keyed by each configured playlist name', async () => {
    mockedAxios.mockResolvedValue({ data: { items: [{ id: '1' }] } })
    const res = await supertest(buildApp()).get('/landingpage')

    expect(res.status).toBe(200)
    const names = CONSTANTS.YOUTUBE_PLAYLIST_NAMES.split(',')
    names.forEach((name: string) => {
      expect(res.body[name]).toEqual({ items: [{ id: '1' }] })
    })
    expect(mockedAxios).toHaveBeenCalledTimes(names.length)
  })

  it('sets an empty object for a playlist whose request fails, without failing the whole response', async () => {
    mockedAxios.mockRejectedValue(new Error('upstream down'))
    const res = await supertest(buildApp()).get('/landingpage')

    expect(res.status).toBe(200)
    const names = CONSTANTS.YOUTUBE_PLAYLIST_NAMES.split(',')
    names.forEach((name: string) => {
      expect(res.body[name]).toEqual({})
    })
  })

  it('sets an empty object when the upstream responds without data', async () => {
    mockedAxios.mockResolvedValue({ data: undefined })
    const res = await supertest(buildApp()).get('/landingpage')
    const [firstName] = CONSTANTS.YOUTUBE_PLAYLIST_NAMES.split(',')
    expect(res.body[firstName]).toEqual({})
  })

  it('honors a maxResults query param in the constructed upstream url', async () => {
    mockedAxios.mockResolvedValue({ data: {} })
    await supertest(buildApp()).get('/landingpage?maxResults=5')
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('&maxResults=5') }))
  })
})
