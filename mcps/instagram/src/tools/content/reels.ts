/**
 * Tools pour la gestion des Reels Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramMedia, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const CreateReelSchema = z.object({
  video_url: z.string().url().describe('URL de la vidéo (format vertical recommandé)'),
  caption: z.string().max(2200).optional().describe('Légende du reel'),
  cover_url: z.string().url().optional().describe('URL de la miniature personnalisée'),
  share_to_feed: z.boolean().default(true).describe('Partager aussi dans le feed'),
  audio_name: z.string().optional().describe('Nom de l\'audio original'),
  location_id: z.string().optional().describe('ID du lieu'),
  user_tags: z.array(z.object({
    user_id: z.string(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })).optional().describe('Tags d\'utilisateurs'),
  collaborators: z.array(z.string()).optional().describe('IDs des collaborateurs'),
});

export const ListReelsSchema = z.object({
  limit: z.number().min(1).max(50).default(25).describe('Nombre de reels'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const GetReelSchema = z.object({
  reel_id: z.string().describe('ID du reel'),
  fields: z.array(z.string()).optional().describe('Champs à récupérer'),
});

export const DeleteReelSchema = z.object({
  reel_id: z.string().describe('ID du reel à supprimer'),
});

export const GetReelInsightsSchema = z.object({
  reel_id: z.string().describe('ID du reel'),
  metrics: z.array(z.enum([
    'plays', 'reach', 'likes', 'comments', 'saves', 'shares', 'total_interactions'
  ])).default(['plays', 'reach', 'likes', 'comments', 'saves', 'shares']).describe('Métriques à récupérer'),
});

// ============================================
// Handlers
// ============================================

export class ReelsTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Crée un nouveau Reel
   */
  async createReel(params: z.infer<typeof CreateReelSchema>): Promise<ApiResponse<{ id: string; permalink: string }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    // Étape 1: Créer le conteneur Reel
    const reelData: Record<string, unknown> = {
      media_type: 'REELS',
      video_url: params.video_url,
      share_to_feed: params.share_to_feed,
    };

    if (params.caption) reelData.caption = params.caption;
    if (params.cover_url) reelData.thumb_offset = 0; // ou cover_url selon l'API
    if (params.location_id) reelData.location_id = params.location_id;
    if (params.audio_name) reelData.audio_name = params.audio_name;

    if (params.user_tags && params.user_tags.length > 0) {
      reelData.user_tags = params.user_tags.map(tag => ({
        username: tag.user_id,
        x: tag.x,
        y: tag.y,
      }));
    }

    if (params.collaborators && params.collaborators.length > 0) {
      reelData.collaborators = params.collaborators;
    }

    const containerResult = await this.client.post<{ id: string }>(
      `/${accountId}/media`,
      reelData,
      { rateLimitCategory: 'content_publish' }
    );

    if (!containerResult.success || !containerResult.data) {
      return containerResult as ApiResponse<{ id: string; permalink: string }>;
    }

    // Attendre le traitement de la vidéo
    const processed = await this.waitForVideoProcessing(containerResult.data.id);
    if (!processed) {
      return {
        success: false,
        error: { code: 'PROCESSING_ERROR', message: 'Échec du traitement vidéo' },
      };
    }

    // Étape 2: Publier le Reel
    const publishResult = await this.client.post<{ id: string }>(
      `/${accountId}/media_publish`,
      { creation_id: containerResult.data.id }
    );

    if (!publishResult.success || !publishResult.data) {
      return publishResult as ApiResponse<{ id: string; permalink: string }>;
    }

    // Récupérer le permalink
    const mediaResult = await this.client.get<{ permalink: string }>(
      `/${publishResult.data.id}`,
      { fields: 'permalink' }
    );

    return {
      success: true,
      data: {
        id: publishResult.data.id,
        permalink: mediaResult.data?.permalink || '',
      },
    };
  }

  /**
   * Liste les Reels du compte
   */
  async listReels(params: z.infer<typeof ListReelsSchema>): Promise<ApiResponse<PaginatedResponse<InstagramMedia>>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    // Récupérer les médias et filtrer les Reels
    const result = await this.client.get<PaginatedResponse<InstagramMedia>>(
      `/${accountId}/media`,
      {
        fields: 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,comments_count',
        limit: params.limit * 2, // Récupérer plus pour compenser le filtrage
        after: params.cursor,
      }
    );

    if (result.success && result.data) {
      // Filtrer uniquement les Reels
      const reels = result.data.data.filter(media => media.media_type === 'REEL');

      return {
        success: true,
        data: {
          data: reels.slice(0, params.limit),
          paging: result.data.paging,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère les détails d'un Reel
   */
  async getReel(params: z.infer<typeof GetReelSchema>): Promise<ApiResponse<InstagramMedia>> {
    const defaultFields = [
      'id', 'media_type', 'media_url', 'thumbnail_url', 'permalink',
      'caption', 'timestamp', 'like_count', 'comments_count', 'username',
    ];

    const fields = params.fields || defaultFields;

    const result = await this.client.get<InstagramMedia>(
      `/${params.reel_id}`,
      { fields: fields.join(',') }
    );

    return result;
  }

  /**
   * Supprime un Reel
   */
  async deleteReel(params: z.infer<typeof DeleteReelSchema>): Promise<ApiResponse<{ success: boolean }>> {
    // Private API nécessaire pour la suppression
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La suppression nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.reel_id}/delete/`,
      {},
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Récupère les insights d'un Reel
   */
  async getReelInsights(params: z.infer<typeof GetReelInsightsSchema>): Promise<ApiResponse<Record<string, number>>> {
    const result = await this.client.get<{
      data: Array<{ name: string; values: Array<{ value: number }> }>;
    }>(
      `/${params.reel_id}/insights`,
      { metric: params.metrics.join(',') }
    );

    if (result.success && result.data) {
      const insights: Record<string, number> = {};
      for (const metric of result.data.data) {
        insights[metric.name] = metric.values[0]?.value || 0;
      }
      return { success: true, data: insights };
    }

    return { success: false, error: result.error };
  }

  /**
   * Recherche des audios tendance
   */
  async getTrendingAudios(limit: number = 20): Promise<ApiResponse<Array<{ id: string; name: string; author: string }>>> {
    // Cette fonctionnalité nécessite la Private API
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Les audios tendance nécessitent la Private API',
        },
      };
    }

    const result = await this.client.get<{
      items: Array<{
        audio_asset_id: string;
        title: string;
        display_artist: string;
      }>;
    }>(
      '/clips/trending_audio/',
      { count: limit },
      { api: 'private' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: result.data.items.map(item => ({
          id: item.audio_asset_id,
          name: item.title,
          author: item.display_artist,
        })),
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Attend le traitement de la vidéo
   */
  private async waitForVideoProcessing(containerId: string, maxAttempts: number = 60): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.client.get<{
        status_code: string;
        status: string;
      }>(
        `/${containerId}`,
        { fields: 'status_code,status' }
      );

      const statusCode = result.data?.status_code;

      if (statusCode === 'FINISHED') {
        return true;
      }

      if (statusCode === 'ERROR') {
        console.error('Erreur de traitement vidéo:', result.data?.status);
        return false;
      }

      // IN_PROGRESS - attendre 3 secondes avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return false;
  }
}
