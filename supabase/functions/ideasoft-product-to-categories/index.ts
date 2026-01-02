// Supabase Edge Function - Ideasoft Product to Categories
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  const body = await req.json()
  const { shopId, accessToken, productId, categoryId, productData } = body

  if (!shopId || !accessToken || !productId || !categoryId) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Shop ID, Access Token, Product ID ve Category ID gerekli' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }

  try {
    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/product_to_categories`
    
    const productCategoryData = {
      product: {
        id: productId,
        name: productData?.name || '',
        fullName: productData?.fullName || productData?.name || '',
        sku: productData?.sku || '',
        stockAmount: productData?.stock || productData?.stockAmount || 0.0,
        price1: productData?.price || productData?.price1 || 0,
        currency: {
          id: 1
        },
        status: productData?.status !== undefined ? productData.status : 0
      },
      category: {
        id: categoryId
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(productCategoryData)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw { response: { status: response.status, data: errorData } }
    }

    const responseData = await response.json()

    return new Response(
      JSON.stringify({
        success: true,
        data: responseData
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error: any) {
    console.error('Product Category API Error:', error)
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.response?.data?.error_description ||
                        error.message ||
                        'Kategori ilişkisi oluşturulamadı'
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        statusCode: error.response?.status
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.response?.status || 500 
      }
    )
  }
})

