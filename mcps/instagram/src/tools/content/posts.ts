/**
 * Tools pour la gestion des posts Instagram (Feed)
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramMedia, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const CreatePostSchema = z.object({
  media_url: z.string().url().describe('URL de l\'image ou vidéo à publier'),
  caption: z.string().max(2200).optional().describe('Légende du post (max 2200 caractères)'),
  location_id: z.string().optional().describe('ID du lieu à taguer'),
  user_tags: z.array(z.object({
    user_id: z.string(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })).optional().describe('Tags d\'utilisateurs sur la photo'),
  product_tags: z.array(z.object({
    product_id: z.string(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })).optional().describe('Tags de produits pour le shopping'),
});

export const CreateCarouselSchema = z.object({
  media_urls: z.array(z.string().url()).min(2).max(10).describe('URLs des médias (2-10)'),
  caption: z.string().max(2200).optional().describe('Légende du carrousel'),
  location_id: z.string().optional().describe('ID du lieu'),
});

export const EditPostSchema = z.object({
  post_id: z.string().describe('ID du post à modifier'),
  caption: z.string().max(2200).optional().describe('Nouvelle légende'),
  location_id: z.string().optional().describe('Nouveau lieu'),
  disable_comments: z.boolean().optional().describe('Désactiver les commentaires'),
});

export const GetPostSchema = z.object({
  post_id: z.string().describe('ID du post'),
  fields: z.array(z.string()).optional().describe('Champs à récupérer'),
});

export const ListPostsSchema = z.object({
  limit: z.number().min(1).max(100).default(25).describe('Nombre de posts à récupérer'),
  cursor: z.string().optional().describe('Curseur de pagination'),
  since: z.string().optional().describe('Date de début (ISO 8601)'),
  until: z.string().optional().describe('Date de fin (ISO 8601)'),
});

export const DeletePostSchema = z.object({
  post_id: z.string().describe('ID du post à supprimer'),
});

// ============================================
// Handlers
// ============================================

export class PostsTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Crée un nouveau post (image ou vidéo)
   */
  async createPost(params: z.infer<typeof CreatePostSchema>): Promise<ApiResponse<{ id: string; permalink: string }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    // Détermine le type de média
    const isVideo = /\.(mp4|mov|avi|webm)$/i.test(params.media_url);
    const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

    // Étape 1: Créer le conteneur
    const containerData: Record<string, unknown> = {};

    if (mediaType === 'IMAGE') {
      containerData.image_url = params.media_url;
    } else {
      containerData.video_url = params.media_url;
      containerData.media_type = 'VIDEO';
    }

    if (params.caption) containerData.caption = params.caption;
    if (params.location_id) containerData.location_id = params.location_id;

    if (params.user_tags && params.user_tags.length > 0) {
      containerData.user_tags = params.user_tags.map(tag => ({
        username: tag.user_id,
        x: tag.x,
        y: tag.y,
      }));
    }

    if (params.product_tags && params.product_tags.length > 0) {
      containerData.product_tags = params.product_tags;
    }

    const containerResult = await this.client.post<{ id: string }>(
      `/${accountId}/media`,
      containerData,
      { rateLimitCategory: 'content_publish' }
    );

    if (!containerResult.success || !containerResult.data) {
      return containerResult as ApiResponse<{ id: string; permalink: string }>;
    }

    // Pour les vidéos, attendre le traitement
    if (mediaType === 'VIDEO') {
      await this.waitForMediaProcessing(containerResult.data.id);
    }

    // Étape 2: Publier
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
   * Crée un carrousel (2-10 images/vidéos)
   */
  async createCarousel(params: z.infer<typeof CreateCarouselSchema>): Promise<ApiResponse<{ id: string; permalink: string }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    // Étape 1: Créer les conteneurs pour chaque média
    const childrenIds: string[] = [];

    for (const url of params.media_urls) {
      const isVideo = /\.(mp4|mov|avi|webm)$/i.test(url);

      const childData: Record<string, unknown> = {
        is_carousel_item: true,
      };

      if (isVideo) {
        childData.video_url = url;
        childData.media_type = 'VIDEO';
      } else {
        childData.image_url = url;
      }

      const childResult = await this.client.post<{ id: string }>(
        `/${accountId}/media`,
        childData,
        { rateLimitCategory: 'content_publish' }
      );

      if (!childResult.success || !childResult.data) {
        return {
          success: false,
          error: { code: 'CAROUSEL_ERROR', message: `Échec création item carrousel: ${url}` },
        };
      }

      // Attendre le traitement si c'est une vidéo
      if (isVideo) {
        await this.waitForMediaProcessing(childResult.data.id);
      }

      childrenIds.push(childResult.data.id);
    }

    // Étape 2: Créer le conteneur carrousel
    const carouselData: Record<string, unknown> = {
      media_type: 'CAROUSEL',
      children: childrenIds.join(','),
    };

    if (params.caption) carouselData.caption = params.caption;
    if (params.location_id) carouselData.location_id = params.location_id;

    const carouselResult = await this.client.post<{ id: string }>(
      `/${accountId}/media`,
      carouselData
    );

    if (!carouselResult.success || !carouselResult.data) {
      return carouselResult as ApiResponse<{ id: string; permalink: string }>;
    }

    // Étape 3: Publier le carrousel
    const publishResult = await this.client.post<{ id: string }>(
      `/${accountId}/media_publish`,
      { creation_id: carouselResult.data.id }
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
   * Modifie un post existant
   */
  async editPost(params: z.infer<typeof EditPostSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const updateData: Record<string, unknown> = {};

    if (params.caption !== undefined) updateData.caption = params.caption;
    if (params.disable_comments !== undefined) updateData.comment_enabled = !params.disable_comments;

    const result = await this.client.post<{ success: boolean }>(
      `/${params.post_id}`,
      updateData
    );

    return result;
  }

  /**
   * Récupère les détails d'un post
   */
  async getPost(params: z.infer<typeof GetPostSchema>): Promise<ApiResponse<InstagramMedia>> {
    const defaultFields = [
      'id', 'media_type', 'media_url', 'thumbnail_url', 'permalink',
      'caption', 'timestamp', 'like_count', 'comments_count', 'username',
    ];

    const fields = params.fields || defaultFields;

    const result = await this.client.get<InstagramMedia>(
      `/${params.post_id}`,
      { fields: fields.join(',') }
    );

    return result;
  }

  /**
   * Liste les posts du compte
   */
  async listPosts(params: z.infer<typeof ListPostsSchema>): Promise<ApiResponse<PaginatedResponse<InstagramMedia>>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const queryParams: Record<string, unknown> = {
      fields: 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,comments_count',
      limit: params.limit,
    };

    if (params.cursor) queryParams.after = params.cursor;
    if (params.since) queryParams.since = params.since;
    if (params.until) queryParams.until = params.until;

    const result = await this.client.get<PaginatedResponse<InstagramMedia>>(
      `/${accountId}/media`,
      queryParams
    );

    return result;
  }

  /**
   * Supprime un post
   */
  async deletePost(params: z.infer<typeof DeletePostSchema>): Promise<ApiResponse<{ success: boolean }>> {
    // Note: L'API Graph ne supporte pas la suppression directe
    // On utilise la Private API si disponible
    if (this.client.getAuth().hasPrivateApiAuth()) {
      const result = await this.client.post<{ status: string }>(
        `/media/${params.post_id}/delete/`,
        {},
        { api: 'private' }
      );

      return {
        success: result.success,
        data: { success: result.data?.status === 'ok' },
        error: result.error,
      };
    }

    return {
      success: false,
      error: {
        code: 'NOT_SUPPORTED',
        message: 'La suppression nécessite la Private API (session_id)',
      },
    };
  }

  /**
   * Attend que le média soit traité (pour les vidéos)
   */
  private async waitForMediaProcessing(containerId: string, maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.client.get<{ status_code: string }>(
        `/${containerId}`,
        { fields: 'status_code' }
      );

      if (result.data?.status_code === 'FINISHED') {
        return true;
      }

      if (result.data?.status_code === 'ERROR') {
        return false;
      }

      // Attendre 2 secondes avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return false;
  }
}
