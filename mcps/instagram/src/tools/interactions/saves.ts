/**
 * Tools pour la gestion des sauvegardes Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramMedia, InstagramCollection, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const SaveMediaSchema = z.object({
  media_id: z.string().describe('ID du média à sauvegarder'),
  collection_id: z.string().optional().describe('ID de la collection (optionnel)'),
});

export const UnsaveMediaSchema = z.object({
  media_id: z.string().describe('ID du média à retirer des sauvegardes'),
  collection_id: z.string().optional().describe('ID de la collection'),
});

export const ListSavedMediaSchema = z.object({
  collection_id: z.string().optional().describe('ID de la collection (sinon toutes)'),
  limit: z.number().min(1).max(50).default(25).describe('Nombre de médias'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const CreateCollectionSchema = z.object({
  name: z.string().min(1).max(50).describe('Nom de la collection'),
});

export const UpdateCollectionSchema = z.object({
  collection_id: z.string().describe('ID de la collection'),
  name: z.string().min(1).max(50).describe('Nouveau nom'),
});

export const DeleteCollectionSchema = z.object({
  collection_id: z.string().describe('ID de la collection à supprimer'),
});

export const ListCollectionsSchema = z.object({
  limit: z.number().min(1).max(50).default(25).describe('Nombre de collections'),
});

export const AddToCollectionSchema = z.object({
  collection_id: z.string().describe('ID de la collection'),
  media_ids: z.array(z.string()).min(1).max(50).describe('IDs des médias à ajouter'),
});

export const RemoveFromCollectionSchema = z.object({
  collection_id: z.string().describe('ID de la collection'),
  media_ids: z.array(z.string()).min(1).max(50).describe('IDs des médias à retirer'),
});

// ============================================
// Handlers
// ============================================

export class SavesTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Sauvegarde un média
   */
  async saveMedia(params: z.infer<typeof SaveMediaSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La sauvegarde nécessite la Private API' },
      };
    }

    const saveData: Record<string, unknown> = {};
    if (params.collection_id) {
      saveData.added_collection_ids = JSON.stringify([params.collection_id]);
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.media_id}/save/`,
      saveData,
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Retire un média des sauvegardes
   */
  async unsaveMedia(params: z.infer<typeof UnsaveMediaSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le retrait nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.media_id}/unsave/`,
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
   * Liste les médias sauvegardés
   */
  async listSavedMedia(params: z.infer<typeof ListSavedMediaSchema>): Promise<ApiResponse<PaginatedResponse<InstagramMedia>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les sauvegardes nécessitent la Private API' },
      };
    }

    const endpoint = params.collection_id
      ? `/feed/collection/${params.collection_id}/`
      : '/feed/saved/';

    const result = await this.client.get<{
      items: Array<{
        media: {
          id: string;
          pk: string;
          media_type: number;
          image_versions2?: { candidates: Array<{ url: string }> };
          video_versions?: Array<{ url: string }>;
          caption?: { text: string };
          taken_at: number;
          like_count: number;
          comment_count: number;
          user: { username: string };
        };
      }>;
      next_max_id?: string;
    }>(
      endpoint,
      {
        count: params.limit,
        max_id: params.cursor,
      },
      { api: 'private' }
    );

    if (result.success && result.data) {
      const mediaList: InstagramMedia[] = result.data.items.map(item => {
        const m = item.media;
        const mediaType = m.media_type === 2 ? 'VIDEO' : m.media_type === 8 ? 'CAROUSEL_ALBUM' : 'IMAGE';

        return {
          id: m.pk || m.id,
          media_type: mediaType,
          media_url: m.video_versions?.[0]?.url || m.image_versions2?.candidates[0]?.url || '',
          caption: m.caption?.text,
          timestamp: new Date(m.taken_at * 1000).toISOString(),
          like_count: m.like_count,
          comments_count: m.comment_count,
          username: m.user.username,
        };
      });

      return {
        success: true,
        data: {
          data: mediaList,
          paging: result.data.next_max_id
            ? { cursors: { after: result.data.next_max_id } }
            : undefined,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Crée une nouvelle collection
   */
  async createCollection(params: z.infer<typeof CreateCollectionSchema>): Promise<ApiResponse<{ id: string }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les collections nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{
      collection_id: string;
      collection_name: string;
    }>(
      '/collections/create/',
      { name: params.name },
      { api: 'private' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: { id: result.data.collection_id },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Met à jour une collection
   */
  async updateCollection(params: z.infer<typeof UpdateCollectionSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les collections nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/collections/${params.collection_id}/edit/`,
      { name: params.name },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Supprime une collection
   */
  async deleteCollection(params: z.infer<typeof DeleteCollectionSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les collections nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/collections/${params.collection_id}/delete/`,
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
   * Liste les collections
   */
  async listCollections(params: z.infer<typeof ListCollectionsSchema>): Promise<ApiResponse<InstagramCollection[]>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les collections nécessitent la Private API' },
      };
    }

    const result = await this.client.get<{
      items: Array<{
        collection_id: string;
        collection_name: string;
        collection_media_count: number;
        cover_media?: {
          image_versions2?: { candidates: Array<{ url: string }> };
        };
      }>;
    }>(
      '/collections/list/',
      { count: params.limit },
      { api: 'private' }
    );

    if (result.success && result.data) {
      const collections: InstagramCollection[] = result.data.items.map(c => ({
        id: c.collection_id,
        name: c.collection_name,
        media_count: c.collection_media_count,
        cover_media: c.cover_media
          ? { id: '', media_type: 'IMAGE', media_url: c.cover_media.image_versions2?.candidates[0]?.url }
          : undefined,
      }));

      return { success: true, data: collections };
    }

    return { success: false, error: result.error };
  }

  /**
   * Ajoute des médias à une collection
   */
  async addToCollection(params: z.infer<typeof AddToCollectionSchema>): Promise<ApiResponse<{ success: boolean; added_count: number }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les collections nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/collections/${params.collection_id}/edit/`,
      { added_media_ids: JSON.stringify(params.media_ids) },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: {
        success: result.data?.status === 'ok',
        added_count: params.media_ids.length,
      },
      error: result.error,
    };
  }

  /**
   * Retire des médias d'une collection
   */
  async removeFromCollection(params: z.infer<typeof RemoveFromCollectionSchema>): Promise<ApiResponse<{ success: boolean; removed_count: number }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les collections nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/collections/${params.collection_id}/edit/`,
      { removed_media_ids: JSON.stringify(params.media_ids) },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: {
        success: result.data?.status === 'ok',
        removed_count: params.media_ids.length,
      },
      error: result.error,
    };
  }
}
