/**
 * Tools pour la gestion des likes Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramUser, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const LikeMediaSchema = z.object({
  media_id: z.string().describe('ID du média à liker'),
});

export const UnlikeMediaSchema = z.object({
  media_id: z.string().describe('ID du média à unliker'),
});

export const GetLikersSchema = z.object({
  media_id: z.string().describe('ID du média'),
  limit: z.number().min(1).max(100).default(50).describe('Nombre de likers'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const LikeCommentSchema = z.object({
  comment_id: z.string().describe('ID du commentaire à liker'),
});

export const UnlikeCommentSchema = z.object({
  comment_id: z.string().describe('ID du commentaire à unliker'),
});

// ============================================
// Handlers
// ============================================

export class LikesTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Like un média (post, reel, etc.)
   */
  async likeMedia(params: z.infer<typeof LikeMediaSchema>): Promise<ApiResponse<{ success: boolean }>> {
    // Private API nécessaire pour liker
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Le like nécessite la Private API (session_id)',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.media_id}/like/`,
      {
        media_id: params.media_id,
        module_name: 'feed_timeline',
      },
      { api: 'private', rateLimitCategory: 'likes' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Unlike un média
   */
  async unlikeMedia(params: z.infer<typeof UnlikeMediaSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Le unlike nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.media_id}/unlike/`,
      { media_id: params.media_id },
      { api: 'private', rateLimitCategory: 'likes' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Récupère la liste des personnes ayant liké un média
   */
  async getLikers(params: z.infer<typeof GetLikersSchema>): Promise<ApiResponse<PaginatedResponse<InstagramUser>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La liste des likers nécessite la Private API',
        },
      };
    }

    const result = await this.client.get<{
      users: Array<{
        pk: string;
        username: string;
        full_name: string;
        profile_pic_url: string;
        is_verified: boolean;
        is_private: boolean;
      }>;
      next_max_id?: string;
    }>(
      `/media/${params.media_id}/likers/`,
      {
        count: params.limit,
        max_id: params.cursor,
      },
      { api: 'private' }
    );

    if (result.success && result.data) {
      const users: InstagramUser[] = result.data.users.map(u => ({
        id: u.pk,
        username: u.username,
        name: u.full_name,
        profile_picture_url: u.profile_pic_url,
        is_verified: u.is_verified,
        is_private: u.is_private,
      }));

      return {
        success: true,
        data: {
          data: users,
          paging: result.data.next_max_id
            ? { cursors: { after: result.data.next_max_id } }
            : undefined,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Like un commentaire
   */
  async likeComment(params: z.infer<typeof LikeCommentSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Le like de commentaire nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.comment_id}/comment_like/`,
      {},
      { api: 'private', rateLimitCategory: 'likes' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Unlike un commentaire
   */
  async unlikeComment(params: z.infer<typeof UnlikeCommentSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Le unlike de commentaire nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.comment_id}/comment_unlike/`,
      {},
      { api: 'private', rateLimitCategory: 'likes' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Récupère les médias likés par l'utilisateur
   */
  async getLikedMedia(limit: number = 50, cursor?: string): Promise<ApiResponse<PaginatedResponse<{ media_id: string }>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Les médias likés nécessitent la Private API',
        },
      };
    }

    const result = await this.client.get<{
      items: Array<{ id: string }>;
      next_max_id?: string;
    }>(
      '/feed/liked/',
      {
        count: limit,
        max_id: cursor,
      },
      { api: 'private' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: {
          data: result.data.items.map(item => ({ media_id: item.id })),
          paging: result.data.next_max_id
            ? { cursors: { after: result.data.next_max_id } }
            : undefined,
        },
      };
    }

    return { success: false, error: result.error };
  }
}
