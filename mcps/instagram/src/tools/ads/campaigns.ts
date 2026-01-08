/**
 * Tools pour la gestion des publicités Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramCampaign, CustomAudience, AdInsights, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(100).describe('Nom de la campagne'),
  objective: z.enum([
    'AWARENESS', 'TRAFFIC', 'ENGAGEMENT', 'LEADS', 'APP_PROMOTION', 'SALES'
  ]).describe('Objectif'),
  budget_amount: z.number().positive().describe('Montant du budget'),
  budget_type: z.enum(['DAILY', 'LIFETIME']).default('DAILY').describe('Type de budget'),
  currency: z.string().length(3).default('EUR').describe('Devise'),
  start_time: z.string().describe('Date de début (ISO 8601)'),
  end_time: z.string().optional().describe('Date de fin (ISO 8601)'),
  targeting: z.object({
    age_min: z.number().min(13).max(65).optional(),
    age_max: z.number().min(13).max(65).optional(),
    genders: z.array(z.enum(['male', 'female', 'all'])).optional(),
    countries: z.array(z.string()).optional(),
    cities: z.array(z.string()).optional(),
    interests: z.array(z.string()).optional(),
    custom_audiences: z.array(z.string()).optional(),
  }).optional().describe('Ciblage'),
  placements: z.array(z.enum(['FEED', 'STORY', 'REELS', 'EXPLORE', 'PROFILE_FEED'])).default(['FEED', 'STORY']).describe('Placements'),
});

export const ListCampaignsSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']).optional().describe('Filtrer par statut'),
  limit: z.number().min(1).max(50).default(25).describe('Nombre de campagnes'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const GetCampaignSchema = z.object({
  campaign_id: z.string().describe('ID de la campagne'),
});

export const UpdateCampaignSchema = z.object({
  campaign_id: z.string().describe('ID de la campagne'),
  name: z.string().optional().describe('Nouveau nom'),
  budget_amount: z.number().positive().optional().describe('Nouveau budget'),
  end_time: z.string().optional().describe('Nouvelle date de fin'),
});

export const PauseCampaignSchema = z.object({
  campaign_id: z.string().describe('ID de la campagne'),
});

export const ResumeCampaignSchema = z.object({
  campaign_id: z.string().describe('ID de la campagne'),
});

export const DeleteCampaignSchema = z.object({
  campaign_id: z.string().describe('ID de la campagne'),
});

export const BoostPostSchema = z.object({
  media_id: z.string().describe('ID du post à promouvoir'),
  budget_amount: z.number().positive().describe('Budget total'),
  duration_days: z.number().min(1).max(30).default(7).describe('Durée en jours'),
  currency: z.string().length(3).default('EUR').describe('Devise'),
  targeting: z.object({
    age_min: z.number().min(13).max(65).optional(),
    age_max: z.number().min(13).max(65).optional(),
    countries: z.array(z.string()).optional(),
    interests: z.array(z.string()).optional(),
  }).optional().describe('Ciblage'),
});

export const CreateCustomAudienceSchema = z.object({
  name: z.string().min(1).max(100).describe('Nom de l\'audience'),
  description: z.string().max(500).optional().describe('Description'),
  source_type: z.enum(['WEBSITE', 'APP', 'ENGAGEMENT', 'CUSTOMER_FILE']).describe('Source'),
  retention_days: z.number().min(1).max(365).default(30).describe('Durée de rétention'),
});

export const CreateLookalikeAudienceSchema = z.object({
  name: z.string().min(1).max(100).describe('Nom de l\'audience'),
  source_audience_id: z.string().describe('ID de l\'audience source'),
  countries: z.array(z.string()).min(1).describe('Pays cibles'),
  ratio: z.number().min(0.01).max(0.20).default(0.01).describe('Ratio (1-20%)'),
});

export const GetAdInsightsSchema = z.object({
  campaign_id: z.string().optional().describe('ID de la campagne'),
  ad_id: z.string().optional().describe('ID de la publicité'),
  date_start: z.string().describe('Date de début (YYYY-MM-DD)'),
  date_end: z.string().describe('Date de fin (YYYY-MM-DD)'),
  metrics: z.array(z.enum([
    'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm', 'spend', 'conversions', 'cost_per_conversion'
  ])).default(['impressions', 'reach', 'clicks', 'spend']).describe('Métriques'),
});

// ============================================
// Handlers
// ============================================

export class AdsTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Crée une nouvelle campagne publicitaire
   */
  async createCampaign(params: z.infer<typeof CreateCampaignSchema>): Promise<ApiResponse<{ id: string }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    // Note: Les campagnes se créent via l'API Ads Manager de Facebook
    // Ici on simule l'appel à l'API

    const campaignData: Record<string, unknown> = {
      name: params.name,
      objective: params.objective,
      status: 'PAUSED', // Créer en pause pour review
      special_ad_categories: [],
      daily_budget: params.budget_type === 'DAILY' ? Math.round(params.budget_amount * 100) : undefined,
      lifetime_budget: params.budget_type === 'LIFETIME' ? Math.round(params.budget_amount * 100) : undefined,
      start_time: params.start_time,
      end_time: params.end_time,
    };

    const result = await this.client.post<{ id: string }>(
      `/act_${accountId}/campaigns`,
      campaignData
    );

    return result;
  }

  /**
   * Liste les campagnes
   */
  async listCampaigns(params: z.infer<typeof ListCampaignsSchema>): Promise<ApiResponse<PaginatedResponse<InstagramCampaign>>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const queryParams: Record<string, unknown> = {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time',
      limit: params.limit,
    };

    if (params.status) {
      queryParams['filtering'] = JSON.stringify([{
        field: 'effective_status',
        operator: 'IN',
        value: [params.status],
      }]);
    }

    if (params.cursor) queryParams.after = params.cursor;

    const result = await this.client.get<{
      data: Array<{
        id: string;
        name: string;
        status: string;
        objective: string;
        daily_budget?: string;
        lifetime_budget?: string;
        start_time: string;
        stop_time?: string;
        created_time: string;
        updated_time: string;
      }>;
      paging?: { cursors?: { after?: string } };
    }>(
      `/act_${accountId}/campaigns`,
      queryParams
    );

    if (result.success && result.data) {
      const campaigns: InstagramCampaign[] = result.data.data.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status as InstagramCampaign['status'],
        objective: c.objective as InstagramCampaign['objective'],
        budget: {
          amount: parseFloat(c.daily_budget || c.lifetime_budget || '0') / 100,
          currency: 'EUR', // À récupérer depuis le compte
          type: c.daily_budget ? 'DAILY' : 'LIFETIME',
        },
        schedule: {
          start_time: c.start_time,
          end_time: c.stop_time,
        },
        targeting: {}, // À récupérer depuis les adsets
        placements: [],
        created_time: c.created_time,
        updated_time: c.updated_time,
      }));

      return {
        success: true,
        data: {
          data: campaigns,
          paging: result.data.paging,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère une campagne
   */
  async getCampaign(params: z.infer<typeof GetCampaignSchema>): Promise<ApiResponse<InstagramCampaign>> {
    const result = await this.client.get<{
      id: string;
      name: string;
      status: string;
      objective: string;
      daily_budget?: string;
      lifetime_budget?: string;
      start_time: string;
      stop_time?: string;
      created_time: string;
      updated_time: string;
    }>(
      `/${params.campaign_id}`,
      { fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time' }
    );

    if (result.success && result.data) {
      const c = result.data;
      return {
        success: true,
        data: {
          id: c.id,
          name: c.name,
          status: c.status as InstagramCampaign['status'],
          objective: c.objective as InstagramCampaign['objective'],
          budget: {
            amount: parseFloat(c.daily_budget || c.lifetime_budget || '0') / 100,
            currency: 'EUR',
            type: c.daily_budget ? 'DAILY' : 'LIFETIME',
          },
          schedule: {
            start_time: c.start_time,
            end_time: c.stop_time,
          },
          targeting: {},
          placements: [],
          created_time: c.created_time,
          updated_time: c.updated_time,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Met à jour une campagne
   */
  async updateCampaign(params: z.infer<typeof UpdateCampaignSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const updateData: Record<string, unknown> = {};

    if (params.name) updateData.name = params.name;
    if (params.budget_amount) updateData.daily_budget = Math.round(params.budget_amount * 100);
    if (params.end_time) updateData.stop_time = params.end_time;

    const result = await this.client.post<{ success: boolean }>(
      `/${params.campaign_id}`,
      updateData
    );

    return {
      success: result.success,
      data: { success: true },
      error: result.error,
    };
  }

  /**
   * Met en pause une campagne
   */
  async pauseCampaign(params: z.infer<typeof PauseCampaignSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const result = await this.client.post<{ success: boolean }>(
      `/${params.campaign_id}`,
      { status: 'PAUSED' }
    );

    return {
      success: result.success,
      data: { success: true },
      error: result.error,
    };
  }

  /**
   * Relance une campagne
   */
  async resumeCampaign(params: z.infer<typeof ResumeCampaignSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const result = await this.client.post<{ success: boolean }>(
      `/${params.campaign_id}`,
      { status: 'ACTIVE' }
    );

    return {
      success: result.success,
      data: { success: true },
      error: result.error,
    };
  }

  /**
   * Supprime (archive) une campagne
   */
  async deleteCampaign(params: z.infer<typeof DeleteCampaignSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const result = await this.client.post<{ success: boolean }>(
      `/${params.campaign_id}`,
      { status: 'DELETED' }
    );

    return {
      success: result.success,
      data: { success: true },
      error: result.error,
    };
  }

  /**
   * Boost un post (promotion rapide)
   */
  async boostPost(params: z.infer<typeof BoostPostSchema>): Promise<ApiResponse<{ promotion_id: string }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const boostData: Record<string, unknown> = {
      media_id: params.media_id,
      budget: Math.round(params.budget_amount * 100),
      currency: params.currency,
      duration: params.duration_days * 24 * 60 * 60, // En secondes
    };

    if (params.targeting) {
      boostData.targeting = {
        age_min: params.targeting.age_min,
        age_max: params.targeting.age_max,
        geo_locations: params.targeting.countries
          ? { countries: params.targeting.countries }
          : undefined,
        interests: params.targeting.interests,
      };
    }

    const result = await this.client.post<{ id: string }>(
      `/${accountId}/promote`,
      boostData
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: { promotion_id: result.data.id },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Crée une audience personnalisée
   */
  async createCustomAudience(params: z.infer<typeof CreateCustomAudienceSchema>): Promise<ApiResponse<{ id: string }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const subtypeMap: Record<string, string> = {
      WEBSITE: 'WEBSITE',
      APP: 'APP',
      ENGAGEMENT: 'ENGAGEMENT',
      CUSTOMER_FILE: 'CUSTOM',
    };

    const audienceData = {
      name: params.name,
      description: params.description,
      subtype: subtypeMap[params.source_type],
      retention_days: params.retention_days,
    };

    const result = await this.client.post<{ id: string }>(
      `/act_${accountId}/customaudiences`,
      audienceData
    );

    return result;
  }

  /**
   * Crée une audience similaire (lookalike)
   */
  async createLookalikeAudience(params: z.infer<typeof CreateLookalikeAudienceSchema>): Promise<ApiResponse<{ id: string }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const audienceData = {
      name: params.name,
      subtype: 'LOOKALIKE',
      origin_audience_id: params.source_audience_id,
      lookalike_spec: JSON.stringify({
        type: 'similarity',
        country: params.countries[0], // Premier pays
        ratio: params.ratio,
      }),
    };

    const result = await this.client.post<{ id: string }>(
      `/act_${accountId}/customaudiences`,
      audienceData
    );

    return result;
  }

  /**
   * Récupère les insights publicitaires
   */
  async getAdInsights(params: z.infer<typeof GetAdInsightsSchema>): Promise<ApiResponse<AdInsights>> {
    if (!params.campaign_id && !params.ad_id) {
      return {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'campaign_id ou ad_id requis' },
      };
    }

    const entityId = params.campaign_id || params.ad_id;

    const result = await this.client.get<{
      data: Array<{
        impressions?: string;
        reach?: string;
        clicks?: string;
        ctr?: string;
        cpc?: string;
        cpm?: string;
        spend?: string;
        conversions?: string;
        cost_per_conversion?: string;
      }>;
    }>(
      `/${entityId}/insights`,
      {
        fields: params.metrics.join(','),
        time_range: JSON.stringify({
          since: params.date_start,
          until: params.date_end,
        }),
      }
    );

    if (result.success && result.data && result.data.data.length > 0) {
      const d = result.data.data[0];
      return {
        success: true,
        data: {
          impressions: parseInt(d.impressions || '0'),
          reach: parseInt(d.reach || '0'),
          clicks: parseInt(d.clicks || '0'),
          ctr: parseFloat(d.ctr || '0'),
          cpc: parseFloat(d.cpc || '0'),
          cpm: parseFloat(d.cpm || '0'),
          spend: parseFloat(d.spend || '0'),
          conversions: parseInt(d.conversions || '0'),
          cost_per_conversion: parseFloat(d.cost_per_conversion || '0'),
        },
      };
    }

    return { success: false, error: result.error };
  }
}
