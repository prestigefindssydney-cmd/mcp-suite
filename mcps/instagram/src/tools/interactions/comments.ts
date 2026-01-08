/**
 * Tools pour la gestion des commentaires Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramComment, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const CreateCommentSchema = z.object({
  media_id: z.string().describe('ID du média à commenter'),
  text: z.string().min(1).max(2200).describe('Texte du commentaire'),
  reply_to_comment_id: z.string().optional().describe('ID du commentaire parent (pour répondre)'),
});

export const DeleteCommentSchema = z.object({
  media_id: z.string().describe('ID du média'),
  comment_id: z.string().describe('ID du commentaire à supprimer'),
});

export const ListCommentsSchema = z.object({
  media_id: z.string().describe('ID du média'),
  limit: z.number().min(1).max(100).default(50).describe('Nombre de commentaires'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const HideCommentSchema = z.object({
  comment_id: z.string().describe('ID du commentaire à masquer'),
});

export const UnhideCommentSchema = z.object({
  comment_id: z.string().describe('ID du commentaire à afficher'),
});

export const PinCommentSchema = z.object({
  media_id: z.string().describe('ID du média'),
  comment_id: z.string().describe('ID du commentaire à épingler'),
});

export const UnpinCommentSchema = z.object({
  media_id: z.string().describe('ID du média'),
  comment_id: z.string().describe('ID du commentaire à désépingler'),
});

export const GetCommentRepliesSchema = z.object({
  media_id: z.string().describe('ID du média'),
  comment_id: z.string().describe('ID du commentaire parent'),
  limit: z.number().min(1).max(50).default(20).describe('Nombre de réponses'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const BulkDeleteCommentsSchema = z.object({
  media_id: z.string().describe('ID du média'),
  comment_ids: z.array(z.string()).min(1).max(25).describe('IDs des commentaires (max 25)'),
});

// ============================================
// Handlers
// ============================================

export class CommentsTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Crée un nouveau commentaire
   */
  async createComment(params: z.infer<typeof CreateCommentSchema>): Promise<ApiResponse<{ id: string }>> {
    // Graph API supporte les commentaires
    if (this.client.getAuth().hasGraphApiAuth()) {
      const result = await this.client.post<{ id: string }>(
        `/${params.media_id}/comments`,
        {
          message: params.text,
          ...(params.reply_to_comment_id && { replied_to_comment_id: params.reply_to_comment_id }),
        },
        { rateLimitCategory: 'write' }
      );

      return result;
    }

    // Fallback Private API
    if (this.client.getAuth().hasPrivateApiAuth()) {
      const endpoint = params.reply_to_comment_id
        ? `/media/${params.media_id}/comment/${params.reply_to_comment_id}/reply/`
        : `/media/${params.media_id}/comment/`;

      const result = await this.client.post<{ comment: { pk: string } }>(
        endpoint,
        { comment_text: params.text },
        { api: 'private', rateLimitCategory: 'write' }
      );

      if (result.success && result.data) {
        return {
          success: true,
          data: { id: result.data.comment.pk },
        };
      }

      return { success: false, error: result.error };
    }

    return {
      success: false,
      error: { code: 'NO_AUTH', message: 'Aucune méthode d\'authentification disponible' },
    };
  }

  /**
   * Supprime un commentaire
   */
  async deleteComment(params: z.infer<typeof DeleteCommentSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (this.client.getAuth().hasGraphApiAuth()) {
      const result = await this.client.delete<{ success: boolean }>(
        `/${params.comment_id}`
      );

      return {
        success: result.success,
        data: { success: true },
        error: result.error,
      };
    }

    if (this.client.getAuth().hasPrivateApiAuth()) {
      const result = await this.client.post<{ status: string }>(
        `/media/${params.media_id}/comment/${params.comment_id}/delete/`,
        {},
        { api: 'private' }
      );

      return {
        success: result.success && result.data?.status === 'ok',
        data: { success: result.data?.status === 'ok' },
        error: result.error,
      };
    }

    return {
      success: false,
      error: { code: 'NO_AUTH', message: 'Aucune méthode d\'authentification disponible' },
    };
  }

  /**
   * Liste les commentaires d'un média
   */
  async listComments(params: z.infer<typeof ListCommentsSchema>): Promise<ApiResponse<PaginatedResponse<InstagramComment>>> {
    if (this.client.getAuth().hasGraphApiAuth()) {
      const result = await this.client.get<{
        data: Array<{
          id: string;
          text: string;
          timestamp: string;
          username: string;
          like_count: number;
          hidden: boolean;
        }>;
        paging?: { cursors?: { after?: string } };
      }>(
        `/${params.media_id}/comments`,
        {
          fields: 'id,text,timestamp,username,like_count,hidden',
          limit: params.limit,
          after: params.cursor,
        }
      );

      if (result.success && result.data) {
        const comments: InstagramComment[] = result.data.data.map(c => ({
          id: c.id,
          text: c.text,
          timestamp: c.timestamp,
          username: c.username,
          like_count: c.like_count,
          is_hidden: c.hidden,
        }));

        return {
          success: true,
          data: {
            data: comments,
            paging: result.data.paging,
          },
        };
      }

      return { success: false, error: result.error };
    }

    // Private API
    if (this.client.getAuth().hasPrivateApiAuth()) {
      const result = await this.client.get<{
        comments: Array<{
          pk: string;
          text: string;
          created_at: number;
          user: { username: string; pk: string };
          comment_like_count: number;
        }>;
        next_min_id?: string;
      }>(
        `/media/${params.media_id}/comments/`,
        {
          count: params.limit,
          min_id: params.cursor,
        },
        { api: 'private' }
      );

      if (result.success && result.data) {
        const comments: InstagramComment[] = result.data.comments.map(c => ({
          id: c.pk,
          text: c.text,
          timestamp: new Date(c.created_at * 1000).toISOString(),
          username: c.user.username,
          user_id: c.user.pk,
          like_count: c.comment_like_count,
        }));

        return {
          success: true,
          data: {
            data: comments,
            paging: result.data.next_min_id
              ? { cursors: { after: result.data.next_min_id } }
              : undefined,
          },
        };
      }

      return { success: false, error: result.error };
    }

    return {
      success: false,
      error: { code: 'NO_AUTH', message: 'Aucune méthode d\'authentification disponible' },
    };
  }

  /**
   * Masque un commentaire
   */
  async hideComment(params: z.infer<typeof HideCommentSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (this.client.getAuth().hasGraphApiAuth()) {
      const result = await this.client.post<{ success: boolean }>(
        `/${params.comment_id}`,
        { hide: true }
      );

      return {
        success: result.success,
        data: { success: true },
        error: result.error,
      };
    }

    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Le masquage nécessite la Graph API' },
    };
  }

  /**
   * Affiche un commentaire masqué
   */
  async unhideComment(params: z.infer<typeof UnhideCommentSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (this.client.getAuth().hasGraphApiAuth()) {
      const result = await this.client.post<{ success: boolean }>(
        `/${params.comment_id}`,
        { hide: false }
      );

      return {
        success: result.success,
        data: { success: true },
        error: result.error,
      };
    }

    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'L\'affichage nécessite la Graph API' },
    };
  }

  /**
   * Épingle un commentaire
   */
  async pinComment(params: z.infer<typeof PinCommentSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'L\'épinglage nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.media_id}/comment/${params.comment_id}/pin/`,
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
   * Désépingle un commentaire
   */
  async unpinComment(params: z.infer<typeof UnpinCommentSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le désépinglage nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.media_id}/comment/${params.comment_id}/unpin/`,
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
   * Récupère les réponses à un commentaire
   */
  async getCommentReplies(params: z.infer<typeof GetCommentRepliesSchema>): Promise<ApiResponse<PaginatedResponse<InstagramComment>>> {
    if (this.client.getAuth().hasGraphApiAuth()) {
      const result = await this.client.get<{
        data: Array<{
          id: string;
          text: string;
          timestamp: string;
          username: string;
          like_count: number;
        }>;
        paging?: { cursors?: { after?: string } };
      }>(
        `/${params.comment_id}/replies`,
        {
          fields: 'id,text,timestamp,username,like_count',
          limit: params.limit,
          after: params.cursor,
        }
      );

      if (result.success && result.data) {
        const replies: InstagramComment[] = result.data.data.map(c => ({
          id: c.id,
          text: c.text,
          timestamp: c.timestamp,
          username: c.username,
          like_count: c.like_count,
          parent_id: params.comment_id,
        }));

        return {
          success: true,
          data: {
            data: replies,
            paging: result.data.paging,
          },
        };
      }

      return { success: false, error: result.error };
    }

    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Les réponses nécessitent la Graph API' },
    };
  }

  /**
   * Supprime plusieurs commentaires en une fois
   */
  async bulkDeleteComments(params: z.infer<typeof BulkDeleteCommentsSchema>): Promise<ApiResponse<{ deleted: number; failed: number }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La suppression en masse nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.media_id}/comment/bulk_delete/`,
      { comment_ids: JSON.stringify(params.comment_ids) },
      { api: 'private' }
    );

    if (result.success && result.data?.status === 'ok') {
      return {
        success: true,
        data: { deleted: params.comment_ids.length, failed: 0 },
      };
    }

    return {
      success: false,
      data: { deleted: 0, failed: params.comment_ids.length },
      error: result.error,
    };
  }
}
