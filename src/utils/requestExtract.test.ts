import { extractUserIdFromRequest, extractUserNameFromRequest, extractUserEmailFromRequest, extractRootOrgFromRequest, IAuthorizedRequest } from './requestExtract';

describe('requestExtract utils', () => {
    const mockRequest = {
        header: jest.fn(),
        kauth: {
            grant: {
                access_token: {
                    token: 'mock-token',
                    content: {
                        sub: 'f:keycloak:user-123',
                        name: 'Test User',
                        email: 'test@example.com',
                        preferred_username: 'testuser',
                        session_state: 'active',
                        given_name: 'Test',
                        family_name: 'User'
                    }
                }
            }
        }
    } as unknown as IAuthorizedRequest;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('extractUserIdFromRequest', () => {
        it('should return wid from header if present', () => {
            (mockRequest.header as jest.Mock).mockReturnValue('wid-123');
            expect(extractUserIdFromRequest(mockRequest)).toBe('wid-123');
        });

        it('should return sub from keycloak token if wid is missing', () => {
            (mockRequest.header as jest.Mock).mockReturnValue(undefined);
            expect(extractUserIdFromRequest(mockRequest)).toBe('f:keycloak:user-123');
        });
    });

    describe('extractUserNameFromRequest', () => {
        it('should return name from keycloak token', () => {
            expect(extractUserNameFromRequest(mockRequest)).toBe('Test User');
        });
    });

    describe('extractUserEmailFromRequest', () => {
        it('should return email from keycloak token', () => {
            const reqWithEmail = { ...mockRequest } as IAuthorizedRequest;
            expect(extractUserEmailFromRequest(reqWithEmail)).toBe('test@example.com');
        });

        it('should return preferred_username if email is missing', () => {
            const reqWithoutEmail = {
                ...mockRequest,
                kauth: {
                    grant: {
                        access_token: {
                            token: 'mock-token',
                            content: {
                                sub: 'f:keycloak:user-123',
                                name: 'Test User',
                                preferred_username: 'testuser',
                                session_state: 'active',
                                given_name: 'Test',
                                family_name: 'User'
                            }
                        }
                    }
                }
            } as unknown as IAuthorizedRequest;
            expect(extractUserEmailFromRequest(reqWithoutEmail)).toBe('testuser');
        });
    });

    describe('extractRootOrgFromRequest', () => {
        it('should return rootorg from header', () => {
            (mockRequest.header as jest.Mock).mockReturnValue('sunbird');
            expect(extractRootOrgFromRequest(mockRequest)).toBe('sunbird');
        });
    });
});
