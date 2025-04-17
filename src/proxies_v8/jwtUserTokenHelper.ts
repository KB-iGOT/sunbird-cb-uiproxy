import express from 'express'
import { logError } from '../utils/logger'
import { extractUserToken } from '../utils/requestExtract'

export const jwtUserTokenHelper = express.Router()

jwtUserTokenHelper.use('/*', async (req, res) => {
    try {
        const userToken = extractUserToken(req)

        res.status(200).json({
            'x-authenticated-user-token': userToken,
        })
    } catch (error) {
        logError('Error in jwtUserTokenHelper', error)
        res.status(500).send({ error: 'Failed to extract user token' })
    }
})
