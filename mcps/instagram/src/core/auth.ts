/**
 * Module d'authentification Instagram
 * Gère l'auth pour Graph API (officielle) et Private API (non-officielle)
 */

import { InstagramConfig } from './types.js';

export interface AuthTokens {
  graph_api?: {
    access_token: string;
    expires_at?: number;
    token_type: string;
  };
  private_api?: {
    session_id: string;
    csrf_token?: string;
    user_id?: string;
    expires_at?: number;
  };
}

export class InstagramAuth {
  private config: InstagramConfig;
  private tokens: AuthTokens = {};

  constructor(config: InstagramConfig) {
    this.config = config;
    this.initializeTokens();
  }

  /**
   * Initialise les tokens depuis la configuration
   */
  private initializeTokens(): void {
    // Graph API token
    if (this.config.access_token) {
      this.tokens.graph_api = {
        access_token: this.config.access_token,
        token_type: 'bearer',
      };
    }

    // Private API session
    if (this.config.session_id) {
      this.tokens.private_api = {
        session_id: this.config.session_id,
      };
    }
  }

  /**
   * Retourne le token Graph API
   */
  getGraphApiToken(): string | undefined {
    return this.tokens.graph_api?.access_token;
  }

  /**
   * Retourne le session ID pour la Private API
   */
  getPrivateApiSession(): string | undefined {
    return this.tokens.private_api?.session_id;
  }

  /**
   * Vérifie si l'auth Graph API est disponible
   */
  hasGraphApiAuth(): boolean {
    return !!this.tokens.graph_api?.access_token;
  }

  /**
   * Vérifie si l'auth Private API est disponible
   */
  hasPrivateApiAuth(): boolean {
    return !!this.tokens.private_api?.session_id;
  }

  /**
   * Vérifie si au moins une méthode d'auth est disponible
   */
  isAuthenticated(): boolean {
    return this.hasGraphApiAuth() || this.hasPrivateApiAuth();
  }

  /**
   * Retourne les headers d'authentification pour Graph API
   */
  getGraphApiHeaders(): Record<string, string> {
    const token = this.getGraphApiToken();
    if (!token) {
      throw new Error('Graph API token non disponible');
    }
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Retourne les headers d'authentification pour Private API
   */
  getPrivateApiHeaders(): Record<string, string> {
    const sessionId = this.getPrivateApiSession();
    if (!sessionId) {
      throw new Error('Private API session non disponible');
    }

    return {
      'Cookie': `sessionid=${sessionId}`,
      'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; fr_FR; 458229237)',
      'X-IG-App-ID': '936619743392459',
      'X-IG-Device-ID': this.generateDeviceId(),
      'X-IG-Android-ID': this.generateAndroidId(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    };
  }

  /**
   * Génère un device ID consistant
   */
  private generateDeviceId(): string {
    // Génère un UUID v4 basé sur le session_id pour la consistance
    const seed = this.tokens.private_api?.session_id || 'default';
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const hex = Math.abs(hash).toString(16).padStart(32, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  /**
   * Génère un Android ID consistant
   */
  private generateAndroidId(): string {
    const seed = this.tokens.private_api?.session_id || 'default';
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `android-${Math.abs(hash).toString(16).slice(0, 16)}`;
  }

  /**
   * Met à jour le token Graph API
   */
  updateGraphApiToken(token: string, expiresAt?: number): void {
    this.tokens.graph_api = {
      access_token: token,
      expires_at: expiresAt,
      token_type: 'bearer',
    };
  }

  /**
   * Met à jour la session Private API
   */
  updatePrivateApiSession(sessionId: string, csrfToken?: string, userId?: string): void {
    this.tokens.private_api = {
      session_id: sessionId,
      csrf_token: csrfToken,
      user_id: userId,
    };
  }

  /**
   * Vérifie si le token Graph API est expiré
   */
  isGraphApiTokenExpired(): boolean {
    if (!this.tokens.graph_api?.expires_at) {
      return false; // Pas d'expiration définie
    }
    return Date.now() >= this.tokens.graph_api.expires_at;
  }

  /**
   * Retourne l'ID du compte business
   */
  getBusinessAccountId(): string | undefined {
    return this.config.business_account_id;
  }

  /**
   * Retourne la version de l'API
   */
  getApiVersion(): string {
    return this.config.api_version;
  }

  /**
   * Retourne la configuration complète
   */
  getConfig(): InstagramConfig {
    return this.config;
  }
}
