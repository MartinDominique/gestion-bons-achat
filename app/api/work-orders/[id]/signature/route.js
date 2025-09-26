export async function POST(request, { params }) {
  const { signature_data, client_signature_name, status } = await request.json();
  
  const { data, error } = await supabaseAdmin
    .from('work_orders')
    .update({
      signature_data,
      client_signature_name,
      signature_timestamp: new Date().toISOString(),
      status
    })
    .eq('id', params.id)
    .select()
    .single();

  return Response.json(data);
}
