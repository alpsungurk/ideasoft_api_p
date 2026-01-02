// Supabase Edge Function - Update Batch Status (Counters)
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
    const { batchId } = body

    if (!batchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'batchId gerekli' }),
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

    // Stats hesapla
    const { data: products, error: productsError } = await supabaseClient
      .from('imported_products')
      .select('transfer_status')
      .eq('batch_id', batchId)

    if (productsError) {
      throw productsError
    }

    const total = products.length
    const successful = products.filter((p: any) => p.transfer_status === 'SUCCESS').length
    const failed = products.filter((p: any) => p.transfer_status === 'FAILED').length
    const status = (successful + failed) >= total ? 'COMPLETED' : 'PROCESSING'

    // Batch'i güncelle
    const { error: updateError } = await supabaseClient
      .from('import_batches')
      .update({
        total_products: total,
        successful_products: successful,
        failed_products: failed,
        status: status
      })
      .eq('id', batchId)

    if (updateError) {
      throw updateError
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Update Batch Stats Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Update failed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

