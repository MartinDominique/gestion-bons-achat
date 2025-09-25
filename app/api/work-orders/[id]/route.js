export async function GET(request, { params }) {
  console.log('=== API [ID] TEST ===');
  console.log('ID reçu:', params.id);
  
  return Response.json({
    success: true,
    message: 'API [id] fonctionne !',
    id: params.id
  });
}
