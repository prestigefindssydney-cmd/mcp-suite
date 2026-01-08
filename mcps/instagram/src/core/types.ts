/**
 * Types principaux pour le MCP Instagram
 * Définit toutes les interfaces et types utilisés dans le projet
 */

// ============================================
// Types de base
// ============================================

export interface InstagramUser {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  website?: string;
  is_verified?: boolean;
  is_private?: boolean;
  is_business_account?: boolean;
  account_type?: 'BUSINESS' | 'MEDIA_CREATOR' | 'PERSONAL';
}

export interface InstagramMedia {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REEL';
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  username?: string;
  children?: InstagramMedia[];
  location?: InstagramLocation;
  is_shared_to_feed?: boolean;
}

export interface InstagramStory {
  id: string;
  media_type: 'IMAGE' | 'VIDEO';
  media_url: string;
  timestamp: string;
  expires_at?: string;
  link?: StoryLink;
  mentions?: StoryMention[];
  stickers?: StorySticker[];
}

export interface StoryLink {
  url: string;
  title?: string;
}

export interface StoryMention {
  user_id: string;
  username: string;
  x: number;
  y: number;
}

export interface StorySticker {
  type: 'poll' | 'quiz' | 'question' | 'countdown' | 'emoji_slider' | 'mention' | 'hashtag' | 'location';
  data: Record<string, unknown>;
}

export interface InstagramLocation {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  city?: string;
}

export interface InstagramHashtag {
  id: string;
  name: string;
  media_count?: number;
}

// ============================================
// Types pour les commentaires
// ============================================

export interface InstagramComment {
  id: string;
  text: string;
  timestamp: string;
  username: string;
  user_id?: string;
  like_count?: number;
  replies?: InstagramComment[];
  is_hidden?: boolean;
  parent_id?: string;
}

// ============================================
// Types pour les messages (DMs)
// ============================================

export interface InstagramThread {
  id: string;
  participants: InstagramUser[];
  last_activity_at?: string;
  is_group?: boolean;
  thread_title?: string;
  muted_until?: string;
  messages?: InstagramMessage[];
}

export interface InstagramMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  timestamp: string;
  text?: string;
  media_url?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'VOICE' | 'STORY_SHARE' | 'POST_SHARE';
  reactions?: MessageReaction[];
  reply_to?: string;
}

export interface MessageReaction {
  emoji: string;
  user_id: string;
  timestamp: string;
}

// ============================================
// Types pour les highlights
// ============================================

export interface InstagramHighlight {
  id: string;
  title: string;
  cover_media_url?: string;
  media_count: number;
  stories?: InstagramStory[];
}

// ============================================
// Types pour les guides
// ============================================

export interface InstagramGuide {
  id: string;
  title: string;
  description?: string;
  guide_type: 'PRODUCTS' | 'PLACES' | 'POSTS';
  cover_media?: InstagramMedia;
  items: GuideItem[];
}

export interface GuideItem {
  media_id?: string;
  product_id?: string;
  place_id?: string;
  title?: string;
  description?: string;
}

// ============================================
// Types pour les analytics/insights
// ============================================

export interface InsightMetric {
  name: string;
  period: 'day' | 'week' | 'days_28' | 'month' | 'lifetime';
  values: InsightValue[];
  title?: string;
  description?: string;
}

export interface InsightValue {
  value: number | Record<string, number>;
  end_time?: string;
}

export interface AccountInsights {
  reach?: number;
  impressions?: number;
  profile_views?: number;
  website_clicks?: number;
  email_contacts?: number;
  phone_call_clicks?: number;
  follower_count?: number;
  online_followers?: Record<string, number>;
}

export interface MediaInsights {
  impressions?: number;
  reach?: number;
  engagement?: number;
  saved?: number;
  shares?: number;
  likes?: number;
  comments?: number;
  plays?: number;
  video_views?: number;
}

export interface AudienceDemographics {
  age_gender: Record<string, number>;
  cities: Record<string, number>;
  countries: Record<string, number>;
  locale: Record<string, number>;
}

// ============================================
// Types pour le commerce
// ============================================

export interface InstagramProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  images: string[];
  url?: string;
  availability: 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER';
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  name: string;
  price?: number;
  sku?: string;
  availability?: 'IN_STOCK' | 'OUT_OF_STOCK';
}

