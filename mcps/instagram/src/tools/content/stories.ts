/**
 * Tools pour la gestion des Stories Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramStory, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const CreateStorySchema = z.object({
  media_url: z.string().url().describe('URL de l\'image ou vidéo'),
  mentions: z.array(z.object({
    user_id: z.string(),
    username: z.string(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })).optional().describe('Mentions d\'utilisateurs'),
  link: z.object({
    url: z.string().url(),
    title: z.string().optional(),
  }).optional().describe('Lien cliquable (comptes vérifiés/10k+ followers)'),
  poll: z.object({
    question: z.string().max(80),
    options: z.array(z.string()).length(2),
  }).optional().describe('Sondage à 2 options'),
  quiz: z.object({
    question: z.string().max(80),
    options: z.array(z.string()).min(2).max(4),
    correct_answer_index: z.number().min(0).max(3),
  }).optional().describe('Quiz interactif'),
  countdown: z.object({
    title: z.string().max(30),
    end_time: z.string().describe('Date de fin ISO 8601'),
  }).optional().describe('Compte à rebours'),
  location_id: z.string().optional().describe('ID du lieu'),
  hashtags: z.array(z.string()).optional().describe('Hashtags à afficher'),
});

export const ListStoriesSchema = z.object({
  active_only: z.boolean().default(true).describe('Uniquement les stories actives (< 24h)'),
});

export const DeleteStorySchema = z.object({
  story_id: z.string().describe('ID de la story à supprimer'),
});

export const GetStoryViewersSchema = z.object({
  story_id: z.string().describe('ID de la story'),
  limit: z.number().min(1).max(100).default(50).describe('Nombre de viewers'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const ReplyToStorySchema = z.object({
  story_id: z.string().describe('ID de la story'),
  user_id: z.string().describe('ID de l\'auteur de la story'),
  message: z.string().max(1000).describe('Message de réponse'),
});

// ============================================
// Handlers
// ============================================

export class StoriesTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Crée une nouvelle story
   */
  async createStory(params: z.infer<typeof CreateStorySchema>): Promise<ApiResponse<{ id: string }>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const isVideo = /\.(mp4|mov|avi|webm)$/i.test(params.media_url);

    // Création du conteneur story
    const storyData: Record<string, unknown> = {
      media_type: 'STORIES',
    };

    if (isVideo) {
      storyData.video_url = params.media_url;
    } else {
      storyData.image_url = params.media_url;
    }

    // Graph API: Stories limitées, on utilise Private API pour les stickers
    if (this.client.getAuth().hasPrivateApiAuth() && (params.poll || params.quiz || params.countdown)) {
      return this.createStoryWithPrivateApi(params);
    }

    const containerResult = await this.client.post<{ id: string }>(
      `/${accountId}/media`,
      storyData,
      { rateLimitCategory: 'stories' }
    );

    if (!containerResult.success || !containerResult.data) {
      return containerResult;
    }

    // Attendre le traitement si vidéo
    if (isVideo) {
      await this.waitForProcessing(containerResult.data.id);
    }

    // Publier la story
    const publishResult = await this.client.post<{ id: string }>(
      `/${accountId}/media_publish`,
      { creation_id: containerResult.data.id }
    );

    return publishResult;
  }

  /**
   * Crée une story avec la Private API (pour les stickers interactifs)
   */
  private async createStoryWithPrivateApi(params: z.infer<typeof CreateStorySchema>): Promise<ApiResponse<{ id: string }>> {
    const storyData: Record<string, unknown> = {};

    // Configuration des stickers
    const stickers: unknown[] = [];

    if (params.poll) {
      stickers.push({
        type: 'poll',
        question: params.poll.question,
        tallies: params.poll.options.map(opt => ({ text: opt, count: 0 })),
        x: 0.5,
        y: 0.5,
        width: 0.7,
        height: 0.2,
      });
    }

    if (params.quiz) {
      stickers.push({
        type: 'quiz',
        question: params.quiz.question,
        options: params.quiz.options,
        correct_answer: params.quiz.correct_answer_index,
        x: 0.5,
        y: 0.5,
      });
    }

    if (params.countdown) {
      stickers.push({
        type: 'countdown',
        text: params.countdown.title,
        end_ts: new Date(params.countdown.end_time).getTime() / 1000,
        x: 0.5,
        y: 0.3,
      });
    }

    if (params.mentions) {
      for (const mention of params.mentions) {
        stickers.push({
          type: 'mention',
          user_id: mention.user_id,
          x: mention.x,
          y: mention.y,
        });
      }
    }

    if (params.link) {
      stickers.push({
        type: 'story_link',
        url: params.link.url,
        link_title: params.link.title || 'En savoir plus',
      });
    }

    if (stickers.length > 0) {
      storyData.story_sticker_ids = JSON.stringify(stickers);
    }

    const result = await this.client.post<{ media: { pk: string } }>(
      '/media/configure_to_story/',
      storyData,
      { api: 'private', rateLimitCategory: 'stories' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: { id: result.data.media.pk },
      };
    }

    return {
      success: false,
      error: result.error,
    };
  }

  /**
   * Liste les stories actives du compte
   */
  async listStories(params: z.infer<typeof ListStoriesSchema>): Promise<ApiResponse<InstagramStory[]>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const result = await this.client.get<{ data: InstagramStory[] }>(
      `/${accountId}/stories`,
      { fields: 'id,media_type,media_url,timestamp' }
    );

    if (result.success && result.data) {
      let stories = result.data.data || [];

      // Filtrer les stories actives si demandé
      if (params.active_only) {
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        stories = stories.filter(story => {
          const storyTime = new Date(story.timestamp).getTime();
          return now - storyTime < twentyFourHours;
        });
      }

      return { success: true, data: stories };
    }

    return {
      success: false,
      error: result.error,
    };
  }

  /**
   * Supprime une story
   */
  async deleteStory(params: z.infer<typeof DeleteStorySchema>): Promise<ApiResponse<{ success: boolean }>> {
    // Private API nécessaire pour la suppression
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La suppression de story nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/media/${params.story_id}/delete/`,
      { media_type: 'STORY' },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Récupère les viewers d'une story
   */
  async getStoryViewers(params: z.infer<typeof GetStoryViewersSchema>): Promise<ApiResponse<PaginatedResponse<{ id: string; username: string }>>> {
    // Private API nécessaire
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'Les viewers de story nécessitent la Private API',
        },
      };
    }

    const result = await this.client.get<{
      users: Array<{ pk: string; username: string }>;
      next_max_id?: string;
    }>(
      `/media/${params.story_id}/list_reel_media_viewer/`,
      {
        count: params.limit,
        max_id: params.cursor,
      },
      { api: 'private' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: {
          data: result.data.users.map(u => ({ id: u.pk, username: u.username })),
          paging: result.data.next_max_id
            ? { cursors: { after: result.data.next_max_id } }
            : undefined,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Répond à une story (envoie un DM)
   */
  async replyToStory(params: z.infer<typeof ReplyToStorySchema>): Promise<ApiResponse<{ message_id: string }>> {
    // Private API nécessaire
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'La réponse aux stories nécessite la Private API',
        },
      };
    }

    const result = await this.client.post<{ message_id: string }>(
      '/direct_v2/threads/broadcast/reel_share/',
      {
        recipient_users: JSON.stringify([params.user_id]),
        media_id: params.story_id,
        text: params.message,
      },
      { api: 'private', rateLimitCategory: 'messages' }
    );

    return result;
  }

  /**
   * Attend le traitement du média
   */
  private async waitForProcessing(containerId: string, maxAttempts: number = 20): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.client.get<{ status_code: string }>(
        `/${containerId}`,
        { fields: 'status_code' }
      );

      if (result.data?.status_code === 'FINISHED') return true;
      if (result.data?.status_code === 'ERROR') return false;

      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return false;
  }
}
