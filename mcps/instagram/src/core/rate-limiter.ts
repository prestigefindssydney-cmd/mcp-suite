/**
 * Gestionnaire de rate limiting pour Instagram API
 * Empêche les bans en respectant les quotas
 */

import { RateLimitBucket, RateLimits } from './types.js';

export type RateLimitCategory = keyof RateLimits;

interface RateLimitConfig {
  limit: number;
  window_seconds: number;
}

// Configuration des limites par défaut (estimations basées sur l'API)
const DEFAULT_LIMITS: Record<RateLimitCategory, RateLimitConfig> = {
  read: { limit: 200, window_seconds: 3600 }, // 200 req/heure
  write: { limit: 25, window_seconds: 3600 }, // 25 req/heure
  content_publish: { limit: 25, window_seconds: 86400 }, // 25 posts/jour
  stories: { limit: 100, window_seconds: 86400 }, // 100 stories/jour
  messages: { limit: 100, window_seconds: 86400 }, // 100 DMs/jour
  follows: { limit: 60, window_seconds: 3600 }, // 60 follows/heure
  likes: { limit: 60, window_seconds: 3600 }, // 60 likes/heure
};

export class RateLimiter {
  private buckets: Map<RateLimitCategory, RateLimitBucket> = new Map();
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.initializeBuckets();
  }

  /**
   * Initialise tous les buckets de rate limiting
   */
  private initializeBuckets(): void {
    for (const [category, config] of Object.entries(DEFAULT_LIMITS)) {
      this.buckets.set(category as RateLimitCategory, {
        limit: config.limit,
        remaining: config.limit,
        reset_at: Date.now() + (config.window_seconds * 1000),
        window_seconds: config.window_seconds,
      });
    }
  }

  /**
   * Vérifie si une action est autorisée
   */
  canExecute(category: RateLimitCategory): boolean {
    if (!this.enabled) return true;

    const bucket = this.buckets.get(category);
    if (!bucket) return true;

    // Reset le bucket si la fenêtre est expirée
    if (Date.now() >= bucket.reset_at) {
      this.resetBucket(category);
      return true;
    }

    return bucket.remaining > 0;
  }

  /**
   * Consomme une requête du bucket
   */
  consume(category: RateLimitCategory): boolean {
    if (!this.enabled) return true;

    const bucket = this.buckets.get(category);
    if (!bucket) return true;

    // Reset si nécessaire
    if (Date.now() >= bucket.reset_at) {
      this.resetBucket(category);
    }

    if (bucket.remaining <= 0) {
      return false;
    }

    bucket.remaining--;
    return true;
  }

  /**
   * Reset un bucket spécifique
   */
  private resetBucket(category: RateLimitCategory): void {
    const config = DEFAULT_LIMITS[category];
    const bucket = this.buckets.get(category);
    if (bucket && config) {
      bucket.remaining = config.limit;
      bucket.reset_at = Date.now() + (config.window_seconds * 1000);
    }
  }

  /**
   * Retourne le temps d'attente avant la prochaine requête possible (en ms)
   */
  getWaitTime(category: RateLimitCategory): number {
    if (!this.enabled) return 0;

    const bucket = this.buckets.get(category);
    if (!bucket) return 0;

    if (bucket.remaining > 0) return 0;

    const waitTime = bucket.reset_at - Date.now();
    return Math.max(0, waitTime);
  }

  /**
   * Retourne le temps d'attente formaté
   */
  getWaitTimeFormatted(category: RateLimitCategory): string {
    const ms = this.getWaitTime(category);
    if (ms === 0) return '0s';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Retourne l'état d'un bucket
   */
  getBucketStatus(category: RateLimitCategory): RateLimitBucket | undefined {
    return this.buckets.get(category);
  }

  /**
   * Retourne l'état de tous les buckets
   */
  getAllBucketsStatus(): RateLimits {
    const status: Partial<RateLimits> = {};
    for (const [category, bucket] of this.buckets.entries()) {
      status[category] = { ...bucket };
    }
    return status as RateLimits;
  }

  /**
   * Met à jour les limites depuis les headers de réponse API
   */
  updateFromHeaders(category: RateLimitCategory, headers: Record<string, string>): void {
    const bucket = this.buckets.get(category);
    if (!bucket) return;

    // Headers standards Instagram/Facebook
    if (headers['x-ratelimit-remaining']) {
      bucket.remaining = parseInt(headers['x-ratelimit-remaining'], 10);
    }
    if (headers['x-ratelimit-reset']) {
      bucket.reset_at = parseInt(headers['x-ratelimit-reset'], 10) * 1000;
    }
    if (headers['x-ratelimit-limit']) {
      bucket.limit = parseInt(headers['x-ratelimit-limit'], 10);
    }
  }

  /**
   * Vérifie et attend si nécessaire avant d'exécuter
   */
  async waitIfNeeded(category: RateLimitCategory): Promise<void> {
    const waitTime = this.getWaitTime(category);
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Active ou désactive le rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Vérifie si le rate limiting est activé
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Génère un rapport de l'utilisation
   */
  getUsageReport(): string {
    const lines: string[] = ['=== Rate Limit Status ==='];

    for (const [category, bucket] of this.buckets.entries()) {
      const usedPercent = Math.round(((bucket.limit - bucket.remaining) / bucket.limit) * 100);
      const resetIn = this.getWaitTimeFormatted(category);

      lines.push(`${category}: ${bucket.remaining}/${bucket.limit} (${usedPercent}% used) - Reset: ${resetIn}`);
    }

    return lines.join('\n');
  }
}
