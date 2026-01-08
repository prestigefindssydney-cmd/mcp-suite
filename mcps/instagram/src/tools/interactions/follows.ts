/**
 * Tools pour la gestion des follows Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramUser, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const FollowUserSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à suivre'),
});

export const UnfollowUserSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à ne plus suivre'),
});

export const GetFollowersSchema = z.object({
  user_id: z.string().optional().describe('ID de l\'utilisateur (défaut: compte connecté)'),
  limit: z.number().min(1).max(100).default(50).describe('Nombre de followers'),
  cursor: z.string().optional().describe('Curseur de pagination'),
  search_query: z.string().optional().describe('Recherche par nom/username'),
});

export const GetFollowingSchema = z.object({
  user_id: z.string().optional().describe('ID de l\'utilisateur (défaut: compte connecté)'),
  limit: z.number().min(1).max(100).default(50).describe('Nombre de following'),
  cursor: z.string().optional().describe('Curseur de pagination'),
  search_query: z.string().optional().describe('Recherche par nom/username'),
});

export const RemoveFollowerSchema = z.object({
  user_id: z.string().describe('ID du follower à retirer'),
});

export const CheckFollowStatusSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à vérifier'),
});

export const GetPendingFollowRequestsSchema = z.object({
  limit: z.number().min(1).max(50).default(25).describe('Nombre de demandes'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const ApproveFollowRequestSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à approuver'),
});

export const RejectFollowRequestSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à rejeter'),
});

// ============================================
// Handlers
// ============================================

export class FollowsTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Suit un utilisateur
   */
  async followUser(params: z.infer<typeof FollowUserSchema>): Promise<ApiResponse<{ success: boolean; status: string }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le follow nécessite la Private API' },
      };
    }

    const result = await this.client.post<{
      status: string;
      friendship_status: {
        following: boolean;
        outgoing_request: boolean;
      };
    }>(
      `/friendships/create/${params.user_id}/`,
      {},
      { api: 'private', rateLimitCategory: 'follows' }
    );

    if (result.success && result.data) {
      const status = result.data.friendship_status.following
        ? 'following'
        : result.data.friendship_status.outgoing_request
          ? 'requested'
          : 'failed';

      return {
        success: true,
        data: { success: true, status },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Ne plus suivre un utilisateur
   */
  async unfollowUser(params: z.infer<typeof UnfollowUserSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le unfollow nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/friendships/destroy/${params.user_id}/`,
      {},
      { api: 'private', rateLimitCategory: 'follows' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Récupère la liste des followers
   */
  async getFollowers(params: z.infer<typeof GetFollowersSchema>): Promise<ApiResponse<PaginatedResponse<InstagramUser>>> {
    const userId = params.user_id || this.client.getAuth().getBusinessAccountId();

    if (!userId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'User ID requis' },
      };
    }

    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les followers nécessitent la Private API' },
      };
    }

    const queryParams: Record<string, unknown> = {
      count: params.limit,
    };

    if (params.cursor) queryParams.max_id = params.cursor;
    if (params.search_query) queryParams.query = params.search_query;

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
      big_list: boolean;
    }>(
      `/friendships/${userId}/followers/`,
      queryParams,
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
   * Récupère la liste des utilisateurs suivis
   */
  async getFollowing(params: z.infer<typeof GetFollowingSchema>): Promise<ApiResponse<PaginatedResponse<InstagramUser>>> {
    const userId = params.user_id || this.client.getAuth().getBusinessAccountId();

    if (!userId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'User ID requis' },
      };
    }

    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les following nécessitent la Private API' },
      };
    }

    const queryParams: Record<string, unknown> = {
      count: params.limit,
    };

    if (params.cursor) queryParams.max_id = params.cursor;
    if (params.search_query) queryParams.query = params.search_query;

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
      `/friendships/${userId}/following/`,
      queryParams,
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
   * Retire un follower
   */
  async removeFollower(params: z.infer<typeof RemoveFollowerSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le retrait de follower nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/friendships/remove_follower/${params.user_id}/`,
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
   * Vérifie le statut de relation avec un utilisateur
   */
  async checkFollowStatus(params: z.infer<typeof CheckFollowStatusSchema>): Promise<ApiResponse<{
    following: boolean;
    followed_by: boolean;
    blocking: boolean;
    is_private: boolean;
    outgoing_request: boolean;
    incoming_request: boolean;
  }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le statut nécessite la Private API' },
      };
    }

    const result = await this.client.get<{
      following: boolean;
      followed_by: boolean;
      blocking: boolean;
      is_private: boolean;
      outgoing_request: boolean;
      incoming_request: boolean;
    }>(
      `/friendships/show/${params.user_id}/`,
      {},
      { api: 'private' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: {
          following: result.data.following,
          followed_by: result.data.followed_by,
          blocking: result.data.blocking,
          is_private: result.data.is_private,
          outgoing_request: result.data.outgoing_request,
          incoming_request: result.data.incoming_request,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère les demandes de follow en attente
   */
  async getPendingFollowRequests(params: z.infer<typeof GetPendingFollowRequestsSchema>): Promise<ApiResponse<PaginatedResponse<InstagramUser>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les demandes nécessitent la Private API' },
      };
    }

    const result = await this.client.get<{
      users: Array<{
        pk: string;
        username: string;
        full_name: string;
        profile_pic_url: string;
      }>;
      next_max_id?: string;
    }>(
      '/friendships/pending/',
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
   * Approuve une demande de follow
   */
  async approveFollowRequest(params: z.infer<typeof ApproveFollowRequestSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'L\'approbation nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/friendships/approve/${params.user_id}/`,
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
   * Rejette une demande de follow
   */
  async rejectFollowRequest(params: z.infer<typeof RejectFollowRequestSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le rejet nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/friendships/ignore/${params.user_id}/`,
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
   * Récupère les suggestions de comptes à suivre
   */
  async getSuggestions(limit: number = 20): Promise<ApiResponse<InstagramUser[]>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les suggestions nécessitent la Private API' },
      };
    }

    const result = await this.client.get<{
      users: Array<{
        pk: string;
        username: string;
        full_name: string;
        profile_pic_url: string;
        is_verified: boolean;
        follower_count: number;
      }>;
    }>(
      '/discover/ayml/',
      { count: limit },
      { api: 'private' }
    );

    if (result.success && result.data) {
      const users: InstagramUser[] = result.data.users.map(u => ({
        id: u.pk,
        username: u.username,
        name: u.full_name,
        profile_picture_url: u.profile_pic_url,
        is_verified: u.is_verified,
        followers_count: u.follower_count,
      }));

      return { success: true, data: users };
    }

    return { success: false, error: result.error };
  }
}
