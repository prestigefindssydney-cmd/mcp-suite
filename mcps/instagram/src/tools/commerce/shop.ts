/**
 * Tools pour le commerce Instagram (Shopping)
 */

import { z } from 'zod';
import { InstagramClient } from '../../core/client.js';
import { InstagramProduct, InstagramOrder, PaginatedResponse, ApiResponse } from '../../core/types.js';

// ============================================
// Schemas de validation
// ============================================

export const ListProductsSchema = z.object({
  limit: z.number().min(1).max(50).default(25).describe('Nombre de produits'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const GetProductSchema = z.object({
  product_id: z.string().describe('ID du produit'),
});

export const CreateProductSchema = z.object({
  name: z.string().min(1).max(200).describe('Nom du produit'),
  description: z.string().max(5000).optional().describe('Description'),
  price: z.number().positive().describe('Prix'),
  currency: z.string().length(3).default('EUR').describe('Devise (EUR, USD, etc.)'),
  images: z.array(z.string().url()).min(1).max(10).describe('URLs des images'),
  url: z.string().url().optional().describe('URL du produit sur le site'),
  availability: z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER']).default('IN_STOCK').describe('Disponibilité'),
  sku: z.string().optional().describe('Référence SKU'),
  category: z.string().optional().describe('Catégorie'),
});

export const UpdateProductSchema = z.object({
  product_id: z.string().describe('ID du produit'),
  name: z.string().min(1).max(200).optional().describe('Nom'),
  description: z.string().max(5000).optional().describe('Description'),
  price: z.number().positive().optional().describe('Prix'),
  availability: z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER']).optional().describe('Disponibilité'),
});

export const DeleteProductSchema = z.object({
  product_id: z.string().describe('ID du produit à supprimer'),
});

export const TagProductsSchema = z.object({
  media_id: z.string().describe('ID du média'),
  product_tags: z.array(z.object({
    product_id: z.string(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })).min(1).max(5).describe('Tags produits (position 0-1)'),
});

export const ListOrdersSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional().describe('Filtrer par statut'),
  limit: z.number().min(1).max(50).default(25).describe('Nombre de commandes'),
  cursor: z.string().optional().describe('Curseur de pagination'),
});

export const GetOrderSchema = z.object({
  order_id: z.string().describe('ID de la commande'),
});

export const UpdateOrderStatusSchema = z.object({
  order_id: z.string().describe('ID de la commande'),
  status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).describe('Nouveau statut'),
  tracking_number: z.string().optional().describe('Numéro de suivi'),
  tracking_carrier: z.string().optional().describe('Transporteur'),
  tracking_url: z.string().url().optional().describe('URL de suivi'),
});

// ============================================
// Handlers
// ============================================

export class CommerceTools {
  private client: InstagramClient;

  constructor(client: InstagramClient) {
    this.client = client;
  }

  /**
   * Liste les produits du catalogue
   */
  async listProducts(params: z.infer<typeof ListProductsSchema>): Promise<ApiResponse<PaginatedResponse<InstagramProduct>>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    // Graph API - Récupérer le catalogue associé
    const result = await this.client.get<{
      data: Array<{
        id: string;
        product_id: string;
        name: string;
        description: string;
        price: string;
        currency: string;
        image_url: string;
        availability: string;
        url: string;
      }>;
      paging?: { cursors?: { after?: string } };
    }>(
      `/${accountId}/catalog_product_search`,
      {
        fields: 'id,product_id,name,description,price,currency,image_url,availability,url',
        limit: params.limit,
        after: params.cursor,
      }
    );

    if (result.success && result.data) {
      const products: InstagramProduct[] = result.data.data.map(p => ({
        id: p.product_id || p.id,
        name: p.name,
        description: p.description,
        price: parseFloat(p.price) || 0,
        currency: p.currency,
        images: [p.image_url],
        url: p.url,
        availability: p.availability as 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER',
      }));

      return {
        success: true,
        data: {
          data: products,
          paging: result.data.paging,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère un produit
   */
  async getProduct(params: z.infer<typeof GetProductSchema>): Promise<ApiResponse<InstagramProduct>> {
    const result = await this.client.get<{
      id: string;
      name: string;
      description: string;
      price: string;
      currency: string;
      image_url: string;
      availability: string;
      url: string;
      variants?: Array<{
        id: string;
        name: string;
        price: string;
        sku: string;
        availability: string;
      }>;
    }>(
      `/${params.product_id}`,
      { fields: 'id,name,description,price,currency,image_url,availability,url,variants' }
    );

    if (result.success && result.data) {
      const p = result.data;
      return {
        success: true,
        data: {
          id: p.id,
          name: p.name,
          description: p.description,
          price: parseFloat(p.price) || 0,
          currency: p.currency,
          images: [p.image_url],
          url: p.url,
          availability: p.availability as 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER',
          variants: p.variants?.map(v => ({
            id: v.id,
            name: v.name,
            price: parseFloat(v.price),
            sku: v.sku,
            availability: v.availability as 'IN_STOCK' | 'OUT_OF_STOCK',
          })),
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Crée un produit (via Commerce Manager API)
   */
  async createProduct(params: z.infer<typeof CreateProductSchema>): Promise<ApiResponse<{ id: string }>> {
    // Note: La création de produits se fait généralement via le Commerce Manager ou l'API Catalog
    // Ici on simule l'appel à l'API Catalog de Facebook

    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const productData = {
      retailer_id: params.sku || `product_${Date.now()}`,
      name: params.name,
      description: params.description || '',
      price: Math.round(params.price * 100), // En centimes
      currency: params.currency,
      image_url: params.images[0],
      url: params.url,
      availability: params.availability,
      category: params.category,
    };

    const result = await this.client.post<{ id: string }>(
      `/${accountId}/products`,
      productData
    );

    return result;
  }

  /**
   * Met à jour un produit
   */
  async updateProduct(params: z.infer<typeof UpdateProductSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const updateData: Record<string, unknown> = {};

    if (params.name) updateData.name = params.name;
    if (params.description) updateData.description = params.description;
    if (params.price) updateData.price = Math.round(params.price * 100);
    if (params.availability) updateData.availability = params.availability;

    const result = await this.client.post<{ success: boolean }>(
      `/${params.product_id}`,
      updateData
    );

    return {
      success: result.success,
      data: { success: true },
      error: result.error,
    };
  }

  /**
   * Supprime un produit
   */
  async deleteProduct(params: z.infer<typeof DeleteProductSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const result = await this.client.delete<{ success: boolean }>(
      `/${params.product_id}`
    );

    return {
      success: result.success,
      data: { success: true },
      error: result.error,
    };
  }

  /**
   * Tag des produits sur un média
   */
  async tagProducts(params: z.infer<typeof TagProductsSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const result = await this.client.post<{ success: boolean }>(
      `/${params.media_id}`,
      {
        product_tags: params.product_tags.map(tag => ({
          product_id: tag.product_id,
          x: tag.x,
          y: tag.y,
        })),
      }
    );

    return {
      success: result.success,
      data: { success: true },
      error: result.error,
    };
  }

  /**
   * Liste les commandes
   */
  async listOrders(params: z.infer<typeof ListOrdersSchema>): Promise<ApiResponse<PaginatedResponse<InstagramOrder>>> {
    const accountId = this.client.getAuth().getBusinessAccountId();
    if (!accountId) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Business Account ID requis' },
      };
    }

    const queryParams: Record<string, unknown> = {
      fields: 'id,created_time,updated_time,order_status,buyer,items,shipping_address,subtotal,total',
      limit: params.limit,
    };

    if (params.status) queryParams.order_status = params.status;
    if (params.cursor) queryParams.after = params.cursor;

    const result = await this.client.get<{
      data: Array<{
        id: string;
        created_time: string;
        updated_time: string;
        order_status: string;
        buyer: { id: string; name: string };
        items: Array<{
          product_id: string;
          quantity: number;
          price: string;
        }>;
        shipping_address?: {
          name: string;
          street1: string;
          street2?: string;
          city: string;
          state: string;
          postal_code: string;
          country: string;
        };
        total: { amount: string; currency: string };
      }>;
      paging?: { cursors?: { after?: string } };
    }>(
      `/${accountId}/commerce_orders`,
      queryParams
    );

    if (result.success && result.data) {
      const orders: InstagramOrder[] = result.data.data.map(o => ({
        id: o.id,
        status: o.order_status as InstagramOrder['status'],
        customer: {
          id: o.buyer.id,
          username: o.buyer.name,
        },
        items: o.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          price: parseFloat(item.price),
        })),
        total_amount: parseFloat(o.total.amount),
        currency: o.total.currency,
        shipping_address: o.shipping_address ? {
          name: o.shipping_address.name,
          address_line1: o.shipping_address.street1,
          address_line2: o.shipping_address.street2,
          city: o.shipping_address.city,
          state: o.shipping_address.state,
          postal_code: o.shipping_address.postal_code,
          country: o.shipping_address.country,
        } : undefined,
        created_at: o.created_time,
        updated_at: o.updated_time,
      }));

      return {
        success: true,
        data: {
          data: orders,
          paging: result.data.paging,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Récupère une commande
   */
  async getOrder(params: z.infer<typeof GetOrderSchema>): Promise<ApiResponse<InstagramOrder>> {
    const result = await this.client.get<{
      id: string;
      created_time: string;
      updated_time: string;
      order_status: string;
      buyer: { id: string; name: string; email?: string };
      items: Array<{
        product_id: string;
        quantity: number;
        price: string;
      }>;
      shipping_address?: {
        name: string;
        street1: string;
        street2?: string;
        city: string;
        state: string;
        postal_code: string;
        country: string;
      };
      total: { amount: string; currency: string };
      tracking?: {
        carrier: string;
        tracking_number: string;
        tracking_url?: string;
      };
    }>(
      `/${params.order_id}`,
      { fields: 'id,created_time,updated_time,order_status,buyer,items,shipping_address,total,tracking' }
    );

    if (result.success && result.data) {
      const o = result.data;
      return {
        success: true,
        data: {
          id: o.id,
          status: o.order_status as InstagramOrder['status'],
          customer: {
            id: o.buyer.id,
            username: o.buyer.name,
            email: o.buyer.email,
          },
          items: o.items.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: parseFloat(item.price),
          })),
          total_amount: parseFloat(o.total.amount),
          currency: o.total.currency,
          shipping_address: o.shipping_address ? {
            name: o.shipping_address.name,
            address_line1: o.shipping_address.street1,
            address_line2: o.shipping_address.street2,
            city: o.shipping_address.city,
            state: o.shipping_address.state,
            postal_code: o.shipping_address.postal_code,
            country: o.shipping_address.country,
          } : undefined,
          tracking_info: o.tracking ? {
            carrier: o.tracking.carrier,
            tracking_number: o.tracking.tracking_number,
            tracking_url: o.tracking.tracking_url,
          } : undefined,
          created_at: o.created_time,
          updated_at: o.updated_time,
        },
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Met à jour le statut d'une commande
   */
  async updateOrderStatus(params: z.infer<typeof UpdateOrderStatusSchema>): Promise<ApiResponse<{ success: boolean }>> {
    const updateData: Record<string, unknown> = {
      order_status: params.status,
    };

    if (params.tracking_number) {
      updateData.tracking = {
        carrier: params.tracking_carrier || 'OTHER',
        tracking_number: params.tracking_number,
        tracking_url: params.tracking_url,
      };
    }

    const result = await this.client.post<{ success: boolean }>(
      `/${params.order_id}`,
      updateData
    );

    return {
      success: result.success,
      data: { success: true },
      error: result.error,
    };
  }
}
