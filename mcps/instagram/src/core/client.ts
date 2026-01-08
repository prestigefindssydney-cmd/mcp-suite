/**
 * Client API Instagram unifié
 * Gère les appels vers Graph API et Private API
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { InstagramAuth } from './auth.js';
import { RateLimiter, RateLimitCategory } from './rate-limiter.js';
import { ApiResponse, ApiError, InstagramConfig } from './types.js';

export type ApiType = 'graph' | 'private';

interface RequestOptions {
  api?: ApiType;
  rateLimitCategory?: RateLimitCategory;
  retries?: number;
  timeout?: number;
}

export class InstagramClient {
  private auth: InstagramAuth;
  private rateLimiter: RateLimiter;
  private graphClient: AxiosInstance;
  private privateClient: AxiosInstance;
  private config: InstagramConfig;

  constructor(config: InstagramConfig) {
    this.config = config;
    this.auth = new InstagramAuth(config);
    this.rateLimiter = new RateLimiter(config.rate_limit_enabled);

    // Client pour Graph API (officielle)
    this.graphClient = axios.create({
      baseURL: `https://graph.instagram.com/${config.api_version}`,
      timeout: 30000,
    });

    // Client pour Private API (non-officielle)
    this.privateClient = axios.create({
      baseURL: 'https://i.instagram.com/api/v1',
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  /**
   * Configure les intercepteurs pour le logging et la gestion d'erreurs
   */
  private setupInterceptors(): void {
    // Intercepteur de réponse Graph API
    this.graphClient.interceptors.response.use(
      (response) => response,
      (error) => this.handleApiError(error, 'graph')
    );

    // Intercepteur de réponse Private API
    this.privateClient.interceptors.response.use(
      (response) => response,
      (error) => this.handleApiError(error, 'private')
    );
  }

  /**
   * Gère les erreurs API de manière uniforme
   */
  private handleApiError(error: unknown, api: ApiType): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      // Erreur de rate limit
      if (status === 429) {
        throw {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Limite de requêtes atteinte. Réessayez plus tard.',
          details: { api, retry_after: error.response?.headers['retry-after'] },
        } as ApiError;
      }

      // Erreur d'authentification
      if (status === 401 || status === 403) {
        throw {
          code: 'AUTH_ERROR',
          message: 'Erreur d\'authentification. Vérifiez vos tokens.',
          details: { api, status },
        } as ApiError;
      }

      // Erreur spécifique Instagram/Facebook
      if (data?.error) {
        throw {
          code: data.error.code || 'API_ERROR',
          message: data.error.message || 'Erreur API Instagram',
          details: { api, ...data.error },
        } as ApiError;
      }

      throw {
        code: 'REQUEST_FAILED',
        message: error.message,
        details: { api, status },
      } as ApiError;
    }

    throw {
      code: 'UNKNOWN_ERROR',
      message: 'Une erreur inconnue s\'est produite',
      details: { api },
    } as ApiError;
  }

  /**
   * Effectue une requête GET
   */
  async get<T>(
    endpoint: string,
    params?: Record<string, unknown>,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { api = 'graph', rateLimitCategory = 'read' } = options;

    // Vérification rate limit
    if (!this.rateLimiter.canExecute(rateLimitCategory)) {
      const waitTime = this.rateLimiter.getWaitTimeFormatted(rateLimitCategory);
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_LOCAL',
          message: `Rate limit local atteint. Réessayez dans ${waitTime}`,
        },
      };
    }

    try {
      const client = api === 'graph' ? this.graphClient : this.privateClient;
      const headers = api === 'graph'
        ? this.auth.getGraphApiHeaders()
        : this.auth.getPrivateApiHeaders();

      // Ajouter le token comme paramètre pour Graph API
      const queryParams = api === 'graph'
        ? { ...params, access_token: this.auth.getGraphApiToken() }
        : params;

      const response: AxiosResponse<T> = await client.get(endpoint, {
        params: queryParams,
        headers,
      });

      this.rateLimiter.consume(rateLimitCategory);
      this.updateRateLimitsFromHeaders(rateLimitCategory, response.headers as Record<string, string>);

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error as ApiError };
    }
  }

  /**
   * Effectue une requête POST
   */
  async post<T>(
    endpoint: string,
    data?: Record<string, unknown>,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { api = 'graph', rateLimitCategory = 'write' } = options;

    if (!this.rateLimiter.canExecute(rateLimitCategory)) {
      const waitTime = this.rateLimiter.getWaitTimeFormatted(rateLimitCategory);
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_LOCAL',
          message: `Rate limit local atteint. Réessayez dans ${waitTime}`,
        },
      };
    }

    try {
      const client = api === 'graph' ? this.graphClient : this.privateClient;
      const headers = api === 'graph'
        ? this.auth.getGraphApiHeaders()
        : this.auth.getPrivateApiHeaders();

      // Pour Graph API, ajouter le token aux données
      const postData = api === 'graph'
        ? { ...data, access_token: this.auth.getGraphApiToken() }
        : data;

      const response: AxiosResponse<T> = await client.post(endpoint, postData, { headers });

      this.rateLimiter.consume(rateLimitCategory);
      this.updateRateLimitsFromHeaders(rateLimitCategory, response.headers as Record<string, string>);

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error as ApiError };
    }
  }

  /**
   * Effectue une requête DELETE
   */
  async delete<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { api = 'graph', rateLimitCategory = 'write' } = options;

    if (!this.rateLimiter.canExecute(rateLimitCategory)) {
      const waitTime = this.rateLimiter.getWaitTimeFormatted(rateLimitCategory);
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_LOCAL',
          message: `Rate limit local atteint. Réessayez dans ${waitTime}`,
        },
      };
    }

    try {
      const client = api === 'graph' ? this.graphClient : this.privateClient;
      const headers = api === 'graph'
        ? this.auth.getGraphApiHeaders()
        : this.auth.getPrivateApiHeaders();

      const response: AxiosResponse<T> = await client.delete(endpoint, {
        params: api === 'graph' ? { access_token: this.auth.getGraphApiToken() } : undefined,
        headers,
      });

      this.rateLimiter.consume(rateLimitCategory);

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error as ApiError };
    }
  }

  /**
   * Upload un média (image/vidéo)
   */
  async uploadMedia(
    mediaUrl: string,
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS',
    caption?: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<{ id: string; container_id?: string }>> {
    const { rateLimitCategory = 'content_publish' } = options;

    if (!this.rateLimiter.canExecute(rateLimitCategory)) {
      const waitTime = this.rateLimiter.getWaitTimeFormatted(rateLimitCategory);
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_LOCAL',
          message: `Rate limit local atteint. Réessayez dans ${waitTime}`,
        },
      };
    }

    const accountId = this.auth.getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Business Account ID non configuré',
        },
      };
    }

    try {
      // Étape 1: Créer le conteneur média
      const containerData: Record<string, unknown> = {
        access_token: this.auth.getGraphApiToken(),
      };

      if (mediaType === 'IMAGE') {
        containerData.image_url = mediaUrl;
      } else if (mediaType === 'VIDEO' || mediaType === 'REELS') {
        containerData.video_url = mediaUrl;
        containerData.media_type = mediaType;
      }

      if (caption) {
        containerData.caption = caption;
      }

      const containerResponse = await this.graphClient.post(
        `/${accountId}/media`,
        containerData,
        { headers: this.auth.getGraphApiHeaders() }
      );

      const containerId = containerResponse.data.id;

      // Étape 2: Publier le conteneur
      const publishResponse = await this.graphClient.post(
        `/${accountId}/media_publish`,
        {
          creation_id: containerId,
          access_token: this.auth.getGraphApiToken(),
        },
        { headers: this.auth.getGraphApiHeaders() }
      );

      this.rateLimiter.consume(rateLimitCategory);

      return {
        success: true,
        data: {
          id: publishResponse.data.id,
          container_id: containerId,
        },
      };
    } catch (error) {
      return { success: false, error: error as ApiError };
    }
  }

  /**
   * Met à jour les rate limits depuis les headers de réponse
   */
  private updateRateLimitsFromHeaders(
    category: RateLimitCategory,
    headers: Record<string, string>
  ): void {
    this.rateLimiter.updateFromHeaders(category, headers);
  }

  /**
   * Retourne l'état du rate limiter
   */
  getRateLimitStatus(): string {
    return this.rateLimiter.getUsageReport();
  }

  /**
   * Retourne l'objet auth
   */
  getAuth(): InstagramAuth {
    return this.auth;
  }

  /**
   * Retourne le rate limiter
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Vérifie si le client est authentifié
   */
  isAuthenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  /**
   * Retourne l'API préférée selon la disponibilité
   */
  getPreferredApi(): ApiType {
    if (this.auth.hasGraphApiAuth()) return 'graph';
    if (this.auth.hasPrivateApiAuth()) return 'private';
    return 'graph';
  }
}
