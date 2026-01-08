/**
 * Tools pour la gestion des Highlights Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramHighlight, InstagramStory, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const CreateHighlightSchema = z.object({
  title: z.string().min(1).max(16).describe('Titre du highlight (max 16 caractères)'),
  story_ids: z.array(z.string()).min(1).describe('IDs des stories à inclure'),
  cover_media_id: z.string().optional().describe('ID du média pour la couverture'),
});

export const UpdateHighlightSchema = z.object({
  highlight_id: z.string().describe('ID du highlight'),
  title: z.string().min(1).max(16).optional().describe('Nouveau titre'),
  story_ids: z.array(z.string()).optional().describe('Nouvelles stories'),
  cover_media_id: z.string().optional().describe('Nouveau média de couverture'),
});

export const DeleteHighlightSchema = z.object({
  highlight_id: z.string().describe('ID du highlight à supprimer'),
});

export const GetHighlightSchema = z.object({
  highlight_id: z.string().describe('ID du highlight'),
  include_stories: z.boolean().default(true).describe('Inclure les stories'),
});

export const ListHighlightsSchema = z.object({
  limit: z.number().min(1).max(50).default(25).describe('Nombre de highlights'),
});

export const AddStoryToHighlightSchema = z.object({
  highlight_id: z.string().describe('ID du highlight'),
  story_id: z.string().describe('ID de la story à ajouter'),
});

export const RemoveStoryFromHighlightSchema = z.object({
  highlight_id: z.string().describe('ID du highlight'),
  story_id: z.string().describe('ID de la story à retirer'),
});

// ============================================
// Handlers
// ============================================

export class HighlightsTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Crée un nouveau highlight
   */
  async createHighlight(params: z.infer<typeof CreateHighlightSchema>): Promise<ApiResponse<{ id: string }>> {
    // Les highlights nécessitent la Private API
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La création de highlights nécessite la Private API',
        },
      };
    }

    const highlightData: Record<string, unknown> = {
      title: params.title,
      media_ids: JSON.stringify(params.story_ids),
      source: 'self_profile',
    };

    if (params.cover_media_id) {
      highlightData.cover_media_id = params.cover_media_id;
    }

    const result = await this.client.post<{ reel: { id: string } }>(
      '/highlights/create_reel/',
      highlightData,
      { api: 'private' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: { id: result.data.reel.id },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Met à jour un highlight existant
   */
  async updateHighlight(params: z.infer<typeof UpdateHighlightSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La modification de highlights nécessite la Private API',
        },
      };
    }

    const updateData: Record<string, unknown> = {
      reel_id: params.highlight_id,
    };

    if (params.title) updateData.title = params.title;
    if (params.story_ids) updateData.added_media_ids = JSON.stringify(params.story_ids);
    if (params.cover_media_id) updateData.cover_media_id = params.cover_media_id;

    const result = await this.client.post<{ status: string }>(
      '/highlights/edit_reel/',
      updateData,
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Supprime un highlight
   */
  async deleteHighlight(params: z.infer<typeof DeleteHighlightSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La suppression de highlights nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      '/highlights/delete_reel/',
      { reel_id: params.highlight_id },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Récupère un highlight avec ses stories
   */
  async getHighlight(params: z.infer<typeof GetHighlightSchema>): Promise<ApiResponse<InstagramHighlight>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Les highlights nécessitent la Private API',
        },
      };
    }

    const result = await this.client.get<{
      reels: Record<string, {
        id: string;
        title: string;
        cover_media: { cropped_image_version: { url: string } };
        media_count: number;
        items?: Array<{
          id: string;
          media_type: number;
          image_versions2?: { candidates: Array<{ url: string }> };
          video_versions?: Array<{ url: string }>;
          taken_at: number;
        }>;
      }>;
    }>(
      `/feed/reels_media/`,
      {
        reel_ids: params.highlight_id,
        include_reels_in_feed: params.include_stories,
      },
      { api: 'private' }
    );

    if (result.success && result.data) {
      const reel = result.data.reels[params.highlight_id];
      if (!reel) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Highlight non trouvé' },
        };
      }

      const highlight: InstagramHighlight = {
        id: reel.id,
        title: reel.title,
        cover_media_url: reel.cover_media?.cropped_image_version?.url,
        media_count: reel.media_count,
      };

      if (params.include_stories && reel.items) {
        highlight.stories = reel.items.map(item => ({
          id: item.id,
          media_type: item.media_type === 2 ? 'VIDEO' : 'IMAGE',
          media_url: item.video_versions?.[0]?.url || item.image_versions2?.candidates[0]?.url || '',
          timestamp: new Date(item.taken_at * 1000).toISOString(),
        }));
      }

      return { success: true, data: highlight };
    }

    return { success: false, error: result.error };
  }

  /**
   * Liste tous les highlights du compte
   */
  async listHighlights(params: z.infer<typeof ListHighlightsSchema>): Promise<ApiResponse<InstagramHighlight[]>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Les highlights nécessitent la Private API',
        },
      };
    }

    const result = await this.client.get<{
      tray: Array<{
        id: string;
        title: string;
        cover_media: { cropped_image_version: { url: string } };
        media_count: number;
      }>;
    }>(
      '/highlights/user_feed/',
      {},
      { api: 'private' }
    );

    if (result.success && result.data) {
      const highlights: InstagramHighlight[] = result.data.tray
        .slice(0, params.limit)
        .map(item => ({
          id: item.id,
          title: item.title,
          cover_media_url: item.cover_media?.cropped_image_version?.url,
          media_count: item.media_count,
        }));

      return { success: true, data: highlights };
    }

    return { success: false, error: result.error };
  }

  /**
   * Ajoute une story à un highlight existant
   */
  async addStoryToHighlight(params: z.infer<typeof AddStoryToHighlightSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La modification de highlights nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      '/highlights/edit_reel/',
      {
        reel_id: params.highlight_id,
        added_media_ids: JSON.stringify([params.story_id]),
      },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Retire une story d'un highlight
   */
  async removeStoryFromHighlight(params: z.infer<typeof RemoveStoryFromHighlightSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La modification de highlights nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      '/highlights/edit_reel/',
      {
        reel_id: params.highlight_id,
        removed_media_ids: JSON.stringify([params.story_id]),
      },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }
}
