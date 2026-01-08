/**
 * Tools pour la gestion du profil et compte Instagram
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramUser, BlockedUser, RestrictedUser, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const GetProfileSchema = z.object({});

export const UpdateProfileSchema = z.object({
  username: z.string().min(1).max(30).optional().describe('Nouveau nom d\'utilisateur'),
  name: z.string().max(30).optional().describe('Nom affiché'),
  biography: z.string().max(150).optional().describe('Bio'),
  website: z.string().url().optional().describe('Site web'),
  phone_number: z.string().optional().describe('Numéro de téléphone'),
  email: z.string().email().optional().describe('Email'),
  category: z.string().optional().describe('Catégorie business'),
  is_private: z.boolean().optional().describe('Compte privé'),
});

export const UpdateProfilePictureSchema = z.object({
  image_url: z.string().url().describe('URL de la nouvelle photo de profil'),
});

export const GetUserSchema = z.object({
  user_id: z.string().optional().describe('ID de l\'utilisateur'),
  username: z.string().optional().describe('Nom d\'utilisateur'),
});

export const SearchUsersSchema = z.object({
  query: z.string().min(1).describe('Recherche'),
  limit: z.number().min(1).max(50).default(20).describe('Nombre de résultats'),
});

export const SearchHashtagsSchema = z.object({
  query: z.string().min(1).describe('Recherche'),
  limit: z.number().min(1).max(30).default(20).describe('Nombre de résultats'),
});

export const SearchLocationsSchema = z.object({
  query: z.string().min(1).describe('Recherche'),
  limit: z.number().min(1).max(30).default(20).describe('Nombre de résultats'),
});

export const BlockUserSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à bloquer'),
});

export const UnblockUserSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à débloquer'),
});

export const RestrictUserSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à restreindre'),
});

export const UnrestrictUserSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à ne plus restreindre'),
});

export const ListBlockedUsersSchema = z.object({
  limit: z.number().min(1).max(50).default(25).describe('Nombre d\'utilisateurs'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const AddCloseFriendSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur'),
});

export const RemoveCloseFriendSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur'),
});

export const ListCloseFriendsSchema = z.object({
  limit: z.number().min(1).max(50).default(25).describe('Nombre d\'utilisateurs'),
});

export const ReportUserSchema = z.object({
  user_id: z.string().describe('ID de l\'utilisateur à signaler'),
  reason: z.enum(['spam', 'inappropriate', 'harassment', 'self_harm', 'hate_speech', 'violence', 'scam']).describe('Raison du signalement'),
});

// ============================================
// Handlers
// ============================================

export class AccountTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Récupère le profil du compte connecté
   */
  async getProfile(): Promise<ApiResponse<InstagramUser>> {
    const accountId = this.client.getAuth().getBusinessAccountId();

    if (this.client.getAuth().hasGraphApiAuth() && accountId) {
      const result = await this.client.get<InstagramUser>(
        `/${accountId}`,
        {
          fields: 'id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,website',
        }
      );

      return result;
    }

    if (this.client.getAuth().hasPrivateApiAuth()) {
      const result = await this.client.get<{
        user: {
          pk: string;
          username: string;
          full_name: string;
          biography: string;
          profile_pic_url: string;
          follower_count: number;
          following_count: number;
          media_count: number;
          external_url: string;
          is_verified: boolean;
          is_private: boolean;
          is_business: boolean;
        };
      }>(
        '/accounts/current_user/',
        { edit: true },
        { api: 'private' }
      );

      if (result.success && result.data) {
        const u = result.data.user;
        return {
          success: true,
          data: {
            id: u.pk,
            username: u.username,
            name: u.full_name,
            biography: u.biography,
            profile_picture_url: u.profile_pic_url,
            followers_count: u.follower_count,
            follows_count: u.following_count,
            media_count: u.media_count,
            website: u.external_url,
            is_verified: u.is_verified,
            is_private: u.is_private,
            is_business_account: u.is_business,
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
   * Met à jour le profil
   */
  async updateProfile(params: z.infer<typeof UpdateProfileSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La modification du profil nécessite la Private API' },
      };
    }

    const updateData: Record<string, unknown> = {};

    if (params.username) updateData.username = params.username;
    if (params.name) updateData.first_name = params.name;
    if (params.biography) updateData.biography = params.biography;
    if (params.website) updateData.external_url = params.website;
    if (params.phone_number) updateData.phone_number = params.phone_number;
    if (params.email) updateData.email = params.email;

    const result = await this.client.post<{ status: string }>(
      '/accounts/edit_profile/',
      updateData,
      { api: 'private' }
    );

    // Gérer le changement de privacité séparément
    if (params.is_private !== undefined) {
      const privacyEndpoint = params.is_private
        ? '/accounts/set_private/'
        : '/accounts/set_public/';

      await this.client.post(privacyEndpoint, {}, { api: 'private' });
    }

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Met à jour la photo de profil
   */
  async updateProfilePicture(params: z.infer<typeof UpdateProfilePictureSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La modification nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      '/accounts/change_profile_picture/',
      { picture_url: params.image_url },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Récupère les infos d'un utilisateur
   */
  async getUser(params: z.infer<typeof GetUserSchema>): Promise<ApiResponse<InstagramUser>> {
    if (!params.user_id && !params.username) {
      return {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'user_id ou username requis' },
      };
    }

    if (this.client.getAuth().hasPrivateApiAuth()) {
      let userId = params.user_id;

      // Si on a le username, récupérer l'ID
      if (!userId && params.username) {
        const searchResult = await this.client.get<{
          user: { pk: string };
        }>(
          `/users/${params.username}/usernameinfo/`,
          {},
          { api: 'private' }
        );

        if (searchResult.success && searchResult.data) {
          userId = searchResult.data.user.pk;
        } else {
          return { success: false, error: searchResult.error };
        }
      }

      const result = await this.client.get<{
        user: {
          pk: string;
          username: string;
          full_name: string;
          biography: string;
          profile_pic_url: string;
          follower_count: number;
          following_count: number;
          media_count: number;
          external_url: string;
          is_verified: boolean;
          is_private: boolean;
          is_business: boolean;
          category: string;
        };
      }>(
        `/users/${userId}/info/`,
        {},
        { api: 'private' }
      );

      if (result.success && result.data) {
        const u = result.data.user;
        return {
          success: true,
          data: {
            id: u.pk,
            username: u.username,
            name: u.full_name,
            biography: u.biography,
            profile_picture_url: u.profile_pic_url,
            followers_count: u.follower_count,
            follows_count: u.following_count,
            media_count: u.media_count,
            website: u.external_url,
            is_verified: u.is_verified,
            is_private: u.is_private,
            is_business_account: u.is_business,
          },
        };
      }

      return { success: false, error: result.error };
    }

    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'La récupération d\'utilisateur nécessite la Private API' },
    };
  }

  /**
   * Recherche des utilisateurs
   */
  async searchUsers(params: z.infer<typeof SearchUsersSchema>): Promise<ApiResponse<InstagramUser[]>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La recherche nécessite la Private API' },
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
        follower_count: number;
      }>;
    }>(
      '/users/search/',
      { q: params.query, count: params.limit },
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
        followers_count: u.follower_count,
      }));

      return { success: true, data: users };
    }

    return { success: false, error: result.error };
  }

  /**
   * Recherche des hashtags
   */
  async searchHashtags(params: z.infer<typeof SearchHashtagsSchema>): Promise<ApiResponse<Array<{ id: string; name: string; media_count: number }>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La recherche nécessite la Private API' },
      };
    }

    const result = await this.client.get<{
      results: Array<{
        id: string;
        name: string;
        media_count: number;
      }>;
    }>(
      '/tags/search/',
      { q: params.query, count: params.limit },
      { api: 'private' }
    );

    if (result.success && result.data) {
      return { success: true, data: result.data.results };
    }

    return { success: false, error: result.error };
  }

  /**
   * Recherche des lieux
   */
  async searchLocations(params: z.infer<typeof SearchLocationsSchema>): Promise<ApiResponse<Array<{ id: string; name: string; address: string }>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La recherche nécessite la Private API' },
      };
    }

    const result = await this.client.get<{
      venues: Array<{
        external_id: string;
        name: string;
        address: string;
      }>;
    }>(
      '/location_search/',
      { search_query: params.query, count: params.limit },
      { api: 'private' }
    );

    if (result.success && result.data) {
      return {
        success: true,
        data: result.data.venues.map(v => ({
          id: v.external_id,
          name: v.name,
          address: v.address,
        })),
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Bloque un utilisateur
   */
  async blockUser(params: z.infer<typeof BlockUserSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le blocage nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/friendships/block/${params.user_id}/`,
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
   * Débloque un utilisateur
   */
  async unblockUser(params: z.infer<typeof UnblockUserSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le déblocage nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      `/friendships/unblock/${params.user_id}/`,
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
   * Restreint un utilisateur
   */
  async restrictUser(params: z.infer<typeof RestrictUserSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La restriction nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      '/restrict_action/restrict/',
      { user_ids: JSON.stringify([params.user_id]) },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Lève la restriction sur un utilisateur
   */
  async unrestrictUser(params: z.infer<typeof UnrestrictUserSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La levée de restriction nécessite la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      '/restrict_action/unrestrict/',
      { user_ids: JSON.stringify([params.user_id]) },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Liste les utilisateurs bloqués
   */
  async listBlockedUsers(params: z.infer<typeof ListBlockedUsersSchema>): Promise<ApiResponse<PaginatedResponse<BlockedUser>>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'La liste nécessite la Private API' },
      };
    }

    const result = await this.client.get<{
      blocked_list: Array<{
        user_id: string;
        username: string;
        block_at: number;
      }>;
      next_max_id?: string;
    }>(
      '/users/blocked_list/',
      { count: params.limit, max_id: params.cursor },
      { api: 'private' }
    );

    if (result.success && result.data) {
      const blocked: BlockedUser[] = result.data.blocked_list.map(u => ({
        user_id: u.user_id,
        username: u.username,
        blocked_at: new Date(u.block_at * 1000).toISOString(),
      }));

      return {
        success: true,
        data: {
          data: blocked,
          paging: result.data.next_max_id
            ? { cursors: { after: result.data.next_max_id } }
            : undefined,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Ajoute un ami proche
   */
  async addCloseFriend(params: z.infer<typeof AddCloseFriendSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les amis proches nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      '/friendships/set_besties/',
      { add: JSON.stringify([params.user_id]) },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Retire un ami proche
   */
  async removeCloseFriend(params: z.infer<typeof RemoveCloseFriendSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les amis proches nécessitent la Private API' },
      };
    }

    const result = await this.client.post<{ status: string }>(
      '/friendships/set_besties/',
      { remove: JSON.stringify([params.user_id]) },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }

  /**
   * Liste les amis proches
   */
  async listCloseFriends(params: z.infer<typeof ListCloseFriendsSchema>): Promise<ApiResponse<InstagramUser[]>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Les amis proches nécessitent la Private API' },
      };
    }

    const result = await this.client.get<{
      users: Array<{
        pk: string;
        username: string;
        full_name: string;
        profile_pic_url: string;
      }>;
    }>(
      '/friendships/besties/',
      { count: params.limit },
      { api: 'private' }
    );

    if (result.success && result.data) {
      const users: InstagramUser[] = result.data.users.map(u => ({
        id: u.pk,
        username: u.username,
        name: u.full_name,
        profile_picture_url: u.profile_pic_url,
      }));

      return { success: true, data: users };
    }

    return { success: false, error: result.error };
  }

  /**
   * Signale un utilisateur
   */
  async reportUser(params: z.infer<typeof ReportUserSchema>): Promise<ApiResponse<{ success: boolean }>> {
    if (!this.client.getAuth().hasPrivateApiAuth()) {
      return {
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Le signalement nécessite la Private API' },
      };
    }

    const reasonMap: Record<string, number> = {
      spam: 1,
      inappropriate: 2,
      harassment: 3,
      self_harm: 4,
      hate_speech: 5,
      violence: 6,
      scam: 7,
    };

    const result = await this.client.post<{ status: string }>(
      `/users/${params.user_id}/flag_user/`,
      { reason_id: reasonMap[params.reason] },
      { api: 'private' }
    );

    return {
      success: result.success && result.data?.status === 'ok',
      data: { success: result.data?.status === 'ok' },
      error: result.error,
    };
  }
}
