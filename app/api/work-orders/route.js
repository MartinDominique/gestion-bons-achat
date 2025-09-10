export async function POST(request) {
  try {
    console.log('=== API POST APPELÉE ===');
    
    const body = await request.json();
    console.log('1. Body reçu:', JSON.stringify(body, null, 2));
    
    // Vérifiez chaque champ
    console.log('2. client_id:', body.client_id, 'type:', typeof body.client_id);
    console.log('3. work_date:', body.work_date);
    console.log('4. work_description:', body.work_description);
    
    const supabase = createClient();
    
    const dataToInsert = {
      client_id: parseInt(body.client_id),
      work_date: body.work_date,
      work_description: body.work_description,
      start_time: body.start_time || null,
      end_time: body.end_time || null,
      break_time: parseFloat(body.break_time) || 0.5,
      status: 'draft'
    };
    
    console.log('5. Données à insérer:', JSON.stringify(dataToInsert, null, 2));
    
    const { data, error } = await supabase
      .from('work_orders')
      .insert([dataToInsert])
      .select()
      .single();
    
    console.log('6. Résultat:', { data: !!data, error: error?.message });
    
    if (error) {
      console.error('7. Erreur détaillée:', error);
      return NextResponse.json({ 
        error: error.message, 
        details: error,
        receivedData: body 
      }, { status: 500 });
    }
    
    console.log('8. SUCCÈS !');
    return NextResponse.json(data, { status: 201 });
    
  } catch (error) {
    console.error('9. Erreur catch:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}
