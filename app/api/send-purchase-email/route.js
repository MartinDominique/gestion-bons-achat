export async function POST(request) {
  console.log('API route appelée !');
  
  try {
    // Test simple sans Resend
    return Response.json({ 
      success: true, 
      message: 'API route fonctionne',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur dans API route:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
