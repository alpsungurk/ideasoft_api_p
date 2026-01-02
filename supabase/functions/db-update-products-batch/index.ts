// Supabase Edge Function - Batch update imported products
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

  if (req.method !== 'POST') {
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

    const body = await req.json()
    const { updates } = body || {}

    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Updates array gerekli' }),
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

    const results = []
    let successCount = 0
    let errorCount = 0

    // Her update'i işle
    for (const update of updates) {
      const { id, ...updateData } = update

      if (!id || isNaN(Number(id))) {
        results.push({ id, success: false, error: 'Invalid product ID' })
        errorCount++
        continue
      }

      // Update data'yı normalize et
      const normalizedData: any = {}

      if (updateData.description !== undefined) {
        normalizedData.description = String(updateData.description)
      }

      if (updateData.imageUrl !== undefined) {
        normalizedData.image_url = String(updateData.imageUrl)
      }

      if (updateData.status !== undefined) {
        normalizedData.status = Number(updateData.status) === 1 ? 1 : 0
      }

      if (updateData.name !== undefined) {
        normalizedData.name = String(updateData.name)
      }

      if (updateData.sku !== undefined) {
        normalizedData.sku = String(updateData.sku)
      }

      if (updateData.price !== undefined) {
        normalizedData.price = Number(updateData.price) || 0
      }

      if (updateData.stockAmount !== undefined) {
        normalizedData.stock_amount = Number(updateData.stockAmount) || 0
      }

      if (updateData.categoryId !== undefined) {
        normalizedData.selected_category_id = updateData.categoryId === null || updateData.categoryId === '' ? null : Number(updateData.categoryId)
      }

      const incomingIdeasoftId = updateData.ideasoft_product_id !== undefined ? updateData.ideasoft_product_id : updateData.ideasoftProductId
      if (incomingIdeasoftId !== undefined) {
        normalizedData.ideasoft_product_id = incomingIdeasoftId === null || incomingIdeasoftId === '' ? null : Number(incomingIdeasoftId)
      }

      if (Object.keys(normalizedData).length === 0) {
        results.push({ id, success: false, error: 'Güncellenecek alan yok' })
        errorCount++
        continue
      }

      try {
        const { error } = await supabaseClient
          .from('imported_products')
          .update(normalizedData)
          .eq('id', Number(id))

        if (error) {
          results.push({ id, success: false, error: error.message })
          errorCount++
        } else {
          results.push({ id, success: true })
          successCount++
        }
      } catch (err: any) {
        results.push({ id, success: false, error: err.message || 'Update failed' })
        errorCount++
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        results,
        successCount,
        errorCount,
        total: updates.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Batch update failed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