export interface ProductTag {
  product_id: string;
  x: number;
  y: number;
}

export interface InstagramOrder {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
  customer: OrderCustomer;
  items: OrderItem[];
  total_amount: number;
  currency: string;
  shipping_address?: ShippingAddress;
  tracking_info?: TrackingInfo;
  created_at: string;
  updated_at?: string;
}

export interface OrderCustomer {
  id: string;
  username: string;
  email?: string;
  phone?: string;
}

export interface OrderItem {
  product_id: string;
  variant_id?: string;
  quantity: number;
  price: number;
}

export interface ShippingAddress {
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
}

export interface TrackingInfo {
  carrier: string;
  tracking_number: string;
  tracking_url?: string;
}

// ============================================
// Types pour les publicités
// ============================================

export interface InstagramCampaign {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  objective: CampaignObjective;
  budget: CampaignBudget;
  schedule: CampaignSchedule;
  targeting: CampaignTargeting;
  placements: AdPlacement[];
  created_time: string;
  updated_time?: string;
}

export type CampaignObjective =
  | 'AWARENESS'
  | 'TRAFFIC'
  | 'ENGAGEMENT'
  | 'LEADS'
  | 'APP_PROMOTION'
  | 'SALES';

export interface CampaignBudget {
  amount: number;
  currency: string;
  type: 'DAILY' | 'LIFETIME';
}

export interface CampaignSchedule {
  start_time: string;
  end_time?: string;
}

export interface CampaignTargeting {
  age_min?: number;
  age_max?: number;
  genders?: ('male' | 'female' | 'all')[];
  geo_locations?: GeoLocation[];
  interests?: string[];
  behaviors?: string[];
  custom_audiences?: string[];
  excluded_custom_audiences?: string[];
}

export interface GeoLocation {
  countries?: string[];
  regions?: string[];
  cities?: string[];
  zips?: string[];
  radius?: number;
  radius_unit?: 'km' | 'mile';
}

export type AdPlacement = 'FEED' | 'STORY' | 'REELS' | 'EXPLORE' | 'PROFILE_FEED';

export interface CustomAudience {
  id: string;
  name: string;
  description?: string;
  subtype: 'CUSTOM' | 'LOOKALIKE' | 'WEBSITE' | 'ENGAGEMENT';
  approximate_count?: number;
}

export interface AdInsights {
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  spend: number;
  conversions?: number;
  cost_per_conversion?: number;
}

// ============================================
// Types pour les collections (saves)
// ============================================

export interface InstagramCollection {
  id: string;
  name: string;
  media_count: number;
  cover_media?: InstagramMedia;
}

// ============================================
// Types pour la modération
// ============================================

export interface BlockedUser {
  user_id: string;
  username: string;
  blocked_at: string;
}

export interface RestrictedUser {
  user_id: string;
  username: string;
  restricted_at: string;
}

// ============================================
// Types pour le rate limiting
// ============================================

export interface RateLimitBucket {
  limit: number;
  remaining: number;
  reset_at: number;
  window_seconds: number;
}

export interface RateLimits {
  read: RateLimitBucket;
  write: RateLimitBucket;
  content_publish: RateLimitBucket;
  stories: RateLimitBucket;
  messages: RateLimitBucket;
  follows: RateLimitBucket;
  likes: RateLimitBucket;
}

// ============================================
// Types pour la pagination
// ============================================

export interface PaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
  total_count?: number;
}

// ============================================
// Types pour les réponses API
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// Types pour la configuration
// ============================================

export interface InstagramConfig {
  // Graph API (Official)
  app_id?: string;
  app_secret?: string;
  access_token?: string;
  business_account_id?: string;
  api_version: string;

  // Private API (Unofficial)
  username?: string;
  password?: string;
  session_id?: string;

  // Settings
  use_private_api: boolean;
  enable_commerce: boolean;
  enable_ads: boolean;
  rate_limit_enabled: boolean;
}

// ============================================
// Types pour les webhooks
// ============================================

export interface WebhookEvent {
  type: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export type WebhookEventType =
  | 'comments'
  | 'mentions'
  | 'messages'
  | 'story_insights'
  | 'live_comments'
  | 'follows'
  | 'unfollows'
  | 'media_published'
  | 'order_placed';
