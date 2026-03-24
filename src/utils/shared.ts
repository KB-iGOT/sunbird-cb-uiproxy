import express from 'express'
import { CONSTANTS } from './env'

// Body parsing middleware - import only on scope
export const jsonParser = express.json({ limit: CONSTANTS.REQ_MAX_BODY_SIZE })
export const urlEncodedParser = express.urlencoded({ limit: CONSTANTS.REQ_MAX_BODY_SIZE, extended: false })