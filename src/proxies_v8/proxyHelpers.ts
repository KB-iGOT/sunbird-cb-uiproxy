import axios from 'axios'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { extractUserToken, IAuthorizedRequest } from '../utils/requestExtract'

const KONG_SEARCH_USER = `${CONSTANTS.KONG_API_BASE}/user/v1/search`

// Headers for calls made to the Sunbird/KONG services on behalf of the logged-in user
export function sbAuthHeaders(req: IAuthorizedRequest) {
  return {
    Authorization: CONSTANTS.SB_API_KEY,
    // tslint:disable-next-line: no-duplicate-string
    'x-authenticated-user-token': extractUserToken(req),
  }
}

// Default axios config plus the Sunbird auth headers
export function sbRequestConfig(req: IAuthorizedRequest) {
  return {
    ...axiosRequestConfig,
    headers: sbAuthHeaders(req),
  }
}

/**
 * Lists a batch's participants from `participantsUrl`, then looks their profiles up in the user search API.
 * Only users whose channel matches `deptName` are kept when it is given. Returns the participants response
 * (for its status / count) alongside the resulting user list.
 */
export async function fetchBatchUsers(req: IAuthorizedRequest, participantsUrl: string, reqBody: object, deptName?: string) {
  const userlist: ICohortsUser[] = []
  const response = await axios.post(participantsUrl, reqBody, sbRequestConfig(req))
  const participants = response.data.result.batch.participants
  if (typeof participants !== 'undefined' && participants.length > 0) {
    const searchresponse = await axios({
      ...axiosRequestConfig,
      data: { request: { filters: { userId: participants } } },
      headers: sbAuthHeaders(req),
      method: 'POST',
      url: KONG_SEARCH_USER,
    })
    if (searchresponse.data.result.response.count > 0) {
      for (const profileObj of searchresponse.data.result.response.content) {
        const user: ICohortsUser = getUsers(profileObj)
        if (!deptName || (profileObj.channel && profileObj.channel === deptName)) {
          user.department = profileObj.rootOrgName
          userlist.push(user)
        }
      }
    }
  }
  return { response, userlist }
}

// tslint:disable-next-line: all
export function getUsers(userprofile: IUserProfile): ICohortsUser {
  let designationValue = ''
  let primaryEmail = ''
  let mobileNumber = 0
  const profileDetails = userprofile.hasOwnProperty('profileDetails') ? userprofile.profileDetails : null
  if (profileDetails != null) {
    const professionalDetails = profileDetails.hasOwnProperty('professionalDetails') ? profileDetails.professionalDetails : null
    if (professionalDetails != null) {
      if (userprofile.profileDetails.professionalDetails[0].designation !== undefined) {
        designationValue = userprofile.profileDetails.professionalDetails[0].designation
      } else {
        designationValue = userprofile.profileDetails.professionalDetails[0].designationOther === undefined ? '' :
          userprofile.profileDetails.professionalDetails[0].designationOther
      }
    }
    if (userprofile.profileDetails.personalDetails !== undefined) {
      primaryEmail = userprofile.profileDetails.personalDetails.primaryEmail
      mobileNumber = userprofile.profileDetails.personalDetails.mobile
    }
  }

  return {
    city: '',
    // department: userprofile.channel === undefined ? '' : userprofile.channel,
    department: userprofile.rootOrgName === undefined ? '' : userprofile.rootOrgName,
    desc: '',
    designation: designationValue,
    email: primaryEmail,
    first_name: userprofile.firstName,
    last_name: userprofile.lastName,
    phone_No: mobileNumber,
    userLocation: '',
    user_id: userprofile.id,
  }
}

export interface ICohortsUser {
  first_name: string
  last_name: string
  email: string
  desc: string
  user_id: string
  department: string
  phone_No: number
  designation: string
  userLocation: string
  city: string
}

export interface IUserProfile {
  channel: string
  firstName: string
  id: string
  lastName: string
  profileDetails: IUserProfileDetails
  rootOrgName: string
}

export interface IUserProfileDetails {
  personalDetails: IPersonalDetails
  professionalDetails: IProfessionalDetailsEntity[]
  employmentDetails: IEmploymentDetails
}

export interface IPersonalDetails {
  firstname: string
  middlename: string
  surname: string
  dob: string
  nationality: string
  domicileMedium: string
  gender: string
  maritalStatus: string
  category: string
  countryCode: string
  mobile: number
  telephone: string
  primaryEmail: string
  officialEmail: string
  personalEmail: string
}

export interface IEmploymentDetails {
  departmentName: string
}

export interface IProfessionalDetailsEntity {
  description: string
  industry: string
  designationOther: string
  nameOther: string
  organisationType: string
  responsibilities: string
  name: string
  location: string
  designation: string
  industryOther: string
  completePostalAddress: string
  doj: string
}
