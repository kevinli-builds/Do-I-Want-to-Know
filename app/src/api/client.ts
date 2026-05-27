import axios from 'axios'
import Constants from 'expo-constants'

const BASE_URL: string =
  Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3000'

export const api = axios.create({ baseURL: BASE_URL })

export type QuestionType = 'yesno' | 'multiplechoice'

export interface Question {
  id: string
  text: string
  type: QuestionType
  options: string | null
  authorId: string
  createdAt: string
  status: string
}

export interface QuestionWithResults extends Question {
  answerCount: number
  results: Record<string, number>
}

export const createUser = (id: string) =>
  api.post('/users', { id }).then(r => r.data)

export const getFeed = (userId: string) =>
  api.get<Question[]>('/questions/feed', { params: { userId } }).then(r => r.data)

export const getMyQuestions = (userId: string) =>
  api.get<QuestionWithResults[]>('/questions/mine', { params: { userId } }).then(r => r.data)

export const postQuestion = (body: {
  authorId: string
  text: string
  type: QuestionType
  options?: string[]
}) => api.post<Question>('/questions', body).then(r => r.data)

export interface UserStats {
  answeredCount: number
  askedCount: number
  totalResponsesReceived: number
  memberSince: string
}

export const getUserStats = (userId: string) =>
  api.get<UserStats>(`/users/${userId}/stats`).then(r => r.data)

export const answerQuestion = (questionId: string, userId: string, value: string) =>
  api
    .post<{ results: Record<string, number>; total: number }>(
      `/questions/${questionId}/answer`,
      { userId, value }
    )
    .then(r => r.data)
