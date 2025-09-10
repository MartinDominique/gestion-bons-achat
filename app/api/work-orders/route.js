export async function POST(request) {
  try {
    console.log('=== ÉTAPE 1: Lecture body ===');
    const body = await request.json();
    console.log('Body OK:', Object.keys(body));
    
    console.log('=== ÉTAPE 2: Création client Supabase ===');
    const supabase = createClient();
    console.log('Supabase OK');
    
    console.log('=== ÉTAPE 3: Test simple avec données fixes ===');
    const { data: testInsert, error: testError } = await supabase
      .from('work_orders')
      .insert([{
        client_id: 1,
        work_date: '2025-09-09',
        work_description: 'Test simple',
        status: 'draft'
      }])
      .select()
      .single();
    
    if (testError) {
      console.error('Erreur test insert:', testError);
      return NextResponse.json({
        error: 'Erreur test insert',
        details: testError,
        message: testError.message
      }, { status: 500 });
    }
    
    console.log('=== SUCCÈS test insert ===');
    return NextResponse.json({ 
      success: true, 
      data: testInsert,
      message: 'Test réussi avec données fixes'
    });
    
  } catch (error) {
    console.error('Erreur catch:', error);
    return NextResponse.json({
      error: 'Erreur dans catch',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
