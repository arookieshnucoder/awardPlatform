import { api } from '../lib/apiClient'

export type HackathonVisibility = 'public' | 'private'
export type HackathonJoinPolicy = 'invite_only' | 'self_register'
export type JudgingMode = 'panel' | 'community' | 'blended'

export interface Hackathon {
  id: string
  title: string
  description: string
  startDate: string
  endDate: string
  registrationKey: string
  status: 'draft' | 'open' | 'running' | 'completed'
  maxTeamSize: number
  allowedParticipants: number
  currentParticipants: number
  createdBy: string
  organizationId: string | null
  bannerUrl: string | null
  rules: string | null
  prizes: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
  visibility: HackathonVisibility
  joinPolicy: HackathonJoinPolicy
  judgingMode: JudgingMode
  panelWeight: number
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface CreateHackathonInput {
  title: string
  description: string
  startDate: string
  endDate: string
  maxTeamSize: number
  allowedParticipants: number
  organizationId?: string
  rules?: string
  bannerUrl?: string | null
  tags?: string[]
  prizes?: string[]
}

export interface JudgingConfigInput {
  visibility?: HackathonVisibility
  joinPolicy?: HackathonJoinPolicy
  judgingMode?: JudgingMode
  panelWeight?: number
}

// Normalize the retired demo copy at the shared API boundary for every award view.
function awardContent(campaign: Hackathon): Hackathon {
  const legacyTitle = ['Spring 2026 Hackathon', '2026 春季黑客松'].includes(campaign.title)
  if (!legacyTitle) return campaign
  const legacyDescription = ['Build something amazing in 48 hours. Open to all skill levels.', '在 48 小时内打造精彩作品，欢迎所有技能水平的参与者。'].includes(campaign.description)
  return {
    ...campaign,
    title: '2026 Digital Pioneer Award',
    description: legacyDescription ? 'Recognizing contributions in Customer Values, Innovation Breakthrough, and Collaboration to Win.' : campaign.description,
  }
}

function awardPage(page: PageResponse<Hackathon>): PageResponse<Hackathon> {
  return { ...page, content: page.content.map(awardContent) }
}

export class HackathonService {
  static async getHackathons(page = 0, size = 20): Promise<PageResponse<Hackathon>> {
    return awardPage(await api.get(`/api/v1/hackathons?page=${page}&size=${size}`))
  }

  static async getHackathon(id: string): Promise<Hackathon> {
    return awardContent(await api.get(`/api/v1/hackathons/${id}`))
  }

  static async getHackathonsByStatus(
    status: Hackathon['status'], page = 0, size = 20
  ): Promise<PageResponse<Hackathon>> {
    return awardPage(await api.get(`/api/v1/hackathons?status=${status}&page=${page}&size=${size}`))
  }

  static async createHackathon(data: CreateHackathonInput): Promise<Hackathon> {
    return awardContent(await api.post('/api/v1/hackathons', data))
  }

  static async updateHackathon(id: string, data: Partial<CreateHackathonInput>): Promise<Hackathon> {
    return awardContent(await api.put(`/api/v1/hackathons/${id}`, data))
  }

  static async deleteHackathon(id: string): Promise<void> {
    return api.delete(`/api/v1/hackathons/${id}`)
  }

  static async joinHackathon(registrationKey: string): Promise<Hackathon> {
    return awardContent(await api.post('/api/v1/hackathons/join', { registrationKey }))
  }

  static async transitionStatus(id: string, status: Hackathon['status']): Promise<Hackathon> {
    return awardContent(await api.patch(`/api/v1/hackathons/${id}/status`, { status }))
  }

  static async updateJudgingConfig(id: string, config: JudgingConfigInput): Promise<Hackathon> {
    return awardContent(await api.patch(`/api/v1/hackathons/${id}/config`, config))
  }
}
