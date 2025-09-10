export async function GET(request) {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur GET:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('Bons de travail trouvés:', data?.length || 0);
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Erreur GET catch:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
