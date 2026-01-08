/**
 * Tools pour la gestion des messages directs (DMs) Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramThread, InstagramMessage, InstagramUser, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const ListThreadsSchema = z.object({
  folder: z.enum(['inbox', 'pending', 'general']).default('inbox').describe('Dossier de messages'),
  limit: z.number().min(1).max(50).default(20).describe('Nombre de conversations'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const GetThreadSchema = z.object({
  thread_id: z.string().describe('ID de la conversation'),
  limit: z.number().min(1).max(50).default(20).describe('Nombre de messages'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const CreateThreadSchema = z.object({
  recipient_ids: z.array(z.string()).min(1).max(32).describe('IDs des destinataires'),
  message: z.string().optional().describe('Message initial'),
});

export const SendMessageSchema = z.object({
  thread_id: z.string().describe('ID de la conversation'),
  text: z.string().max(1000).optional().describe('Texte du message'),
  media_url: z.string().url().optional().describe('URL du média à envoyer'),
  media_type: z.enum(['image', 'video', 'voice']).optional().describe('Type de média'),
  shared_media_id: z.string().optional().describe('ID d\'un post à partager'),
  reply_to_message_id: z.string().optional().describe('ID du message auquel répondre'),
});

export const DeleteMessageSchema = z.object({
  thread_id: z.string().describe('ID de la conversation'),
  message_id: z.string().describe('ID du message à supprimer'),
});

export const ReactToMessageSchema = z.object({
  thread_id: z.string().describe('ID de la conversation'),
  message_id: z.string().describe('ID du message'),
  emoji: z.string().describe('Emoji de réaction'),
});

export const MuteThreadSchema = z.object({
  thread_id: z.string().describe('ID de la conversation'),
  duration: z.enum(['1h', '8h', '24h', '1w', 'forever']).default('forever').describe('Durée du mute'),
});

export const UnmuteThreadSchema = z.object({
  thread_id: z.string().describe('ID de la conversation'),
});

export const LeaveThreadSchema = z.object({
  thread_id: z.string().describe('ID de la conversation de groupe'),
});

export const AddToThreadSchema = z.object({
  thread_id: z.string().describe('ID de la conversation de groupe'),
  user_ids: z.array(z.string()).min(1).describe('IDs des utilisateurs à ajouter'),
});

export const MarkAsReadSchema = z.object({
  thread_id: z.string().describe('ID de la conversation'),
});

export const SearchMessagesSchema = z.object({
  query: z.string().min(1).describe('Texte à rechercher'),
  limit: z.number().min(1).max(50).default(20).describe('Nombre de résultats'),
});

// ============================================
// Handlers
// ============================================

export class MessagingTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Liste les conversations
   */
  async listThreads(params: z.infer<typeof ListThreadsSchema>): Promise<ApiResponse<PaginatedResponse<InstagramThread>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les DMs nécessitent la Private API' },
      };
    }

    const endpoint = params.folder === 'pending'
      ? '/direct_v2/pending_inbox/'
      : '/direct_v2/inbox/';

    const result = await this.client.get<{
      inbox: {
        threads: Array<{
          thread_id: string;
          thread_title: string;
          is_group: boolean;
          last_activity_at: number;
          muted_until: number | null;
          users: Array<{
            pk: string;
            username: string;
            full_name: string;
            profile_pic_url: string;
          }>;
          items?: Array<{
            item_id: string;
            user_id: string;
            timestamp: number;
            text?: string;
          }>;
        }>;
      };
      pending_requests_total?: number;
      cursor?: string;
    }>(
      endpoint,
      {
        limit: params.limit,
        cursor: params.cursor,
      },
      { api: 'private', rateLimitCategory: 'messages' }
    );

    if (result.success && result.data) {
      const threads: InstagramThread[] = result.data.inbox.threads.map(t => ({
        id: t.thread_id,
        thread_title: t.thread_title,
        is_group: t.is_group,
        last_activity_at: new Date(t.last_activity_at / 1000).toISOString(),
        muted_until: t.muted_until ? new Date(t.muted_until * 1000).toISOString() : undefined,
        participants: t.users.map(u => ({
          id: u.pk,
          username: u.username,
          name: u.full_name,
          profile_picture_url: u.profile_pic_url,
        })),
      }));

      return {
        success: true,
        data: {
          data: threads,
          paging: result.data.cursor
            ? { cursors: { after: result.data.cursor } }
            : undefined,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère une conversation avec ses messages
   */
  async getThread(params: z.infer<typeof GetThreadSchema>): Promise<ApiResponse<{
    thread: InstagramThread;
    messages: InstagramMessage[];
  }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les DMs nécessitent la Private API' },
      };
    }

    const result = await this.client.get<{
      thread: {
        thread_id: string;
        thread_title: string;
        is_group: boolean;
        users: Array<{
          pk: string;
          username: string;
          full_name: string;
          profile_pic_url: string;
        }>;
        items: Array<{
          item_id: string;
          user_id: string;
          timestamp: number;
          item_type: string;
          text?: string;
          media?: { url: string };
          voice_media?: { url: string };
          reactions?: { emojis: Array<{ emoji: string; sender_id: string }> };
        }>;
      };
      cursor?: string;
    }>(
      `/direct_v2/threads/${params.thread_id}/`,
      {
        limit: params.limit,
        cursor: params.cursor,
      },
      { api: 'private' }
    );

    if (result.success && result.data) {
      const t = result.data.thread;

      const thread: InstagramThread = {
        id: t.thread_id,
        thread_title: t.thread_title,
        is_group: t.is_group,
        participants: t.users.map(u => ({
          id: u.pk,
          username: u.username,
          name: u.full_name,
          profile_picture_url: u.profile_pic_url,
        })),
      };

      const messages: InstagramMessage[] = t.items.map(item => ({
        id: item.item_id,
        thread_id: t.thread_id,
        sender_id: item.user_id,
        timestamp: new Date(item.timestamp / 1000).toISOString(),
        text: item.text,
        media_url: item.media?.url || item.voice_media?.url,
        media_type: item.item_type === 'voice_media' ? 'VOICE' : item.media ? 'IMAGE' : undefined,
        reactions: item.reactions?.emojis.map(r => ({
          emoji: r.emoji,
          user_id: r.sender_id,
          timestamp: '',
        })),
      }));

      return {
        success: true,
        data: { thread, messages },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Crée une nouvelle conversation
   */
  async createThread(params: z.infer<typeof CreateThreadSchema>): Promise<ApiResponse<{ thread_id: string }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les DMs nécessitent la Private API' },
      };
    }

    const threadData: Record<string, unknown> = {
      recipient_users: JSON.stringify(params.recipient_ids),
    };

    if (params.message) {
      threadData.text = params.message;
    }

    const result = await this.client.post<{
      thread_id: string;
      status: string;
    }>(
      '/direct_v2/threads/broadcast/text/',
      threadData,
      { api: 'private', rateLimitCategory: 'messages' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: { thread_id: result.data.thread_id },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Envoie un message
   */
  async sendMessage(params: z.infer<typeof SendMessageSchema>): Promise<ApiResponse<{ message_id: string }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les DMs nécessitent la Private API' },
      };
    }

    let endpoint = '/direct_v2/threads/broadcast/';
    const messageData: Record<string, unknown> = {
      thread_ids: JSON.stringify([params.thread_id]),
    };

    // Détermine le type de message
    if (params.text) {
      endpoint += 'text/';
      messageData.text = params.text;
    } else if (params.shared_media_id) {
      endpoint += 'media_share/';
      messageData.media_id = params.shared_media_id;
    } else if (params.media_url) {
      // Upload nécessaire pour les médias
      endpoint += params.media_type === 'voice' ? 'voice/' : 'photo/';
      messageData.media_url = params.media_url;
    }

    if (params.reply_to_message_id) {
      messageData.replied_to_item_id = params.reply_to_message_id;
    }

    const result = await this.client.post<{
      item_id: string;
      status: string;
    }>(
      endpoint,
      messageData,
      { api: 'private', rateLimitCategory: 'messages' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: { message_id: result.data.item_id },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Supprime un message
   */
  async deleteMessage(params: z.infer<typeof DeleteMessageSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les DMs nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/direct_v2/threads/${params.thread_id}/items/${params.message_id}/delete/`,
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
   * Réagit à un message
   */
  async reactToMessage(params: z.infer<typeof ReactToMessageSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les réactions nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/direct_v2/threads/${params.thread_id}/items/${params.message_id}/reactions/`,
      {
        reaction_type: 'like',
        emoji: params.emoji,
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
   * Met une conversation en sourdine
   */
  async muteThread(params: z.infer<typeof MuteThreadSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le mute nécessite la Private API' },
      };
    }

    const durationMap: Record<string, number> = {
      '1h': 3600,
      '8h': 28800,
      '24h': 86400,
      '1w': 604800,
      'forever': 0,
    };

    const result = await this.client.post<{ status: string }>(
      `/direct_v2/threads/${params.thread_id}/mute/`,
      { mute_messages: true, mute_duration: durationMap[params.duration] },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Retire la sourdine d'une conversation
   */
  async unmuteThread(params: z.infer<typeof UnmuteThreadSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le unmute nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/direct_v2/threads/${params.thread_id}/unmute/`,
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
   * Quitte une conversation de groupe
   */
  async leaveThread(params: z.infer<typeof LeaveThreadSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Quitter un groupe nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/direct_v2/threads/${params.thread_id}/leave/`,
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
   * Ajoute des membres à une conversation de groupe
   */
  async addToThread(params: z.infer<typeof AddToThreadSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Ajouter des membres nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/direct_v2/threads/${params.thread_id}/add_user/`,
      { user_ids: JSON.stringify(params.user_ids) },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Marque une conversation comme lue
   */
  async markAsRead(params: z.infer<typeof MarkAsReadSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Marquer comme lu nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/direct_v2/threads/${params.thread_id}/mark_seen/`,
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
   * Recherche dans les messages
   */
  async searchMessages(params: z.infer<typeof SearchMessagesSchema>): Promise<ApiResponse<Array<{
    thread_id: string;
    message_id: string;
    text: string;
  }>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La recherche nécessite la Private API' },
      };
    }

    const result = await this.client.get<{
      results: Array<{
        thread_id: string;
        item_id: string;
        text: string;
      }>;
    }>(
      '/direct_v2/search/',
      { query: params.query, count: params.limit },
      { api: 'private' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: result.data.results.map(r => ({
          thread_id: r.thread_id,
          message_id: r.item_id,
          text: r.text,
        })),
      };
    }

    return { success: false, error: result.error };
  }
}
