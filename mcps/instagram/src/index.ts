#!/usr/bin/env node
/**
 * MCP Instagram - Serveur MCP complet pour l'administration Instagram
 *
 * Ce serveur expose toutes les fonctionnalités Instagram via le protocole MCP,
 * permettant à un agent IA d'administrer un compte Instagram de manière autonome.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { InstagramClient, InstagramConfig } from './core/index.js';
import { PostsTools, StoriesTools, ReelsTools, HighlightsTools } from './tools/content/index.js';
import { LikesTools, CommentsTools, FollowsTools, SavesTools } from './tools/interactions/index.js';
import { MessagingTools } from './tools/messaging/index.js';
import { AnalyticsTools } from './tools/analytics/index.js';
import { AccountTools } from './tools/account/index.js';
import { CommerceTools } from './tools/commerce/index.js';
import { AdsTools } from './tools/ads/index.js';

// Charger les variables d'environnement depuis le bon chemin
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

// ============================================
// Configuration
// ============================================

function loadConfig(): InstagramConfig {
  return {
    // Graph API (Official)
    app_id: process.env.INSTAGRAM_APP_ID,
    app_secret: process.env.INSTAGRAM_APP_SECRET,
    access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
    business_account_id: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
    api_version: process.env.INSTAGRAM_API_VERSION || 'v21.0',

    // Private API (Unofficial)
    username: process.env.INSTAGRAM_USERNAME,
    password: process.env.INSTAGRAM_PASSWORD,
    session_id: process.env.INSTAGRAM_SESSION_ID,

    // Settings
    use_private_api: process.env.USE_PRIVATE_API === 'true',
    enable_commerce: process.env.ENABLE_COMMERCE !== 'false',
    enable_ads: process.env.ENABLE_ADS !== 'false',
    rate_limit_enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  };
}

// ============================================
// Définition des Tools MCP
// ============================================

const TOOLS_DEFINITION = [
  // ===== CONTENT - Posts =====
  {
    name: 'instagram_create_post',
    description: 'Crée un nouveau post Instagram (image ou vidéo)',
    inputSchema: {
      type: 'object',
      properties: {
        media_url: { type: 'string', description: 'URL du média' },
        caption: { type: 'string', description: 'Légende (max 2200 caractères)' },
        location_id: { type: 'string', description: 'ID du lieu' },
        user_tags: { type: 'array', description: 'Tags utilisateurs' },
        product_tags: { type: 'array', description: 'Tags produits' },
      },
      required: ['media_url'],
    },
  },
  {
    name: 'instagram_create_carousel',
    description: 'Crée un carrousel Instagram (2-10 médias)',
    inputSchema: {
      type: 'object',
      properties: {
        media_urls: { type: 'array', items: { type: 'string' }, description: '2-10 URLs' },
        caption: { type: 'string' },
        location_id: { type: 'string' },
      },
      required: ['media_urls'],
    },
  },
  {
    name: 'instagram_list_posts',
    description: 'Liste les posts du compte',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 25 },
        cursor: { type: 'string' },
      },
    },
  },
  {
    name: 'instagram_get_post',
    description: 'Récupère les détails d\'un post',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string' },
      },
      required: ['post_id'],
    },
  },
  {
    name: 'instagram_delete_post',
    description: 'Supprime un post',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string' },
      },
      required: ['post_id'],
    },
  },

  // ===== CONTENT - Stories =====
  {
    name: 'instagram_create_story',
    description: 'Crée une story Instagram avec stickers optionnels',
    inputSchema: {
      type: 'object',
      properties: {
        media_url: { type: 'string' },
        mentions: { type: 'array' },
        link: { type: 'object' },
        poll: { type: 'object' },
        quiz: { type: 'object' },
        countdown: { type: 'object' },
      },
      required: ['media_url'],
    },
  },
  {
    name: 'instagram_list_stories',
    description: 'Liste les stories actives',
    inputSchema: {
      type: 'object',
      properties: {
        active_only: { type: 'boolean', default: true },
      },
    },
  },
  {
    name: 'instagram_delete_story',
    description: 'Supprime une story',
    inputSchema: {
      type: 'object',
      properties: {
        story_id: { type: 'string' },
      },
      required: ['story_id'],
    },
  },

  // ===== CONTENT - Reels =====
  {
    name: 'instagram_create_reel',
    description: 'Crée un nouveau Reel',
    inputSchema: {
      type: 'object',
      properties: {
        video_url: { type: 'string' },
        caption: { type: 'string' },
        share_to_feed: { type: 'boolean', default: true },
        cover_url: { type: 'string' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'instagram_list_reels',
    description: 'Liste les Reels du compte',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 25 },
        cursor: { type: 'string' },
      },
    },
  },

  // ===== CONTENT - Highlights =====
  {
    name: 'instagram_create_highlight',
    description: 'Crée un highlight à partir de stories',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        story_ids: { type: 'array', items: { type: 'string' } },
        cover_media_id: { type: 'string' },
      },
      required: ['title', 'story_ids'],
    },
  },
  {
    name: 'instagram_list_highlights',
    description: 'Liste les highlights du profil',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 25 },
      },
    },
  },

  // ===== INTERACTIONS - Likes =====
  {
    name: 'instagram_like_media',
    description: 'Like un média',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
      },
      required: ['media_id'],
    },
  },
  {
    name: 'instagram_unlike_media',
    description: 'Unlike un média',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
      },
      required: ['media_id'],
    },
  },
  {
    name: 'instagram_get_likers',
    description: 'Liste les personnes ayant liké un média',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
        limit: { type: 'number', default: 50 },
      },
      required: ['media_id'],
    },
  },

  // ===== INTERACTIONS - Comments =====
  {
    name: 'instagram_create_comment',
    description: 'Ajoute un commentaire',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
        text: { type: 'string' },
        reply_to_comment_id: { type: 'string' },
      },
      required: ['media_id', 'text'],
    },
  },
  {
    name: 'instagram_list_comments',
    description: 'Liste les commentaires d\'un média',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
        limit: { type: 'number', default: 50 },
      },
      required: ['media_id'],
    },
  },
  {
    name: 'instagram_delete_comment',
    description: 'Supprime un commentaire',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
        comment_id: { type: 'string' },
      },
      required: ['media_id', 'comment_id'],
    },
  },
  {
    name: 'instagram_hide_comment',
    description: 'Masque un commentaire',
    inputSchema: {
      type: 'object',
      properties: {
        comment_id: { type: 'string' },
      },
      required: ['comment_id'],
    },
  },
  {
    name: 'instagram_pin_comment',
    description: 'Épingle un commentaire',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
        comment_id: { type: 'string' },
      },
      required: ['media_id', 'comment_id'],
    },
  },

  // ===== INTERACTIONS - Follows =====
  {
    name: 'instagram_follow_user',
    description: 'Suit un utilisateur',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'instagram_unfollow_user',
    description: 'Ne plus suivre un utilisateur',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'instagram_get_followers',
    description: 'Liste les followers',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        limit: { type: 'number', default: 50 },
        cursor: { type: 'string' },
      },
    },
  },
  {
    name: 'instagram_get_following',
    description: 'Liste les utilisateurs suivis',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        limit: { type: 'number', default: 50 },
        cursor: { type: 'string' },
      },
    },
  },
  {
    name: 'instagram_remove_follower',
    description: 'Retire un follower',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
      },
      required: ['user_id'],
    },
  },

  // ===== INTERACTIONS - Saves =====
  {
    name: 'instagram_save_media',
    description: 'Sauvegarde un média',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
        collection_id: { type: 'string' },
      },
      required: ['media_id'],
    },
  },
  {
    name: 'instagram_unsave_media',
    description: 'Retire un média des sauvegardes',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
      },
      required: ['media_id'],
    },
  },
  {
    name: 'instagram_list_saved',
    description: 'Liste les médias sauvegardés',
    inputSchema: {
      type: 'object',
      properties: {
        collection_id: { type: 'string' },
        limit: { type: 'number', default: 25 },
      },
    },
  },
  {
    name: 'instagram_list_collections',
    description: 'Liste les collections de sauvegardes',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 25 },
      },
    },
  },

  // ===== MESSAGING =====
  {
    name: 'instagram_list_threads',
    description: 'Liste les conversations DM',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', enum: ['inbox', 'pending', 'general'], default: 'inbox' },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'instagram_get_thread',
    description: 'Récupère une conversation avec ses messages',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
      required: ['thread_id'],
    },
  },
  {
    name: 'instagram_send_message',
    description: 'Envoie un message direct',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string' },
        text: { type: 'string' },
        media_url: { type: 'string' },
        shared_media_id: { type: 'string' },
      },
      required: ['thread_id'],
    },
  },
  {
    name: 'instagram_create_thread',
    description: 'Crée une nouvelle conversation',
    inputSchema: {
      type: 'object',
      properties: {
        recipient_ids: { type: 'array', items: { type: 'string' } },
        message: { type: 'string' },
      },
      required: ['recipient_ids'],
    },
  },

  // ===== ANALYTICS =====
  {
    name: 'instagram_get_account_insights',
    description: 'Récupère les insights du compte',
    inputSchema: {
      type: 'object',
      properties: {
        metrics: { type: 'array', items: { type: 'string' } },
        period: { type: 'string', enum: ['day', 'week', 'days_28', 'month'] },
      },
    },
  },
  {
    name: 'instagram_get_media_insights',
    description: 'Récupère les insights d\'un média',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
        metrics: { type: 'array', items: { type: 'string' } },
      },
      required: ['media_id'],
    },
  },
  {
    name: 'instagram_get_audience_demographics',
    description: 'Récupère les données démographiques de l\'audience',
    inputSchema: {
      type: 'object',
      properties: {
        breakdown: { type: 'string', enum: ['age', 'gender', 'country', 'city'] },
      },
    },
  },
  {
    name: 'instagram_get_follower_growth',
    description: 'Récupère l\'évolution des followers',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
      required: ['since', 'until'],
    },
  },

  // ===== ACCOUNT =====
  {
    name: 'instagram_get_profile',
    description: 'Récupère le profil du compte connecté',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'instagram_update_profile',
    description: 'Met à jour le profil',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        name: { type: 'string' },
        biography: { type: 'string' },
        website: { type: 'string' },
        is_private: { type: 'boolean' },
      },
    },
  },
  {
    name: 'instagram_get_user',
    description: 'Récupère les infos d\'un utilisateur',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        username: { type: 'string' },
      },
    },
  },
  {
    name: 'instagram_search_users',
    description: 'Recherche des utilisateurs',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'instagram_search_hashtags',
    description: 'Recherche des hashtags',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'instagram_block_user',
    description: 'Bloque un utilisateur',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'instagram_unblock_user',
    description: 'Débloque un utilisateur',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
      },
      required: ['user_id'],
    },
  },

  // ===== COMMERCE =====
  {
    name: 'instagram_list_products',
    description: 'Liste les produits du catalogue',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 25 },
        cursor: { type: 'string' },
      },
    },
  },
  {
    name: 'instagram_list_orders',
    description: 'Liste les commandes',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        limit: { type: 'number', default: 25 },
      },
    },
  },
  {
    name: 'instagram_update_order_status',
    description: 'Met à jour le statut d\'une commande',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
        status: { type: 'string' },
        tracking_number: { type: 'string' },
        tracking_carrier: { type: 'string' },
      },
      required: ['order_id', 'status'],
    },
  },

  // ===== ADS =====
  {
    name: 'instagram_create_campaign',
    description: 'Crée une campagne publicitaire',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        objective: { type: 'string' },
        budget_amount: { type: 'number' },
        budget_type: { type: 'string' },
        start_time: { type: 'string' },
        end_time: { type: 'string' },
        targeting: { type: 'object' },
        placements: { type: 'array' },
      },
      required: ['name', 'objective', 'budget_amount', 'start_time'],
    },
  },
  {
    name: 'instagram_list_campaigns',
    description: 'Liste les campagnes publicitaires',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        limit: { type: 'number', default: 25 },
      },
    },
  },
  {
    name: 'instagram_boost_post',
    description: 'Boost un post (promotion rapide)',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string' },
        budget_amount: { type: 'number' },
        duration_days: { type: 'number', default: 7 },
        targeting: { type: 'object' },
      },
      required: ['media_id', 'budget_amount'],
    },
  },
  {
    name: 'instagram_get_ad_insights',
    description: 'Récupère les insights publicitaires',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        ad_id: { type: 'string' },
        date_start: { type: 'string' },
        date_end: { type: 'string' },
        metrics: { type: 'array' },
      },
      required: ['date_start', 'date_end'],
    },
  },

  // ===== UTILITIES =====
  {
    name: 'instagram_get_rate_limits',
    description: 'Récupère l\'état des rate limits',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================
// Serveur MCP
// ============================================

async function main() {
  const appConfig = loadConfig();
  const client = new InstagramClient(appConfig);

  // Initialiser les tools
  const posts = new PostsTools(client);
  const stories = new StoriesTools(client);
  const reels = new ReelsTools(client);
  const highlights = new HighlightsTools(client);
  const likes = new LikesTools(client);
  const comments = new CommentsTools(client);
  const follows = new FollowsTools(client);
  const saves = new SavesTools(client);
  const messaging = new MessagingTools(client);
  const analytics = new AnalyticsTools(client);
  const account = new AccountTools(client);
  const commerce = new CommerceTools(client);
  const ads = new AdsTools(client);

  // Créer le serveur MCP
  const server = new Server(
    {
      name: 'mcp-instagram',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Handler pour lister les tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS_DEFINITION,
  }));

  // Handler pour lister les resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'instagram://profile',
        name: 'Profil Instagram',
        description: 'Informations du profil connecté',
        mimeType: 'application/json',
      },
      {
        uri: 'instagram://rate-limits',
        name: 'Rate Limits',
        description: 'État actuel des quotas API',
        mimeType: 'application/json',
      },
    ],
  }));

  // Handler pour lire les resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === 'instagram://profile') {
      const result = await account.getProfile();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result.data || result.error, null, 2),
        }],
      };
    }

    if (uri === 'instagram://rate-limits') {
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: client.getRateLimitStatus(),
        }],
      };
    }

    throw new Error(`Resource inconnue: ${uri}`);
  });

  // Handler pour exécuter les tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        // Content - Posts
        case 'instagram_create_post':
          result = await posts.createPost(args as any);
          break;
        case 'instagram_create_carousel':
          result = await posts.createCarousel(args as any);
          break;
        case 'instagram_list_posts':
          result = await posts.listPosts(args as any);
          break;
        case 'instagram_get_post':
          result = await posts.getPost(args as any);
          break;
        case 'instagram_delete_post':
          result = await posts.deletePost(args as any);
          break;

        // Content - Stories
        case 'instagram_create_story':
          result = await stories.createStory(args as any);
          break;
        case 'instagram_list_stories':
          result = await stories.listStories(args as any);
          break;
        case 'instagram_delete_story':
          result = await stories.deleteStory(args as any);
          break;

        // Content - Reels
        case 'instagram_create_reel':
          result = await reels.createReel(args as any);
          break;
        case 'instagram_list_reels':
          result = await reels.listReels(args as any);
          break;

        // Content - Highlights
        case 'instagram_create_highlight':
          result = await highlights.createHighlight(args as any);
          break;
        case 'instagram_list_highlights':
          result = await highlights.listHighlights(args as any);
          break;

        // Interactions - Likes
        case 'instagram_like_media':
          result = await likes.likeMedia(args as any);
          break;
        case 'instagram_unlike_media':
          result = await likes.unlikeMedia(args as any);
          break;
        case 'instagram_get_likers':
          result = await likes.getLikers(args as any);
          break;

        // Interactions - Comments
        case 'instagram_create_comment':
          result = await comments.createComment(args as any);
          break;
        case 'instagram_list_comments':
          result = await comments.listComments(args as any);
          break;
        case 'instagram_delete_comment':
          result = await comments.deleteComment(args as any);
          break;
        case 'instagram_hide_comment':
          result = await comments.hideComment(args as any);
          break;
        case 'instagram_pin_comment':
          result = await comments.pinComment(args as any);
          break;

        // Interactions - Follows
        case 'instagram_follow_user':
          result = await follows.followUser(args as any);
          break;
        case 'instagram_unfollow_user':
          result = await follows.unfollowUser(args as any);
          break;
        case 'instagram_get_followers':
          result = await follows.getFollowers(args as any);
          break;
        case 'instagram_get_following':
          result = await follows.getFollowing(args as any);
          break;
        case 'instagram_remove_follower':
          result = await follows.removeFollower(args as any);
          break;

        // Interactions - Saves
        case 'instagram_save_media':
          result = await saves.saveMedia(args as any);
          break;
        case 'instagram_unsave_media':
          result = await saves.unsaveMedia(args as any);
          break;
        case 'instagram_list_saved':
          result = await saves.listSavedMedia(args as any);
          break;
        case 'instagram_list_collections':
          result = await saves.listCollections(args as any);
          break;

        // Messaging
        case 'instagram_list_threads':
          result = await messaging.listThreads(args as any);
          break;
        case 'instagram_get_thread':
          result = await messaging.getThread(args as any);
          break;
        case 'instagram_send_message':
          result = await messaging.sendMessage(args as any);
          break;
        case 'instagram_create_thread':
          result = await messaging.createThread(args as any);
          break;

        // Analytics
        case 'instagram_get_account_insights':
          result = await analytics.getAccountInsights(args as any);
          break;
        case 'instagram_get_media_insights':
          result = await analytics.getMediaInsights(args as any);
          break;
        case 'instagram_get_audience_demographics':
          result = await analytics.getAudienceDemographics(args as any);
          break;
        case 'instagram_get_follower_growth':
          result = await analytics.getFollowerGrowth(args as any);
          break;

        // Account
        case 'instagram_get_profile':
          result = await account.getProfile();
          break;
        case 'instagram_update_profile':
          result = await account.updateProfile(args as any);
          break;
        case 'instagram_get_user':
          result = await account.getUser(args as any);
          break;
        case 'instagram_search_users':
          result = await account.searchUsers(args as any);
          break;
        case 'instagram_search_hashtags':
          result = await account.searchHashtags(args as any);
          break;
        case 'instagram_block_user':
          result = await account.blockUser(args as any);
          break;
        case 'instagram_unblock_user':
          result = await account.unblockUser(args as any);
          break;

        // Commerce
        case 'instagram_list_products':
          result = await commerce.listProducts(args as any);
          break;
        case 'instagram_list_orders':
          result = await commerce.listOrders(args as any);
          break;
        case 'instagram_update_order_status':
          result = await commerce.updateOrderStatus(args as any);
          break;

        // Ads
        case 'instagram_create_campaign':
          result = await ads.createCampaign(args as any);
          break;
        case 'instagram_list_campaigns':
          result = await ads.listCampaigns(args as any);
          break;
        case 'instagram_boost_post':
          result = await ads.boostPost(args as any);
          break;
        case 'instagram_get_ad_insights':
          result = await ads.getAdInsights(args as any);
          break;

        // Utilities
        case 'instagram_get_rate_limits':
          result = {
            success: true,
            data: client.getRateLimiter().getAllBucketsStatus(),
          };
          break;

        default:
          throw new Error(`Tool inconnu: ${name}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMessage }),
        }],
        isError: true,
      };
    }
  });

  // Démarrer le serveur
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('MCP Instagram server started');
}

main().catch(console.error);
