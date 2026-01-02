// Supabase Edge Function - Get batch details with products
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
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

    // URL'den batch ID'yi al
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const batchIdStr = pathParts[pathParts.length - 1]
    const batchId = parseInt(batchIdStr, 10)

    if (isNaN(batchId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid batch ID' }),
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

    // Batch info
    const { data: batch, error: batchError } = await supabaseClient
      .from('import_batches')
      .select('*')
      .eq('id', batchId)
      .single()
    
    if (batchError) {
      if (batchError.code === 'PGRST116') {
        return new Response(
          JSON.stringify({ success: false, error: 'Proje bulunamadı' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404 
          }
        )
      }
      throw batchError
    }

    if (!batch) {
      return new Response(
        JSON.stringify({ success: false, error: 'Proje bulunamadı' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    // Products
    const { data: products, error: productsError } = await supabaseClient
      .from('imported_products')
      .select('*')
      .eq('batch_id', batchId)

    if (productsError) {
      throw productsError
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...batch,
          products: products || []
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Get Batch Details Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Veritabanı hatası oluştu' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

