import { Response } from 'express'

// Wraps a non-Error rejection/throw value in an Error, leaving real Errors (e.g. AxiosError) untouched
export function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value))
}

// Forwards an upstream (axios) error's status and body, or 500 with the given fallback body
// tslint:disable-next-line: no-any
export function sendUpstreamError(res: Response, err: any, fallback: unknown = {}) {
    res.status((err && err.response && err.response.status) || 500)
        .send((err && err.response && err.response.data) || fallback)
}
