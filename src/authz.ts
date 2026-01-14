import axios from 'axios'
import { Request, Response, Router } from 'express'
import { CONSTANTS } from './utils/env'
import { extractUserIdFromRequest, IAuthorizedRequest } from './utils/requestExtract'

export const authzApi = Router()

interface IUser {
    id: string
}

// Helper: validateKeycloak
export function validateKeycloak(cookie: string | undefined): IUser | null {
    if (!cookie) {
        return null
    }
    if (cookie.includes('access_token')) {
        return { id: 'user-123' } // verified user
    }
    return null
}

// Helper: extractPartner
export function extractPartner(originalUri: string | string[] | undefined): string | null {
    if (!originalUri) {
        return null
    }
    const uri = Array.isArray(originalUri) ? originalUri[0] : originalUri
    const match = uri.match(/\/partner\/([^\/]+)/)
    return match ? match[1] : null
}

// Helper: extractCourseName
export function extractCourseId(originalUri: string | string[] | undefined): string | null {
    if (!originalUri) {
        return null
    }
    const uri = Array.isArray(originalUri) ? originalUri[0] : originalUri
    // Assuming course structure in URI, e.g., /course/course-name/
    const match = uri.match(/\/course\/([^\/]+)/)
    return match ? match[1] : null
}

// Service: allocationService
export const allocationService = {
    async isEnrolledToCourse(userId: string, partner: string | null, courseName: string | null, token: string): Promise<boolean> {
        if (!userId || !partner || !courseName) {
            return false
        }
        try {
            const response = await this.readByUserIdCourseId(userId, courseName, token)
            return !!response
        } catch (e) {
            return false
        }
    },
    async readByUserIdCourseId(userId: string, courseId: string, token: string): Promise<any> {
        try {
            const response = await axios.get(
                `${CONSTANTS.KONG_API_BASE}/proxies/v8/cios-enroll/v1/readby/useridcourseid/${courseId}`,
                {
                    headers: {
                        'x-authenticated-user-token': token,
                        'x-authenticated-userid': userId,
                    },
                }
            )
            return response.data
        } catch (error) {
            console.error('Error in readByUserIdCourseId:', error)
            return null
        }
    }
}

authzApi.get('/', async (req: Request, res: Response) => {
    try {
        const user = validateKeycloak(req.headers.cookie)
        if (!user) {
            res.sendStatus(401)
            return
        }

        const userId = extractUserIdFromRequest(req as IAuthorizedRequest) || user.id;
        const courseId = extractCourseId(req.headers['x-original-uri'])
        const partner = extractPartner(req.headers['x-original-uri'])

        const token = req.headers['x-authenticated-user-token'] as string
        const allowed = await allocationService.isEnrolledToCourse(userId, partner, courseId, token)
        if (!allowed) {
            res.sendStatus(403)
            return
        }

        res.sendStatus(200)
    } catch (err) {
        console.error('Error in /authz:', err)
        res.sendStatus(500)
    }
})
