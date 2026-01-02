// Supabase Edge Function - Update imported product fields
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'PATCH') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Supabase bağlantısı yapılandırılmamış' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    // URL'den product ID'yi al
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const idStr = pathParts[pathParts.length - 1]
    const id = parseInt(idStr, 10)

    if (isNaN(id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid product ID' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    const body = await req.json()
    const {
      description,
      imageUrl,
      status,
      name,
      sku,
      price,
      stockAmount,
      categoryId,
      ideasoft_product_id,
      ideasoftProductId
    } = body || {}

    const updateData: any = {}

    if (description !== undefined) {
      updateData.description = String(description)
    }

    if (imageUrl !== undefined) {
      updateData.image_url = String(imageUrl)
    }

    if (status !== undefined) {
      updateData.status = Number(status) === 1 ? 1 : 0
    }

    if (name !== undefined) {
      updateData.name = String(name)
    }

    if (sku !== undefined) {
      updateData.sku = String(sku)
    }

    if (price !== undefined) {
      updateData.price = Number(price) || 0
    }

    if (stockAmount !== undefined) {
      updateData.stock_amount = Number(stockAmount) || 0
    }

    if (categoryId !== undefined) {
      updateData.selected_category_id = categoryId === null || categoryId === '' ? null : Number(categoryId)
    }

    const incomingIdeasoftId = ideasoft_product_id !== undefined ? ideasoft_product_id : ideasoftProductId
    if (incomingIdeasoftId !== undefined) {
      updateData.ideasoft_product_id = incomingIdeasoftId === null || incomingIdeasoftId === '' ? null : Number(incomingIdeasoftId)
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Güncellenecek alan yok' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { error } = await supabaseClient
      .from('imported_products')
      .update(updateData)
      .eq('id', id)

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

