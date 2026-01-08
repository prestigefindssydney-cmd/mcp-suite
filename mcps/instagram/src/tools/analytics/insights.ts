/**
 * Tools pour les analytics et insights Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { AccountInsights, MediaInsights, AudienceDemographics, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const GetAccountInsightsSchema = z.object({
  metrics: z.array(z.enum([
    'impressions', 'reach', 'profile_views', 'website_clicks',
    'email_contacts', 'phone_call_clicks', 'follower_count',
    'accounts_engaged', 'total_interactions'
  ])).default(['impressions', 'reach', 'profile_views', 'follower_count']).describe('Métriques à récupérer'),
  period: z.enum(['day', 'week', 'days_28', 'month', 'lifetime']).default('days_28').describe('Période'),
  since: z.string().optional().describe('Date de début (YYYY-MM-DD)'),
  until: z.string().optional().describe('Date de fin (YYYY-MM-DD)'),
});

export const GetMediaInsightsSchema = z.object({
  media_id: z.string().describe('ID du média'),
  metrics: z.array(z.enum([
    'impressions', 'reach', 'engagement', 'saved', 'shares',
    'likes', 'comments', 'plays', 'video_views', 'total_interactions'
  ])).default(['impressions', 'reach', 'engagement', 'saved', 'shares']).describe('Métriques'),
});

export const GetAudienceDemographicsSchema = z.object({
  breakdown: z.enum(['age', 'gender', 'country', 'city']).default('country').describe('Type de répartition'),
});

export const GetAudienceActivitySchema = z.object({
  type: z.enum(['hours', 'days']).default('hours').describe('Activité par heures ou jours'),
});

export const GetFollowerGrowthSchema = z.object({
  since: z.string().describe('Date de début (YYYY-MM-DD)'),
  until: z.string().describe('Date de fin (YYYY-MM-DD)'),
});

export const GetStoriesInsightsSchema = z.object({
  story_id: z.string().optional().describe('ID de la story (sinon toutes les récentes)'),
});

export const GetReelsInsightsSchema = z.object({
  reel_id: z.string().describe('ID du reel'),
  metrics: z.array(z.enum([
    'plays', 'reach', 'likes', 'comments', 'saves', 'shares', 'total_interactions'
  ])).default(['plays', 'reach', 'likes', 'comments', 'saves', 'shares']).describe('Métriques'),
});

export const GetOnlineFollowersSchema = z.object({});

// ============================================
// Handlers
// ============================================

export class AnalyticsTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Récupère les insights du compte
   */
  async getAccountInsights(params: z.infer<typeof GetAccountInsightsSchema>): Promise<ApiResponse<AccountInsights>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const queryParams: Record<string, unknown> = {
      metric: params.metrics.join(','),
      period: params.period,
    };

    if (params.since) queryParams.since = params.since;
    if (params.until) queryParams.until = params.until;

    const result = await this.client.get<{
      data: Array<{
        name: string;
        period: string;
        values: Array<{ value: number; end_time?: string }>;
        title: string;
        description: string;
      }>;
    }>(
      `/${accountId}/insights`,
      queryParams
    );

    if (result.success && result.data) {
      const insights: AccountInsights = {};

      for (const metric of result.data.data) {
        const value = metric.values[0]?.value || 0;

        switch (metric.name) {
          case 'reach': insights.reach = value as number; break;
          case 'impressions': insights.impressions = value as number; break;
          case 'profile_views': insights.profile_views = value as number; break;
          case 'website_clicks': insights.website_clicks = value as number; break;
          case 'email_contacts': insights.email_contacts = value as number; break;
          case 'phone_call_clicks': insights.phone_call_clicks = value as number; break;
          case 'follower_count': insights.follower_count = value as number; break;
        }
      }

      return { success: true, data: insights };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère les insights d'un média
   */
  async getMediaInsights(params: z.infer<typeof GetMediaInsightsSchema>): Promise<ApiResponse<MediaInsights>> {
    const result = await this.client.get<{
      data: Array<{
        name: string;
        values: Array<{ value: number }>;
      }>;
    }>(
      `/${params.media_id}/insights`,
      { metric: params.metrics.join(',') }
    );

    if (result.success && result.data) {
      const insights: MediaInsights = {};

      for (const metric of result.data.data) {
        const value = metric.values[0]?.value || 0;

        switch (metric.name) {
          case 'impressions': insights.impressions = value; break;
          case 'reach': insights.reach = value; break;
          case 'engagement': insights.engagement = value; break;
          case 'saved': insights.saved = value; break;
          case 'shares': insights.shares = value; break;
          case 'likes': insights.likes = value; break;
          case 'comments': insights.comments = value; break;
          case 'plays': insights.plays = value; break;
          case 'video_views': insights.video_views = value; break;
        }
      }

      return { success: true, data: insights };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère les données démographiques de l'audience
   */
  async getAudienceDemographics(params: z.infer<typeof GetAudienceDemographicsSchema>): Promise<ApiResponse<AudienceDemographics>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const metricMap: Record<string, string> = {
      age: 'audience_gender_age',
      gender: 'audience_gender_age',
      country: 'audience_country',
      city: 'audience_city',
    };

    const result = await this.client.get<{
      data: Array<{
        name: string;
        values: Array<{ value: Record<string, number> }>;
      }>;
    }>(
      `/${accountId}/insights`,
      {
        metric: metricMap[params.breakdown],
        period: 'lifetime',
      }
    );

    if (result.success && result.data) {
      const demographics: AudienceDemographics = {
        age_gender: {},
        cities: {},
        countries: {},
        locale: {},
      };

      for (const metric of result.data.data) {
        const values = metric.values[0]?.value || {};

        switch (metric.name) {
          case 'audience_gender_age':
            demographics.age_gender = values;
            break;
          case 'audience_country':
            demographics.countries = values;
            break;
          case 'audience_city':
            demographics.cities = values;
            break;
        }
      }

      return { success: true, data: demographics };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère les heures d'activité des followers
   */
  async getAudienceActivity(params: z.infer<typeof GetAudienceActivitySchema>): Promise<ApiResponse<Record<string, number>>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const metric = params.type === 'hours' ? 'online_followers' : 'audience_locale';

    const result = await this.client.get<{
      data: Array<{
        name: string;
        values: Array<{ value: Record<string, number> }>;
      }>;
    }>(
      `/${accountId}/insights`,
      { metric, period: 'lifetime' }
    );

    if (result.success && result.data) {
      const values = result.data.data[0]?.values[0]?.value || {};
      return { success: true, data: values };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère l'évolution des followers
   */
  async getFollowerGrowth(params: z.infer<typeof GetFollowerGrowthSchema>): Promise<ApiResponse<{
    daily_data: Array<{ date: string; count: number; change: number }>;
    total_change: number;
  }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const result = await this.client.get<{
      data: Array<{
        name: string;
        values: Array<{ value: number; end_time: string }>;
      }>;
    }>(
      `/${accountId}/insights`,
      {
        metric: 'follower_count',
        period: 'day',
        since: params.since,
        until: params.until,
      }
    );

    if (result.success && result.data) {
      const values = result.data.data[0]?.values || [];

      const dailyData = values.map((v, i) => ({
        date: v.end_time,
        count: v.value,
        change: i > 0 ? v.value - values[i - 1].value : 0,
      }));

      const totalChange = values.length > 1
        ? values[values.length - 1].value - values[0].value
        : 0;

      return {
        success: true,
        data: { daily_data: dailyData, total_change: totalChange },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère les insights des stories
   */
  async getStoriesInsights(params: z.infer<typeof GetStoriesInsightsSchema>): Promise<ApiResponse<Array<{
    story_id: string;
    impressions: number;
    reach: number;
    replies: number;
    taps_forward: number;
    taps_back: number;
    exits: number;
  }>>> {
    if (params.story_id) {
      const result = await this.client.get<{
        data: Array<{ name: string; values: Array<{ value: number }> }>;
      }>(
        `/${params.story_id}/insights`,
        { metric: 'impressions,reach,replies,taps_forward,taps_back,exits' }
      );

      if (result.success && result.data) {
        const insights: Record<string, number> = {};
        for (const m of result.data.data) {
          insights[m.name] = m.values[0]?.value || 0;
        }

        return {
          success: true,
          data: [{
            story_id: params.story_id,
            impressions: insights.impressions || 0,
            reach: insights.reach || 0,
            replies: insights.replies || 0,
            taps_forward: insights.taps_forward || 0,
            taps_back: insights.taps_back || 0,
            exits: insights.exits || 0,
          }],
        };
      }

      return { success: false, error: result.error };
    }

    // Récupérer toutes les stories récentes
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const storiesResult = await this.client.get<{
      data: Array<{ id: string }>;
    }>(
      `/${accountId}/stories`,
      { fields: 'id' }
    );

    if (!storiesResult.success || !storiesResult.data) {
      return { success: false, error: storiesResult.error };
    }

    const allInsights = [];
    for (const story of storiesResult.data.data) {
      const insightResult = await this.getStoriesInsights({ story_id: story.id });
      if (insightResult.success && insightResult.data) {
        allInsights.push(...insightResult.data);
      }
    }

    return { success: true, data: allInsights };
  }

  /**
   * Récupère les insights d'un reel
   */
  async getReelsInsights(params: z.infer<typeof GetReelsInsightsSchema>): Promise<ApiResponse<Record<string, number>>> {
    const result = await this.client.get<{
      data: Array<{ name: string; values: Array<{ value: number }> }>;
    }>(
      `/${params.reel_id}/insights`,
      { metric: params.metrics.join(',') }
    );

    if (result.success && result.data) {
      const insights: Record<string, number> = {};
      for (const m of result.data.data) {
        insights[m.name] = m.values[0]?.value || 0;
      }

      return { success: true, data: insights };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère les followers en ligne
   */
  async getOnlineFollowers(): Promise<ApiResponse<Record<string, number>>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const result = await this.client.get<{
      data: Array<{
        name: string;
        values: Array<{ value: Record<string, number> }>;
      }>;
    }>(
      `/${accountId}/insights`,
      { metric: 'online_followers', period: 'lifetime' }
    );

    if (result.success && result.data) {
      const values = result.data.data[0]?.values[0]?.value || {};
      return { success: true, data: values };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère un résumé complet des analytics
   */
  async getAnalyticsSummary(days: number = 28): Promise<ApiResponse<{
    account: AccountInsights;
    top_posts: Array<{ id: string; engagement: number }>;
    audience: AudienceDemographics;
  }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    // Récupérer les insights du compte
    const accountResult = await this.getAccountInsights({
      metrics: ['impressions', 'reach', 'profile_views', 'follower_count'],
      period: days <= 7 ? 'week' : 'days_28',
    });

    // Récupérer les données démographiques
    const demographicsResult = await this.getAudienceDemographics({ breakdown: 'country' });

    // Récupérer les top posts
    const postsResult = await this.client.get<{
      data: Array<{ id: string }>;
    }>(
      `/${accountId}/media`,
      { fields: 'id', limit: 10 }
    );

    const topPosts: Array<{ id: string; engagement: number }> = [];

    if (postsResult.success && postsResult.data) {
      for (const post of postsResult.data.data) {
        const insights = await this.getMediaInsights({
          media_id: post.id,
          metrics: ['engagement'],
        });

        if (insights.success && insights.data) {
          topPosts.push({
            id: post.id,
            engagement: insights.data.engagement || 0,
          });
        }
      }

      // Trier par engagement
      topPosts.sort((a, b) => b.engagement - a.engagement);
    }

    return {
      success: true,
      data: {
        account: accountResult.data || {},
        top_posts: topPosts.slice(0, 5),
        audience: demographicsResult.data || { age_gender: {}, cities: {}, countries: {}, locale: {} },
      },
    };
  }
}
