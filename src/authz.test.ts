import { allocationService, extractCourseId, extractPartner, validateKeycloak } from './authz'

const pass = (msg: string) => console.log(`✅ PASS: ${msg}`)
const fail = (msg: string, err?: any) => {
    console.error(`❌ FAIL: ${msg}`)
    if (err) console.error(err)
    throw new Error('Test failed')
}

async function runTests() {
    console.log('Starting Authz Tests...')

    // 1. Test validateKeycloak
    try {
        const noCookie = validateKeycloak(undefined)
        if (noCookie !== null) fail('validateKeycloak should return null for undefined cookie')
        else pass('validateKeycloak(undefined)')

        const invalidCookie = validateKeycloak('some=cookie')
        if (invalidCookie !== null) fail('validateKeycloak should return null for invalid cookie')
        else pass('validateKeycloak(invalid)')

        const validCookie = validateKeycloak('access_token=123')
        if (validCookie === null || validCookie.id !== 'user-123') fail('validateKeycloak should return user for valid cookie')
        else pass('validateKeycloak(valid)')
    } catch (e) { fail('validateKeycloak threw error', e) }

    // 2. Test extractPartner
    try {
        const noHeader = extractPartner(undefined)
        if (noHeader !== null) fail('extractPartner should return null for undefined header')
        else pass('extractPartner(undefined)')

        const plainUrl = extractPartner('/some/path')
        if (plainUrl !== null) fail('extractPartner should return null if no partner found')
        else pass('extractPartner(no partner)')

        const partnerUrl = extractPartner('/partner/my-partner/action')
        if (partnerUrl !== 'my-partner') fail(`extractPartner should extract "my-partner", got "${partnerUrl}"`)
        else pass('extractPartner(valid)')
    } catch (e) { fail('extractPartner threw error', e) }

    // 3. Test extractCourseId
    try {
        const noHeader = extractCourseId(undefined)
        if (noHeader !== null) fail('extractCourseId should return null for undefined header')
        else pass('extractCourseId(undefined)')

        const plainUrl = extractCourseId('/some/path')
        if (plainUrl !== null) fail('extractCourseId should return null if no course found')
        else pass('extractCourseId(no course)')

        const courseUrl = extractCourseId('/course/my-course-id/action')
        if (courseUrl !== 'my-course-id') fail(`extractCourseId should extract "my-course-id", got "${courseUrl}"`)
        else pass('extractCourseId(valid)')
    } catch (e) { fail('extractCourseId threw error', e) }

    // 4. Test allocationService
    try {
        // Mock readByUserIdCourseId
        allocationService.readByUserIdCourseId = async () => ({ some: 'data' })

        const allowed = await allocationService.isEnrolledToCourse('u1', 'p1', 'c1', 'token')
        if (allowed !== true) fail('allocationService should return true (mock)')
        else pass('allocationService(mock)')

        // Test with missing params
        const notAllowed1 = await allocationService.isEnrolledToCourse('', 'p1', 'c1', 'token')
        if (notAllowed1 !== false) fail('allocationService should fail if no user')
        else pass('allocationService(missing user)')
    } catch (e) { fail('allocationService threw error', e) }

    console.log('All tests passed!')
}

runTests().catch((e) => {
    console.error(e)
    process.exit(1)
})
